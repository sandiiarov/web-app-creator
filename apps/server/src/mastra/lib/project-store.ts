/**
 * File-backed project storage.
 *
 * Each project lives at `<dataDir>/projects/<id>/` with:
 *   - `project.json`   metadata (id, title, model, timestamps, hasHtml)
 *   - `index.html`     the landing page the agent edits — THE source of truth
 *   - `messages.json`  persisted chat/tool/stats turns for the project
 *   - `images/<file>`  generated image bytes copied out of the in-memory store
 *
 * The agent operates directly on the project's `index.html` via
 * `createProjectHtmlStore`. The UI never writes HTML; it only reads it back
 * (`getProject`) after each `edit` tool completes.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PLACEHOLDER_INDEX_HTML, type HtmlStore } from './html-store.ts'
import { getImage } from './image-store.ts'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(MODULE_DIR, '..', '..', '..', '.data')
const PROJECTS_DIR = join(DATA_DIR, 'projects')

const INDEX_HTML = 'index.html'
const PROJECT_JSON = 'project.json'
const MESSAGES_JSON = 'messages.json'
const IMAGES_DIR = 'images'

export interface Project extends ProjectMeta {
  indexHtml: string
  messages: ProjectMessageTurn[]
}

export interface ProjectInput {
  model?: string
  title?: string
}

export interface ProjectMessageAttachment {
  analysisText?: string
  id: string
  mediaType: string
  name: string
  size: number
}

export type ProjectMessagePart =
  | ProjectMessageStatsPart
  | ProjectMessageTextPart
  | ProjectMessageThinkingPart
  | ProjectMessageToolCallPart

export interface ProjectMessageStatsPart {
  cost: number
  costBreakdown?: unknown
  durationMs: number
  finishReason: string
  model: string
  type: 'stats'
  usage: Record<string, number | undefined>
}

export interface ProjectMessageTextPart {
  id: string
  text: string
  type: 'text'
}

export interface ProjectMessageThinkingPart {
  id: string
  text: string
  type: 'thinking'
}

export interface ProjectMessageToolCallPart {
  detail?: null | string
  id: string
  intent: null | string
  providerId?: string
  result?: null | string
  state: 'done' | 'error' | 'running' | 'start'
  tool: string
  type: 'tool_call'
}

export interface ProjectMessageTurn {
  attachments?: ProjectMessageAttachment[]
  error?: string
  htmlSwaps: number
  id: string
  isStreaming: boolean
  model: string
  parts: ProjectMessagePart[]
  prompt: string
}

export interface ProjectMeta {
  createdAt: string
  hasHtml: boolean
  id: string
  model: string
  title: string
  updatedAt: string
}

// ── async CRUD (HTTP handlers) ───────────────────────────────────

/** Append a completed project conversation turn and return the full history. */
export async function appendProjectMessageTurn(
  id: string,
  turn: ProjectMessageTurn,
): Promise<ProjectMessageTurn[]> {
  const messages = await readMessages(id)
  const next = [...messages, turn]
  await writeMessages(id, next)
  return next
}

/** Create a new draft project seeded with the placeholder page. */
export async function createProject(
  input: ProjectInput = {},
): Promise<Project> {
  const id = randomUUID()
  const now = new Date().toISOString()
  const meta: ProjectMeta = {
    createdAt: now,
    hasHtml: false,
    id,
    model: input.model?.trim() ?? '',
    title: input.title?.trim() || 'Untitled',
    updatedAt: now,
  }

  await ensureProjectDir(id)
  await writeMeta(id, meta)
  await writeIndexHtml(id, PLACEHOLDER_INDEX_HTML)
  await writeMessages(id, [])

  return { ...meta, indexHtml: PLACEHOLDER_INDEX_HTML, messages: [] }
}

/**
 * A write-through store bound to a project's `index.html`. The agent reads and
 * edits this file; every `set` persists to disk, copies any referenced
 * in-memory generated images into the project folder, and marks the project as
 * having content. Sync so the write is complete before Mastra emits the
 * `edit` tool-result (the UI fetches on edit-done — no race).
 */
export function createProjectHtmlStore(projectId: string): HtmlStore {
  let html = readIndexHtmlSync(projectId) ?? PLACEHOLDER_INDEX_HTML

  return {
    get() {
      return html
    },
    reset(seed) {
      html = seed ?? PLACEHOLDER_INDEX_HTML
      writeIndexHtmlSync(projectId, html)
    },
    set(next) {
      const normalized = persistProjectImagesSync(projectId, next)
      writeIndexHtmlSync(projectId, normalized)
      markHasHtmlSync(projectId)
      html = normalized
      return Buffer.byteLength(normalized, 'utf8')
    },
  }
}

/** Delete a project and its images. No-op if missing. */
export async function deleteProject(id: string): Promise<void> {
  await rm(projectDir(id), { force: true, recursive: true })
}

/** Full project (metadata + index.html + messages), or null if missing. */
export async function getProject(id: string): Promise<null | Project> {
  const meta = await readMeta(id)
  if (!meta) return null
  const indexHtml = await readIndexHtml(id)
  const messages = await readMessages(id)
  return { ...meta, indexHtml, messages }
}

/** List all projects (metadata only), newest first. Drafts (no HTML) hidden. */
export async function listProjects(): Promise<ProjectMeta[]> {
  const ids = await readDirSafe(PROJECTS_DIR)
  const metas: ProjectMeta[] = []

  for (const id of ids) {
    const meta = await readMeta(id)
    if (meta && meta.hasHtml) metas.push(meta)
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

// ── agent-facing project HTML store (sync, write-through) ─────────

/** Set the title from the prompt if it is still the default. Sync, server-side. */
export function setTitleIfUntitled(id: string, title: string): void {
  const meta = readMetaSync(id)
  if (!meta || meta.title !== 'Untitled') return
  meta.title = truncateTitle(title)
  meta.updatedAt = new Date().toISOString()
  writeMetaSync(id, meta)
}

/** Persist the current model selection for a project. */
export async function updateProjectModel(
  id: string,
  model: string,
): Promise<null | ProjectMeta> {
  const meta = await readMeta(id)
  if (!meta) return null

  const normalized = model.trim()
  if (meta.model === normalized) return meta

  const next = {
    ...meta,
    model: normalized,
    updatedAt: new Date().toISOString(),
  }
  await writeMeta(id, next)
  return next
}

// ── image URL normalization (sync) ───────────────────────────────

function copyAgentImageSync(
  projectId: string,
  imgId: string,
  ext: string,
): null | string {
  const stored = getImage(imgId)
  if (!stored) return null

  const extension = ext || `.${stored.extension}` || '.png'
  const fileName = `${imgId}${extension}`
  const dir = join(projectDir(projectId), IMAGES_DIR)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, fileName), stored.buffer)
  return `/api/projects/${projectId}/images/${fileName}`
}

async function ensureProjectDir(id: string) {
  await mkdir(projectDir(id), { recursive: true })
}

async function ensureProjectsRoot() {
  await mkdir(PROJECTS_DIR, { recursive: true })
}

// ── sync fs helpers ──────────────────────────────────────────────

function isSafeImageName(name: string): boolean {
  return (
    /^(img-\d+|img-\d+\.[a-z0-9]+|[a-z0-9_-]+\.[a-z0-9]+)$/i.test(name) &&
    !name.includes('..') &&
    !name.includes('/')
  )
}

function markHasHtmlSync(id: string) {
  const meta = readMetaSync(id)
  if (!meta) return
  meta.hasHtml = true
  meta.updatedAt = new Date().toISOString()
  writeMetaSync(id, meta)
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

/**
 * Normalize locally-generated image URLs in the HTML into a stable
 * project-relative form and copy their bytes into the project's image folder.
 *
 * Handles three input shapes:
 *   - `${origin}/images/img-N.ext`   agent endpoint, absolute (fresh generation)
 *   - `/images/img-N.ext`            agent endpoint, root-relative
 *   - `${origin}/api/projects/<id>/images/<file>` or root-relative (already persisted)
 *
 * Agent-endpoint images are copied from the in-memory `image-store` and
 * rewritten to `/api/projects/<projectId>/images/img-N.ext`. Unknown ids are
 * left untouched. Already-project URLs are collapsed to root-relative.
 */
function persistProjectImagesSync(projectId: string, html: string): string {
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
    return copyAgentImageSync(projectId, imgId, ext) ?? match
  })

  working = working.replace(/__PROJIMG_(\d+)__/g, (_m, idx: string) => {
    return sentinels[Number(idx)] ?? ''
  })

  return working
}

function projectDir(id: string) {
  return join(PROJECTS_DIR, id)
}

// ── async fs helpers (HTTP CRUD) ─────────────────────────────────

async function readDirSafe(dir: string): Promise<string[]> {
  try {
    if (!existsSync(dir)) await ensureProjectsRoot()
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

function readIndexHtmlSync(id: string): null | string {
  try {
    return readFileSync(join(projectDir(id), INDEX_HTML), 'utf8')
  } catch {
    return null
  }
}

async function readMessages(id: string): Promise<ProjectMessageTurn[]> {
  try {
    const raw = await readFile(join(projectDir(id), MESSAGES_JSON), 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ProjectMessageTurn[]) : []
  } catch {
    return []
  }
}

async function readMeta(id: string): Promise<null | ProjectMeta> {
  try {
    const raw = await readFile(join(projectDir(id), PROJECT_JSON), 'utf8')
    return JSON.parse(raw) as ProjectMeta
  } catch {
    return null
  }
}

function readMetaSync(id: string): null | ProjectMeta {
  try {
    const raw = readFileSync(join(projectDir(id), PROJECT_JSON), 'utf8')
    return JSON.parse(raw) as ProjectMeta
  } catch {
    return null
  }
}

function stripOrigin(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/i, '')
}

function truncateTitle(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed
}

async function writeIndexHtml(id: string, html: string) {
  await ensureProjectDir(id)
  await writeFile(join(projectDir(id), INDEX_HTML), html, 'utf8')
}

function writeIndexHtmlSync(id: string, html: string) {
  mkdirSync(projectDir(id), { recursive: true })
  writeFileSync(join(projectDir(id), INDEX_HTML), html, 'utf8')
}

async function writeMessages(id: string, messages: ProjectMessageTurn[]) {
  await ensureProjectDir(id)
  await writeFile(
    join(projectDir(id), MESSAGES_JSON),
    JSON.stringify(messages, null, 2),
    'utf8',
  )
}

async function writeMeta(id: string, meta: ProjectMeta) {
  await ensureProjectDir(id)
  await writeFile(
    join(projectDir(id), PROJECT_JSON),
    JSON.stringify(meta, null, 2),
    'utf8',
  )
}

function writeMetaSync(id: string, meta: ProjectMeta) {
  mkdirSync(projectDir(id), { recursive: true })
  writeFileSync(
    join(projectDir(id), PROJECT_JSON),
    JSON.stringify(meta, null, 2),
    'utf8',
  )
}
