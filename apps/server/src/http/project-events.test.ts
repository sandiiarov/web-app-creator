import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import type { Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  PROTOCOL_MAX_DOCUMENT_BYTES,
  PROTOCOL_MAX_DOCUMENT_EVENT_FRAME_BYTES,
  PROTOCOL_MAX_EVENT_DATA_BYTES,
  PROTOCOL_MAX_LIST_SNAPSHOT_FRAME_BYTES,
  PROTOCOL_MAX_PROJECT_SNAPSHOT_FRAME_BYTES,
  ProjectListSnapshotSchema,
  PROTOCOL_MAX_QUEUED_BYTES,
} from '@workspace/contracts'
import { afterEach, describe, expect, it } from 'vitest'

import { createApiServer } from '../index.ts'
import { allowNetworkOrigin } from '../testing/deny-network.ts'
import {
  createRuntimeFixture,
  type RuntimeFixture,
} from '../testing/runtime-fixture.ts'
import { createProjectEventDelivery } from './project-events.ts'

const fixtures: RuntimeFixture[] = []
afterEach(async () => {
  const results = await Promise.allSettled(
    fixtures.splice(0).map((fixture) => fixture.dispose()),
  )
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  )
  if (failures.length) throw new AggregateError(failures)
})

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'

describe('project event delivery', () => {
  it('subscribes before the snapshot and delivers its committed tail once', async () => {
    const fixture = await setupProject()
    const repository = fixture.runtime.repository
    const snapshot = await repository.readSnapshot(PROJECT_ID)
    expect(snapshot?.ok).toBe(true)
    const gate = deferred<Awaited<ReturnType<typeof repository.readSnapshot>>>()
    const originalRead = repository.readSnapshot
    repository.readSnapshot = async () => gate.promise
    const response = new FakeResponse()
    const opened = createProjectEventDelivery(repository).openProject(
      PROJECT_ID,
      response.asResponse(),
    )
    const committed = await repository.appendClientMessage(PROJECT_ID, {
      dir: 'out',
      event: 'text',
      payload: { delta: 'tail' },
      ts: '2026-09-06T00:00:01.000Z',
      turnId: 'turn-1',
    })
    gate.resolve(snapshot)
    await opened
    await tick()
    repository.readSnapshot = originalRead
    const frames = response.frames()
    expect(frames.map((frame) => frame.event)).toEqual([
      'state',
      'project_event',
    ])
    expect(frames[1]?.id).toBe(String(committed.seq))
    expect(JSON.parse(frames[1]!.data)).toMatchObject({
      payload: { delta: 'tail' },
      seq: committed.seq,
    })
    response.close()
  })

  it('serializes events while a socket drain is pending and exits when it closes', async () => {
    const fixture = await setupProject()
    const repository = fixture.runtime.repository
    const response = new FakeResponse()
    await createProjectEventDelivery(repository).openProject(
      PROJECT_ID,
      response.asResponse(),
    )
    response.blockWrites = true
    await repository.appendClientMessage(PROJECT_ID, {
      dir: 'out',
      event: 'text',
      payload: { delta: 'one' },
      ts: 'one',
      turnId: 'turn-1',
    })
    await tick()
    await repository.appendClientMessage(PROJECT_ID, {
      dir: 'out',
      event: 'text',
      payload: { delta: 'two' },
      ts: 'two',
      turnId: 'turn-1',
    })
    await tick()
    expect(
      response.frames().filter((frame) => frame.event === 'project_event'),
    ).toHaveLength(1)
    response.close()
    await tick()
    expect(response.listenerCount('drain')).toBe(0)
  })

  it('emits a fatal protocol error for a damaged journal snapshot', async () => {
    const fixture = await setupProject()
    const repository = fixture.runtime.repository
    const snapshot = await repository.readSnapshot(PROJECT_ID)
    if (!snapshot?.ok) throw new Error('expected snapshot')
    repository.readSnapshot = async () => ({
      ok: true,
      snapshot: {
        ...snapshot.snapshot,
        journalStatus: 'incompleteTail',
        tail: { byteLength: 2, offset: 4 },
      },
    })
    const response = new FakeResponse()
    await createProjectEventDelivery(repository).openProject(
      PROJECT_ID,
      response.asResponse(),
    )
    expect(response.frames()).toEqual([
      expect.objectContaining({
        data: expect.stringContaining('INVALID_EVENT'),
        event: 'protocol_error',
      }),
    ])
    expect(response.ended).toBe(true)
  })

  it('serializes and repeats authoritative list snapshots across invalidation', async () => {
    const fixture = await setupProject()
    const response = new FakeResponse()
    await createProjectEventDelivery(fixture.runtime.repository).openList(
      response.asResponse(),
    )
    expect(JSON.parse(response.frames()[0]!.data).projects).toHaveLength(1)
    await fixture.runtime.repository.updateProjectModel(PROJECT_ID, {
      title: 'Renamed',
    })
    await new Promise((resolve) => setTimeout(resolve, 70))
    const lists = response
      .frames()
      .filter((frame) => frame.event === 'list_state')
    expect(JSON.parse(lists.at(-1)!.data).projects[0]).toMatchObject({
      title: 'Renamed',
    })
    response.close()
  })

  it('serializes an invalidation that arrives during initial list hydration', async () => {
    const fixture = await setupProject()
    const repository = fixture.runtime.repository
    const firstRead = deferred<void>()
    const original = repository.listProjects
    let reads = 0
    repository.listProjects = async () => {
      reads += 1
      if (reads === 1) await firstRead.promise
      return original()
    }
    const response = new FakeResponse()
    const opening = createProjectEventDelivery(repository).openList(
      response.asResponse(),
    )
    await tick()
    await repository.updateProjectModel(PROJECT_ID, { title: 'During read' })
    await new Promise((resolve) => setTimeout(resolve, 70))
    expect(reads).toBe(1)
    firstRead.resolve()
    await opening
    await new Promise((resolve) => setTimeout(resolve, 70))
    expect(reads).toBe(2)
    expect(
      JSON.parse(response.frames().at(-1)!.data).projects[0],
    ).toMatchObject({ title: 'During read' })
    response.close()
  })

  it('publishes authoritative empty, created, and deleted project lists', async () => {
    const fixture = await createRuntimeFixture()
    fixtures.push(fixture)
    const response = new FakeResponse()
    await createProjectEventDelivery(fixture.runtime.repository).openList(
      response.asResponse(),
    )
    expect(JSON.parse(response.frames()[0]!.data)).toEqual({
      projects: [],
      version: 2,
    })
    const project = await fixture.runtime.projectService.create({
      creationKey: '22222222-2222-4222-8222-222222222222',
    })
    fixture.runtime.repository
      .createProjectHtmlStore(project.id)
      .set('<!doctype html><main>Created</main>')
    await waitFor(
      () => JSON.parse(response.frames().at(-1)!.data).projects.length === 1,
    )
    await fixture.runtime.projectService.delete(project.id)
    await waitFor(
      () => JSON.parse(response.frames().at(-1)!.data).projects.length === 0,
    )
    response.close()
  })

  it('delivers document and terminal commits made while the snapshot is pending', async () => {
    const fixture = await setupProject()
    const repository = fixture.runtime.repository
    const oldSnapshot = await repository.readSnapshot(PROJECT_ID)
    const snapshotGate = deferred<typeof oldSnapshot>()
    const original = repository.readSnapshot
    let first = true
    repository.readSnapshot = async (id) => {
      if (first) {
        first = false
        return snapshotGate.promise
      }
      return original(id)
    }
    const response = new FakeResponse()
    const opening = createProjectEventDelivery(repository).openProject(
      PROJECT_ID,
      response.asResponse(),
    )
    repository
      .createProjectHtmlStore(PROJECT_ID)
      .set('<!doctype html><html><body>Final</body></html>')
    const document = await repository.commitDocumentChange(PROJECT_ID, 'turn-1')
    const terminal = await repository.appendClientMessage(PROJECT_ID, {
      dir: 'out',
      event: 'run_terminal',
      payload: {
        finishedAt: '2026-09-06T00:00:02.000Z',
        outcome: 'completed',
        stats: null,
        turnId: 'turn-1',
      },
      ts: '2026-09-06T00:00:02.000Z',
      turnId: 'turn-1',
    })
    snapshotGate.resolve(oldSnapshot)
    await opening
    await waitFor(() => response.frames().length === 3)
    const frames = response.frames()
    expect(frames.map((frame) => frame.event)).toEqual([
      'state',
      'project_event',
      'project_event',
    ])
    expect(frames.slice(1).map((frame) => frame.id)).toEqual([
      String(document?.seq),
      String(terminal.seq),
    ])
    expect(JSON.parse(frames[1]!.data)).toMatchObject({
      payload: { html: expect.stringContaining('Final') },
      type: 'document_changed',
    })
    response.close()
  })

  it('closes an overflowing pre-snapshot queue without losing cleanup', async () => {
    const fixture = await setupProject()
    const repository = fixture.runtime.repository
    const snapshot = await repository.readSnapshot(PROJECT_ID)
    const gate = deferred<typeof snapshot>()
    repository.readSnapshot = async () => gate.promise
    const response = new FakeResponse()
    const opening = createProjectEventDelivery(repository).openProject(
      PROJECT_ID,
      response.asResponse(),
    )
    await repository.appendClientMessage(PROJECT_ID, {
      dir: 'out',
      event: 'text',
      payload: { delta: 'x'.repeat(PROTOCOL_MAX_QUEUED_BYTES + 1) },
      ts: 'now',
      turnId: 'turn-1',
    })
    expect(response.ended).toBe(true)
    gate.resolve(snapshot)
    await expect(opening).resolves.toBe(true)
  })

  it('unsubscribes when the client closes during the snapshot read', async () => {
    const fixture = await setupProject()
    const repository = fixture.runtime.repository
    const snapshot = await repository.readSnapshot(PROJECT_ID)
    const gate = deferred<typeof snapshot>()
    repository.readSnapshot = async () => gate.promise
    const originalSubscribe = repository.subscribeProjectCommits
    let unsubscribed = 0
    repository.subscribeProjectCommits = (id, listener) => {
      const unsubscribe = originalSubscribe(id, listener)
      return () => {
        unsubscribed += 1
        unsubscribe()
      }
    }
    const response = new FakeResponse()
    const opening = createProjectEventDelivery(repository).openProject(
      PROJECT_ID,
      response.asResponse(),
    )
    response.close()
    gate.resolve(snapshot)
    await expect(opening).resolves.toBe(true)
    expect(unsubscribed).toBe(1)
  })

  it('reports invalid committed payloads but treats enrichment I/O as reconnectable', async () => {
    const fixture = await setupProject()
    const repository = fixture.runtime.repository
    const initial = await repository.readSnapshot(PROJECT_ID)
    const gate = deferred<typeof initial>()
    const originalRead = repository.readSnapshot
    let first = true
    repository.readSnapshot = async (id) => {
      if (first) {
        first = false
        return gate.promise
      }
      return originalRead(id)
    }
    const invalidResponse = new FakeResponse()
    const invalidOpening = createProjectEventDelivery(repository).openProject(
      PROJECT_ID,
      invalidResponse.asResponse(),
    )
    await repository.appendClientMessage(PROJECT_ID, {
      dir: 'out',
      event: 'text',
      payload: { delta: 42 },
      ts: 'now',
      turnId: 'turn-1',
    })
    gate.resolve(initial)
    await invalidOpening
    await waitFor(() => invalidResponse.ended)
    expect(invalidResponse.frames().at(-1)?.data).toContain('INVALID_EVENT')

    const healthySnapshot = await originalRead(PROJECT_ID)
    const secondResponse = new FakeResponse()
    repository.readSnapshot = async () => healthySnapshot
    await createProjectEventDelivery(repository).openProject(
      PROJECT_ID,
      secondResponse.asResponse(),
    )
    repository.readSnapshot = async () => {
      throw new Error('transient read failure')
    }
    await repository.appendClientMessage(PROJECT_ID, {
      dir: 'out',
      event: 'document_changed',
      payload: { bytes: 1, hash: 'different' },
      ts: 'later',
      turnId: 'turn-1',
    })
    await waitFor(() => secondResponse.ended)
    expect(
      secondResponse
        .frames()
        .filter((frame) => frame.event === 'protocol_error'),
    ).toEqual([])
  })

  it('allows a multi-mebibyte snapshot and rejects raw HTML above its cap', async () => {
    const fixture = await setupProject()
    const repository = fixture.runtime.repository
    const original = await repository.readSnapshot(PROJECT_ID)
    if (!original?.ok) throw new Error('expected snapshot')
    repository.readSnapshot = async () => ({
      ok: true,
      snapshot: {
        ...original.snapshot,
        indexHtml: `<main>${'x'.repeat(2 * 1024 * 1024)}</main>`,
      },
    })
    const valid = new FakeResponse()
    await createProjectEventDelivery(repository).openProject(
      PROJECT_ID,
      valid.asResponse(),
    )
    expect(valid.frames()[0]?.event).toBe('state')
    valid.close()

    repository.readSnapshot = async () => ({
      ok: true,
      snapshot: {
        ...original.snapshot,
        indexHtml: 'x'.repeat(PROTOCOL_MAX_DOCUMENT_BYTES + 1),
      },
    })
    const oversized = new FakeResponse()
    await createProjectEventDelivery(repository).openProject(
      PROJECT_ID,
      oversized.asResponse(),
    )
    expect(oversized.frames()[0]).toMatchObject({
      data: expect.stringContaining('DOCUMENT_TOO_LARGE'),
      event: 'protocol_error',
    })
  })

  it('accepts ordinary event data at its byte cap and rejects the next byte', async () => {
    const fixture = await setupProject()
    const repository = fixture.runtime.repository
    const response = new FakeResponse()
    await createProjectEventDelivery(repository).openProject(
      PROJECT_ID,
      response.asResponse(),
    )
    const nextSequence =
      (await repository.readClientJournal(PROJECT_ID)).watermark + 1
    const base = {
      payload: { delta: '' },
      projectId: PROJECT_ID,
      seq: nextSequence,
      ts: 'cap',
      turnId: 'turn-1',
      type: 'text',
      version: 2,
    }
    const overhead = Buffer.byteLength(JSON.stringify(base), 'utf8')
    await repository.appendClientMessage(PROJECT_ID, {
      dir: 'out',
      event: 'text',
      payload: {
        delta: 'x'.repeat(PROTOCOL_MAX_EVENT_DATA_BYTES - overhead),
      },
      ts: 'cap',
      turnId: 'turn-1',
    })
    await waitFor(
      () =>
        response.frames().filter((frame) => frame.event === 'project_event')
          .length === 1,
    )
    await repository.appendClientMessage(PROJECT_ID, {
      dir: 'out',
      event: 'text',
      payload: {
        delta: 'x'.repeat(PROTOCOL_MAX_EVENT_DATA_BYTES - overhead + 1),
      },
      ts: 'cap',
      turnId: 'turn-1',
    })
    await waitFor(() => response.ended)
    expect(response.frames().at(-1)?.data).toContain('EVENT_TOO_LARGE')
  })

  it('enforces encoded snapshot and list frame caps at exact byte boundaries', async () => {
    const fixture = await setupProject()
    const repository = fixture.runtime.repository
    const stored = await repository.readSnapshot(PROJECT_ID)
    if (!stored?.ok) throw new Error('expected snapshot')
    const baseTurn = {
      htmlSwaps: 0,
      id: 'large-turn',
      isStreaming: false,
      model: 'model',
      parts: [],
      prompt: '',
      startedAt: 0,
    }
    const baseSnapshot = {
      brief: stored.snapshot.metadata.brief,
      cursor: stored.snapshot.committedWatermark,
      documentHash: stored.snapshot.documentHash,
      html: stored.snapshot.indexHtml,
      models: {
        image: stored.snapshot.metadata.imageModel,
        text: stored.snapshot.metadata.model,
        vision: stored.snapshot.metadata.visionModel,
      },
      projectId: PROJECT_ID,
      run: {
        blocked: false,
        startedAt: null,
        status: 'idle',
        turnId: null,
      },
      title: stored.snapshot.metadata.title,
      titleSource: stored.snapshot.metadata.titleSource,
      turns: [baseTurn],
      version: 2,
    }
    const snapshotOverhead = Buffer.byteLength(
      `event: state\ndata: ${JSON.stringify(baseSnapshot)}\n\n`,
      'utf8',
    )
    const snapshotPrompt = 'x'.repeat(
      PROTOCOL_MAX_PROJECT_SNAPSHOT_FRAME_BYTES - snapshotOverhead,
    )
    repository.readSnapshot = async () => ({
      ok: true,
      snapshot: {
        ...stored.snapshot,
        conversationRecords: [],
        messages: [{ ...baseTurn, prompt: snapshotPrompt }],
      },
    })
    const exactSnapshot = new FakeResponse()
    await createProjectEventDelivery(repository).openProject(
      PROJECT_ID,
      exactSnapshot.asResponse(),
    )
    expect(Buffer.byteLength(exactSnapshot.writes[0]!, 'utf8')).toBe(
      PROTOCOL_MAX_PROJECT_SNAPSHOT_FRAME_BYTES,
    )
    exactSnapshot.close()
    exactSnapshot.writes.length = 0
    repository.readSnapshot = async () => ({
      ok: true,
      snapshot: {
        ...stored.snapshot,
        conversationRecords: [],
        messages: [{ ...baseTurn, prompt: `${snapshotPrompt}x` }],
      },
    })
    const largeSnapshot = new FakeResponse()
    await createProjectEventDelivery(repository).openProject(
      PROJECT_ID,
      largeSnapshot.asResponse(),
    )
    expect(largeSnapshot.frames()[0]?.data).toContain('SNAPSHOT_TOO_LARGE')

    const project = await repository.getProject(PROJECT_ID)
    if (!project) throw new Error('expected project')
    const { indexHtml: _html, messages: _messages, ...meta } = project
    const baseList = ProjectListSnapshotSchema.parse({
      projects: [{ ...meta, title: '' }],
      version: 2,
    })
    const listOverhead = Buffer.byteLength(
      `event: list_state\ndata: ${JSON.stringify(baseList)}\n\n`,
      'utf8',
    )
    const listTitle = 'x'.repeat(
      PROTOCOL_MAX_LIST_SNAPSHOT_FRAME_BYTES - listOverhead,
    )
    repository.listProjects = async () => [{ ...meta, title: listTitle }]
    const exactList = new FakeResponse()
    await createProjectEventDelivery(repository).openList(
      exactList.asResponse(),
    )
    expect(Buffer.byteLength(exactList.writes[0]!, 'utf8')).toBe(
      PROTOCOL_MAX_LIST_SNAPSHOT_FRAME_BYTES,
    )
    exactList.close()
    exactList.writes.length = 0
    repository.listProjects = async () => [{ ...meta, title: `${listTitle}x` }]
    const largeList = new FakeResponse()
    await createProjectEventDelivery(repository).openList(
      largeList.asResponse(),
    )
    expect(largeList.frames()[0]?.data).toContain('SNAPSHOT_TOO_LARGE')
  })

  it('enforces the enriched document frame cap after JSON escaping', async () => {
    const fixture = await setupProject()
    const repository = fixture.runtime.repository
    const response = new FakeResponse()
    await createProjectEventDelivery(repository).openProject(
      PROJECT_ID,
      response.asResponse(),
    )
    const nextSequence =
      (await repository.readClientJournal(PROJECT_ID)).watermark + 1
    const baseEvent = {
      payload: { bytes: 1, hash: 'hash', html: '' },
      projectId: PROJECT_ID,
      seq: nextSequence,
      ts: 'doc',
      turnId: 'turn-1',
      type: 'document_changed',
      version: 2,
    }
    const overhead = Buffer.byteLength(
      `id: ${nextSequence}\nevent: project_event\ndata: ${JSON.stringify(baseEvent)}\n\n`,
      'utf8',
    )
    const expandedBytes = PROTOCOL_MAX_DOCUMENT_EVENT_FRAME_BYTES - overhead
    const controls = Math.floor(expandedBytes / 6)
    const remainder = expandedBytes % 6
    const exactHtml = `${'\0'.repeat(controls)}${'x'.repeat(remainder)}`
    const baseSnapshot = await repository.readSnapshot(PROJECT_ID)
    if (!baseSnapshot?.ok) throw new Error('expected snapshot')
    repository.readSnapshot = async () => ({
      ok: true,
      snapshot: {
        ...baseSnapshot.snapshot,
        documentHash: 'hash',
        indexHtml: exactHtml,
      },
    })
    await repository.appendClientMessage(PROJECT_ID, {
      dir: 'out',
      event: 'document_changed',
      payload: { bytes: 1, hash: 'hash' },
      ts: 'doc',
      turnId: 'turn-1',
    })
    await waitFor(
      () =>
        response.frames().filter((frame) => frame.event === 'project_event')
          .length === 1,
    )
    expect(Buffer.byteLength(response.writes.at(-1)!, 'utf8')).toBe(
      PROTOCOL_MAX_DOCUMENT_EVENT_FRAME_BYTES,
    )
    response.close()
    response.writes.length = 0

    const oversizedResponse = new FakeResponse()
    repository.readSnapshot = async () => baseSnapshot
    await createProjectEventDelivery(repository).openProject(
      PROJECT_ID,
      oversizedResponse.asResponse(),
    )
    repository.readSnapshot = async () => ({
      ok: true,
      snapshot: {
        ...baseSnapshot.snapshot,
        documentHash: 'hash-2',
        indexHtml: `${exactHtml}x`,
      },
    })
    await repository.appendClientMessage(PROJECT_ID, {
      dir: 'out',
      event: 'document_changed',
      payload: { bytes: 1, hash: 'hash-2' },
      ts: 'doc-2',
      turnId: 'turn-1',
    })
    await waitFor(() => oversizedResponse.ended)
    expect(oversizedResponse.frames().at(-1)?.data).toContain('EVENT_TOO_LARGE')
  })

  it('projects a legacy prompt repaired by a canonical interrupted terminal', async () => {
    const fixture = await setupProject()
    const repository = fixture.runtime.repository
    await repository.appendClientMessage(PROJECT_ID, {
      dir: 'in',
      prompt: 'Legacy request',
      ts: '2026-09-06T00:00:03.000Z',
      turnId: 'legacy-turn',
      type: 'prompt',
    })
    await repository.appendClientMessage(PROJECT_ID, {
      dir: 'out',
      event: 'run_terminal',
      payload: {
        finishedAt: '2026-09-06T00:00:04.000Z',
        outcome: 'interrupted',
        reason: 'Server restarted while run was active.',
        stats: null,
        turnId: 'legacy-turn',
      },
      ts: '2026-09-06T00:00:04.000Z',
      turnId: 'legacy-turn',
    })
    const response = new FakeResponse()
    await createProjectEventDelivery(repository).openProject(
      PROJECT_ID,
      response.asResponse(),
    )
    expect(JSON.parse(response.frames()[0]!.data)).toMatchObject({
      run: { status: 'interrupted', turnId: 'legacy-turn' },
      turns: [
        expect.anything(),
        expect.objectContaining({
          error: 'Server restarted while run was active.',
          id: 'legacy-turn',
          isStreaming: false,
        }),
      ],
    })
    response.close()
  })

  it('emits INVALID_EVENT for deterministic snapshot and list schema failures', async () => {
    const fixture = await setupProject()
    const repository = fixture.runtime.repository
    const originalSnapshot = await repository.readSnapshot(PROJECT_ID)
    if (!originalSnapshot?.ok) throw new Error('expected snapshot')
    repository.readSnapshot = async () =>
      ({
        ok: true,
        snapshot: {
          ...originalSnapshot.snapshot,
          metadata: {
            ...originalSnapshot.snapshot.metadata,
            titleSource: 'invalid',
          },
        },
      }) as never
    const projectResponse = new FakeResponse()
    await createProjectEventDelivery(repository).openProject(
      PROJECT_ID,
      projectResponse.asResponse(),
    )
    expect(projectResponse.frames()[0]?.data).toContain('INVALID_EVENT')

    repository.listProjects = async () =>
      [
        { ...(await setupProjectMeta(fixture)), titleSource: 'invalid' },
      ] as never
    const listResponse = new FakeResponse()
    await createProjectEventDelivery(repository).openList(
      listResponse.asResponse(),
    )
    expect(listResponse.frames()[0]?.data).toContain('INVALID_EVENT')
  })

  it('emits INVALID_EVENT when a later list refresh becomes invalid', async () => {
    const fixture = await setupProject()
    const repository = fixture.runtime.repository
    const response = new FakeResponse()
    await createProjectEventDelivery(repository).openList(response.asResponse())
    const valid = await setupProjectMeta(fixture)
    repository.listProjects = async () =>
      [{ ...valid, titleSource: 'invalid' }] as never

    await repository.updateProjectModel(PROJECT_ID, { title: 'Refresh' })
    await new Promise((resolve) => setTimeout(resolve, 70))
    await waitFor(() =>
      response
        .frames()
        .some(
          (frame) =>
            frame.event === 'protocol_error' &&
            frame.data.includes('INVALID_EVENT'),
        ),
    )
    expect(response.ended).toBe(true)
  })

  it('hydrates a terminal project after reconstructing the runtime from disk', async () => {
    const root = await mkdtemp(join(tmpdir(), 'protocol-reconstruct-'))
    let first: RuntimeFixture | undefined
    let second: RuntimeFixture | undefined
    try {
      first = await createRuntimeFixture({}, { removeRoot: false, root })
      const project = await first.runtime.repository.createProject({
        creationKey: PROJECT_ID,
      })
      first.runtime.repository
        .createProjectHtmlStore(project.id)
        .set('<!doctype html><main>Reconstructed</main>')
      await first.runtime.repository.appendClientMessage(project.id, {
        attachments: [],
        compactionPercent: null,
        dir: 'in',
        imageModel: 'image',
        lifecycle: 'run_accepted',
        model: 'model',
        prompt: 'Build',
        requestDigest: 'digest',
        requestVersion: 1,
        ts: '2026-09-06T00:00:00.000Z',
        turnId: 'turn-1',
        type: 'prompt',
        visionModel: 'vision',
      })
      await first.runtime.repository.appendClientMessage(project.id, {
        dir: 'out',
        event: 'run_terminal',
        payload: {
          finishedAt: '2026-09-06T00:00:01.000Z',
          outcome: 'completed',
          stats: null,
          turnId: 'turn-1',
        },
        ts: '2026-09-06T00:00:01.000Z',
        turnId: 'turn-1',
      })
      await first.dispose()
      second = await createRuntimeFixture({}, { removeRoot: false, root })
      const response = new FakeResponse()
      await createProjectEventDelivery(second.runtime.repository).openProject(
        project.id,
        response.asResponse(),
      )
      expect(JSON.parse(response.frames()[0]!.data)).toMatchObject({
        html: '<!doctype html><main>Reconstructed</main>',
        run: { status: 'idle', turnId: 'turn-1' },
        turns: [expect.objectContaining({ id: 'turn-1', isStreaming: false })],
      })
      response.close()
    } finally {
      await disposeReconstructedFixtures(root, first, second)
    }
  })

  it('keeps two real HTTP editors converged through edits, Stop, completion, and reconnect', async () => {
    let streams = 0
    const fixture = await createRuntimeFixture({
      createAgentSdkRuntime: async () => ({
        createAgent: (() => ({
          async stream(
            _message: unknown,
            options: { abortSignal: AbortSignal },
          ) {
            streams += 1
            const invocation = streams
            return {
              finishReason: Promise.resolve('stop'),
              fullStream: (async function* () {
                yield { payload: { text: 'Working' }, type: 'text-delta' }
                if (invocation === 1)
                  await new Promise<void>((resolve) =>
                    options.abortSignal.addEventListener(
                      'abort',
                      () => resolve(),
                      { once: true },
                    ),
                  )
              })(),
              usage: Promise.resolve({
                cachedInputTokens: 0,
                inputTokens: 2,
                outputTokens: 3,
                totalTokens: 5,
              }),
            }
          },
        })) as never,
        async deleteProjectMemory() {},
        async dispose() {},
        memory: { async deleteThread() {} },
      }),
    })
    fixtures.push(fixture)
    const project = await fixture.runtime.projectService.create({
      creationKey: '44444444-4444-4444-8444-444444444444',
    })
    fixture.runtime.repository
      .createProjectHtmlStore(project.id)
      .set('<!doctype html><main>Two editors</main>')
    const server = createApiServer(fixture.runtime)
    const clients = [new AbortController(), new AbortController()]
    let disallow: (() => void) | undefined
    try {
      await listen(server)
      const port = (server.address() as AddressInfo).port
      const baseUrl = `http://127.0.0.1:${port}`
      disallow = allowNetworkOrigin(baseUrl)
      const responses = await Promise.all(
        clients.map((controller) =>
          fetch(`${baseUrl}/api/projects/${project.id}/events?v=2`, {
            signal: controller.signal,
          }),
        ),
      )
      const readers = responses.map((response) => new LiveSseReader(response))
      await Promise.all(readers.map((reader) => reader.until('state')))
      const started = await fetch(`${baseUrl}/agent`, {
        body: JSON.stringify({
          projectId: project.id,
          prompt: 'Start in the first editor',
          turnId: 'shared-turn',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      expect(await started.json()).toMatchObject({
        ok: true,
        turnId: 'shared-turn',
      })
      await Promise.all(
        readers.map((reader) => reader.until('project_event', 'run_accepted')),
      )
      await Promise.all(
        readers.map((reader) => reader.until('project_event', 'text')),
      )
      fixture.runtime.repository
        .createProjectHtmlStore(project.id)
        .set('<!doctype html><main>Committed before Stop</main>')
      clients[0]!.abort()
      const stopped = await fetch(
        `${baseUrl}/api/projects/${project.id}/stop`,
        { method: 'POST' },
      )
      expect(await stopped.json()).toMatchObject({ ok: true, stopped: true })
      const document = await readers[1]!.until(
        'project_event',
        'document_changed',
      )
      expect(document.data).toMatchObject({
        payload: { html: expect.stringContaining('Committed before Stop') },
      })
      const terminal = await readers[1]!.until('project_event', 'run_terminal')
      expect(terminal.data).toMatchObject({
        payload: { outcome: 'stopped' },
        turnId: 'shared-turn',
      })
      clients[1]!.abort()

      const reconnect = new AbortController()
      clients.push(reconnect)
      const reconnectReader = new LiveSseReader(
        await fetch(`${baseUrl}/api/projects/${project.id}/events?v=2`, {
          signal: reconnect.signal,
        }),
      )
      const snapshot = await reconnectReader.until('state')
      expect(snapshot.data).toMatchObject({
        html: expect.stringContaining('Committed before Stop'),
        run: { status: 'stopped', turnId: 'shared-turn' },
        turns: [
          expect.objectContaining({
            id: 'shared-turn',
            isStreaming: false,
            stopped: true,
          }),
        ],
      })

      const completed = await fetch(`${baseUrl}/agent`, {
        body: JSON.stringify({
          projectId: project.id,
          prompt: 'Complete in the reconnected editor',
          turnId: 'completed-turn',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      expect(await completed.json()).toMatchObject({
        ok: true,
        turnId: 'completed-turn',
      })
      await reconnectReader.until('project_event', 'run_accepted')
      await reconnectReader.until('project_event', 'text')
      const completedTerminal = await reconnectReader.until(
        'project_event',
        'run_terminal',
      )
      expect(completedTerminal.data).toMatchObject({
        payload: { outcome: 'completed' },
        turnId: 'completed-turn',
      })
    } finally {
      clients.forEach((controller) => controller.abort())
      disallow?.()
      await close(server)
    }
  })
})

class FakeResponse extends EventEmitter {
  blockWrites = false
  destroyed = false
  ended = false
  headersSent = false
  writableEnded = false
  readonly writes: string[] = []
  asResponse() {
    return this as unknown as ServerResponse
  }
  close() {
    this.destroyed = true
    this.emit('close')
  }
  end() {
    this.ended = true
    this.writableEnded = true
    return this
  }
  frames() {
    return this.writes.flatMap((chunk) =>
      chunk
        .split('\n\n')
        .filter((frame) => frame && !frame.startsWith(':'))
        .map((frame) => {
          const lines = frame.split('\n')
          return {
            data: lines
              .filter((line) => line.startsWith('data: '))
              .map((line) => line.slice(6))
              .join('\n'),
            event: lines.find((line) => line.startsWith('event: '))?.slice(7),
            id: lines.find((line) => line.startsWith('id: '))?.slice(4),
          }
        }),
    )
  }
  write(value: string) {
    this.headersSent = true
    this.writes.push(String(value))
    return !this.blockWrites
  }
  writeHead() {
    this.headersSent = true
    return this
  }
}

class LiveSseReader {
  private buffer = ''
  private readonly decoder = new TextDecoder()
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>

  constructor(response: Response) {
    if (!response.body) throw new Error('expected SSE response body')
    this.reader = response.body.getReader()
  }

  async until(event: string, type?: string) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      let boundary: number
      while ((boundary = this.buffer.indexOf('\n\n')) >= 0) {
        const frame = this.buffer.slice(0, boundary)
        this.buffer = this.buffer.slice(boundary + 2)
        if (frame.startsWith(':')) continue
        const parsed = parseLiveFrame(frame)
        if (
          parsed.event === event &&
          (type === undefined ||
            (parsed.data as { type?: unknown }).type === type)
        )
          return parsed
      }
      const chunk = await Promise.race([
        this.reader.read(),
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error('SSE frame timed out.')), 5_000),
        ),
      ])
      if (chunk.done) throw new Error('SSE ended before expected frame.')
      this.buffer += this.decoder.decode(chunk.value, { stream: true })
    }
    throw new Error('Expected SSE frame was not received.')
  }
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.closeAllConnections()
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

async function disposeReconstructedFixtures(
  root: string,
  ...fixtures: (RuntimeFixture | undefined)[]
) {
  const results = await Promise.allSettled(
    fixtures.map((fixture) => fixture?.dispose()),
  )
  await rm(root, { force: true, recursive: true })
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  )
  if (failures.length) throw new AggregateError(failures)
}

function listen(server: Server) {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error)
    server.once('error', onError)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError)
      resolve()
    })
  })
}

function parseLiveFrame(frame: string) {
  const lines = frame.split('\n')
  const event = lines.find((line) => line.startsWith('event: '))?.slice(7) ?? ''
  const data = lines
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice(6))
    .join('\n')
  return { data: JSON.parse(data) as unknown, event }
}

async function setupProject() {
  const fixture = await createRuntimeFixture()
  fixtures.push(fixture)
  const project = await fixture.runtime.repository.createProject({
    creationKey: PROJECT_ID,
  })
  fixture.runtime.repository
    .createProjectHtmlStore(project.id)
    .set(
      '<!doctype html><html><head><title>Page</title></head><body>Hi</body></html>',
    )
  await fixture.runtime.repository.appendClientMessage(project.id, {
    attachments: [],
    compactionPercent: null,
    dir: 'in',
    imageModel: 'image',
    lifecycle: 'run_accepted',
    model: 'model',
    prompt: 'Build',
    requestDigest: 'digest',
    requestVersion: 1,
    ts: '2026-09-06T00:00:00.000Z',
    turnId: 'turn-1',
    type: 'prompt',
    visionModel: 'vision',
  })
  return fixture
}

async function setupProjectMeta(fixture: RuntimeFixture) {
  const project = await fixture.runtime.repository.getProject(PROJECT_ID)
  if (!project) throw new Error('expected project')
  const { indexHtml: _html, messages: _messages, ...meta } = project
  return meta
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return
    await tick()
  }
  throw new Error('Condition did not settle.')
}
