/**
 * File-backed project storage.
 *
 * Each project lives at `<dataDir>/projects/<id>/` with:
 *   - `project.json`  metadata (id, title, model, timestamps, hasHtml)
 *   - `index.html`    generated landing page (may be empty for drafts)
 *   - `images/<file>` generated image bytes copied out of the in-memory image store
 *
 * The data dir is local-only (gitignored). This is the persistence layer that
 * the process-memory `html-store`/`image-store` lacked: it lets generated
 * landing pages and their locally-generated images survive across reloads and
 * server restarts.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { getImage } from './image-store.ts'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(MODULE_DIR, '..', '..', '..', '..', '.data')
const PROJECTS_DIR = join(DATA_DIR, 'projects')

const INDEX_HTML = 'index.html'
const PROJECT_JSON = 'project.json'
const IMAGES_DIR = 'images'

export interface Project extends ProjectMeta {
  indexHtml: string
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

export interface ProjectUpdate extends ProjectInput {
  indexHtml?: string
}

/** Create a new draft project and return it. */
export async function createProject(
  input: ProjectInput = {},
): Promise<Project> {
  const id = randomUUID()
  const now = new Date().toISOString()
  const meta: ProjectMeta = {
    createdAt: now,
    hasHtml: false,
    id,
    model: input.model ?? '',
    title: input.title?.trim() || 'Untitled',
    updatedAt: now,
  }

  await ensureProjectDir(id)
  await writeMeta(id, meta)
  await writeIndexHtml(id, '')

  return { ...meta, indexHtml: '' }
}

/** Delete a project and its images. No-op if missing. */
export async function deleteProject(id: string): Promise<void> {
  await rm(projectDir(id), { force: true, recursive: true })
}

/** Full project (metadata + index.html), or null if missing. */
export async function getProject(id: string): Promise<null | Project> {
  const meta = await readMeta(id)
  if (!meta) return null
  const indexHtml = await readIndexHtml(id)
  return { ...meta, indexHtml }
}

/** List all projects (metadata only), newest first. Drafts without HTML included. */
export async function listProjects(): Promise<ProjectMeta[]> {
  const ids = await readDirSafe(PROJECTS_DIR)
  const metas: ProjectMeta[] = []

  for (const id of ids) {
    const meta = await readMeta(id)
    if (meta) metas.push(meta)
  }

  return metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** Read a persisted project image. Returns bytes + content-type, or null. */
export async function readProjectImage(
  id: string,
  file: string,
): Promise<null | { buffer: Buffer; mediaType: string }> {
  if (!isSafeImageName(file)) return null
  const filePath = join(projectDir(id), IMAGES_DIR, file)

  try {
    const buffer = await readFile(filePath)
    return { buffer, mediaType: mediaTypeForName(file) }
  } catch {
    return null
  }
}

/** Update metadata and/or index.html. Returns the updated full project. */
export async function updateProject(
  id: string,
  update: ProjectUpdate,
): Promise<null | Project> {
  const existing = await readMeta(id)
  if (!existing) return null

  let nextHtml: string | undefined
  if (typeof update.indexHtml === 'string' && update.indexHtml.trim()) {
    const normalized = await persistProjectImages(id, update.indexHtml)
    await writeIndexHtml(id, normalized)
    nextHtml = normalized
  }

  const now = new Date().toISOString()
  const meta: ProjectMeta = {
    ...existing,
    model: update.model?.trim() ? update.model : existing.model,
    title: update.title?.trim() ? update.title : existing.title,
    updatedAt: now,
  }

  if (typeof update.indexHtml === 'string') {
    meta.hasHtml = update.indexHtml.trim().length > 0
  }

  await writeMeta(id, meta)

  return {
    ...meta,
    indexHtml: nextHtml ?? (await readIndexHtml(id)),
  }
}

// ── image URL normalization ──────────────────────────────────────

function copyAgentImage(
  projectId: string,
  imgId: string,
  ext: string,
): null | string {
  const stored = getImage(imgId)
  if (!stored) return null

  const extension = ext || `.${stored.extension}` || '.png'
  const fileName = `${imgId}${extension}`
  void persistImageBytes(projectId, fileName, stored.buffer)
  return `/api/projects/${projectId}/images/${fileName}`
}

async function ensureProjectDir(id: string) {
  await mkdir(projectDir(id), { recursive: true })
}

async function ensureProjectsRoot() {
  await mkdir(PROJECTS_DIR, { recursive: true })
}

async function hasIndexHtml(id: string): Promise<boolean> {
  try {
    const content = await readFile(join(projectDir(id), INDEX_HTML), 'utf8')
    return content.trim().length > 0
  } catch {
    return false
  }
}

// ── fs helpers ───────────────────────────────────────────────────

function isSafeImageName(name: string): boolean {
  return (
    /^(img-\d+|img-\d+\.[a-z0-9]+|[a-z0-9_-]+\.[a-z0-9]+)$/i.test(name) &&
    !name.includes('..') &&
    !name.includes('/')
  )
}

function mediaTypeForName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'gif':
      return 'image/gif'
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg'
    case 'svg':
      return 'image/svg+xml'
    case 'webp':
      return 'image/webp'
    default:
      return 'image/png'
  }
}

async function persistImageBytes(
  projectId: string,
  fileName: string,
  buffer: Buffer,
) {
  const dir = join(projectDir(projectId), IMAGES_DIR)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, fileName), buffer)
}

/**
 * Normalize locally-generated image URLs in the saved HTML into a stable
 * root-relative form and copy their bytes into the project's image folder.
 *
 * Handles three input shapes (the editor may hold any of them):
 *   - `${origin}/images/img-N.ext`        agent endpoint, absolute (fresh gen)
 *   - `/images/img-N.ext`                 agent endpoint, root-relative
 *   - `${origin}/api/projects/<id>/images/<file>` or root-relative (already persisted)
 *
 * Agent-endpoint images are copied from the in-memory `image-store` and
 * rewritten to `/api/projects/<projectId>/images/img-N.ext`. Already-project
 * URLs are collapsed to root-relative (origin stripped) and left untouched.
 */
async function persistProjectImages(
  projectId: string,
  html: string,
): Promise<string> {
  const sentinels: string[] = []
  const PROJ_IMG =
    /(?:https?:\/\/[^"' )\]]+)?\/api\/projects\/[a-f0-9-]+\/images\/[^"' )\]]+/gi
  let working = html.replace(PROJ_IMG, (match) => {
    sentinels.push(stripOrigin(match))
    return `__PROJIMG_${sentinels.length - 1}__`
  })

  const AGENT_IMG =
    /(?:https?:\/\/[^"' )\]]+)?\/images\/(img-\d+)(\.[a-z0-9]+)?/gi
  working = working.replace(AGENT_IMG, (match, imgId: string, ext = '') => {
    return copyAgentImage(projectId, imgId, ext) ?? match
  })

  working = working.replace(/__PROJIMG_(\d+)__/g, (_m, idx: string) => {
    return sentinels[Number(idx)] ?? ''
  })

  return working
}

function projectDir(id: string) {
  return join(PROJECTS_DIR, id)
}

async function readDirSafe(dir: string): Promise<string[]> {
  try {
    await ensureProjectsRoot()
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

async function readIndexHtml(id: string): Promise<string> {
  try {
    return await readFile(join(projectDir(id), INDEX_HTML), 'utf8')
  } catch {
    return ''
  }
}

async function readMeta(id: string): Promise<null | ProjectMeta> {
  try {
    const raw = await readFile(join(projectDir(id), PROJECT_JSON), 'utf8')
    const meta = JSON.parse(raw) as ProjectMeta
    const hasHtml = await hasIndexHtml(id)
    return { ...meta, hasHtml }
  } catch {
    return null
  }
}

function stripOrigin(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/i, '')
}

async function writeIndexHtml(id: string, html: string) {
  await ensureProjectDir(id)
  await writeFile(join(projectDir(id), INDEX_HTML), html, 'utf8')
}

async function writeMeta(id: string, meta: ProjectMeta) {
  const { hasHtml: _ignored, ...persisted } = meta
  await ensureProjectDir(id)
  await writeFile(
    join(projectDir(id), PROJECT_JSON),
    JSON.stringify(persisted, null, 2),
    'utf8',
  )
}
