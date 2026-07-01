import { SERVER_URL, type LandingTurn } from './landing-agent'

export interface Project extends ProjectMeta {
  indexHtml: string
  messages: LandingTurn[]
}

export interface ProjectInput {
  model?: string
  title?: string
}

export interface ProjectMeta {
  createdAt: string
  hasHtml: boolean
  id: string
  model: string
  title: string
  updatedAt: string
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
    body: JSON.stringify(input),
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

/**
 * Expand root-relative project image URLs to absolute so they load inside the
 * preview iframe, which runs on a virtual almostnode origin (not this server).
 * Stored HTML uses `/api/projects/:id/images/<file>`; the preview needs the
 * full `${SERVER_URL}/api/projects/:id/images/<file>`.
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
