import type { LandingTurn } from '@workspace/prompt-panel'

import { SERVER_URL } from './landing-agent'

export interface AgentEventSubscription {
  html: string
  models: { image: string; text: string; vision: string }
  runStartedAt: null | string
  runTurnId: null | string
  status: RunStatus
  turns: LandingTurn[]
}

export interface Project extends ProjectMeta {
  indexHtml: string
  messages: LandingTurn[]
}

export interface ProjectInput {
  textModel?: string
  title?: string
}

export interface ProjectMeta {
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

export interface SendPromptInput {
  attachments?: Array<
    | {
        dataUrl: string
        id: string
        mediaType: string
        name: string
        size: number
      }
    | { kind: 'element'; selector: string }
  >
  imageModel?: string
  projectId: string
  prompt: string
  textModel: string
  turnId: string
  visionModel?: string
}

export interface SendPromptResult {
  status: string
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
export function downloadProjectHtml(id: string): void {
  window.location.href = `${SERVER_URL}/api/projects/${id}/html`
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
  return json.projects
}

/** SSE URL for the per-project live event stream (state snapshot + run tail). */
export function projectEventsUrl(projectId: string): string {
  return `${SERVER_URL}/api/projects/${projectId}/events`
}

/** SSE URL for the project-list live status stream. */
export function projectListEventsUrl(): string {
  return `${SERVER_URL}/api/projects/events`
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
  const response = await fetch(`${SERVER_URL}/agent`, {
    body: JSON.stringify(input),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (response.status === 404) throw new ProjectNotFoundError(input.projectId)
  const json = (await response.json()) as {
    error?: string
    ok: boolean
    status?: string
    turnId?: string
  }
  if (!json.ok || !json.turnId || !json.status) {
    throw new Error(json.error ?? 'Failed to start agent run')
  }
  return { status: json.status, turnId: json.turnId }
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
