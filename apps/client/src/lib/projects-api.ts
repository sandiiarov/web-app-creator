import type { LandingTurn } from '@workspace/prompt-panel'

import { SERVER_URL, type ScreenshotResponseInput } from './landing-agent'

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
  title: string
  updatedAt: string
  visionModel?: string
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

export async function postScreenshotResponse(
  requestId: string,
  payload: ScreenshotResponseInput,
): Promise<void> {
  const response = await fetch(
    `${SERVER_URL}/api/screenshot-responses/${requestId}`,
    {
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
  )
  const json = (await response.json()) as { ok: boolean }
  if (!json.ok) throw new Error('Failed to post screenshot response')
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
