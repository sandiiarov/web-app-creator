import { readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { applyAnchorEdits } from './html-anchor-document.ts'
import {
  appendProjectMessageTurn,
  createProject,
  createProjectHtmlStore,
  deleteProject,
  getProject,
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

  it('normalizes legacy zero-cost stats from saved token usage', async () => {
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
      cost: expect.closeTo(0.0034378, 8),
      costBreakdown: expect.objectContaining({
        llm: expect.closeTo(0.0034378, 8),
        total: expect.closeTo(0.0034378, 8),
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
