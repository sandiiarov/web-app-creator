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
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  replayClientEvents,
  type ClientEvent as ClientMessageEntry,
  type ConversationAttachment as ProjectMessageAttachment,
  type ConversationPart as ProjectMessagePart,
  type ConversationStatsPart as ProjectMessageStatsPart,
  type ConversationTextPart as ProjectMessageTextPart,
  type ConversationThinkingPart as ProjectMessageThinkingPart,
  type ConversationToolCallPart as ProjectMessageToolCallPart,
  type ConversationTurn as ProjectMessageTurn,
} from '@workspace/conversation'

export type {
  ClientMessageEntry,
  ProjectMessageAttachment,
  ProjectMessagePart,
  ProjectMessageStatsPart,
  ProjectMessageTextPart,
  ProjectMessageThinkingPart,
  ProjectMessageToolCallPart,
  ProjectMessageTurn,
}

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
// Legacy filenames (read-only fallback for projects persisted before the
// append-log refactor). Never written by new code.
const MESSAGES_JSON = 'messages.json'
const RAW_MESSAGES_JSON = 'raw-messages.json'
const CLIENT_MESSAGES_JSONL = 'client-messages.jsonl'
const AGENT_MESSAGES_JSONL = 'agent-messages.jsonl'
const VISION_MESSAGES_JSON = 'vision-messages.json'
const IMAGES_DIR = 'images'
const SCREENSHOTS_DIR = 'screenshots'

// ── append-log entries ────────────────────────────────────────────
// Each file is a chronological, timestamped record of one execution context,
// appended per event/step so the exact data at any moment is preserved.

/** One line in `agent-messages.jsonl`: the real Mastra message list snapshotted
 * after an agent step (`onStepFinish`). `messages` is the verbatim
 * `MastraDBMessage[]` from `stream.messageList.get.all.db()` (with screenshot
 * images externalized to `screenshots/`). */
export type AgentMessageEntry = {
  dir: 'step'
  messages: ProjectRawMessage[]
  step: number
  ts: string
  turnId: string
}

export interface Project extends ProjectMeta {
  indexHtml: string
  messages: ProjectMessageTurn[]
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

/** A persisted screenshot file written under `screenshots/`. */
export interface ProjectScreenshot {
  ext: string
  /** Project-relative URL (`/api/projects/<id>/screenshots/<file>`). */
  path: string
}
/** One entry in `vision-messages.json`: a single OCR/vision call (`ocrImageInputs`).
 * Text/usage/cost only — never image bytes. */
export type VisionMessageEntry = {
  costUsd: number
  imagesAnalyzed: number
  model: string
  ok: boolean
  reason?: string
  seq: number
  source: 'attachment' | 'scrape'
  text: string
  ts: string
  turnId: string
  usage: unknown
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
  invalidateTurnCache(id)
  await rm(projectDir(id), { force: true, recursive: true })
}

/** Full project (metadata + rendered indexHtml + messages), or null if missing. */
export async function getProject(id: string): Promise<null | Project> {
  const meta = await readMeta(id)
  if (!meta) return null
  const document = await readOrCreateHtmlDocument(id)
  // Hydrate from the append-only client log (replayed into turns); fall back to
  // the legacy messages.json for projects persisted before this refactor.
  // Cached in memory so a reload doesn't re-read + re-replay the whole log on
  // every call; the cache is invalidated on any client-log or legacy write.
  let messages = turnCache.get(id)
  if (!messages) {
    const replayed = replayClientEvents(await readClientMessages(id))
    messages = replayed.length > 0 ? replayed : await readMessages(id)
    turnCache.set(id, messages)
  }
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

/**
 * Persist a generated image to the project folder at generation time (independent
 * of a later successful edit) so its bytes are durable even if the run never
 * writes HTML. `ext` should include the leading dot (e.g. `.jpg`) or be empty
 * to infer from the stored media type. Returns the durable project-relative
 * URL, or null when the image id is no longer in the in-memory store (e.g.
 * after a server restart).
 */
export function persistGeneratedImage(
  projectId: string,
  imgId: string,
  ext = '',
): null | string {
  return copyAgentImageSync(projectId, imgId, ext)
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

/** Read a persisted screenshot under `screenshots/`. Returns bytes + content-type, or null. */
export async function readProjectScreenshot(
  id: string,
  file: string,
): Promise<null | { buffer: Buffer; mediaType: string }> {
  if (!isSafeScreenshotName(file)) return null
  const filePath = join(projectDir(id), SCREENSHOTS_DIR, file)

  try {
    const buffer = await readFile(filePath)
    return { buffer, mediaType: mediaTypeForName(file) }
  } catch {
    return null
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

// ── append-only debug logs (client / agent / vision) ──────────────
// Each log is a chronological, per-event/per-step record of one execution
// context, appended immediately so the exact data at any moment is
// inspectable mid-run. JSONL for the high-frequency logs (true append, no
// rewrite); JSON array for the infrequent vision log.

const projectWriteChains = new Map<string, Promise<void>>()

/** In-memory cache of the replayed/legacy message turns for `getProject`, so a
 *  reload doesn't re-read + re-replay the whole client log on every call.
 *  Invalidated whenever the client log or legacy messages.json changes. */
const turnCache = new Map<string, ProjectMessageTurn[]>()

/** Append one per-step Mastra message snapshot to `agent-messages.jsonl`. */
export function appendAgentMessages(
  id: string,
  entry: AgentMessageEntry,
): Promise<void> {
  return chainProjectWrite(id, async () => {
    await ensureProjectDir(id)
    await appendFile(
      join(projectDir(id), AGENT_MESSAGES_JSONL),
      `${JSON.stringify(entry)}\n`,
      'utf8',
    )
  })
}

/** Append one client-facing event/request to `client-messages.jsonl`. */
export function appendClientMessage(
  id: string,
  entry: ClientMessageEntry,
): Promise<void> {
  invalidateTurnCache(id)
  return chainProjectWrite(id, async () => {
    await ensureProjectDir(id)
    await appendFile(
      join(projectDir(id), CLIENT_MESSAGES_JSONL),
      `${JSON.stringify(entry)}\n`,
      'utf8',
    )
  })
}

/** Append one OCR/vision call to `vision-messages.json` (read-modify-write;
 *  OCR is infrequent so a full rewrite per call is fine). */
export function appendVisionMessage(
  id: string,
  entry: Omit<VisionMessageEntry, 'seq'>,
): Promise<VisionMessageEntry[]> {
  let result: VisionMessageEntry[] = []
  const done = chainProjectWrite(id, async () => {
    const existing = await readVisionMessages(id)
    result = [...existing, { ...entry, seq: existing.length + 1 }]
    await ensureProjectDir(id)
    await writeFile(
      join(projectDir(id), VISION_MESSAGES_JSON),
      JSON.stringify(result, null, 2),
      'utf8',
    )
  })
  return done.then(() => result)
}

/** Await any still-pending debug-log writes for a project (client, agent,
 *  vision). Call before a run fully completes so the logs are durable (and so
 *  test cleanup doesn't race fire-and-forget appends). */
export async function flushProjectLogs(id: string): Promise<void> {
  await (projectWriteChains.get(id) ?? Promise.resolve())
}

/** Read the full agent message log (oldest first). Empty when absent. */
export async function readAgentMessages(
  id: string,
): Promise<AgentMessageEntry[]> {
  return readJsonl<AgentMessageEntry>(
    join(projectDir(id), AGENT_MESSAGES_JSONL),
  )
}

/** Build a turn-id → raw Mastra message[] map for agent history replay, taking
 *  the LAST per-step snapshot per turn from the agent log. Falls back to the
 *  legacy raw-messages.json for projects persisted before this refactor. */
export async function readAgentRawByTurn(
  id: string,
): Promise<Map<string, ProjectRawMessage[]>> {
  const entries = await readAgentMessages(id)
  if (entries.length > 0) {
    const byTurn = new Map<string, ProjectRawMessage[]>()
    for (const entry of entries) byTurn.set(entry.turnId, entry.messages)
    return byTurn
  }
  return new Map(
    (await readProjectRawMessages(id)).map((entry) => [
      entry.turnId,
      entry.messages,
    ]),
  )
}

/** Read the full client message log (oldest first). Empty when absent. */
export async function readClientMessages(
  id: string,
): Promise<ClientMessageEntry[]> {
  return readJsonl<ClientMessageEntry>(
    join(projectDir(id), CLIENT_MESSAGES_JSONL),
  )
}

/** Read the vision/OCR call log. Empty array when absent/malformed. */
export async function readVisionMessages(
  id: string,
): Promise<VisionMessageEntry[]> {
  try {
    const raw = await readFile(
      join(projectDir(id), VISION_MESSAGES_JSON),
      'utf8',
    )
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as VisionMessageEntry[]) : []
  } catch {
    return []
  }
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

/**
 * Persist a captured screenshot (base64 dataUrl from the client POST-back) to
 * `screenshots/<seq>-<requestId>.<ext>` and return its project-relative URL.
 * The single durable copy of the bytes — referenced by path from the logs so
 * no base64 ever lands in a JSON file. Sync so the file exists before the
 * agent message snapshot that points at it.
 */
export function writeProjectScreenshotSync(
  id: string,
  requestId: string,
  dataUrl: string,
  mediaType: string,
): ProjectScreenshot {
  const ext = mediaTypeToExt(mediaType)
  const dir = join(projectDir(id), SCREENSHOTS_DIR)
  mkdirSync(dir, { recursive: true })
  const seq = readdirSync(dir).filter((name) => name.endsWith(ext)).length + 1
  const fileName = `${String(seq).padStart(3, '0')}-${requestId}${ext}`
  writeFileSync(join(dir, fileName), decodeBase64DataUrl(dataUrl, mediaType))
  return { ext, path: `/api/projects/${id}/screenshots/${fileName}` }
}

/** Serialize a project's debug-log writes on one per-project chain. The chain
 *  is registered SYNCHRONOUSLY (before any await) so `flushProjectLogs` always
 *  sees the latest pending write — fire-and-forget callers from the stream
 *  loop can't race project cleanup. */
function chainProjectWrite(
  id: string,
  run: () => Promise<unknown>,
): Promise<void> {
  const prev = projectWriteChains.get(id) ?? Promise.resolve()
  const next = prev.then(run, run).then(
    () => undefined,
    () => undefined,
  )
  projectWriteChains.set(id, next)
  void next.finally(() => {
    if (projectWriteChains.get(id) === next) projectWriteChains.delete(id)
  })
  return next
}

/** Serialize appends to one JSONL file so concurrent calls never interleave
 *  lines. Resolves once the line is durably appended. */
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

function decodeBase64DataUrl(dataUrl: string, mediaType: string): Buffer {
  const prefix = `data:${mediaType};base64,`
  const start = dataUrl.startsWith(prefix)
    ? prefix.length
    : dataUrl.indexOf(',') + 1
  return Buffer.from(dataUrl.slice(start), 'base64')
}

async function ensureProjectDir(id: string) {
  await mkdir(projectDir(id), { recursive: true })
}

async function ensureProjectsRoot() {
  await mkdir(PROJECTS_DIR, { recursive: true })
}

// ── image URL normalization (sync) ───────────────────────────────

function invalidateTurnCache(id: string): void {
  turnCache.delete(id)
}

function isProjectRawTurnMessages(
  value: unknown,
): value is ProjectRawTurnMessages {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const data = value as Record<string, unknown>
  return typeof data.turnId === 'string' && Array.isArray(data.messages)
}

function isSafeImageName(name: string): boolean {
  return (
    /^(img-\d+|img-\d+\.[a-z0-9]+|[a-z0-9_-]+\.[a-z0-9]+)$/i.test(name) &&
    !name.includes('..') &&
    !name.includes('/')
  )
}

function isSafeScreenshotName(name: string): boolean {
  return (
    /^\d+-[a-f0-9-]+\.(gif|jpe?g|png|webp)$/i.test(name) &&
    !name.includes('..') &&
    !name.includes('/')
  )
}

// ── sync fs helpers ──────────────────────────────────────────────

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

function mediaTypeToExt(mediaType: string): string {
  switch (mediaType) {
    case 'image/gif':
      return '.gif'
    case 'image/jpeg':
      return '.jpg'
    case 'image/webp':
      return '.webp'
    default:
      return '.png'
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

// ── async fs helpers (HTTP CRUD) ─────────────────────────────────

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

async function readJsonl<T>(filePath: string): Promise<T[]> {
  try {
    const raw = await readFile(filePath, 'utf8')
    return raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as T)
  } catch {
    return []
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
  invalidateTurnCache(id)
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
