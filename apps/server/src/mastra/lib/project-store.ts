/**
 * File-backed project storage.
 *
 * Each project lives at `<dataDir>/projects/<id>/` with:
 *   - `project.json`   metadata (id, title, model, timestamps, hasHtml)
 *   - `html.json`      anchored landing page document — the source of truth
 *   - `messages.json`  persisted chat/tool/stats turns for the project
 *   - `images/<file>`  generated image bytes copied out of the in-memory store
 *
 * The agent operates on the project's anchored `html.json` via
 * `createProjectHtmlStore`. The UI never writes HTML; it only reads rendered
 * HTML back (`getProject`) after each `edit` tool completes.
 */
import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  cloneHtmlDocument,
  createHtmlDocumentFromString,
  type HtmlDocumentJsonV1,
  normalizeHtmlDocument,
  parseHtmlDocumentJson,
  renderHtmlDocument,
} from './html-anchor-document.ts'
import { PLACEHOLDER_INDEX_HTML, type HtmlStore } from './html-store.ts'
import { getImage } from './image-store.ts'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(MODULE_DIR, '..', '..', '..', '.data')
const PROJECTS_DIR = join(DATA_DIR, 'projects')

const HTML_JSON = 'html.json'
const INDEX_HTML = 'index.html'
const PROJECT_JSON = 'project.json'
const MESSAGES_JSON = 'messages.json'
const RAW_MESSAGES_JSON = 'raw-messages.json'
const IMAGES_DIR = 'images'

/**
 * Opaque raw Mastra message JSON (`MastraDBMessage`-shaped) persisted per turn
 * for faithful history replay. Stored apart from `messages.json` (the UI turn)
 * because raw tool args/results can be large and the browser never needs them —
 * only the server-side agent replay path reads them.
 */

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
  html?: string
  id: string
  kind?: 'element' | 'image'
  mediaType: string
  name: string
  screenshotHeight?: number
  screenshotWidth?: number
  selector?: string
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

/**
 * Opaque raw Mastra message JSON (`MastraDBMessage`-shaped) persisted per turn
 * for faithful history replay. Stored apart from `messages.json` (the UI turn)
 * because raw tool args/results can be large and the browser never needs them —
 * only the server-side agent replay path reads them.
 */
export type ProjectRawMessage = unknown
export interface ProjectRawTurnMessages {
  messages: ProjectRawMessage[]
  turnId: string
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

  const document = createHtmlDocumentFromString(PLACEHOLDER_INDEX_HTML)

  await ensureProjectDir(id)
  await writeMeta(id, meta)
  await writeHtmlDocument(id, document)
  await writeMessages(id, [])

  return { ...meta, indexHtml: renderHtmlDocument(document), messages: [] }
}

/**
 * A write-through store bound to a project's anchored `html.json`. The agent
 * edits this document; every `set` persists to disk, copies any referenced
 * in-memory generated images into the project folder, and marks the project as
 * having content. Sync so the write is complete before Mastra emits the
 * `edit` tool-result (the UI fetches on edit-done — no race).
 */
export function createProjectHtmlStore(projectId: string): HtmlStore {
  let document = readOrCreateHtmlDocumentSync(projectId)

  function persistRenderedDocument(nextDocument: HtmlDocumentJsonV1): number {
    document = cloneHtmlDocument(normalizeHtmlDocument(nextDocument))
    const rendered = renderHtmlDocument(document)
    const normalizedHtml = persistProjectImagesSync(projectId, rendered)
    if (normalizedHtml !== rendered) {
      document = preserveAnchorsForRenderedHtml(document, normalizedHtml)
    }
    writeHtmlDocumentSync(projectId, document)
    markHasHtmlSync(projectId)
    return Buffer.byteLength(renderHtmlDocument(document), 'utf8')
  }

  return {
    get() {
      return renderHtmlDocument(document)
    },
    getDocument() {
      return cloneHtmlDocument(document)
    },
    reset(seed) {
      document = createHtmlDocumentFromString(seed ?? PLACEHOLDER_INDEX_HTML)
      writeHtmlDocumentSync(projectId, document)
    },
    set(next) {
      return persistRenderedDocument(createHtmlDocumentFromString(next))
    },
    setDocument(next) {
      return persistRenderedDocument(next)
    },
  }
}

/** Delete a project and its images. No-op if missing. */
export async function deleteProject(id: string): Promise<void> {
  await rm(projectDir(id), { force: true, recursive: true })
}

/** Full project (metadata + rendered indexHtml + messages), or null if missing. */
export async function getProject(id: string): Promise<null | Project> {
  const meta = await readMeta(id)
  if (!meta) return null
  const document = await readOrCreateHtmlDocument(id)
  const messages = await readMessages(id)
  return { ...meta, indexHtml: renderHtmlDocument(document), messages }
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

/**
 * Read raw Mastra messages recorded per turn, for faithful agent history
 * replay. Returns an empty array when the file is missing or malformed. The
 * server-only replay path looks entries up by `turnId`.
 */
export async function readProjectRawMessages(
  id: string,
): Promise<ProjectRawTurnMessages[]> {
  try {
    const raw = await readFile(join(projectDir(id), RAW_MESSAGES_JSON), 'utf8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isProjectRawTurnMessages)
  } catch {
    return []
  }
}

// ── agent-facing project HTML store (sync, write-through) ─────────

/**
 * Upsert a project conversation turn by id: replace an existing turn with the
 * same id (incremental streaming checkpoints) or append it (first write of a
 * new turn). The route writes a streaming turn at run start, rewrites it at
 * meaningful checkpoints (html_update, retry, error), and replaces it with the
 * finalized turn at completion — all keyed by the stable turn id. This keeps a
 * crash mid-run from losing the whole turn: the last successful checkpoint
 * survives on disk instead of the run being all-or-nothing.
 */
export async function saveProjectMessageTurn(
  id: string,
  turn: ProjectMessageTurn,
): Promise<ProjectMessageTurn[]> {
  const messages = await readMessages(id)
  const index = messages.findIndex((entry) => entry.id === turn.id)
  const next =
    index === -1
      ? [...messages, turn]
      : messages.map((entry, i) => (i === index ? turn : entry))
  await writeMessages(id, next)
  return next
}

/**
 * Upsert raw Mastra messages for a turn by `turnId`. Called once at run
 * completion with the captured response messages (`MastraDBMessage[]`) so the
 * next turn's history replay sees the real assistant text, tool calls, and
 * tool results instead of a lossy prose reconstruction.
 */
export async function saveProjectRawMessages(
  id: string,
  turnId: string,
  messages: ProjectRawMessage[],
): Promise<ProjectRawTurnMessages[]> {
  const existing = await readProjectRawMessages(id)
  const index = existing.findIndex((entry) => entry.turnId === turnId)
  const entry: ProjectRawTurnMessages = { messages, turnId }
  const next =
    index === -1
      ? [...existing, entry]
      : existing.map((value, i) => (i === index ? entry : value))
  await ensureProjectDir(id)
  await writeFile(
    join(projectDir(id), RAW_MESSAGES_JSON),
    JSON.stringify(next, null, 2),
    'utf8',
  )
  return next
}

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

function isProjectRawTurnMessages(value: unknown): value is ProjectRawTurnMessages {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const data = value as Record<string, unknown>
  return (
    typeof data.turnId === 'string' && Array.isArray(data.messages)
  )
}

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

function preserveAnchorsForRenderedHtml(
  document: HtmlDocumentJsonV1,
  html: string,
): HtmlDocumentJsonV1 {
  const next = createHtmlDocumentFromString(html)
  if (
    document.finalNewline !== next.finalNewline ||
    document.lineEnding !== next.lineEnding ||
    document.lines.length !== next.lines.length
  ) {
    return next
  }

  return normalizeHtmlDocument({
    ...document,
    checksum: 'sha256:',
    lines: next.lines.map(([, text], index) => [
      document.lines[index]![0],
      text,
    ]),
  })
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

async function readHtmlDocument(
  id: string,
): Promise<HtmlDocumentJsonV1 | null> {
  const filePath = join(projectDir(id), HTML_JSON)
  if (!existsSync(filePath)) return null
  const raw = await readFile(filePath, 'utf8')
  return parseHtmlDocumentJson(JSON.parse(raw))
}

function readHtmlDocumentSync(id: string): HtmlDocumentJsonV1 | null {
  const filePath = join(projectDir(id), HTML_JSON)
  if (!existsSync(filePath)) return null
  const raw = readFileSync(filePath, 'utf8')
  return parseHtmlDocumentJson(JSON.parse(raw))
}

async function readIndexHtml(id: string): Promise<null | string> {
  try {
    return await readFile(join(projectDir(id), INDEX_HTML), 'utf8')
  } catch {
    return null
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

async function readOrCreateHtmlDocument(
  id: string,
): Promise<HtmlDocumentJsonV1> {
  const existing = await readHtmlDocument(id)
  if (existing) return existing

  const legacyHtml = await readIndexHtml(id)
  const document = createHtmlDocumentFromString(
    legacyHtml ?? PLACEHOLDER_INDEX_HTML,
  )
  await writeHtmlDocument(id, document)
  await removeIndexHtml(id)
  return document
}

function readOrCreateHtmlDocumentSync(id: string): HtmlDocumentJsonV1 {
  const existing = readHtmlDocumentSync(id)
  if (existing) return existing

  const legacyHtml = readIndexHtmlSync(id)
  const document = createHtmlDocumentFromString(
    legacyHtml ?? PLACEHOLDER_INDEX_HTML,
  )
  writeHtmlDocumentSync(id, document)
  removeIndexHtmlSync(id)
  return document
}

async function removeIndexHtml(id: string) {
  await rm(join(projectDir(id), INDEX_HTML), { force: true })
}

function removeIndexHtmlSync(id: string) {
  rmSync(join(projectDir(id), INDEX_HTML), { force: true })
}

function stripOrigin(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/i, '')
}

function truncateTitle(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed
}

async function writeHtmlDocument(id: string, document: HtmlDocumentJsonV1) {
  await ensureProjectDir(id)
  await writeFile(
    join(projectDir(id), HTML_JSON),
    `${JSON.stringify(normalizeHtmlDocument(document), null, 2)}\n`,
    'utf8',
  )
}

function writeHtmlDocumentSync(id: string, document: HtmlDocumentJsonV1) {
  mkdirSync(projectDir(id), { recursive: true })
  writeFileSync(
    join(projectDir(id), HTML_JSON),
    `${JSON.stringify(normalizeHtmlDocument(document), null, 2)}\n`,
    'utf8',
  )
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
