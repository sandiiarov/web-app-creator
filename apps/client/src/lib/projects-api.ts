import {
  ProjectListSnapshotSchema,
  ProjectMetaSchema,
  ProjectSnapshotSchema,
  StartRunResultSchema,
  type ProjectMeta as ContractProjectMeta,
  type ProjectSnapshot,
  type StartRunCommand,
} from '@workspace/contracts'
import type { LandingTurn } from '@workspace/prompt-panel'

import { SERVER_URL } from './landing-agent'

/** @deprecated Test/legacy snapshot shape. Production v2 is validated with parseProjectSnapshot. */
export interface AgentEventSubscription {
  brief?: string
  cursor?: number
  documentHash?: string
  html: string
  models: ProjectSnapshot['models']
  projectId?: string
  run?: ProjectSnapshot['run']
  runStartedAt?: null | string
  runTurnId?: null | string
  status?: RunStatus
  title?: string
  titleSource?: ProjectSnapshot['titleSource']
  turns: LandingTurn[]
  version?: 2
}

export interface Project extends ProjectMeta {
  indexHtml: string
  messages: LandingTurn[]
}

export interface ProjectInput {
  creationKey?: string
  textModel?: string
  title?: string
}

export interface ProjectMeta extends ContractProjectMeta {
  brief?: string
  createdAt: string
  hasHtml: boolean
  id: string
  imageModel?: string
  model: string
  runStartedAt?: null | string
  runTurnId?: null | string
  status?: RunStatus
  title: string
  updatedAt: string
  visionModel?: string
}

export type RunStatus = 'error' | 'idle' | 'interrupted' | 'running' | 'stopped'

export type SendPromptInput = StartRunCommand

export interface SendPromptResult {
  outcome: 'accepted' | 'rejected' | 'unknown'
  reason?: string
  status?: string
  turnId: string
}

export class ProjectNotFoundError extends Error {
  readonly id: string
  constructor(id: string) {
    super(`Project not found: ${id}`)
    this.name = 'ProjectNotFoundError'
    this.id = id
  }
}

export async function createProject(
  input: ProjectInput = {},
): Promise<Project> {
  const response = await fetch(`${SERVER_URL}/api/projects`, {
    body: JSON.stringify({
      creationKey: input.creationKey,
      ...(input.textModel ? { textModel: input.textModel } : {}),
      ...(input.title ? { title: input.title } : {}),
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  const json = (await response.json()) as { ok: boolean; project: Project }
  if (!json.ok) throw new Error('Failed to create project')
  return json.project
}

export async function deleteProject(id: string): Promise<void> {
  const response = await fetch(`${SERVER_URL}/api/projects/${id}`, {
    method: 'DELETE',
  })
  const json = (await response.json()) as { ok: boolean }
  if (!json.ok) throw new Error('Failed to delete project')
}

/** Trigger a download of the project's portable single-file HTML (images inlined). */
export async function downloadProjectHtml(id: string): Promise<void> {
  const response = await fetch(`${SERVER_URL}/api/projects/${id}/html`)
  if (!response.ok)
    throw new Error('Could not download HTML. Please try again.')
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download =
    /filename="([^"/\\]+)"/.exec(
      response.headers.get('content-disposition') ?? '',
    )?.[1] ?? 'page.html'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Expand root-relative project image URLs to absolute so they load inside
 * sandboxed `srcDoc` preview iframes. Stored HTML uses
 * `/api/projects/:id/images/<file>`; iframe documents need the full
 * `${SERVER_URL}/api/projects/:id/images/<file>`.
 */
export function expandProjectImageUrls(html: string): string {
  const pattern = /\/api\/projects\/[a-f0-9-]+\/images\/[^"')\]]+/gi
  return html.replace(pattern, (match) =>
    match.startsWith('http') ? match : `${SERVER_URL}${match}`,
  )
}

export async function getProject(id: string): Promise<Project> {
  const response = await fetch(`${SERVER_URL}/api/projects/${id}`)
  if (response.status === 404) throw new ProjectNotFoundError(id)
  const json = (await response.json()) as { ok: boolean; project: Project }
  if (!json.ok) throw new Error('Failed to load project')
  return json.project
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const response = await fetch(`${SERVER_URL}/api/projects`)
  const json = (await response.json()) as {
    ok: boolean
    projects: ProjectMeta[]
  }
  if (!json.ok) throw new Error('Failed to list projects')
  return ProjectListSnapshotSchema.parse({
    projects: json.projects,
    version: 2,
  }).projects as ProjectMeta[]
}

export function parseProjectMeta(value: unknown) {
  return ProjectMetaSchema.parse(value)
}

export function parseProjectSnapshot(value: unknown) {
  return ProjectSnapshotSchema.parse(value)
}

/** SSE URL for the per-project live event stream (state snapshot + run tail). */
export function projectEventsUrl(projectId: string): string {
  return `${SERVER_URL}/api/projects/${projectId}/events?v=2`
}

/** SSE URL for the project-list live status stream. */
export function projectListEventsUrl(): string {
  return `${SERVER_URL}/api/projects/events?v=2`
}

export async function renameProject(
  id: string,
  title: string,
): Promise<ProjectMeta> {
  const response = await fetch(`${SERVER_URL}/api/projects/${id}`, {
    body: JSON.stringify({ title }),
    headers: { 'content-type': 'application/json' },
    method: 'PATCH',
  })
  const json = (await response.json()) as {
    error?: string
    ok: boolean
    project: ProjectMeta
  }
  if (!response.ok || !json.ok)
    throw new Error(json.error ?? 'Could not rename project')
  return json.project
}

/**
 * Start a landing-page agent run. Returns immediately with the resolved turn
 * id + `status: 'running'`; the run proceeds on the server and its events are
 * delivered through the per-project event subscription. 404 → ProjectNotFound,
 * 409 → throws (a run is already active).
 */
export async function sendPrompt(
  input: SendPromptInput,
): Promise<SendPromptResult> {
  let response: Response
  try {
    response = await fetch(`${SERVER_URL}/agent`, {
      body: JSON.stringify(input),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
  } catch {
    return {
      outcome: 'unknown',
      reason: 'Connection lost before acceptance was confirmed.',
      turnId: input.turnId ?? '',
    }
  }
  let value: unknown
  try {
    value = await response.json()
  } catch {
    return {
      outcome: 'unknown',
      reason: 'The server response could not confirm acceptance.',
      turnId: input.turnId ?? '',
    }
  }
  const parsed = StartRunResultSchema.safeParse(value)
  if (!parsed.success) {
    if ([400, 403, 404, 413].includes(response.status)) {
      return {
        outcome: 'rejected',
        reason:
          value && typeof value === 'object' && 'error' in value
            ? String(value.error)
            : 'The command was rejected.',
        turnId: input.turnId ?? '',
      }
    }
    return {
      outcome: 'unknown',
      reason: 'The server response could not confirm acceptance.',
      turnId: input.turnId ?? '',
    }
  }
  if (parsed.data.ok) return { outcome: 'accepted', turnId: parsed.data.turnId }
  if (parsed.data.reason === 'storage' || response.status >= 500) {
    return {
      outcome: 'unknown',
      reason: parsed.data.error,
      turnId: input.turnId ?? '',
    }
  }
  return {
    outcome: 'rejected',
    reason: parsed.data.error ?? parsed.data.reason,
    turnId: input.turnId ?? '',
  }
}

/**
 * Gracefully stop the active run for a project. The server aborts its Mastra
 * stream but keeps the SSE response open so the final cost/stats + `done` are
 * still streamed back (the caller keeps reading). Returns whether a run was
 * active and stopped.
 */
export async function stopProjectAgent(id: string): Promise<boolean> {
  const response = await fetch(`${SERVER_URL}/api/projects/${id}/stop`, {
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  const json = (await response.json()) as { ok: boolean; stopped: boolean }
  if (!json.ok) throw new Error('Failed to stop project')
  return json.stopped
}

/**
 * Persist the per-category model selection. Sends `textModel`, `visionModel`,
 * and `imageModel`; the server currently persists `textModel` and accepts the
 * rest forward-compat (ignored until project metadata stores them).
 */
export async function updateProjectModels(
  id: string,
  models: { image: string; text: string; vision: string },
): Promise<ProjectMeta> {
  const response = await fetch(`${SERVER_URL}/api/projects/${id}`, {
    body: JSON.stringify({
      imageModel: models.image,
      textModel: models.text,
      visionModel: models.vision,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'PATCH',
  })
  if (response.status === 404) throw new ProjectNotFoundError(id)
  const json = (await response.json()) as { ok: boolean; project: ProjectMeta }
  if (!json.ok) throw new Error('Failed to update project models')
  return json.project
}
