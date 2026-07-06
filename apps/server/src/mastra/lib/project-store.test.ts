import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { applyAnchorEdits } from './html-anchor-document.ts'
import { saveImage } from './image-store.ts'
import {
  appendProjectMessageTurn,
  createProject,
  createProjectHtmlStore,
  deleteProject,
  getProject,
  listProjects,
  readProjectImage,
  readProjectRawMessages,
  saveProjectMessageTurn,
  saveProjectRawMessages,
  setTitleIfUntitled,
  updateProjectModel,
  type ProjectMessageTurn,
} from './project-store.ts'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECTS_DIR = join(MODULE_DIR, '..', '..', '..', '.data', 'projects')

const createdProjectIds: string[] = []

afterEach(async () => {
  await Promise.all(createdProjectIds.splice(0).map((id) => deleteProject(id)))
})

describe('project message storage', () => {
  it('creates projects with empty message history', async () => {
    const project = await createProject()
    createdProjectIds.push(project.id)

    expect(project.messages).toEqual([])
    await expect(getProject(project.id)).resolves.toMatchObject({
      id: project.id,
      messages: [],
    })
  })

  it('stores new project HTML in html.json without creating index.html', async () => {
    const project = await createProject()
    createdProjectIds.push(project.id)
    const projectDir = join(PROJECTS_DIR, project.id)

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
    await expect(getProject(project.id)).resolves.toMatchObject({
      id: project.id,
      indexHtml: project.indexHtml,
    })
  })

  it('migrates legacy index.html into html.json and removes the legacy file', async () => {
    const project = await createProject()
    createdProjectIds.push(project.id)
    const projectDir = join(PROJECTS_DIR, project.id)
    const legacyHtml = '<main>\n  <h1>Legacy</h1>\n</main>\n'

    await rm(join(projectDir, 'html.json'))
    await writeFile(join(projectDir, 'index.html'), legacyHtml, 'utf8')

    await expect(getProject(project.id)).resolves.toMatchObject({
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
    const project = await createProject()
    createdProjectIds.push(project.id)
    const projectDir = join(PROJECTS_DIR, project.id)
    const store = createProjectHtmlStore(project.id)
    const result = applyAnchorEdits(store.getDocument(), [
      {
        operation: 'replace',
        range: ['a6'],
        text: '    <title>Anchored</title>',
      },
    ])

    store.setDocument(result.document)

    const saved = await getProject(project.id)
    expect(saved?.indexHtml).toContain('<title>Anchored</title>')
    expect(await readFile(join(projectDir, 'html.json'), 'utf8')).toContain(
      '<title>Anchored</title>',
    )
    await expect(
      readFile(join(projectDir, 'index.html'), 'utf8'),
    ).rejects.toThrow('ENOENT')
  })

  it('appends and reads project message turns', async () => {
    const project = await createProject()
    createdProjectIds.push(project.id)
    const turn = messageTurn(project.id)

    await appendProjectMessageTurn(project.id, turn)

    await expect(getProject(project.id)).resolves.toMatchObject({
      id: project.id,
      messages: [turn],
    })
  })

  it('upserts a project message turn by id for incremental checkpoints', async () => {
    const project = await createProject()
    createdProjectIds.push(project.id)
    const turn = messageTurn(project.id)

    await saveProjectMessageTurn(project.id, turn)
    await expect(getProject(project.id)).resolves.toMatchObject({
      messages: [turn],
    })

    const finalized: ProjectMessageTurn = {
      ...turn,
      isStreaming: false,
      parts: [...turn.parts, { id: 'text-final', text: 'Done.', type: 'text' }],
    }
    await saveProjectMessageTurn(project.id, finalized)

    const saved = await getProject(project.id)
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
    const project = await createProject()
    createdProjectIds.push(project.id)
    const turn = messageTurn(project.id)
    const rawAssistant = {
      content: { format: 2, parts: [{ text: 'Done.', type: 'text' }] },
      id: 'mastra-1',
      role: 'assistant',
    }

    await saveProjectRawMessages(project.id, turn.id, [rawAssistant])
    await expect(readProjectRawMessages(project.id)).resolves.toEqual([
      { messages: [rawAssistant], turnId: turn.id },
    ])

    // The client-facing project read must NOT carry raw messages (large,
    // server-only replay data).
    await expect(getProject(project.id)).resolves.not.toHaveProperty(
      'rawMessages',
    )

    // Upsert by turn id replaces in place without duplicating.
    const rawFinal = {
      content: { format: 2, parts: [{ text: 'Final.', type: 'text' }] },
      id: 'mastra-1',
      role: 'assistant',
    }
    await saveProjectRawMessages(project.id, turn.id, [rawFinal])
    await expect(readProjectRawMessages(project.id)).resolves.toEqual([
      { messages: [rawFinal], turnId: turn.id },
    ])
  })

  it('falls back to empty message history when messages.json is missing', async () => {
    const project = await createProject()
    createdProjectIds.push(project.id)
    await rm(join(PROJECTS_DIR, project.id, 'messages.json'))

    await expect(getProject(project.id)).resolves.toMatchObject({
      id: project.id,
      messages: [],
    })
  })

  it('persists attachment metadata without image data', async () => {
    const project = await createProject()
    createdProjectIds.push(project.id)
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

    await appendProjectMessageTurn(project.id, turn)

    await expect(getProject(project.id)).resolves.toMatchObject({
      id: project.id,
      messages: [turn],
    })
  })

  it('leaves legacy zero-cost stats unchanged when only token usage is saved', async () => {
    const project = await createProject()
    createdProjectIds.push(project.id)
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

    await appendProjectMessageTurn(project.id, turn)

    const saved = await getProject(project.id)
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
    const project = await createProject({ model: 'moonshotai/Kimi-K2.7-Code' })
    createdProjectIds.push(project.id)
    const turn = messageTurn(project.id)

    await appendProjectMessageTurn(project.id, turn)
    await updateProjectModel(project.id, 'zai-org/GLM-5.2')

    await expect(getProject(project.id)).resolves.toMatchObject({
      id: project.id,
      messages: [turn],
      model: 'zai-org/GLM-5.2',
    })
  })

  it('lists only generated projects newest first and tolerates missing projects', async () => {
    const older = await createProject({ title: 'Older' })
    const newer = await createProject({ title: 'Newer' })
    createdProjectIds.push(older.id, newer.id)

    createProjectHtmlStore(older.id).set('<main>Older</main>')
    await new Promise((resolve) => setTimeout(resolve, 5))
    createProjectHtmlStore(newer.id).set('<main>Newer</main>')

    const listed = (await listProjects()).filter(
      (project) => project.id === newer.id || project.id === older.id,
    )
    expect(listed).toEqual([
      expect.objectContaining({ id: newer.id, title: 'Newer' }),
      expect.objectContaining({ id: older.id, title: 'Older' }),
    ])
    await expect(
      updateProjectModel('missing-project', 'model'),
    ).resolves.toBeNull()
    await expect(deleteProject('missing-project')).resolves.toBeUndefined()
  })

  it('sets the title once from the first prompt and truncates long titles', async () => {
    const project = await createProject()
    createdProjectIds.push(project.id)

    setTitleIfUntitled(
      project.id,
      '   Build    a landing page with a title that is definitely longer than sixty characters   ',
    )
    setTitleIfUntitled(project.id, 'Do not overwrite')

    const saved = await getProject(project.id)
    expect(saved?.title).toMatch(/^Build a landing page.*…$/)
    expect(saved?.title).toHaveLength(61)
  })

  it('reads persisted project images by safe names and media type', async () => {
    const project = await createProject()
    createdProjectIds.push(project.id)
    const imageDir = join(PROJECTS_DIR, project.id, 'images')
    await mkdir(imageDir, { recursive: true })
    await writeFile(join(imageDir, 'img-123.jpg'), 'jpg-bytes')
    await writeFile(join(imageDir, 'logo.svg'), '<svg />')
    await writeFile(join(imageDir, 'asset.gif'), 'gif-bytes')
    await writeFile(join(imageDir, 'asset.webp'), 'webp-bytes')
    await writeFile(join(imageDir, 'asset.unknown'), 'png-bytes')

    await expect(readProjectImage(project.id, 'img-123.jpg')).resolves.toEqual({
      buffer: Buffer.from('jpg-bytes'),
      mediaType: 'image/jpeg',
    })
    await expect(readProjectImage(project.id, 'logo.svg')).resolves.toEqual({
      buffer: Buffer.from('<svg />'),
      mediaType: 'image/svg+xml',
    })
    await expect(
      readProjectImage(project.id, 'asset.gif'),
    ).resolves.toMatchObject({
      mediaType: 'image/gif',
    })
    await expect(
      readProjectImage(project.id, 'asset.webp'),
    ).resolves.toMatchObject({
      mediaType: 'image/webp',
    })
    await expect(
      readProjectImage(project.id, 'asset.unknown'),
    ).resolves.toMatchObject({ mediaType: 'image/png' })
    await expect(
      readProjectImage(project.id, '../secret.png'),
    ).resolves.toBeNull()
    await expect(
      readProjectImage(project.id, 'missing.webp'),
    ).resolves.toBeNull()
  })

  it('resets project stores with custom and placeholder documents', async () => {
    const project = await createProject()
    createdProjectIds.push(project.id)
    const store = createProjectHtmlStore(project.id)

    store.reset('<main>Seed</main>')
    expect(store.get()).toBe('<main>Seed</main>')

    store.reset()
    expect(store.get()).toContain('<title>Untitled</title>')
  })

  it('copies generated images into project storage and preserves existing project URLs', async () => {
    const project = await createProject()
    createdProjectIds.push(project.id)
    const imageId = saveImage(
      Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      'image/jpeg',
    )
    const store = createProjectHtmlStore(project.id)

    store.set(
      `<main><img src="http://localhost:3001/images/${imageId}.jpg"><img src="http://localhost:3001/api/projects/${project.id}/images/already.png"><img src="/images/img-999.png"></main>`,
    )

    const saved = await getProject(project.id)
    expect(saved?.indexHtml).toContain(
      `/api/projects/${project.id}/images/${imageId}.jpg`,
    )
    expect(saved?.indexHtml).toContain(
      `/api/projects/${project.id}/images/already.png`,
    )
    expect(saved?.indexHtml).toContain('/images/img-999.png')
    await expect(
      readProjectImage(project.id, `${imageId}.jpg`),
    ).resolves.toEqual({
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      mediaType: 'image/jpeg',
    })
  })
})

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
