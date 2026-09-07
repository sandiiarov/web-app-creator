import {
  appendFile,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createImageStore, type ImageStore } from './image-store.ts'
import {
  createProjectFileSystem,
  type ProjectFileSystem,
} from './project-filesystem.ts'
import {
  createProjectRepository,
  ProjectAssetConflictError,
  ProjectDocumentCommitError,
  ProjectFileCommitError,
  type ProjectMessageTurn,
  type ProjectRepository,
} from './project-store.ts'
import { createRunBus } from './run-bus.ts'

let imageStore: ImageStore
let repository: ProjectRepository
let testRoot: string

beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), 'project-store-test-'))
  imageStore = createImageStore()
  repository = createProjectRepository({
    dataDir: testRoot,
    fileSystem: createProjectFileSystem(testRoot),
    imageStore,
    logger() {},
    runBus: createRunBus(),
  })
})

afterEach(async () => {
  await repository.dispose()
  await rm(testRoot, { force: true, recursive: true })
})

describe('project message storage', () => {
  it('keeps disk and HtmlStore memory unchanged when document rename fails', async () => {
    const project = await repository.createProject()
    const projectDir = join(repository.projectsDir, project.id)
    const htmlPath = join(projectDir, 'html.json')
    const oldBytes = await readFile(htmlPath)
    const base = createProjectFileSystem(testRoot)
    await repository.dispose()
    repository = createProjectRepository({
      dataDir: testRoot,
      fileSystem: {
        ...base,
        renameSync(from, to) {
          if (to === htmlPath) throw new Error('rename failed')
          base.renameSync(from, to)
        },
      },
      imageStore,
      logger() {},
      runBus: createRunBus(),
    })
    const store = repository.createProjectHtmlStore(project.id)
    const oldHtml = store.get()
    const nextHtml = oldHtml.replace('Untitled', 'Not committed')

    let failure: unknown
    try {
      store.set(nextHtml)
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(ProjectDocumentCommitError)
    expect(failure).toMatchObject({
      commitState: 'notCommitted',
      metadataProjection: 'notAttempted',
    })
    expect(store.get()).toBe(oldHtml)
    await expect(readFile(htmlPath)).resolves.toEqual(oldBytes)
  })

  it('reconciles HtmlStore memory when directory sync fails after document rename', async () => {
    const project = await repository.createProject()
    const projectDir = join(repository.projectsDir, project.id)
    const base = createProjectFileSystem(testRoot)
    const directoryFiles = new Set<number>()
    let failDirectoryOnce = true
    await repository.dispose()
    repository = createProjectRepository({
      dataDir: testRoot,
      fileSystem: {
        ...base,
        closeSync(file) {
          directoryFiles.delete(file)
          base.closeSync(file)
        },
        fsyncSync(file) {
          if (directoryFiles.has(file) && failDirectoryOnce) {
            failDirectoryOnce = false
            throw new Error('directory sync failed')
          }
          base.fsyncSync(file)
        },
        openSync(path, flags) {
          const file = base.openSync(path, flags)
          if (path === projectDir) directoryFiles.add(file)
          return file
        },
      },
      imageStore,
      logger() {},
      runBus: createRunBus(),
    })
    const store = repository.createProjectHtmlStore(project.id)
    const nextHtml = store.get().replace('Untitled', 'Visible uncertain')

    let failure: unknown
    try {
      store.set(nextHtml)
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(ProjectDocumentCommitError)
    expect(failure).toMatchObject({
      commitState: 'durabilityUncertain',
      metadataProjection: 'committed',
    })
    expect(store.get()).toContain('Visible uncertain')
    expect(await readFile(join(projectDir, 'html.json'), 'utf8')).toContain(
      'Visible uncertain',
    )
  })

  it('keeps a committed document visible when metadata projection fails', async () => {
    const project = await repository.createProject()
    const projectDir = join(repository.projectsDir, project.id)
    const metadataPath = join(projectDir, 'project.json')
    const base = createProjectFileSystem(testRoot)
    const bus = createRunBus()
    const broadcast = vi.spyOn(bus, 'broadcast')
    await repository.dispose()
    repository = createProjectRepository({
      dataDir: testRoot,
      fileSystem: {
        ...base,
        renameSync(from, to) {
          if (to === metadataPath) throw new Error('metadata rename failed')
          base.renameSync(from, to)
        },
      },
      imageStore,
      logger() {},
      runBus: bus,
    })
    const store = repository.createProjectHtmlStore(project.id)
    const nextHtml = store.get().replace('Untitled', 'Committed page')

    let failure: unknown
    try {
      store.set(nextHtml)
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(ProjectDocumentCommitError)
    expect(failure).toMatchObject({
      commitState: 'committed',
      metadataProjection: 'failed',
    })
    expect(store.get()).toContain('Committed page')
    expect(await readFile(join(projectDir, 'html.json'), 'utf8')).toContain(
      'Committed page',
    )
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('creates projects with empty message history', async () => {
    const project = await repository.createProject()

    expect(project.messages).toEqual([])
    await expect(repository.getProject(project.id)).resolves.toMatchObject({
      id: project.id,
      messages: [],
    })
  })

  it('stores new project HTML in html.json without creating index.html', async () => {
    const project = await repository.createProject()
    const projectDir = join(repository.projectsDir, project.id)

    const htmlJson = JSON.parse(
      await readFile(join(projectDir, 'html.json'), 'utf8'),
    )

    expect(htmlJson).toMatchObject({
      finalNewline: true,
      lineEnding: '\n',
      version: 1,
    })
    expect(htmlJson.lines[0]).toEqual(['a1', '<!doctype html>'])
    await expect(
      readFile(join(projectDir, 'index.html'), 'utf8'),
    ).rejects.toThrow('ENOENT')
    await expect(repository.getProject(project.id)).resolves.toMatchObject({
      id: project.id,
      indexHtml: project.indexHtml,
    })
  })

  it('migrates legacy index.html into html.json and removes the legacy file', async () => {
    const project = await repository.createProject()
    const projectDir = join(repository.projectsDir, project.id)
    const legacyHtml = '<main>\n  <h1>Legacy</h1>\n</main>\n'

    await rm(join(projectDir, 'html.json'))
    await writeFile(join(projectDir, 'index.html'), legacyHtml, 'utf8')

    await expect(repository.getProject(project.id)).resolves.toMatchObject({
      id: project.id,
      indexHtml: legacyHtml,
    })
    const htmlJson = JSON.parse(
      await readFile(join(projectDir, 'html.json'), 'utf8'),
    )
    expect(htmlJson.lines).toEqual([
      ['a1', '<main>'],
      ['a2', '  <h1>Legacy</h1>'],
      ['a3', '</main>'],
    ])
    await expect(
      readFile(join(projectDir, 'index.html'), 'utf8'),
    ).rejects.toThrow('ENOENT')
  })

  it('writes project store document edits to html.json only', async () => {
    const project = await repository.createProject()
    const projectDir = join(repository.projectsDir, project.id)
    const store = repository.createProjectHtmlStore(project.id)
    const nextHtml = store
      .get()
      .replace('<title>Untitled</title>', '<title>Anchored</title>')
    store.set(nextHtml)

    const saved = await repository.getProject(project.id)
    expect(saved?.indexHtml).toContain('<title>Anchored</title>')
    expect(await readFile(join(projectDir, 'html.json'), 'utf8')).toContain(
      '<title>Anchored</title>',
    )
    await expect(
      readFile(join(projectDir, 'index.html'), 'utf8'),
    ).rejects.toThrow('ENOENT')
  })

  it('appends and reads project message turns', async () => {
    const project = await repository.createProject()
    const turn = messageTurn(project.id)

    await repository.appendProjectMessageTurn(project.id, turn)

    await expect(repository.getProject(project.id)).resolves.toMatchObject({
      id: project.id,
      messages: [turn],
    })
  })

  it('upserts a project message turn by id for incremental checkpoints', async () => {
    const project = await repository.createProject()
    const turn = messageTurn(project.id)

    await repository.saveProjectMessageTurn(project.id, turn)
    await expect(repository.getProject(project.id)).resolves.toMatchObject({
      messages: [turn],
    })

    const finalized: ProjectMessageTurn = {
      ...turn,
      isStreaming: false,
      parts: [...turn.parts, { id: 'text-final', text: 'Done.', type: 'text' }],
    }
    await repository.saveProjectMessageTurn(project.id, finalized)

    const saved = await repository.getProject(project.id)
    expect(saved?.messages).toHaveLength(1)
    expect(saved?.messages[0]).toMatchObject({
      id: turn.id,
      isStreaming: false,
    })
    expect(saved?.messages[0]?.parts).toContainEqual(
      expect.objectContaining({ id: 'text-final', type: 'text' }),
    )
  })

  it('upserts raw mastra messages by turn id and keeps them out of the client payload', async () => {
    const project = await repository.createProject()
    const turn = messageTurn(project.id)
    const rawAssistant = {
      content: { format: 2, parts: [{ text: 'Done.', type: 'text' }] },
      id: 'mastra-1',
      role: 'assistant',
    }

    await repository.saveProjectRawMessages(project.id, turn.id, [rawAssistant])
    await expect(
      repository.readProjectRawMessages(project.id),
    ).resolves.toEqual([{ messages: [rawAssistant], turnId: turn.id }])

    // The client-facing project read must NOT carry raw messages (large,
    // server-only replay data).
    await expect(repository.getProject(project.id)).resolves.not.toHaveProperty(
      'rawMessages',
    )

    // Upsert by turn id replaces in place without duplicating.
    const rawFinal = {
      content: { format: 2, parts: [{ text: 'Final.', type: 'text' }] },
      id: 'mastra-1',
      role: 'assistant',
    }
    await repository.saveProjectRawMessages(project.id, turn.id, [rawFinal])
    await expect(
      repository.readProjectRawMessages(project.id),
    ).resolves.toEqual([{ messages: [rawFinal], turnId: turn.id }])
  })

  it('returns empty message history for a fresh project with no client log', async () => {
    const project = await repository.createProject()

    await expect(repository.getProject(project.id)).resolves.toMatchObject({
      id: project.id,
      messages: [],
    })
  })

  it('persists attachment metadata without image data', async () => {
    const project = await repository.createProject()
    const turn: ProjectMessageTurn = {
      ...messageTurn(project.id),
      attachments: [
        {
          id: 'image-1',
          mediaType: 'image/png',
          name: 'wireframe.png',
          size: 1234,
        },
      ],
    }

    await repository.appendProjectMessageTurn(project.id, turn)

    await expect(repository.getProject(project.id)).resolves.toMatchObject({
      id: project.id,
      messages: [turn],
    })
  })

  it('leaves legacy zero-cost stats unchanged when only token usage is saved', async () => {
    const project = await repository.createProject()
    const turn = messageTurn(project.id)
    turn.parts = [
      {
        cost: 0,
        costBreakdown: {
          image: { cost: 0, count: 0 },
          llm: 0,
          scrape: { calls: 0, cost: 0, credits: 0 },
          total: 0,
          vision: { calls: 0, cost: 0, images: 0 },
        },
        durationMs: 1000,
        finishReason: 'stop',
        model: 'zai-org/GLM-5.2',
        type: 'stats',
        usage: {
          cachedInputTokens: 3360,
          inputTokens: 4981,
          outputTokens: 67,
          totalTokens: 5048,
        },
      },
    ]

    await repository.appendProjectMessageTurn(project.id, turn)

    const saved = await repository.getProject(project.id)
    const stats = saved?.messages[0]?.parts[0]
    expect(stats).toMatchObject({
      cost: 0,
      costBreakdown: expect.objectContaining({
        llm: 0,
        total: 0,
      }),
      type: 'stats',
    })
  })

  it('persists the latest project model without rewriting message turns', async () => {
    const project = await repository.createProject({
      model: 'moonshotai/Kimi-K2.7-Code',
    })
    const turn = messageTurn(project.id)

    await repository.appendProjectMessageTurn(project.id, turn)
    await repository.updateProjectModel(project.id, {
      textModel: 'zai-org/GLM-5.2',
    })

    await expect(repository.getProject(project.id)).resolves.toMatchObject({
      id: project.id,
      messages: [turn],
      model: 'zai-org/GLM-5.2',
    })
  })

  it('updateProjectModel preserves hasHtml and title set by sync writers (no lost update)', async () => {
    // Regression guard (plan 017): updateProjectModel used to read project.json
    // across an await, so a concurrent edit's markHasHtmlSync write (hasHtml=true)
    // could be reverted when the stale snapshot was written back. The fix makes
    // its read-modify-write synchronous; this characterizes the fresh-read
    // contract that fields set by sibling sync writers survive a model PATCH.
    const project = await repository.createProject()

    // Simulate a successful edit flipping hasHtml, and a title set from a prompt.
    repository
      .createProjectHtmlStore(project.id)
      .set('<!doctype html><html><body><h1>Hi</h1></body></html>')
    repository.setTitleIfUntitled(project.id, 'My Landing')

    // A model PATCH must read the latest meta (hasHtml true, titled) and keep both.
    const updated = await repository.updateProjectModel(project.id, {
      textModel: 'some/model-id',
    })
    expect(updated).toMatchObject({
      hasHtml: true,
      model: 'some/model-id',
      title: 'My Landing',
    })

    // The on-disk file agrees (hasHtml was not reverted to false).
    const onDisk = JSON.parse(
      await readFile(
        join(repository.projectsDir, project.id, 'project.json'),
        'utf8',
      ),
    )
    expect(onDisk).toMatchObject({
      hasHtml: true,
      model: 'some/model-id',
      title: 'My Landing',
    })
  })

  it('updateProjectModel persists each role and preserves the others', async () => {
    const project = await repository.createProject()

    await repository.updateProjectModel(project.id, {
      visionModel: 'vision/v1',
    })
    let saved = await repository.getProject(project.id)
    expect(saved).toMatchObject({
      imageModel: '',
      model: '',
      visionModel: 'vision/v1',
    })

    await repository.updateProjectModel(project.id, {
      imageModel: 'image/i1',
      textModel: 'text/t1',
    })
    saved = await repository.getProject(project.id)
    expect(saved).toMatchObject({
      imageModel: 'image/i1',
      model: 'text/t1',
      visionModel: 'vision/v1',
    })
  })

  it('updateProjectModel is a no-op when no selection field is provided', async () => {
    const project = await repository.createProject({ model: 'text/keep' })
    const before = await repository.getProject(project.id)

    const result = await repository.updateProjectModel(project.id, {})

    expect(result).toMatchObject({ model: 'text/keep' })
    expect(result?.updatedAt).toBe(before?.updatedAt)
  })

  it('lists only generated projects newest first and tolerates missing projects', async () => {
    const older = await repository.createProject({ title: 'Older' })
    const newer = await repository.createProject({ title: 'Newer' })

    repository.createProjectHtmlStore(older.id).set('<main>Older</main>')
    await new Promise((resolve) => setTimeout(resolve, 5))
    repository.createProjectHtmlStore(newer.id).set('<main>Newer</main>')

    const listed = (await repository.listProjects()).filter(
      (project) => project.id === newer.id || project.id === older.id,
    )
    expect(listed).toEqual([
      expect.objectContaining({ id: newer.id, title: 'Newer' }),
      expect.objectContaining({ id: older.id, title: 'Older' }),
    ])
    await expect(
      repository.updateProjectModel('missing-project', { textModel: 'model' }),
    ).resolves.toBeNull()
    await expect(
      repository.deleteProject('missing-project'),
    ).resolves.toBeUndefined()
  })

  it('sets the title once from the first prompt and truncates long titles', async () => {
    const project = await repository.createProject()

    repository.setTitleIfUntitled(
      project.id,
      '   Build    a landing page with a title that is definitely longer than sixty characters   ',
    )
    repository.setTitleIfUntitled(project.id, 'Do not overwrite')

    const saved = await repository.getProject(project.id)
    expect(saved?.title).toMatch(/^Build a landing page.*…$/)
    expect(saved?.title).toHaveLength(61)
  })

  it('reads persisted project images by safe names and media type', async () => {
    const project = await repository.createProject()
    const imageDir = join(repository.projectsDir, project.id, 'images')
    await mkdir(imageDir, { recursive: true })
    await writeFile(join(imageDir, 'img-123.jpg'), 'jpg-bytes')
    await writeFile(join(imageDir, 'logo.svg'), '<svg />')
    await writeFile(join(imageDir, 'asset.gif'), 'gif-bytes')
    await writeFile(join(imageDir, 'asset.webp'), 'webp-bytes')
    await writeFile(join(imageDir, 'asset.unknown'), 'png-bytes')

    await expect(
      repository.readProjectImage(project.id, 'img-123.jpg'),
    ).resolves.toEqual({
      buffer: Buffer.from('jpg-bytes'),
      mediaType: 'image/jpeg',
    })
    await expect(
      repository.readProjectImage(project.id, 'logo.svg'),
    ).resolves.toEqual({
      buffer: Buffer.from('<svg />'),
      mediaType: 'image/svg+xml',
    })
    await expect(
      repository.readProjectImage(project.id, 'asset.gif'),
    ).resolves.toMatchObject({
      mediaType: 'image/gif',
    })
    await expect(
      repository.readProjectImage(project.id, 'asset.webp'),
    ).resolves.toMatchObject({
      mediaType: 'image/webp',
    })
    await expect(
      repository.readProjectImage(project.id, 'asset.unknown'),
    ).resolves.toMatchObject({
      mediaType: 'image/png',
    })
    await expect(
      repository.readProjectImage(project.id, '../secret.png'),
    ).resolves.toBeNull()
    await expect(
      repository.readProjectImage(project.id, 'missing.webp'),
    ).resolves.toBeNull()
  })

  it('inlines only owned project images for remote capture', async () => {
    const project = await repository.createProject()
    const otherProject = await repository.createProject()
    const imageDir = join(repository.projectsDir, project.id, 'images')
    await mkdir(imageDir, { recursive: true })
    await writeFile(join(imageDir, 'img-1.png'), 'png-bytes')

    const html = `<main><img src="/api/projects/${project.id}/images/img-1.png"><img src="https://example.test/api/projects/${otherProject.id}/images/other.png"><img src="https://cdn.example.test/logo.png"></main>`
    const prepared = await repository.inlineProjectImagesForCapture(
      project.id,
      html,
    )

    expect(prepared).toContain(
      `data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}`,
    )
    expect(prepared).toContain(
      `https://example.test/api/projects/${otherProject.id}/images/other.png`,
    )
    expect(prepared).toContain('https://cdn.example.test/logo.png')
  })

  it('rejects missing same-project image files before remote capture', async () => {
    const project = await repository.createProject()

    await expect(
      repository.inlineProjectImagesForCapture(
        project.id,
        `<img src="/api/projects/${project.id}/images/missing.png">`,
      ),
    ).rejects.toThrow('Project image "missing.png" is missing.')
  })

  it('resets project stores with custom and placeholder documents', async () => {
    const project = await repository.createProject()
    const store = repository.createProjectHtmlStore(project.id)

    store.reset('<main>Seed</main>')
    expect(store.get()).toBe('<main>Seed</main>')

    store.reset()
    expect(store.get()).toContain('<title>Untitled</title>')
  })

  it('copies generated images into project storage and preserves existing project URLs', async () => {
    const project = await repository.createProject()
    const imageId = imageStore.saveImage(
      Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      'image/jpeg',
    )
    const store = repository.createProjectHtmlStore(project.id)

    store.set(
      `<main><img src="http://localhost:3001/images/${imageId}.jpg"><img src="http://localhost:3001/api/projects/${project.id}/images/already.png"><img src="/images/img-999.png"></main>`,
    )

    const saved = await repository.getProject(project.id)
    expect(saved?.indexHtml).toContain(
      `/api/projects/${project.id}/images/${imageId}.jpg`,
    )
    expect(saved?.indexHtml).toContain(
      `/api/projects/${project.id}/images/already.png`,
    )
    expect(saved?.indexHtml).toContain('/images/img-999.png')
    await expect(
      repository.readProjectImage(project.id, `${imageId}.jpg`),
    ).resolves.toEqual({
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      mediaType: 'image/jpeg',
    })
  })

  it('persists a generated image to the project folder independent of an edit', async () => {
    const project = await repository.createProject()
    const imageId = imageStore.saveImage(
      Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      'image/jpeg',
    )

    // Persist at generation time, with no edit/store write at all.
    const url = repository.persistGeneratedImage(project.id, imageId, '.jpg')

    expect(url).toBe(`/api/projects/${project.id}/images/${imageId}.jpg`)
    await expect(
      repository.readProjectImage(project.id, `${imageId}.jpg`),
    ).resolves.toEqual({
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      mediaType: 'image/jpeg',
    })
    expect(imageStore.getImage(imageId)).toBeUndefined()
    expect(repository.readGeneratedImage(imageId)).toEqual({
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      mediaType: 'image/jpeg',
    })
  })

  it('removes only an accepted attachment file created by a failed write', async () => {
    const project = await repository.createProject()
    const base = createProjectFileSystem(testRoot)
    const attachmentPath = join(
      repository.projectsDir,
      project.id,
      'attachments',
      'accepted-digest.png',
    )
    let attachmentFile: number | undefined
    let failWrite = true
    await repository.dispose()
    repository = createProjectRepository({
      dataDir: testRoot,
      fileSystem: {
        ...base,
        closeSync(file) {
          if (file === attachmentFile) attachmentFile = undefined
          base.closeSync(file)
        },
        openSync(path, flags) {
          const file = base.openSync(path, flags)
          if (path === attachmentPath && flags === 'wx') attachmentFile = file
          return file
        },
        writeFileSync(path, data, encoding) {
          if (path === attachmentFile && failWrite) {
            base.writeFileSync(path, Buffer.from('partial'))
            const error = new Error('disk full') as NodeJS.ErrnoException
            error.code = 'ENOSPC'
            throw error
          }
          base.writeFileSync(path, data, encoding)
        },
      },
      imageStore,
      logger() {},
      runBus: createRunBus(),
    })

    expect(() =>
      repository.persistAcceptedAttachmentSync(
        project.id,
        'accepted-digest',
        'image/png',
        Buffer.from('complete bytes'),
      ),
    ).toThrow('disk full')
    await expect(readFile(attachmentPath)).rejects.toMatchObject({
      code: 'ENOENT',
    })

    failWrite = false
    expect(
      repository.persistAcceptedAttachmentSync(
        project.id,
        'accepted-digest',
        'image/png',
        Buffer.from('complete bytes'),
      ),
    ).toMatchObject({ created: true })
    await expect(readFile(attachmentPath)).resolves.toEqual(
      Buffer.from('complete bytes'),
    )
  })

  it('rewrites a digit-leading UUID temporary URL after its buffer is released', async () => {
    const project = await repository.createProject()
    await repository.dispose()
    imageStore = createImageStore({
      createId: () => '12345678-1234-4abc-8def-123456789abc',
    })
    repository = createProjectRepository({
      dataDir: testRoot,
      fileSystem: createProjectFileSystem(testRoot),
      imageStore,
      logger() {},
      runBus: createRunBus(),
    })
    const imageId = imageStore.saveImage(Buffer.from('uuid-image'), 'image/png')
    repository.persistGeneratedImage(project.id, imageId, '.png')

    const store = repository.createProjectHtmlStore(project.id)
    store.set(`<main><img src="/images/${imageId}.png"></main>`)
    expect(store.get()).toContain(
      `/api/projects/${project.id}/images/${imageId}.png`,
    )
    expect(store.get()).not.toContain(`/images/img-12345678.png`)
  })

  it('keeps asset identities immutable and restart-safe', async () => {
    const project = await repository.createProject()
    await repository.dispose()
    const fixedId = '00000000-0000-4000-8000-000000000111'
    imageStore = createImageStore({ createId: () => fixedId })
    repository = createProjectRepository({
      dataDir: testRoot,
      fileSystem: createProjectFileSystem(testRoot),
      imageStore,
      logger() {},
      runBus: createRunBus(),
    })
    const firstId = imageStore.saveImage(Buffer.from('old-bytes'), 'image/png')
    const firstUrl = repository.persistGeneratedImage(
      project.id,
      firstId,
      '.png',
    )
    const store = repository.createProjectHtmlStore(project.id)
    store.set(`<main><img src="${firstUrl}"></main>`)
    const oldHtml = store.get()
    await repository.dispose()

    imageStore = createImageStore({ createId: () => fixedId })
    repository = createProjectRepository({
      dataDir: testRoot,
      fileSystem: createProjectFileSystem(testRoot),
      imageStore,
      logger() {},
      runBus: createRunBus(),
    })
    const repeatedId = imageStore.saveImage(
      Buffer.from('old-bytes'),
      'image/png',
    )
    expect(
      repository.persistGeneratedImage(project.id, repeatedId, '.png'),
    ).toBe(firstUrl)
    await expect(
      repository.readProjectImage(project.id, `${firstId}.png`),
    ).resolves.toMatchObject({ buffer: Buffer.from('old-bytes') })
    await expect(repository.getProject(project.id)).resolves.toMatchObject({
      indexHtml: oldHtml,
    })
    await repository.dispose()

    const nextId = '00000000-0000-4000-8000-000000000112'
    imageStore = createImageStore({ createId: () => nextId })
    repository = createProjectRepository({
      dataDir: testRoot,
      fileSystem: createProjectFileSystem(testRoot),
      imageStore,
      logger() {},
      runBus: createRunBus(),
    })
    const generatedAfterRestart = imageStore.saveImage(
      Buffer.from('new-bytes'),
      'image/png',
    )
    expect(
      repository.persistGeneratedImage(
        project.id,
        generatedAfterRestart,
        '.png',
      ),
    ).toBe(`/api/projects/${project.id}/images/img-${nextId}.png`)
    await expect(
      repository.readProjectImage(project.id, `${firstId}.png`),
    ).resolves.toMatchObject({ buffer: Buffer.from('old-bytes') })
    await expect(repository.getProject(project.id)).resolves.toMatchObject({
      indexHtml: oldHtml,
    })
    await repository.dispose()

    imageStore = createImageStore({ createId: () => fixedId })
    repository = createProjectRepository({
      dataDir: testRoot,
      fileSystem: createProjectFileSystem(testRoot),
      imageStore,
      logger() {},
      runBus: createRunBus(),
    })
    const conflictingId = imageStore.saveImage(
      Buffer.from('different-bytes'),
      'image/png',
    )
    expect(() =>
      repository.persistGeneratedImage(project.id, conflictingId, '.png'),
    ).toThrow(ProjectAssetConflictError)
    await expect(
      repository.readProjectImage(project.id, `${firstId}.png`),
    ).resolves.toMatchObject({ buffer: Buffer.from('old-bytes') })
  })

  it('requires a successful retry after an immutable asset directory sync fails', async () => {
    const project = await repository.createProject()
    const imageDir = join(testRoot, 'projects', project.id, 'images')
    const base = createProjectFileSystem(testRoot)
    const directoryFiles = new Set<number>()
    let remainingDirectoryFailures = 2
    await repository.dispose()
    imageStore = createImageStore({
      createId: () => '00000000-0000-4000-8000-000000000222',
    })
    repository = createProjectRepository({
      dataDir: testRoot,
      fileSystem: {
        ...base,
        closeSync(file) {
          directoryFiles.delete(file)
          base.closeSync(file)
        },
        fsyncSync(file) {
          if (directoryFiles.has(file) && remainingDirectoryFailures > 0) {
            remainingDirectoryFailures -= 1
            throw new Error('directory sync failed')
          }
          base.fsyncSync(file)
        },
        openSync(path, flags) {
          const file = base.openSync(path, flags)
          if (path === imageDir) directoryFiles.add(file)
          return file
        },
      },
      imageStore,
      logger() {},
      runBus: createRunBus(),
    })
    const imageId = imageStore.saveImage(Buffer.from('asset'), 'image/png')

    expect(() =>
      repository.persistGeneratedImage(project.id, imageId, '.png'),
    ).toThrow(ProjectFileCommitError)
    expect(imageStore.getImage(imageId)).toBeDefined()
    expect(() =>
      repository.persistGeneratedImage(project.id, imageId, '.png'),
    ).toThrow(ProjectFileCommitError)
    expect(imageStore.getImage(imageId)).toBeDefined()
    expect(repository.persistGeneratedImage(project.id, imageId, '.png')).toBe(
      `/api/projects/${project.id}/images/${imageId}.png`,
    )
    expect(imageStore.getImage(imageId)).toBeUndefined()
  })

  it('returns null when persisting an unknown image id', async () => {
    const project = await repository.createProject()

    expect(
      repository.persistGeneratedImage(
        project.id,
        'img-does-not-exist',
        '.jpg',
      ),
    ).toBe(null)
  })
})

describe('append-only debug logs', () => {
  it('reads empty logs for a fresh project', async () => {
    const project = await repository.createProject()

    await expect(repository.readClientMessages(project.id)).resolves.toEqual([])
    await expect(repository.readAgentMessages(project.id)).resolves.toEqual([])
    await expect(repository.readVisionMessages(project.id)).resolves.toEqual([])
  })

  it('appends and reads client message entries in order (true append)', async () => {
    const project = await repository.createProject()

    await repository.appendClientMessage(project.id, {
      dir: 'in',
      prompt: 'hi',
      ts: 't0',
      type: 'prompt',
    })
    await repository.appendClientMessage(project.id, {
      dir: 'out',
      event: 'text',
      payload: { delta: 'H' },
      ts: 't1',
    })
    await repository.appendClientMessage(project.id, {
      dir: 'out',
      event: 'text',
      payload: { delta: 'i' },
      ts: 't2',
    })

    await expect(repository.readClientMessages(project.id)).resolves.toEqual([
      { dir: 'in', prompt: 'hi', seq: 1, ts: 't0', type: 'prompt' },
      {
        dir: 'out',
        event: 'text',
        payload: { delta: 'H' },
        seq: 2,
        ts: 't1',
      },
      {
        dir: 'out',
        event: 'text',
        payload: { delta: 'i' },
        seq: 3,
        ts: 't2',
      },
    ])
  })

  it('getProject reflects new client-log appends (turn cache invalidates)', async () => {
    const project = await repository.createProject()

    await repository.appendClientMessage(project.id, {
      dir: 'in',
      model: 'm',
      prompt: 'hi',
      ts: 't0',
      turnId: 'turn-x',
      type: 'prompt',
    })
    await repository.appendClientMessage(project.id, {
      dir: 'out',
      event: 'text',
      payload: { delta: 'H' },
      ts: 't1',
    })

    const first = await repository.getProject(project.id)
    expect(first?.messages[0]?.parts).toEqual([
      {
        durationMs: expect.any(Number),
        id: 'turn-x-text',
        startedAt: expect.any(Number),
        text: 'H',
        type: 'text',
      },
    ])

    // A later append must be visible on the next getProject — proves the
    // in-memory turn cache invalidated (otherwise this would still read 'H').
    await repository.appendClientMessage(project.id, {
      dir: 'out',
      event: 'text',
      payload: { delta: 'i' },
      ts: 't2',
    })
    const second = await repository.getProject(project.id)
    expect(second?.messages[0]?.parts).toEqual([
      {
        durationMs: expect.any(Number),
        id: 'turn-x-text',
        startedAt: expect.any(Number),
        text: 'Hi',
        type: 'text',
      },
    ])
  })

  it('appends and reads per-step agent message snapshots', async () => {
    const project = await repository.createProject()

    await repository.appendAgentMessages(project.id, {
      dir: 'step',
      messages: [{ role: 'assistant' }],
      step: 1,
      ts: 't1',
      turnId: 'turn-1',
    })
    await repository.appendAgentMessages(project.id, {
      dir: 'step',
      messages: [{ role: 'assistant' }, { role: 'tool' }],
      step: 2,
      ts: 't2',
      turnId: 'turn-1',
    })

    await expect(repository.readAgentMessages(project.id)).resolves.toEqual([
      {
        dir: 'step',
        messages: [{ role: 'assistant' }],
        step: 1,
        ts: 't1',
        turnId: 'turn-1',
      },
      {
        dir: 'step',
        messages: [{ role: 'assistant' }, { role: 'tool' }],
        step: 2,
        ts: 't2',
        turnId: 'turn-1',
      },
    ])
  })

  it('appends and reads vision message entries', async () => {
    const project = await repository.createProject()
    const entry = {
      costUsd: 0.001,
      imagesAnalyzed: 2,
      model: 'vision-x',
      ok: true,
      seq: 1,
      source: 'attachment' as const,
      text: 'a wireframe',
      ts: 't1',
      turnId: 'turn-1',
      usage: { total: 10 },
    }

    await repository.appendVisionMessage(project.id, entry)

    await expect(repository.readVisionMessages(project.id)).resolves.toEqual([
      entry,
    ])
  })

  it('routes a failed append-log write through the write-failure logger', async () => {
    const sink = vi.fn<(id: string, error: unknown) => void>()
    repository.setProjectWriteFailureLogger(sink)

    const project = await repository.createProject()
    const projectDir = join(repository.projectsDir, project.id)

    try {
      await chmod(projectDir, 0o555)
      await expect(
        repository.appendClientMessage(project.id, {
          dir: 'out',
          event: 'text',
          payload: { delta: 'hi' },
          ts: 't-fail',
        }),
      ).rejects.toThrow('requires explicit recovery')
      await expect(repository.flushProjectLogs(project.id)).rejects.toThrow(
        'requires explicit recovery',
      )
      expect(sink).toHaveBeenCalledTimes(1)
      expect(sink).toHaveBeenCalledWith(project.id, expect.anything())
    } finally {
      await chmod(projectDir, 0o755)
      await repository.recoverClientJournal(project.id)
    }
  })

  it('serializes concurrent client appends without interleaving lines', async () => {
    const project = await repository.createProject()

    // Fire many appends concurrently; the per-file chain must keep each on its own line.
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        repository.appendClientMessage(project.id, {
          dir: 'out',
          event: 'text',
          payload: { i },
          ts: `t${i}`,
        }),
      ),
    )

    const entries = await repository.readClientMessages(project.id)
    expect(entries).toHaveLength(20)
    const indices = entries
      .map((e) => (e.payload as undefined | { i: number })?.i)
      .sort((a, b) => (a ?? 0) - (b ?? 0))
    expect(indices).toEqual(Array.from({ length: 20 }, (_, i) => i))
  })

  it('keeps a read-during-append cache on confirmed data, then publishes the committed generation', async () => {
    const project = await repository.createProject()
    await repository.appendClientMessage(project.id, {
      dir: 'in',
      model: 'm',
      prompt: 'hi',
      ts: 't0',
      turnId: 'turn-cache',
      type: 'prompt',
    })
    await repository.appendClientMessage(project.id, {
      dir: 'out',
      event: 'text',
      payload: { delta: 'H' },
      ts: 't1',
    })
    await repository.getProject(project.id)

    const base = createProjectFileSystem(testRoot)
    const syncEntered = deferred<void>()
    const releaseSync = deferred<void>()
    let pauseAppendSync = true
    await repository.dispose()
    repository = createProjectRepository({
      dataDir: testRoot,
      fileSystem: {
        ...base,
        async open(path, flags) {
          const handle = await base.open(path, flags)
          if (flags !== 'a') return handle
          return proxyFileHandle(handle, {
            async sync() {
              if (pauseAppendSync) {
                pauseAppendSync = false
                syncEntered.resolve()
                await releaseSync.promise
              }
              await handle.sync()
            },
          })
        },
      },
      imageStore,
      logger() {},
      runBus: createRunBus(),
    })

    const pending = repository.appendClientMessage(project.id, {
      dir: 'out',
      event: 'text',
      payload: { delta: 'i' },
      ts: 't2',
    })
    await syncEntered.promise
    await expect(repository.getProject(project.id)).resolves.toMatchObject({
      messages: [
        expect.objectContaining({
          parts: [expect.objectContaining({ text: 'H' })],
        }),
      ],
    })
    releaseSync.resolve()
    await pending
    await expect(repository.getProject(project.id)).resolves.toMatchObject({
      messages: [
        expect.objectContaining({
          parts: [expect.objectContaining({ text: 'Hi' })],
        }),
      ],
    })
  })

  it('requires explicit repository recovery before appending past an incomplete tail', async () => {
    const project = await repository.createProject()
    await repository.appendClientMessage(project.id, {
      dir: 'in',
      prompt: 'first',
      ts: 't0',
      type: 'prompt',
    })
    await repository.dispose()
    const journalPath = join(
      testRoot,
      'projects',
      project.id,
      'client-messages.jsonl',
    )
    const tail = Buffer.from('{"dir":"out"')
    await appendFile(journalPath, tail)
    const damaged = await readFile(journalPath)
    repository = createProjectRepository({
      dataDir: testRoot,
      fileSystem: createProjectFileSystem(testRoot),
      imageStore,
      logger() {},
      runBus: createRunBus(),
    })

    await expect(
      repository.readClientJournal(project.id),
    ).resolves.toMatchObject({
      records: [{ seq: 1 }],
      status: 'incompleteTail',
      tail: { byteLength: tail.length },
      watermark: 1,
    })
    await expect(
      repository.appendClientMessage(project.id, {
        dir: 'out',
        event: 'blocked',
        ts: 't1',
      }),
    ).rejects.toThrow('requires explicit recovery')
    await expect(readFile(journalPath)).resolves.toEqual(damaged)
    await expect(repository.readSnapshot(project.id)).resolves.toMatchObject({
      ok: true,
      snapshot: {
        committedWatermark: 1,
        journalStatus: 'incompleteTail',
        tail: { byteLength: tail.length },
      },
    })

    const recovery = await repository.recoverClientJournal(project.id)
    await expect(readFile(recovery.quarantinePath!)).resolves.toEqual(tail)
    await expect(
      repository.appendClientMessage(project.id, {
        dir: 'out',
        event: 'next',
        ts: 't2',
      }),
    ).resolves.toMatchObject({ seq: 2 })
  })

  it('writes screenshot bytes to screenshots/ and returns a project-relative path', async () => {
    const project = await repository.createProject()
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`

    const result = repository.writeProjectScreenshotSync(
      project.id,
      'req-1',
      dataUrl,
      'image/png',
    )

    expect(result.ext).toBe('.png')
    expect(result.path).toBe(
      `/api/projects/${project.id}/screenshots/001-req-1.png`,
    )
    await expect(
      readFile(
        join(
          repository.projectsDir,
          project.id,
          'screenshots',
          '001-req-1.png',
        ),
      ),
    ).resolves.toEqual(bytes)
  })

  it('prunes screenshots to the newest cap and keeps sequence numbers monotonic', async () => {
    const project = await repository.createProject()
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`
    const dir = join(repository.projectsDir, project.id, 'screenshots')

    // MAX_SCREENSHOTS_PER_PROJECT is 50; write one past the cap.
    for (let i = 1; i <= 51; i++) {
      repository.writeProjectScreenshotSync(
        project.id,
        `req-${i}`,
        dataUrl,
        'image/png',
      )
    }

    const remaining = await readdir(dir)
    expect(remaining).toHaveLength(50)
    // oldest pruned, newest kept, and the 51st write did not reuse 001
    expect(remaining).not.toContain('001-req-1.png')
    expect(remaining).toContain('051-req-51.png')
  })
})

describe('stable project snapshots', () => {
  it('waits for a visible document rename to publish its repository revision', async () => {
    const base = createProjectFileSystem(testRoot)
    const renameVisible = deferred<void>()
    const releaseRename = deferred<void>()
    let projectId: string | undefined
    let pauseHtmlRename = true
    await repository.dispose()
    repository = createProjectRepository({
      dataDir: testRoot,
      fileSystem: {
        ...base,
        async rename(from, to) {
          await base.rename(from, to)
          if (pauseHtmlRename && basename(to) === 'html.json') {
            pauseHtmlRename = false
            projectId = basename(dirname(to))
            renameVisible.resolve()
            await releaseRename.promise
          }
        },
      },
      imageStore,
      logger() {},
      runBus: createRunBus(),
    })

    const creating = repository.createProject()
    await renameVisible.promise
    if (!projectId) throw new Error('Expected the project id from html rename.')
    let settled = false
    const snapshot = repository.readSnapshot(projectId).then((result) => {
      settled = true
      return result
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    releaseRename.resolve()
    const project = await creating
    await expect(snapshot).resolves.toMatchObject({
      ok: true,
      snapshot: {
        documentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        indexHtml: project.indexHtml,
        metadata: { id: project.id },
      },
    })
  })

  it('retries when the document changes during asynchronous snapshot reads', async () => {
    const project = await repository.createProject()
    const base = createProjectFileSystem(testRoot)
    await repository.dispose()
    let mutateDuringRead = true
    let store: ReturnType<ProjectRepository['createProjectHtmlStore']>
    repository = createProjectRepository({
      dataDir: testRoot,
      fileSystem: {
        ...base,
        async readFile(path, encoding) {
          const result = encoding
            ? await base.readFile(path, encoding)
            : await base.readFile(path)
          if (mutateDuringRead && basename(path) === 'html.json') {
            mutateDuringRead = false
            store.set('<main>new stable document</main>')
          }
          return result
        },
      } as ProjectFileSystem,
      imageStore,
      logger() {},
      runBus: createRunBus(),
    })
    store = repository.createProjectHtmlStore(project.id)

    await expect(repository.readSnapshot(project.id)).resolves.toMatchObject({
      ok: true,
      snapshot: { indexHtml: '<main>new stable document</main>' },
    })
  })

  it('retries a transient read failure when a local mutation intervenes', async () => {
    const project = await repository.createProject()
    const base = createProjectFileSystem(testRoot)
    await repository.dispose()
    let failDuringRead = true
    let store: ReturnType<ProjectRepository['createProjectHtmlStore']>
    repository = createProjectRepository({
      dataDir: testRoot,
      fileSystem: {
        ...base,
        async readFile(path, encoding) {
          const result = encoding
            ? await base.readFile(path, encoding)
            : await base.readFile(path)
          if (failDuringRead && basename(path) === 'html.json') {
            failDuringRead = false
            store.set('<main>committed after transient read failure</main>')
            const error = new Error(
              'html changed during read',
            ) as NodeJS.ErrnoException
            error.code = 'ENOENT'
            throw error
          }
          return result
        },
      } as ProjectFileSystem,
      imageStore,
      logger() {},
      runBus: createRunBus(),
    })
    store = repository.createProjectHtmlStore(project.id)

    await expect(repository.readSnapshot(project.id)).resolves.toMatchObject({
      ok: true,
      snapshot: {
        indexHtml: '<main>committed after transient read failure</main>',
      },
    })
  })

  it('publishes conversation records and watermark together after a pending append', async () => {
    const project = await repository.createProject()
    const base = createProjectFileSystem(testRoot)
    const syncEntered = deferred<void>()
    const releaseSync = deferred<void>()
    let pauseAppendSync = true
    await repository.dispose()
    repository = createProjectRepository({
      dataDir: testRoot,
      fileSystem: {
        ...base,
        async open(path, flags) {
          const handle = await base.open(path, flags)
          if (flags !== 'a') return handle
          return proxyFileHandle(handle, {
            async sync() {
              if (pauseAppendSync) {
                pauseAppendSync = false
                syncEntered.resolve()
                await releaseSync.promise
              }
              await handle.sync()
            },
          })
        },
      },
      imageStore,
      logger() {},
      runBus: createRunBus(),
    })
    const appending = repository.appendClientMessage(project.id, {
      dir: 'in',
      prompt: 'snapshot me',
      ts: 't0',
      type: 'prompt',
    })
    await syncEntered.promise
    let settled = false
    const snapshot = repository.readSnapshot(project.id).then((result) => {
      settled = true
      return result
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    releaseSync.resolve()
    await appending
    await expect(snapshot).resolves.toMatchObject({
      ok: true,
      snapshot: {
        committedWatermark: 1,
        conversationRecords: [{ prompt: 'snapshot me', seq: 1 }],
        journalStatus: 'clean',
      },
    })
  })

  it('returns a typed retryable busy result after eight changing reads', async () => {
    const project = await repository.createProject()
    const base = createProjectFileSystem(testRoot)
    await repository.dispose()
    repository = createProjectRepository({
      dataDir: testRoot,
      fileSystem: {
        ...base,
        async readFile(path, encoding) {
          const result = encoding
            ? await base.readFile(path, encoding)
            : await base.readFile(path)
          if (basename(path) === 'html.json') {
            repository.setRunStatusSync(project.id, {
              status: 'running',
              turnId: randomTestId(),
            })
          }
          return result
        },
      } as ProjectFileSystem,
      imageStore,
      logger() {},
      runBus: createRunBus(),
    })

    await expect(repository.readSnapshot(project.id)).resolves.toEqual({
      ok: false,
      reason: 'busy',
      retryable: true,
    })
  })

  it('surfaces malformed legacy metadata instead of returning a blank project', async () => {
    const project = await repository.createProject()
    await writeFile(
      join(testRoot, 'projects', project.id, 'project.json'),
      '{malformed',
    )

    await expect(repository.readSnapshot(project.id)).rejects.toBeInstanceOf(
      SyntaxError,
    )
  })

  it('includes legacy HTML and message turns in the same stable snapshot', async () => {
    const project = await repository.createProject()
    const legacyTurn = messageTurn(project.id)
    await repository.appendProjectMessageTurn(project.id, legacyTurn)
    const projectDir = join(testRoot, 'projects', project.id)
    await rm(join(projectDir, 'html.json'))
    await writeFile(join(projectDir, 'index.html'), '<main>legacy page</main>')
    await repository.dispose()
    repository = createProjectRepository({
      dataDir: testRoot,
      fileSystem: createProjectFileSystem(testRoot),
      imageStore,
      logger() {},
      runBus: createRunBus(),
    })

    await expect(repository.readSnapshot(project.id)).resolves.toMatchObject({
      ok: true,
      snapshot: {
        indexHtml: '<main>legacy page</main>',
        messages: [legacyTurn],
      },
    })
  })

  it('surfaces malformed legacy message data in snapshot reads', async () => {
    const project = await repository.createProject()
    await writeFile(
      join(testRoot, 'projects', project.id, 'messages.json'),
      '{malformed',
    )

    await expect(repository.readSnapshot(project.id)).rejects.toBeInstanceOf(
      SyntaxError,
    )
  })

  it('does not read stale legacy fallbacks when canonical data is complete', async () => {
    const project = await repository.createProject()
    await repository.appendClientMessage(project.id, {
      dir: 'in',
      model: 'm',
      prompt: 'canonical history',
      ts: 't0',
      turnId: 'turn-canonical',
      type: 'prompt',
    })
    await repository.appendClientMessage(project.id, {
      dir: 'out',
      event: 'text',
      payload: { delta: 'canonical response' },
      ts: 't1',
    })
    const projectDir = join(testRoot, 'projects', project.id)
    await writeFile(join(projectDir, 'index.html'), 'stale legacy HTML')
    await writeFile(join(projectDir, 'messages.json'), '{malformed')

    await expect(repository.readSnapshot(project.id)).resolves.toMatchObject({
      ok: true,
      snapshot: {
        indexHtml: project.indexHtml,
        messages: [{ id: 'turn-canonical' }],
      },
    })
  })
})

describe('run-state (run lifecycle persistence)', () => {
  it('defaults to idle status when no run-state.json exists', async () => {
    const project = await repository.createProject({ title: 'Idle draft' })

    expect(project.status).toBe('idle')
    expect(project.runTurnId).toBeNull()
    expect(project.runStartedAt).toBeNull()

    const fetched = await repository.getProject(project.id)
    expect(fetched?.status).toBe('idle')
  })

  it('setRunStatusSync round-trips through run-state.json', async () => {
    const project = await repository.createProject({ title: 'Run trip' })

    const startedAt = new Date('2026-07-20T00:00:00.000Z').toISOString()
    repository.setRunStatusSync(project.id, {
      startedAt,
      status: 'running',
      turnId: 'turn-x',
    })

    const fetched = await repository.getProject(project.id)
    expect(fetched?.status).toBe('running')
    expect(fetched?.runTurnId).toBe('turn-x')
    expect(fetched?.runStartedAt).toBe(startedAt)
  })

  it('listProjects surfaces the composed run status', async () => {
    const project = await repository.createProject({ title: 'Listed run' })
    // Give it HTML so it survives the list's hasHtml filter.
    repository
      .createProjectHtmlStore(project.id)
      .set('<!doctype html><p>hi</p>')
    repository.setRunStatusSync(project.id, {
      status: 'error',
      turnId: 'turn-err',
    })

    const all = await repository.listProjects()
    const found = all.find((meta) => meta.id === project.id)
    expect(found?.status).toBe('error')
    expect(found?.runTurnId).toBe('turn-err')
  })
})

describe('project identity and creation recovery', () => {
  it('reuses one logical creation across concurrent requests and repository restart', async () => {
    const creationKey = 'c4d8ef24-cc2c-4423-9814-cf9cc38309cd'
    const projects = await Promise.all(
      Array.from({ length: 3 }, () =>
        repository.createProject({ creationKey }),
      ),
    )
    expect(new Set(projects.map((project) => project.id)).size).toBe(1)
    await repository.dispose()
    repository = createProjectRepository({
      dataDir: testRoot,
      fileSystem: createProjectFileSystem(testRoot),
      imageStore,
      logger() {},
      runBus: createRunBus(),
    })
    expect((await repository.createProject({ creationKey })).id).toBe(
      projects[0]!.id,
    )
    expect(await readdir(repository.projectsDir)).toHaveLength(1)
    await expect(
      repository.createProject({ creationKey: '../../outside' }),
    ).rejects.toThrow('Invalid creation key')
  })

  it('preserves the original brief and protects user names from later page edits', async () => {
    const project = await repository.createProject()
    repository.setTitleIfUntitled(
      project.id,
      'Build a small garden shop with seasonal plants',
    )
    const html = repository.createProjectHtmlStore(project.id)
    html.set(
      '<html><head><title>Fern &amp; Field</title></head><body>Shop</body></html>',
    )
    expect(await repository.getProject(project.id)).toMatchObject({
      brief: 'Build a small garden shop with seasonal plants',
      title: 'Fern & Field',
      titleSource: 'page',
    })
    await repository.updateProjectModel(project.id, { title: 'Our garden' })
    html.set(
      '<html><head><title>A different HTML title</title></head><body>Shop</body></html>',
    )
    expect(await repository.getProject(project.id)).toMatchObject({
      hasHtml: true,
      title: 'Our garden',
      titleSource: 'user',
    })
  })

  it('tracks creation-key preparation through a stable snapshot', async () => {
    const creationKey = '0e8ca90f-24cc-4e28-b130-4d9151df0122'
    const base = createProjectFileSystem(testRoot)
    const mkdirEntered = deferred<void>()
    const releaseMkdir = deferred<void>()
    await repository.dispose()
    repository = createProjectRepository({
      dataDir: testRoot,
      fileSystem: {
        ...base,
        async mkdir(path, options) {
          if (basename(path) === creationKey) {
            mkdirEntered.resolve()
            await releaseMkdir.promise
          }
          return base.mkdir(path, options)
        },
      },
      imageStore,
      logger() {},
      runBus: createRunBus(),
    })

    const creating = repository.createProject({ creationKey })
    await mkdirEntered.promise
    let settled = false
    const snapshot = repository.readSnapshot(creationKey).then((result) => {
      settled = true
      return result
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    releaseMkdir.resolve()
    await creating
    await expect(snapshot).resolves.toMatchObject({
      ok: true,
      snapshot: { metadata: { creationKey, id: creationKey } },
    })
  })

  it('waits for a pending keyed creation during disposal', async () => {
    const creationKey = 'd3d2a248-69bc-43cb-975d-768a61ad93e6'
    const base = createProjectFileSystem(testRoot)
    const mkdirEntered = deferred<void>()
    const releaseMkdir = deferred<void>()
    await repository.dispose()
    repository = createProjectRepository({
      dataDir: testRoot,
      fileSystem: {
        ...base,
        async mkdir(path, options) {
          if (basename(path) === creationKey) {
            mkdirEntered.resolve()
            await releaseMkdir.promise
          }
          return base.mkdir(path, options)
        },
      },
      imageStore,
      logger() {},
      runBus: createRunBus(),
    })

    const creating = repository.createProject({ creationKey })
    await mkdirEntered.promise
    let disposed = false
    const disposal = repository.dispose().then(() => {
      disposed = true
    })
    await Promise.resolve()
    expect(disposed).toBe(false)

    releaseMkdir.resolve()
    await creating
    await disposal
    expect(disposed).toBe(true)
  })
})

function deferred<T>() {
  let reject!: (error: unknown) => void
  let resolve!: (value: PromiseLike<T> | T) => void
  const promise = new Promise<T>((accept, deny) => {
    resolve = accept
    reject = deny
  })
  return { promise, reject, resolve }
}

function messageTurn(projectId: string): ProjectMessageTurn {
  return {
    htmlSwaps: 1,
    id: `turn-${projectId}`,
    isStreaming: false,
    model: 'zai-org/GLM-5.2',
    parts: [
      {
        id: 'text-1',
        text: 'Done.',
        type: 'text',
      },
      {
        cost: 0.01,
        durationMs: 1000,
        finishReason: 'stop',
        model: 'zai-org/GLM-5.2',
        type: 'stats',
        usage: { totalTokens: 100 },
      },
    ],
    prompt: 'Build a page',
  }
}

function proxyFileHandle(
  handle: Awaited<ReturnType<ProjectFileSystem['open']>>,
  overrides: Partial<Awaited<ReturnType<ProjectFileSystem['open']>>>,
) {
  return new Proxy(handle, {
    get(value, property) {
      const member =
        property in overrides
          ? Reflect.get(overrides, property)
          : Reflect.get(value, property)
      return typeof member === 'function' ? member.bind(value) : member
    },
  })
}

let testId = 0
function randomTestId(): string {
  testId += 1
  return `snapshot-${testId}`
}
