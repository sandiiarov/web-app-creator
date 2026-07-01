import { rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import {
  appendProjectMessageTurn,
  createProject,
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
