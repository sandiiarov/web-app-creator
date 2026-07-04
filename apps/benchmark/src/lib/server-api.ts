import { SERVER_URL } from './types'

export interface CreateProjectInput {
  model?: string
  title?: string
}

export interface ScreenshotErrorResponse {
  error: string
}

/** Server project shape (only the fields the benchmark uses). */
export interface ServerProject {
  hasHtml: boolean
  id: string
  indexHtml: string
  model: string
  title: string
}

export async function createProject(
  input: CreateProjectInput = {},
): Promise<ServerProject> {
  const response = await fetch(`${SERVER_URL}/api/projects`, {
    body: JSON.stringify(input),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  const json = (await response.json()) as {
    ok: boolean
    project: ServerProject
  }
  if (!json.ok) throw new Error('Failed to create project')
  return json.project
}

/**
 * Expand root-relative project image URLs to absolute so they render inside
 * sandboxed `srcDoc` preview iframes. Stored HTML uses
 * `/api/projects/:id/images/<file>`; iframe documents need `${SERVER_URL}...`.
 */
export function expandProjectImageUrls(html: string): string {
  const pattern = /\/api\/projects\/[a-f0-9-]+\/images\/[^"')\]]+/gi
  return html.replace(pattern, (match) =>
    match.startsWith('http') ? match : `${SERVER_URL}${match}`,
  )
}

export async function getProject(id: string): Promise<ServerProject> {
  const response = await fetch(`${SERVER_URL}/api/projects/${id}`)
  if (!response.ok) throw new Error(`Failed to load project ${id}`)
  const json = (await response.json()) as {
    ok: boolean
    project: ServerProject
  }
  if (!json.ok) throw new Error(`Failed to load project ${id}`)
  return json.project
}

/**
 * Answer a screenshot request with a fast error so the server's screenshot tool
 * fails deterministically instead of waiting the full timeout. The benchmark
 * does not render preview captures; screenshot is a known controlled failure.
 */
export async function postScreenshotError(
  requestId: string,
  error: string,
): Promise<void> {
  await fetch(`${SERVER_URL}/api/screenshot-responses/${requestId}`, {
    body: JSON.stringify({ error } satisfies ScreenshotErrorResponse),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
}

/** Absolute URL to open a generated project in the client editor. */
export function projectEditorUrl(projectId: string): string {
  return `${SERVER_URL.replace(/\/$/, '')}#/projects/${projectId}`
}
