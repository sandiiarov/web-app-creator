import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import type { ServerResponse } from 'node:http'

import type {
  RunAcceptedAttachment,
  RunAcceptedClientEvent,
  RunBlockedPayload,
  RunTerminalOutcome,
  RunTerminalPayload,
} from '@workspace/conversation'

import type {
  CommittedClientMessageEntry,
  Project,
  ProjectRepository,
  RunState,
} from '../mastra/lib/project-store.ts'
import type { RunBus, RunEntry } from '../mastra/lib/run-bus.ts'
import {
  createOperationScope,
  type OperationScope,
  type OperationScopeFactory,
  type ProviderUsageReport,
} from '../providers/operation-scope.ts'

export type RunAttachmentInput =
  | {
      dataUrl: string
      id: string
      kind?: 'image'
      mediaType: 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp'
      name: string
      size: number
    }
  | {
      kind: 'element'
      selector: string
    }

export interface RunCompletion {
  outcome: 'blocked' | RunTerminalOutcome
  reason?: string
  turnId: string
}

export type RunCoordinator = ReturnType<typeof createRunCoordinator>

export interface RunCoordinatorOptions {
  bus: RunBus
  createOperationScope?: OperationScopeFactory
  defaultImageModel: string
  defaultTextModel: string
  defaultVisionModel: string
  drainGraceMs: number
  execute: RunExecutor
  operationTimeoutMs: number
  repository: ProjectRepository
}

export interface RunExecutionContext extends Required<
  Pick<
    RunStartCommand,
    | 'attachments'
    | 'baseUrl'
    | 'imageModel'
    | 'projectId'
    | 'prompt'
    | 'turnId'
    | 'visionModel'
  >
> {
  compactionPercent?: number
  controller: AbortController
  operations: OperationScope
  project: Project
  setUsageReporter(reporter: (report: ProviderUsageReport) => void): void
  textModel: string
}

export type RunExecutionResult =
  | {
      knownUsage: null | Record<string, unknown>
      outcome: 'blocked'
      reason: string
      settlement: Promise<{
        reason?: string
        stats: null | Record<string, unknown>
      }>
    }
  | {
      outcome: 'completed' | 'error' | 'stopped'
      reason?: string
      stats: null | Record<string, unknown>
    }

export type RunExecutor = (
  context: RunExecutionContext,
) => Promise<RunExecutionResult>

export interface RunStartCommand {
  attachments?: RunAttachmentInput[]
  baseUrl: string
  compactionPercent?: number
  imageModel?: string
  projectId: string
  prompt: string
  subscriber?: ServerResponse
  textModel?: string
  turnId?: string
  visionModel?: string
}

export type RunStartResult =
  | {
      existing?: true
      ok: true
      outcome?: RunTerminalOutcome
      status: 'running'
      turnId: string
    }
  | {
      ok: false
      reason: 'conflict' | 'deleted' | 'not_found' | 'overlap' | 'storage'
    }

interface ActiveRun {
  acceptance: Promise<RunStartResult>
  blockedKind?: 'acceptance' | 'execution'
  command: RunStartCommand
  completion: Deferred<RunCompletion>
  controller: AbortController
  digest: string
  entry: RunEntry
  execution?: Promise<RunExecutionResult>
  firstOutcome: Deferred<RunCompletion>
  normalized: NormalizedRequest
  operations?: OperationScope
  state: 'accepting' | 'blocked' | 'executing' | 'terminal'
  terminalization?: Promise<void>
  turnId: string
}

interface Deferred<T> {
  promise: Promise<T>
  reject(reason?: unknown): void
  resolve(value: T): void
}

type NormalizedAttachment =
  | {
      byteLength: number
      bytes: Buffer
      kind: 'image'
      mediaType: string
      name: string
      sha256: string
    }
  | {
      kind: 'element'
      selector: string
    }

interface NormalizedRequest {
  attachments: NormalizedAttachment[]
  compactionPercent: null | number
  imageModel: string
  prompt: string
  textModel: string
  version: 1
  visionModel: string
}

export class RunCoordinatorDisposedError extends Error {
  constructor() {
    super('Run coordinator is disposed.')
    this.name = 'RunCoordinatorDisposedError'
  }
}

export class RunCoordinatorUnsettledError extends Error {
  readonly projectIds: string[]

  constructor(projectIds: string[]) {
    super(
      `Run work remains unsettled during disposal: ${projectIds.join(', ')}`,
    )
    this.name = 'RunCoordinatorUnsettledError'
    this.projectIds = projectIds
  }
}

export function createRunCoordinator({
  bus,
  createOperationScope: createScope = createOperationScope,
  defaultImageModel,
  defaultTextModel,
  defaultVisionModel,
  drainGraceMs,
  execute,
  operationTimeoutMs,
  repository,
}: RunCoordinatorOptions) {
  const active = new Map<string, ActiveRun>()
  const unhealthy = new Set<string>()
  const deleting = new Set<string>()
  const pending = new Set<Promise<unknown>>()
  const pendingErrors: unknown[] = []
  let accepting = true

  function start(command: RunStartCommand): Promise<RunStartResult> {
    if (!accepting) return Promise.reject(new RunCoordinatorDisposedError())
    const turnId = command.turnId ?? `turn-${randomUUID()}`
    let normalized = normalizeRequest(command, {
      compactionPercent: null,
      imageModel: defaultImageModel,
      textModel: defaultTextModel,
      visionModel: defaultVisionModel,
    })
    const digest = digestRequest(normalized)
    const current = active.get(command.projectId)
    if (current) {
      if (current.turnId !== turnId) {
        return Promise.resolve({ ok: false, reason: 'overlap' })
      }
      normalized = normalizeRequest(command, {
        compactionPercent: current.normalized.compactionPercent,
        imageModel: current.normalized.imageModel,
        textModel: current.normalized.textModel,
        visionModel: current.normalized.visionModel,
      })
      if (current.digest !== digestRequest(normalized)) {
        return Promise.resolve({ ok: false, reason: 'conflict' })
      }
      return current.acceptance
    }
    if (deleting.has(command.projectId)) {
      return Promise.resolve({ ok: false, reason: 'deleted' })
    }
    if (unhealthy.has(command.projectId)) {
      return Promise.resolve({ ok: false, reason: 'storage' })
    }

    const controller = new AbortController()
    const startedAt = new Date().toISOString()
    const entry: RunEntry = {
      controller,
      startedAt,
      subscribers: command.subscriber
        ? new Set<ServerResponse>([command.subscriber])
        : new Set<ServerResponse>(),
      turnId,
    }
    if (!bus.claimRun(command.projectId, entry)) {
      return Promise.resolve({ ok: false, reason: 'overlap' })
    }
    const completion = deferred<RunCompletion>()
    const firstOutcome = deferred<RunCompletion>()
    const slot: ActiveRun = {
      acceptance: Promise.resolve({ ok: false, reason: 'storage' }),
      command,
      completion,
      controller,
      digest,
      entry,
      firstOutcome,
      normalized,
      state: 'accepting',
      turnId,
    }
    active.set(command.projectId, slot)
    slot.acceptance = acceptAndLaunch(slot, normalized)
    track(slot.acceptance)
    return slot.acceptance
  }

  async function acceptAndLaunch(
    slot: ActiveRun,
    normalized: NormalizedRequest,
  ): Promise<RunStartResult> {
    const { command, turnId } = slot
    const projectId = command.projectId
    let createdAssets: string[] = []
    try {
      const project = await repository.getProject(projectId)
      if (!accepting) throw new RunCoordinatorDisposedError()
      if (!project) {
        releaseSlot(projectId, slot)
        return { ok: false, reason: 'not_found' }
      }
      const journal = await repository.readClientJournal(projectId)
      if (journal.status !== 'clean') {
        unhealthy.add(projectId)
        return blockAcceptance(projectId, slot)
      }
      const existing = findAccepted(journal.records, turnId)
      if (existing) {
        const retry = normalizeRequest(command, {
          compactionPercent:
            command.compactionPercent === undefined
              ? existing.compactionPercent
              : null,
          imageModel:
            command.imageModel === undefined
              ? existing.imageModel
              : defaultImageModel,
          textModel:
            command.textModel === undefined ? existing.model : defaultTextModel,
          visionModel:
            command.visionModel === undefined
              ? existing.visionModel
              : defaultVisionModel,
        })
        if (digestRequest(retry) !== existing.requestDigest) {
          releaseSlot(projectId, slot)
          return { ok: false, reason: 'conflict' }
        }
        const terminal = findTerminal(journal.records, turnId)
        releaseSlot(projectId, slot)
        return {
          existing: true,
          ok: true,
          ...(terminal ? { outcome: terminal.outcome } : {}),
          status: 'running',
          turnId,
        }
      }
      if (findLegacyPrompt(journal.records, turnId)) {
        releaseSlot(projectId, slot)
        return { ok: false, reason: 'conflict' }
      }

      const acceptedAttachments: RunAcceptedAttachment[] = []
      for (const attachment of normalized.attachments) {
        if (attachment.kind === 'element') {
          acceptedAttachments.push({
            kind: 'element',
            name: `Element ${attachment.selector}`,
            selector: attachment.selector,
          })
          continue
        }
        const persisted = repository.persistAcceptedAttachmentSync(
          projectId,
          attachment.sha256,
          attachment.mediaType,
          attachment.bytes,
        )
        if (persisted.created) createdAssets.push(persisted.path)
        acceptedAttachments.push({
          assetPath: persisted.path,
          byteLength: attachment.byteLength,
          kind: 'image',
          mediaType: attachment.mediaType,
          name: attachment.name,
          sha256: attachment.sha256,
        })
      }
      const acceptedAt = new Date().toISOString()
      await repository.appendClientMessage(projectId, {
        attachments: acceptedAttachments,
        compactionPercent: normalized.compactionPercent,
        dir: 'in',
        imageModel: normalized.imageModel,
        lifecycle: 'run_accepted',
        model: normalized.textModel,
        prompt: normalized.prompt,
        requestDigest: slot.digest,
        requestVersion: 1,
        ts: acceptedAt,
        turnId,
        type: 'prompt',
        visionModel: normalized.visionModel,
      } satisfies RunAcceptedClientEvent)
      createdAssets = []
      repository.setRunStatusSync(projectId, {
        error: null,
        finishedAt: null,
        runBlocked: false,
        startedAt: acceptedAt,
        status: 'running',
        turnId,
      })
      if (slot.state === 'blocked' || slot.controller.signal.aborted) {
        return { ok: true, status: 'running', turnId }
      }
      slot.state = 'executing'
      let recordUsage: ((report: ProviderUsageReport) => void) | undefined
      const operations = createScope({
        drainGraceMs,
        onUsage(report) {
          recordUsage?.(report)
        },
        operationTimeoutMs,
        signal: slot.controller.signal,
      })
      slot.operations = operations
      const execution = Promise.resolve(
        execute({
          attachments: command.attachments ?? [],
          baseUrl: command.baseUrl,
          ...(command.compactionPercent === undefined
            ? {}
            : { compactionPercent: command.compactionPercent }),
          controller: slot.controller,
          imageModel: normalized.imageModel,
          operations,
          project,
          projectId,
          prompt: normalized.prompt,
          setUsageReporter(reporter) {
            recordUsage = reporter
          },
          textModel: normalized.textModel,
          turnId,
          visionModel: normalized.visionModel,
        }),
      )
      slot.execution = execution
      track(coordinateExecution(projectId, slot, execution))
      return { ok: true, status: 'running', turnId }
    } catch (error) {
      const acceptance = await getAcceptanceState(projectId, turnId)
      if (acceptance === 'not_accepted') {
        for (const path of createdAssets) {
          try {
            repository.removeAcceptedAttachmentSync(projectId, path)
          } catch {
            // Preserve the acceptance failure.
          }
        }
      }
      if (acceptance === 'accepted') {
        await terminalize(projectId, slot, {
          outcome: 'error',
          reason: safeError(error),
          stats: null,
        }).catch(() => {})
      } else if (acceptance === 'not_accepted') {
        const completion = {
          outcome: slot.controller.signal.aborted ? 'stopped' : 'error',
          reason: safeError(error),
          turnId,
        } satisfies RunCompletion
        slot.firstOutcome.resolve(completion)
        slot.completion.resolve(completion)
        releaseSlot(projectId, slot)
      } else {
        unhealthy.add(projectId)
        slot.state = 'blocked'
        slot.blockedKind = 'acceptance'
      }
      throw error
    }
  }

  async function coordinateExecution(
    projectId: string,
    slot: ActiveRun,
    execution: Promise<RunExecutionResult>,
  ): Promise<void> {
    let result: RunExecutionResult
    try {
      result = await execution
    } catch (error) {
      if (slot.state === 'blocked') return
      const drained = await slot.operations?.drain()
      if (drained && !drained.ok) {
        const reason = `${safeError(error)} ${`Provider operations did not settle: ${drained.pendingOperationIds.join(', ')}.`}`
        await markBlocked(projectId, slot, {
          knownUsage: null,
          outcome: 'blocked',
          reason,
          settlement: slot.operations!.waitForSettled().then(() => ({
            reason,
            stats: null,
          })),
        })
        return
      }
      await terminalize(projectId, slot, {
        outcome: slot.controller.signal.aborted ? 'stopped' : 'error',
        reason: safeError(error),
        stats: null,
      })
      return
    }
    if (slot.state === 'blocked') return
    if (result.outcome === 'blocked') {
      await markBlocked(projectId, slot, result)
      return
    }
    await terminalize(projectId, slot, result)
  }

  async function markBlocked(
    projectId: string,
    slot: ActiveRun,
    result: Extract<RunExecutionResult, { outcome: 'blocked' }>,
  ): Promise<void> {
    if (slot.state === 'blocked' || slot.terminalization) return
    slot.state = 'blocked'
    slot.blockedKind = 'execution'
    unhealthy.add(projectId)
    const payload: RunBlockedPayload = {
      knownUsage: result.knownUsage,
      reason: result.reason,
      turnId: slot.turnId,
    }
    slot.firstOutcome.resolve({
      outcome: 'blocked',
      reason: result.reason,
      turnId: slot.turnId,
    })
    const recorded = repository
      .appendClientMessage(projectId, {
        dir: 'out',
        event: 'run_blocked',
        payload,
        ts: new Date().toISOString(),
        turnId: slot.turnId,
      })
      .then(() => {
        repository.setRunStatusSync(projectId, {
          error: result.reason,
          finishedAt: null,
          runBlocked: true,
          status: 'error',
        })
        bus.broadcast(projectId, 'run_blocked', payload)
      })
      .catch((error: unknown) => {
        console.error(
          `[run-coordinator] failed to record blocked run ${projectId}:`,
          error,
        )
      })
    track(recorded)
    const settlement = result.settlement.catch((error: unknown) => ({
      reason: safeError(error),
      stats: result.knownUsage,
    }))
    void Promise.all([recorded, settlement, slot.operations?.waitForSettled()])
      .then(async ([, settled]) => {
        await terminalize(projectId, slot, {
          outcome: 'error',
          reason: settled.reason ?? result.reason,
          stats: settled.stats,
        })
      })
      .catch((error: unknown) => {
        console.error(
          `[run-coordinator] late settlement failed for ${projectId}:`,
          error,
        )
      })
  }

  function terminalize(
    projectId: string,
    slot: ActiveRun,
    result: Exclude<RunExecutionResult, { outcome: 'blocked' }>,
  ): Promise<void> {
    slot.terminalization ??= commitTerminal(projectId, slot, result)
    return slot.terminalization
  }

  async function commitTerminal(
    projectId: string,
    slot: ActiveRun,
    result: Exclude<RunExecutionResult, { outcome: 'blocked' }>,
  ): Promise<void> {
    const finishedAt = new Date().toISOString()
    const payload: RunTerminalPayload = {
      finishedAt,
      outcome: result.outcome,
      ...(result.reason ? { reason: result.reason } : {}),
      stats: result.stats,
      turnId: slot.turnId,
    }
    let committed = false
    try {
      await repository.commitDocumentChange(projectId, slot.turnId)
      const journal = await repository.readClientJournal(projectId)
      const existing = findTerminal(journal.records, slot.turnId)
      if (!existing) {
        await repository.appendClientMessage(projectId, {
          dir: 'out',
          event: 'run_terminal',
          payload,
          ts: finishedAt,
          turnId: slot.turnId,
        })
      }
      committed = true
      const status = statusForOutcome(existing?.outcome ?? payload.outcome)
      try {
        repository.setRunStatusSync(projectId, {
          error: payload.reason ?? null,
          finishedAt,
          runBlocked: false,
          status,
          turnId: slot.turnId,
        })
      } catch (error) {
        console.error(
          `[run-coordinator] terminal projection failed for ${projectId}:`,
          error,
        )
      }
      publishLegacyTerminal(projectId, existing ?? payload)
      await repository.flushProjectLogs(projectId)
      unhealthy.delete(projectId)
      slot.state = 'terminal'
      const completion = {
        outcome: existing?.outcome ?? payload.outcome,
        ...(payload.reason ? { reason: payload.reason } : {}),
        turnId: slot.turnId,
      } satisfies RunCompletion
      slot.firstOutcome.resolve(completion)
      slot.completion.resolve(completion)
      releaseSlot(projectId, slot)
    } catch (error) {
      unhealthy.add(projectId)
      if (!committed) slot.state = 'blocked'
      const completion = {
        outcome: 'blocked',
        reason: safeError(error),
        turnId: slot.turnId,
      } satisfies RunCompletion
      slot.firstOutcome.resolve(completion)
      slot.completion.reject(error)
      releaseSlot(projectId, slot)
      throw error
    }
  }

  function publishLegacyTerminal(
    projectId: string,
    payload: RunTerminalPayload,
  ): void {
    if (payload.stats) bus.broadcast(projectId, 'stats', payload.stats)
    if (payload.outcome !== 'completed') {
      bus.broadcast(projectId, 'error', {
        message: payload.outcome === 'stopped' ? 'stopped' : payload.reason,
      })
    }
    bus.broadcast(projectId, 'done', {})
  }

  async function stop(projectId: string): Promise<{
    ok: boolean
    outcome?: RunCompletion['outcome']
    stopped: boolean
  }> {
    const slot = active.get(projectId)
    if (!slot) return { ok: true, stopped: false }
    slot.controller.abort(new DOMException('Stopped', 'AbortError'))
    const result = await firstWithin(slot.firstOutcome.promise, drainGraceMs)
    if (!result) {
      const reason =
        'Run execution did not settle before the drain grace period.'
      if (slot.terminalization) {
        return { ok: true, outcome: 'blocked', stopped: false }
      }
      const execution = slot.execution
      await markBlocked(projectId, slot, {
        knownUsage: null,
        outcome: 'blocked',
        reason,
        settlement: execution
          ? settleLateExecution(execution)
          : slot.acceptance.then(async () => {
              if (slot.execution) {
                return settleLateExecution(slot.execution)
              }
              return { reason, stats: null }
            }),
      })
      return { ok: true, outcome: 'blocked', stopped: false }
    }
    return {
      ok: true,
      outcome: result.outcome,
      stopped: result.outcome !== 'blocked',
    }
  }

  function waitForCompletion(
    projectId: string,
    turnId: string,
  ): Promise<RunCompletion> {
    const slot = active.get(projectId)
    if (!slot || slot.turnId !== turnId) {
      return Promise.reject(new Error('Run completion is not available.'))
    }
    return slot.firstOutcome.promise
  }

  async function recover(): Promise<number> {
    let recovered = 0
    for (const projectId of await repository.listProjectIds()) {
      const local = active.get(projectId)
      if (local) {
        if (local.state !== 'blocked' || local.blockedKind !== 'acceptance') {
          continue
        }
        const journal = await repository.readClientJournal(projectId)
        if (journal.status !== 'clean') continue
        const accepted = findAccepted(journal.records, local.turnId)
        const terminal = findTerminal(journal.records, local.turnId)
        if (accepted && !terminal) {
          await appendInterrupted(projectId, local.turnId)
          recovered += 1
        } else if (terminal) {
          projectTerminal(projectId, terminal)
          recovered += 1
        }
        unhealthy.delete(projectId)
        local.state = 'terminal'
        const outcome = {
          outcome: terminal?.outcome ?? (accepted ? 'interrupted' : 'error'),
          turnId: local.turnId,
        } satisfies RunCompletion
        local.firstOutcome.resolve(outcome)
        local.completion.resolve(outcome)
        releaseSlot(projectId, local)
        continue
      }
      const journal = await repository.readClientJournal(projectId)
      if (journal.status !== 'clean') {
        unhealthy.add(projectId)
        repository.setRunStatusSync(projectId, {
          error: `Client journal requires recovery (${journal.status}).`,
          runBlocked: true,
          status: 'error',
        })
        continue
      }
      unhealthy.delete(projectId)
      const state = repository.readRunStateSync(projectId)
      const records = journal.records
      const lifecycle = findCurrentLifecycle(records, projectId)
      if (lifecycle?.open) {
        await appendInterrupted(
          projectId,
          lifecycle.open.turnId,
          lifecycle.open.legacySequence,
        )
        recovered += 1
        continue
      }
      if (lifecycle?.terminal) {
        projectTerminal(projectId, lifecycle.terminal)
        recovered +=
          state.status === statusForOutcome(lifecycle.terminal.outcome) ? 0 : 1
        continue
      }
      if (state.status !== 'running' || !state.turnId) continue
      const legacy = findLastLegacyTurn(records)
      if (legacy?.terminal) {
        projectLegacyTerminal(projectId, state, legacy.terminal)
      } else {
        await appendInterrupted(
          projectId,
          legacy?.turnId ?? state.turnId,
          legacy?.sequence,
        )
      }
      recovered += 1
    }
    return recovered
  }

  async function appendInterrupted(
    projectId: string,
    turnId: string,
    legacySequence?: number,
  ): Promise<void> {
    const journal = await repository.readClientJournal(projectId)
    const existing = findTerminal(journal.records, turnId)
    if (existing) {
      projectTerminal(projectId, existing)
      return
    }
    const finishedAt = new Date().toISOString()
    const payload: RunTerminalPayload & { legacyPromptSeq?: number } = {
      finishedAt,
      ...(legacySequence === undefined
        ? {}
        : { legacyPromptSeq: legacySequence }),
      outcome: 'interrupted',
      reason: 'Server restarted while run was active.',
      stats: null,
      turnId,
    }
    await repository.appendClientMessage(projectId, {
      dir: 'out',
      event: 'run_terminal',
      payload,
      ts: finishedAt,
      turnId,
    })
    projectTerminal(projectId, payload)
  }

  function projectTerminal(projectId: string, payload: RunTerminalPayload) {
    repository.setRunStatusSync(projectId, {
      error: payload.reason ?? null,
      finishedAt: payload.finishedAt,
      runBlocked: false,
      status: statusForOutcome(payload.outcome),
      turnId: payload.turnId,
    })
  }

  function projectLegacyTerminal(
    projectId: string,
    state: RunState,
    terminal: { outcome: RunTerminalOutcome; reason?: string; ts: string },
  ) {
    repository.setRunStatusSync(projectId, {
      error: terminal.reason ?? null,
      finishedAt: terminal.ts,
      runBlocked: false,
      status: statusForOutcome(terminal.outcome),
      turnId: state.turnId,
    })
  }

  function beginDeletion(projectId: string): {
    active: ActiveRun | undefined
    blocked: boolean
    ok: true
    release(): void
  } {
    const acquired = !deleting.has(projectId)
    deleting.add(projectId)
    const slot = active.get(projectId)
    return {
      active: slot,
      blocked: unhealthy.has(projectId),
      ok: true,
      release() {
        if (acquired) deleting.delete(projectId)
      },
    }
  }

  function completeDeletion(projectId: string, slot?: ActiveRun): void {
    if (slot) releaseSlot(projectId, slot)
    unhealthy.delete(projectId)
  }

  function markProjectDeleted(projectId: string): void {
    deleting.add(projectId)
    unhealthy.delete(projectId)
  }

  function isProjectUnavailable(projectId: string): boolean {
    return deleting.has(projectId) || unhealthy.has(projectId)
  }

  function releaseSlot(projectId: string, slot: ActiveRun): void {
    if (active.get(projectId) === slot) active.delete(projectId)
    bus.releaseRun(projectId, slot.entry)
  }

  function blockAcceptance(projectId: string, slot: ActiveRun): RunStartResult {
    unhealthy.add(projectId)
    slot.state = 'blocked'
    slot.firstOutcome.resolve({
      outcome: 'blocked',
      reason: 'Project journal requires recovery.',
      turnId: slot.turnId,
    })
    slot.completion.resolve({
      outcome: 'blocked',
      reason: 'Project journal requires recovery.',
      turnId: slot.turnId,
    })
    releaseSlot(projectId, slot)
    return { ok: false, reason: 'storage' }
  }

  async function getAcceptanceState(
    projectId: string,
    turnId: string,
  ): Promise<'accepted' | 'not_accepted' | 'unknown'> {
    try {
      const journal = await repository.readClientJournal(projectId)
      if (findAccepted(journal.records, turnId)) return 'accepted'
      return journal.status === 'clean' ? 'not_accepted' : 'unknown'
    } catch {
      return 'unknown'
    }
  }

  async function dispose(): Promise<void> {
    accepting = false
    await Promise.allSettled(
      [...active.keys()].map((projectId) => stop(projectId)),
    )
    if (active.size > 0) {
      const settled = await firstWithin(
        Promise.allSettled(
          [...active.values()].map((slot) => slot.completion.promise),
        ),
        drainGraceMs,
      )
      if (!settled && active.size > 0) {
        throw new RunCoordinatorUnsettledError([...active.keys()])
      }
    }
    await waitForIdle()
  }

  function close(): void {
    accepting = false
  }

  async function waitForIdle(): Promise<void> {
    while (pending.size > 0) await Promise.allSettled(pending)
    await Promise.resolve()
    const blocked = [...active.values()].filter(
      (slot) => slot.state === 'blocked',
    )
    if (blocked.length > 0) {
      throw new AggregateError(
        blocked.map((slot) => new Error(`Run remains blocked: ${slot.turnId}`)),
        'Landing agent runner operations failed.',
      )
    }
    if (pendingErrors.length > 0) {
      const errors = pendingErrors.splice(0)
      throw new AggregateError(
        errors,
        'Landing agent runner operations failed.',
      )
    }
  }

  function track<T>(promise: Promise<T>): Promise<T> {
    pending.add(promise)
    void promise.then(
      () => pending.delete(promise),
      (error: unknown) => {
        pending.delete(promise)
        if (!(error instanceof RunCoordinatorDisposedError)) {
          pendingErrors.push(error)
        }
      },
    )
    return promise
  }

  return {
    beginDeletion,
    close,
    completeDeletion,
    dispose,
    isProjectUnavailable,
    markProjectDeleted,
    recover,
    start,
    stop,
    waitForCompletion,
    waitForIdle,
  }
}

function decodeDataUrl(value: string): Buffer {
  const comma = value.indexOf(',')
  if (comma === -1) throw new TypeError('Invalid attachment data URL.')
  return Buffer.from(value.slice(comma + 1).replace(/\s/g, ''), 'base64')
}

function deferred<T>(): Deferred<T> {
  let reject!: (reason?: unknown) => void
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept, deny) => {
    resolve = accept
    reject = deny
  })
  void promise.catch(() => {})
  return { promise, reject, resolve }
}

function digestRequest(request: NormalizedRequest): string {
  const canonical = {
    attachments: request.attachments.map((attachment) =>
      attachment.kind === 'element'
        ? { kind: attachment.kind, selector: attachment.selector }
        : {
            byteLength: attachment.byteLength,
            kind: attachment.kind,
            mediaType: attachment.mediaType,
            name: attachment.name,
            sha256: attachment.sha256,
          },
    ),
    compactionPercent: request.compactionPercent,
    imageModel: request.imageModel,
    prompt: request.prompt,
    textModel: request.textModel,
    version: request.version,
    visionModel: request.visionModel,
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

function findAccepted(records: CommittedClientMessageEntry[], turnId: string) {
  return records.find(
    (record): record is CommittedClientMessageEntry & RunAcceptedClientEvent =>
      isAcceptedRecord(record) && record.turnId === turnId,
  )
}

function findCurrentLifecycle(
  records: CommittedClientMessageEntry[],
  projectId: string,
):
  | undefined
  | {
      open?: { legacySequence?: number; turnId: string }
      terminal?: RunTerminalPayload
    } {
  let current: undefined | { legacySequence?: number; turnId: string }
  let currentCanonical = false
  let latestTerminal: RunTerminalPayload | undefined
  for (const record of records) {
    if (record.dir === 'in' && record.type === 'prompt') {
      current = {
        ...(isAcceptedRecord(record) ? {} : { legacySequence: record.seq }),
        turnId:
          typeof record.turnId === 'string'
            ? record.turnId
            : legacyTurnId(projectId, record.seq),
      }
      currentCanonical = isAcceptedRecord(record)
      continue
    }
    if (record.dir !== 'out') continue
    if (record.event === 'run_terminal') {
      const terminal =
        typeof record.turnId === 'string'
          ? findTerminal([record], record.turnId)
          : undefined
      if (terminal) {
        latestTerminal = terminal
        if (current?.turnId === terminal.turnId) current = undefined
      }
      continue
    }
    if (
      current &&
      !currentCanonical &&
      (record.event === 'done' || record.event === 'error') &&
      (typeof record.turnId !== 'string' || record.turnId === current.turnId)
    ) {
      const reason =
        record.event === 'error' &&
        isRecord(record.payload) &&
        typeof record.payload.message === 'string'
          ? record.payload.message
          : undefined
      latestTerminal = {
        finishedAt: record.ts,
        outcome:
          record.event === 'done'
            ? 'completed'
            : reason === 'stopped'
              ? 'stopped'
              : 'error',
        ...(reason ? { reason } : {}),
        stats: null,
        turnId: current.turnId,
      }
      current = undefined
    }
  }
  return current || latestTerminal
    ? {
        ...(current ? { open: current } : {}),
        ...(latestTerminal ? { terminal: latestTerminal } : {}),
      }
    : undefined
}

function findLastLegacyTurn(records: CommittedClientMessageEntry[]) {
  let current:
    | undefined
    | {
        sequence: number
        terminal?: { outcome: RunTerminalOutcome; reason?: string; ts: string }
        turnId: string
      }
  let promptOrdinal = 0
  for (const record of records) {
    if (record.dir === 'in' && record.type === 'prompt') {
      promptOrdinal += 1
      current = {
        sequence: record.seq,
        turnId:
          typeof record.turnId === 'string'
            ? record.turnId
            : `legacy-${record.seq}-${promptOrdinal}`,
      }
      continue
    }
    if (!current || record.dir !== 'out') continue
    if (record.event === 'done') {
      current.terminal ??= { outcome: 'completed', ts: record.ts }
    } else if (record.event === 'error' && isRecord(record.payload)) {
      const reason =
        typeof record.payload.message === 'string'
          ? record.payload.message
          : 'Run failed.'
      current.terminal = {
        outcome: reason === 'stopped' ? 'stopped' : 'error',
        reason,
        ts: record.ts,
      }
    }
  }
  return current
}

function findLegacyPrompt(
  records: CommittedClientMessageEntry[],
  turnId: string,
) {
  return records.find(
    (record) =>
      record.dir === 'in' &&
      record.type === 'prompt' &&
      record.lifecycle !== 'run_accepted' &&
      record.turnId === turnId,
  )
}

function findTerminal(
  records: CommittedClientMessageEntry[],
  turnId: string,
): RunTerminalPayload | undefined {
  const terminal = records.find(
    (record) =>
      record.dir === 'out' &&
      record.event === 'run_terminal' &&
      record.turnId === turnId,
  )
  if (!terminal || !isRecord(terminal.payload)) return undefined
  const payload = terminal.payload
  if (
    typeof payload.finishedAt !== 'string' ||
    typeof payload.turnId !== 'string' ||
    !isRunOutcome(payload.outcome)
  ) {
    return undefined
  }
  return payload as unknown as RunTerminalPayload
}

async function firstWithin<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function isAcceptedRecord(
  record: CommittedClientMessageEntry,
): record is CommittedClientMessageEntry & RunAcceptedClientEvent {
  return (
    record.dir === 'in' &&
    record.type === 'prompt' &&
    record.lifecycle === 'run_accepted' &&
    record.requestVersion === 1 &&
    typeof record.requestDigest === 'string' &&
    typeof record.turnId === 'string'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isRunOutcome(value: unknown): value is RunTerminalOutcome {
  return (
    value === 'completed' ||
    value === 'error' ||
    value === 'interrupted' ||
    value === 'stopped'
  )
}

function legacyTurnId(projectId: string, sequence: number): string {
  return `legacy-${createHash('sha256')
    .update(`${projectId}\0${sequence}`)
    .digest('hex')
    .slice(0, 24)}`
}

function normalizeModel(model: string): string {
  return model.startsWith('openrouter/')
    ? model.slice('openrouter/'.length)
    : model
}

function normalizeRequest(
  command: RunStartCommand,
  defaults: {
    compactionPercent: null | number
    imageModel: string
    textModel: string
    visionModel: string
  },
): NormalizedRequest {
  return {
    attachments: (command.attachments ?? []).map((attachment) => {
      if (attachment.kind === 'element') {
        return { kind: 'element', selector: attachment.selector }
      }
      const mediaType = attachment.mediaType.toLowerCase()
      const bytes = decodeDataUrl(attachment.dataUrl)
      return {
        byteLength: bytes.byteLength,
        bytes,
        kind: 'image',
        mediaType,
        name: attachment.name,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      }
    }),
    compactionPercent: command.compactionPercent ?? defaults.compactionPercent,
    imageModel: normalizeModel(command.imageModel ?? defaults.imageModel),
    prompt: command.prompt.trim(),
    textModel: normalizeModel(command.textModel ?? defaults.textModel),
    version: 1,
    visionModel: normalizeModel(command.visionModel ?? defaults.visionModel),
  }
}

async function resolveLateExecution(
  result: RunExecutionResult,
): Promise<{ reason?: string; stats: null | Record<string, unknown> }> {
  if (result.outcome === 'blocked') return result.settlement
  return {
    ...(result.reason ? { reason: result.reason } : {}),
    stats: result.stats,
  }
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown run failure.'
}

function settleLateExecution(
  execution: Promise<RunExecutionResult>,
): Promise<{ reason?: string; stats: null | Record<string, unknown> }> {
  return execution.then(resolveLateExecution).catch((error: unknown) => ({
    reason: safeError(error),
    stats: null,
  }))
}

function statusForOutcome(outcome: RunTerminalOutcome): RunState['status'] {
  switch (outcome) {
    case 'completed':
      return 'idle'
    case 'interrupted':
      return 'interrupted'
    default:
      return outcome
  }
}
