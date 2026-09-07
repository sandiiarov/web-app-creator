/**
 * File-backed project storage.
 *
 * Each project lives at `<dataDir>/projects/<id>/` with:
 *   - `project.json` metadata, model selection, and durable project identity
 *   - `html.json` atomically replaced anchored document — the source of truth
 *   - `client-messages.jsonl` authoritative sequenced conversation events
 *   - `messages.json` read-only legacy conversation fallback
 *   - `images/<file>` immutable generated image bytes
 *
 * The agent operates on the project's anchored `html.json` via
 * `createProjectHtmlStore`. The UI never writes HTML; it only reads rendered
 * HTML back (`getProject`) after each `edit` tool completes.
 */
import { createHash, randomUUID } from 'node:crypto'
import { isAbsolute, join, resolve } from 'node:path'

import {
  replayClientEvents,
  type ClientEvent as ClientMessageEntry,
  type ConversationAttachment as ProjectMessageAttachment,
  type ConversationStatsPart as ProjectMessageStatsPart,
  type ConversationToolCallPart as ProjectMessageToolCallPart,
  type ConversationTurn as ProjectMessageTurn,
} from '@workspace/conversation'
import { LRUCache } from 'lru-cache'

export type {
  ClientMessageEntry,
  ProjectMessageAttachment,
  ProjectMessageStatsPart,
  ProjectMessageToolCallPart,
  ProjectMessageTurn,
}

import {
  atomicWriteFile,
  atomicWriteFileSync,
  syncDirectorySync,
  type AtomicWriteResult,
} from '../../storage/atomic-file.ts'
import {
  createEventJournal,
  type EventJournalEntry,
  type EventJournalRead,
  type EventJournalRecovery,
} from '../../storage/event-journal.ts'
import {
  cloneHtmlDocument,
  createHtmlDocumentFromString,
  type HtmlDocumentJsonV1,
  normalizeHtmlDocument,
  parseHtmlDocumentJson,
  renderHtmlDocument,
} from './html-anchor-document.ts'
import { PLACEHOLDER_INDEX_HTML, type HtmlStore } from './html-store.ts'
import { IMAGE_ID_SOURCE, type ImageStore } from './image-store.ts'
import type { ProjectFileSystem } from './project-filesystem.ts'
import type { RunBus } from './run-bus.ts'

export type CommittedClientMessageEntry = ClientMessageEntry & EventJournalEntry

const HTML_JSON = 'html.json'
const INDEX_HTML = 'index.html'
const PROJECT_JSON = 'project.json'
const RUN_STATE_JSON = 'run-state.json'
// Legacy filenames (read-only fallback for projects persisted before the
// append-log refactor). Never written by new code.
const MESSAGES_JSON = 'messages.json'
const RAW_MESSAGES_JSON = 'raw-messages.json'
const CLIENT_MESSAGES_JSONL = 'client-messages.jsonl'
const AGENT_MESSAGES_JSONL = 'agent-messages.jsonl'
const VISION_MESSAGES_JSON = 'vision-messages.json'
const ATTACHMENTS_DIR = 'attachments'
const IMAGES_DIR = 'images'
const SCREENSHOTS_DIR = 'screenshots'
const TOMBSTONES_DIR = 'project-tombstones'

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

export interface CreateProjectRepositoryOptions {
  dataDir: string
  fileSystem: ProjectFileSystem
  imageStore: ImageStore
  logger: ProjectWriteFailureLogger
  runBus: RunBus
}

export interface Project extends ProjectMeta {
  indexHtml: string
  messages: ProjectMessageTurn[]
}
export type ProjectCommitListener = (
  projectId: string,
  record: CommittedClientMessageEntry,
) => void

export interface ProjectInput {
  creationKey?: string
  imageModel?: string
  model?: string
  title?: string
  visionModel?: string
}

export type ProjectListInvalidationListener = (projectId: string) => void

export interface ProjectMeta {
  brief?: string
  createdAt: string
  creationKey?: string
  hasHtml: boolean
  id: string
  imageModel: string
  model: string
  title: string
  titleSource?: 'brief' | 'page' | 'user'
  updatedAt: string
  visionModel: string
}

/** Per-role model selection to persist. Only provided fields are changed. */
export interface ProjectModelSelection {
  imageModel?: string
  textModel?: string
  title?: string
  visionModel?: string
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

export type ProjectRepository = ReturnType<typeof createProjectRepository>

/** Run-lifecycle fields composed onto `ProjectMeta` at the list/get read
 *  boundary (NOT persisted to `project.json` — read from `run-state.json`). */
export interface ProjectRunMeta {
  runBlocked?: boolean
  runStartedAt: null | string
  runTurnId: null | string
  status: RunStatus
}

/** A persisted screenshot file written under `screenshots/`. */
export interface ProjectScreenshot {
  ext: string
  /** Project-relative URL (`/api/projects/<id>/screenshots/<file>`). */
  path: string
}

export interface ProjectSnapshot {
  committedWatermark: number
  conversationRecords: CommittedClientMessageEntry[]
  documentHash: string
  indexHtml: string
  journalStatus: EventJournalRead<CommittedClientMessageEntry>['status']
  messages: ProjectMessageTurn[]
  metadata: ProjectMeta
  mutationGeneration: number
  repositoryRevision: number
  tail: EventJournalRead<CommittedClientMessageEntry>['tail']
}

export type ProjectSnapshotResult =
  | { ok: false; reason: 'busy'; retryable: true }
  | { ok: true; snapshot: ProjectSnapshot }

export interface ProjectTombstone {
  projectId: string
  state: 'completed' | 'deleting'
  updatedAt: string
  version: 1
}

export type ProjectWriteFailureLogger = (id: string, error: unknown) => void

/** Full run-lifecycle record on disk. `idle` (default) when the file is absent
 *  — the back-compat state for all pre-existing projects + fresh drafts. */
export interface RunState {
  error: null | string
  finishedAt: null | string
  runBlocked?: boolean
  startedAt: null | string
  status: RunStatus
  turnId: null | string
}

/** Run-lifecycle status persisted in `run-state.json` (separate from
 *  `project.json` so run writes don't contend with model/hasHtml RMWs). */
export type RunStatus = 'error' | 'idle' | 'interrupted' | 'running' | 'stopped'
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

export class ProjectAssetConflictError extends Error {
  constructor(path: string) {
    super(
      `Immutable project asset already exists with different bytes: ${path}`,
    )
    this.name = 'ProjectAssetConflictError'
  }
}

export class ProjectCreationConflictError extends Error {
  constructor(projectId: string) {
    super(`Project creation key conflicts with existing project: ${projectId}`)
    this.name = 'ProjectCreationConflictError'
  }
}

export class ProjectDeletedError extends Error {
  constructor(projectId: string) {
    super(`Project was deleted and cannot be recreated: ${projectId}`)
    this.name = 'ProjectDeletedError'
  }
}

export class ProjectDocumentCommitError extends Error {
  readonly commitState: AtomicWriteResult['state']
  readonly metadataProjection: 'committed' | 'failed' | 'notAttempted'

  constructor(
    message: string,
    commitState: AtomicWriteResult['state'],
    metadataProjection: 'committed' | 'failed' | 'notAttempted',
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.commitState = commitState
    this.metadataProjection = metadataProjection
    this.name = 'ProjectDocumentCommitError'
  }
}

export class ProjectFileCommitError extends Error {
  readonly commitState: Exclude<AtomicWriteResult['state'], 'committed'>

  constructor(
    message: string,
    commitState: Exclude<AtomicWriteResult['state'], 'committed'>,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.commitState = commitState
    this.name = 'ProjectFileCommitError'
  }
}

export class ProjectMutationBlockedError extends Error {
  constructor(projectId: string) {
    super(`Project mutations are blocked during deletion: ${projectId}`)
    this.name = 'ProjectMutationBlockedError'
  }
}

/** Create one isolated file-backed project repository. */
export function createProjectRepository({
  dataDir,
  fileSystem,
  imageStore,
  logger,
  runBus,
}: CreateProjectRepositoryOptions) {
  if (!isAbsolute(dataDir)) {
    throw new Error('Project repository dataDir must be an absolute path.')
  }
  const PROJECTS_DIR = join(resolve(dataDir), 'projects')
  if (fileSystem.root !== resolve(dataDir)) {
    throw new Error('Project repository filesystem root must equal dataDir.')
  }
  const {
    appendFile,
    existsSync,
    mkdir,
    mkdirSync,
    readdir,
    readdirSync,
    readFile,
    readFileSync,
    rm,
    rmSync,
    writeFile,
    writeFileSync,
  } = fileSystem
  const getImage = imageStore.getImage
  const releaseImage = imageStore.releaseImage
  const broadcastStatus = runBus.broadcastStatus
  const persistedImageUrls = new Map<string, string>()
  const persistedImagesById = new Map<
    string,
    { filePath: string; mediaType: string; projectId: string }
  >()
  const deletionStates = new Map<string, 'deleted' | 'draining'>()
  const commitSubscribers = new Map<string, Set<ProjectCommitListener>>()
  const listInvalidationSubscribers = new Set<ProjectListInvalidationListener>()
  const tombstonesDir = join(dataDir, TOMBSTONES_DIR)

  function tombstonePath(id: string): string {
    return join(tombstonesDir, `${id}.json`)
  }

  function readProjectTombstoneSync(id: string): null | ProjectTombstone {
    const path = tombstonePath(id)
    if (!existsSync(path)) return null
    const value = JSON.parse(readFileSync(path, 'utf8')) as ProjectTombstone
    if (
      value.version !== 1 ||
      value.projectId !== id ||
      (value.state !== 'deleting' && value.state !== 'completed')
    ) {
      throw new Error(`Invalid project tombstone: ${path}`)
    }
    return value
  }

  async function writeProjectTombstone(
    id: string,
    state: ProjectTombstone['state'],
  ): Promise<ProjectTombstone> {
    const tombstone: ProjectTombstone = {
      projectId: id,
      state,
      updatedAt: new Date().toISOString(),
      version: 1,
    }
    await mkdir(tombstonesDir, { recursive: true })
    assertAtomicWrite(
      await atomicWriteFile(
        fileSystem,
        tombstonePath(id),
        JSON.stringify(tombstone, null, 2),
        'utf8',
      ),
      'Project deletion intent',
    )
    return tombstone
  }

  async function listProjectTombstones(): Promise<ProjectTombstone[]> {
    if (!existsSync(tombstonesDir)) return []
    const entries = await readdir(tombstonesDir, { withFileTypes: true })
    return entries
      .filter((entry) => !entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => name.endsWith('.json'))
      .map((name) => readProjectTombstoneSync(name.slice(0, -5)))
      .filter((value): value is ProjectTombstone => value !== null)
  }

  // ── async CRUD (HTTP handlers) ───────────────────────────────────

  /** Append a completed project conversation turn and return the full history. */
  function appendProjectMessageTurn(
    id: string,
    turn: ProjectMessageTurn,
  ): Promise<ProjectMessageTurn[]> {
    return trackProjectMutation(id, async () => {
      const messages = await readMessages(id)
      const next = [...messages, turn]
      await writeMessages(id, next)
      return next
    })
  }

  const creations = new Map<string, Promise<Project & ProjectRunMeta>>()

  async function createProject(
    input: ProjectInput = {},
  ): Promise<Project & ProjectRunMeta> {
    const key = input.creationKey
    if (!key) return createDraft(input)
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        key,
      )
    ) {
      throw new Error('Invalid creation key')
    }
    if (deletionStates.has(key)) throw new ProjectDeletedError(key)
    if (readProjectTombstoneSync(key)) {
      throw new ProjectDeletedError(key)
    }
    const pending = creations.get(key)
    if (pending) return pending
    const operation = trackProjectMutation(key, async () => {
      const existing = await getProject(key)
      if (existing) {
        if (existing.creationKey !== key) {
          throw new ProjectCreationConflictError(key)
        }
        return existing
      }
      return createDraft(input, key)
    })
    creations.set(key, operation)
    try {
      return await operation
    } finally {
      creations.delete(key)
    }
  }

  /** Create a new draft project seeded with the placeholder page. */
  function createDraft(
    input: ProjectInput = {},
    id: string = randomUUID(),
  ): Promise<Project & ProjectRunMeta> {
    const now = new Date().toISOString()
    const meta: ProjectMeta = {
      createdAt: now,
      creationKey: input.creationKey,
      hasHtml: false,
      id,
      imageModel: input.imageModel?.trim() ?? '',
      model: input.model?.trim() ?? '',
      title: input.title?.trim() || 'Untitled',
      titleSource: input.title?.trim() ? 'user' : 'brief',
      updatedAt: now,
      visionModel: input.visionModel?.trim() ?? '',
    }

    const document = createHtmlDocumentFromString(PLACEHOLDER_INDEX_HTML)

    return trackProjectMutation(id, async () => {
      await ensureOrdinaryProjectDir(id)
      await writeMeta(id, meta)
      await writeHtmlDocument(id, document)

      return {
        ...meta,
        ...composeRunMeta(id),
        indexHtml: renderHtmlDocument(document),
        messages: [],
      }
    })
  }

  /**
   * A write-through store bound to a project's anchored `html.json`. The agent
   * edits this document; every `set` persists to disk, copies any referenced
   * in-memory generated images into the project folder, and marks the project as
   * having content. Sync so the write is complete before Mastra emits the
   * `edit` tool-result (the UI fetches on edit-done — no race).
   */
  function createProjectHtmlStore(projectId: string): HtmlStore {
    assertOrdinaryWriteAllowed(projectId)
    let document = readOrCreateHtmlDocumentSync(projectId)

    function persistRenderedDocument(nextDocument: HtmlDocumentJsonV1): number {
      assertOrdinaryWriteAllowed(projectId)
      let candidate = cloneHtmlDocument(normalizeHtmlDocument(nextDocument))
      const rendered = renderHtmlDocument(candidate)
      const normalizedHtml = persistProjectImagesSync(projectId, rendered)
      if (normalizedHtml !== rendered) {
        candidate = preserveAnchorsForRenderedHtml(candidate, normalizedHtml)
      }
      const commit = writeHtmlDocumentSync(projectId, candidate)
      if (commit.state === 'notCommitted') {
        throw new ProjectDocumentCommitError(
          'Project document was not committed.',
          commit.state,
          'notAttempted',
          { cause: commit.error },
        )
      }
      document = candidate
      try {
        markHasHtmlSync(projectId, normalizedHtml)
      } catch (error) {
        throw new ProjectDocumentCommitError(
          'Project document committed, but metadata projection failed.',
          commit.state,
          'failed',
          { cause: error },
        )
      }
      if (commit.state === 'durabilityUncertain') {
        throw new ProjectDocumentCommitError(
          'Project document is visible, but directory durability is uncertain.',
          commit.state,
          'committed',
          { cause: commit.error },
        )
      }
      return Buffer.byteLength(renderHtmlDocument(document), 'utf8')
    }

    function replaceDocument(nextDocument: HtmlDocumentJsonV1): void {
      assertOrdinaryWriteAllowed(projectId)
      const candidate = cloneHtmlDocument(normalizeHtmlDocument(nextDocument))
      const commit = writeHtmlDocumentSync(projectId, candidate)
      if (commit.state === 'notCommitted') {
        throw new ProjectDocumentCommitError(
          'Project document was not committed.',
          commit.state,
          'notAttempted',
          { cause: commit.error },
        )
      }
      document = candidate
      if (commit.state === 'durabilityUncertain') {
        throw new ProjectDocumentCommitError(
          'Project document is visible, but directory durability is uncertain.',
          commit.state,
          'notAttempted',
          { cause: commit.error },
        )
      }
    }

    return {
      get() {
        return renderHtmlDocument(document)
      },
      getDocument() {
        return cloneHtmlDocument(document)
      },
      reset(seed) {
        replaceDocument(
          createHtmlDocumentFromString(seed ?? PLACEHOLDER_INDEX_HTML),
        )
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
  function deleteProject(id: string): Promise<void> {
    return trackProjectMutation(id, async () => {
      invalidateTurnCache(id)
      await rm(projectDir(id), { force: true, recursive: true })
      clientJournals.delete(id)
      turnCacheGeneration.delete(id)
      for (const key of persistedImageUrls.keys()) {
        if (key.startsWith(`${id}\0`)) persistedImageUrls.delete(key)
      }
      for (const [imageId, image] of persistedImagesById) {
        if (image.projectId === id) persistedImagesById.delete(imageId)
      }
      publishProjectRevision(id)
    })
  }

  function listProjectIds(): Promise<string[]> {
    return readDirSafe(PROJECTS_DIR)
  }

  function persistAcceptedAttachmentSync(
    projectId: string,
    sha256: string,
    mediaType: string,
    bytes: Uint8Array,
  ): { created: boolean; path: string } {
    assertOrdinaryWriteAllowed(projectId)
    const extension = mediaTypeToExt(mediaType)
    const fileName = `${sha256}${extension}`
    const directory = join(projectDir(projectId), ATTACHMENTS_DIR)
    const filePath = join(directory, fileName)
    mkdirSync(directory, { recursive: true })
    let created = false
    let file: number | undefined
    try {
      file = fileSystem.openSync(filePath, 'wx')
      created = true
      writeFileSync(file, bytes)
      fileSystem.fsyncSync(file)
      fileSystem.closeSync(file)
      file = undefined
      syncDirectorySync(fileSystem, directory)
    } catch (error) {
      if (file !== undefined) {
        try {
          fileSystem.closeSync(file)
        } catch {
          // Preserve the attachment failure.
        }
      }
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        if (created) {
          try {
            rmSync(filePath, { force: true })
          } catch {
            // Preserve the persistence failure; only this operation's file was
            // eligible for cleanup.
          }
        }
        throw error
      }
      const existing = readFileSync(filePath)
      if (!existing.equals(bytes)) throw new ProjectAssetConflictError(filePath)
      syncExistingAsset(filePath, directory)
      created = false
    }
    return { created, path: `${ATTACHMENTS_DIR}/${fileName}` }
  }

  function removeAcceptedAttachmentSync(projectId: string, path: string): void {
    const prefix = `${ATTACHMENTS_DIR}/`
    if (!path.startsWith(prefix) || path.includes('..')) {
      throw new Error('Invalid accepted attachment path.')
    }
    rmSync(join(projectDir(projectId), path), { force: true })
  }

  /** Full project (metadata + rendered indexHtml + messages), or null if missing. */
  async function getProject(
    id: string,
  ): Promise<null | (Project & ProjectRunMeta)> {
    const meta = await readMeta(id)
    if (!meta) return null
    const document = await readOrCreateHtmlDocument(id)
    // Hydrate from the append-only client log (replayed into turns); fall back to
    // the legacy messages.json for projects persisted before this refactor.
    // Cached in memory so a reload doesn't re-read + re-replay the whole log on
    // every call; the cache is invalidated on any client-log or legacy write.
    const messages = await readProjectTurns(id)
    if (!meta.titleSource) {
      const latest = readMetaSync(id)
      if (latest && !latest.titleSource) {
        latest.brief ??= messages[0]?.prompt ?? meta.title
        // Legacy names came from the first prompt; preserve other custom names.
        const fromBrief =
          latest.title === truncateTitle(latest.brief) ||
          latest.title === 'Untitled'
        const title = fromBrief ? pageTitle(renderHtmlDocument(document)) : null
        latest.title = title ?? latest.title
        latest.titleSource = fromBrief ? (title ? 'page' : 'brief') : 'user'
        writeMetaSync(id, latest)
        Object.assign(meta, latest)
      }
    }
    return {
      ...meta,
      ...composeRunMeta(id),
      indexHtml: renderHtmlDocument(document),
      messages,
    }
  }

  /** Read one stable document/metadata/conversation snapshot for later cursors. */
  async function readSnapshot(
    id: string,
  ): Promise<null | ProjectSnapshotResult> {
    const state = projectMutationState(id)
    const journal = clientJournal(id)
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const capturedPending = [...state.pending]
      const capturedJournalChain = journal.currentChain()
      await Promise.allSettled([...capturedPending, capturedJournalChain])
      const repositoryRevision = state.revision
      const mutationGeneration = state.generation
      let committed: EventJournalRead<CommittedClientMessageEntry> | undefined
      let document: HtmlDocumentJsonV1 | null = null
      let indexHtml = PLACEHOLDER_INDEX_HTML
      let messages: ProjectMessageTurn[] = []
      let metadata: null | ProjectMeta = null
      let readFailed = false
      let readFailure: unknown
      try {
        ;[metadata, document, committed] = await Promise.all([
          readMeta(id),
          readHtmlDocument(id),
          journal.readCommitted(),
        ])
        indexHtml = document
          ? renderHtmlDocument(document)
          : ((await readIndexHtml(id)) ?? PLACEHOLDER_INDEX_HTML)
        const replayed = replayClientEvents(committed.records)
        messages = replayed.length > 0 ? replayed : await readMessages(id)
      } catch (error) {
        readFailed = true
        readFailure = error
      }
      if (
        repositoryRevision !== state.revision ||
        mutationGeneration !== state.generation ||
        state.pending.size > 0 ||
        capturedJournalChain !== journal.currentChain()
      ) {
        continue
      }
      if (readFailed) throw readFailure
      if (!metadata) return null
      if (!committed) throw new Error('Project snapshot journal read failed.')
      return {
        ok: true,
        snapshot: {
          committedWatermark: committed.watermark,
          conversationRecords: structuredClone(committed.records),
          documentHash: createHash('sha256').update(indexHtml).digest('hex'),
          indexHtml,
          journalStatus: committed.status,
          messages: structuredClone(messages),
          metadata: structuredClone(metadata),
          mutationGeneration,
          repositoryRevision,
          tail: committed.tail ? { ...committed.tail } : null,
        },
      }
    }
    return { ok: false, reason: 'busy', retryable: true }
  }

  /** List all projects (metadata only), newest first. Drafts (no HTML) hidden. */
  async function listProjects(): Promise<(ProjectMeta & ProjectRunMeta)[]> {
    const ids = await readDirSafe(PROJECTS_DIR)
    const metas: (ProjectMeta & ProjectRunMeta)[] = []

    for (const id of ids) {
      const meta = await readMeta(id)
      if (meta && meta.hasHtml) {
        const current = !meta.titleSource
          ? ((await getProject(id)) ?? meta)
          : meta
        const {
          indexHtml: _html,
          messages: _messages,
          ...metadata
        } = current as Project
        metas.push({ ...metadata, ...composeRunMeta(id) })
      }
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
  function persistGeneratedImage(
    projectId: string,
    imgId: string,
    ext = '',
  ): null | string {
    assertOrdinaryWriteAllowed(projectId)
    return copyAgentImageSync(projectId, imgId, ext)
  }

  /** Read a persisted project image. Returns bytes + content-type, or null. */
  async function readProjectImage(
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

  /** Resolve a released temporary image id to its runtime-owned durable bytes. */
  function readGeneratedImage(
    id: string,
  ): null | { buffer: Buffer; mediaType: string } {
    const persisted = persistedImagesById.get(id)
    if (!persisted) return null
    try {
      return {
        buffer: readFileSync(persisted.filePath),
        mediaType: persisted.mediaType,
      }
    } catch {
      return null
    }
  }

  /** Match project-image refs (`/api/projects/<id>/images/<file>`) and capture the file. */
  const PROJECT_IMAGE_REF_RE =
    /\/api\/projects\/[a-f0-9-]+\/images\/([^"')\]]+)/gi
  const PROJECT_IMAGE_CAPTURE_REF_RE =
    /(?:https?:\/\/[^"'\s)\]]+)?\/api\/projects\/([a-f0-9-]+)\/images\/([^"'?\s)\]#]+)(?:[?#][^"')\]]*)?/gi

  /**
   * Rendered project HTML with project images inlined as base64 `data:` URLs, so
   * the file is a portable single document (no `localhost` image refs). Returns
   * a download filename + html, or null when the project has no generated HTML.
   */
  async function getProjectHtmlInlined(
    id: string,
  ): Promise<null | { filename: string; html: string }> {
    const meta = await readMeta(id)
    if (!meta || !meta.hasHtml) return null
    const document = await readHtmlDocument(id)
    if (!document) return null
    const html = await inlineProjectImages(id, renderHtmlDocument(document))
    return { filename: `${slugifyTitle(meta.title ?? '')}.html`, html }
  }

  /**
   * Inline image references owned by one project before its HTML is sent to an
   * isolated remote browser. A missing same-project file is an actionable error:
   * it must not turn into a remote fetch. References belonging to other projects
   * and arbitrary external URLs are deliberately left untouched; the capture
   * context blocks their requests.
   */
  async function inlineProjectImagesForCapture(
    projectId: string,
    html: string,
  ): Promise<string> {
    const refs = [...html.matchAll(PROJECT_IMAGE_CAPTURE_REF_RE)]
    if (refs.length === 0) return html

    const dataUrlByReference = new Map<string, string>()
    for (const match of refs) {
      const [reference, referencedProjectId, rawFile] = match
      if (!reference || referencedProjectId !== projectId || !rawFile) continue

      let file: string
      try {
        file = decodeURIComponent(rawFile)
      } catch {
        throw new Error(
          'Project HTML contains an invalid project image reference.',
        )
      }
      const image = await readProjectImage(projectId, file)
      if (!image) {
        throw new Error(`Project image "${file}" is missing.`)
      }
      dataUrlByReference.set(
        reference,
        `data:${image.mediaType};base64,${image.buffer.toString('base64')}`,
      )
    }

    return html.replace(
      PROJECT_IMAGE_CAPTURE_REF_RE,
      (reference) => dataUrlByReference.get(reference) ?? reference,
    )
  }

  /**
   * Read raw Mastra messages recorded per turn, for faithful agent history
   * replay. Returns an empty array when the file is missing or malformed. The
   * server-only replay path looks entries up by `turnId`.
   */
  async function readProjectRawMessages(
    id: string,
  ): Promise<ProjectRawTurnMessages[]> {
    try {
      const raw = await readFile(
        join(projectDir(id), RAW_MESSAGES_JSON),
        'utf8',
      )
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isProjectRawTurnMessages)
    } catch {
      return []
    }
  }

  /** Read a persisted screenshot under `screenshots/`. Returns bytes + content-type, or null. */
  async function readProjectScreenshot(
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

  /**
   * Upsert a project conversation turn by id: replace an existing turn with the
   * same id (incremental streaming checkpoints) or append it (first write of a
   * new turn). The route writes a streaming turn at run start, rewrites it at
   * meaningful checkpoints (html_update, retry, error), and replaces it with the
   * finalized turn at completion — all keyed by the stable turn id. This keeps a
   * crash mid-run from losing the whole turn: the last successful checkpoint
   * survives on disk instead of the run being all-or-nothing.
   */
  function saveProjectMessageTurn(
    id: string,
    turn: ProjectMessageTurn,
  ): Promise<ProjectMessageTurn[]> {
    assertOrdinaryWriteAllowed(id)
    return trackProjectMutation(id, async () => {
      const messages = await readMessages(id)
      const index = messages.findIndex((entry) => entry.id === turn.id)
      const next =
        index === -1
          ? [...messages, turn]
          : messages.map((entry, i) => (i === index ? turn : entry))
      await writeMessages(id, next)
      return next
    })
  }

  // ── agent-facing project HTML store (sync, write-through) ─────────

  /**
   * Upsert raw Mastra messages for a turn by `turnId`. Called once at run
   * completion with the captured response messages (`MastraDBMessage[]`) so the
   * next turn's history replay sees the real assistant text, tool calls, and
   * tool results instead of a lossy prose reconstruction.
   */
  async function saveProjectRawMessages(
    id: string,
    turnId: string,
    messages: ProjectRawMessage[],
  ): Promise<ProjectRawTurnMessages[]> {
    assertOrdinaryWriteAllowed(id)
    const existing = await readProjectRawMessages(id)
    const index = existing.findIndex((entry) => entry.turnId === turnId)
    const entry: ProjectRawTurnMessages = { messages, turnId }
    const next =
      index === -1
        ? [...existing, entry]
        : existing.map((value, i) => (i === index ? entry : value))
    await ensureOrdinaryProjectDir(id)
    await writeFile(
      join(projectDir(id), RAW_MESSAGES_JSON),
      JSON.stringify(next, null, 2),
      'utf8',
    )
    return next
  }

  /** Inline every `/api/projects/<id>/images/<file>` ref as a base64 `data:` URL. */
  async function inlineProjectImages(
    projectId: string,
    html: string,
  ): Promise<string> {
    const filenames = new Set<string>()
    for (const match of html.matchAll(PROJECT_IMAGE_REF_RE)) {
      const file = match[1]
      if (file) filenames.add(file)
    }
    if (filenames.size === 0) return html

    const dataUrlByFile = new Map<string, string>()
    for (const file of filenames) {
      const image = await readProjectImage(projectId, file)
      if (!image) continue
      dataUrlByFile.set(
        file,
        `data:${image.mediaType};base64,${image.buffer.toString('base64')}`,
      )
    }

    return html.replace(
      PROJECT_IMAGE_REF_RE,
      (full, file: string) => dataUrlByFile.get(file) ?? full,
    )
  }

  /** Slugify a project title into a safe download filename stem. */
  function slugifyTitle(title: string): string {
    const slug = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return slug || 'landing-page'
  }

  // ── append-only debug logs (client / agent / vision) ──────────────
  // Each log is a chronological, per-event/per-step record of one execution
  // context, appended immediately so the exact data at any moment is
  // inspectable mid-run. JSONL for the high-frequency logs (true append, no
  // rewrite); JSON array for the infrequent vision log.

  const projectWriteChains = new Map<string, Promise<void>>()
  const clientJournals = new Map<
    string,
    ReturnType<typeof createClientJournal>
  >()
  const turnCacheGeneration = new Map<string, number>()
  const projectMutationStates = new Map<
    string,
    { generation: number; pending: Set<Promise<unknown>>; revision: number }
  >()

  /** Upper bound on the number of projects whose replayed turn cache is
   *  held in memory. Long-lived servers see one entry per recently-viewed
   *  project; LRU evicts the least-recently-used when the bound is hit. */
  const TURN_CACHE_MAX_PROJECTS = 64

  /** In-memory cache of the replayed/legacy message turns for `getProject`, so a
   *  reload doesn't re-read + re-replay the whole client log on every call.
   *  Invalidated whenever the client log or legacy messages.json changes;
   *  bounded to `TURN_CACHE_MAX_PROJECTS` entries via LRU eviction so a
   *  long-lived server doesn't accumulate one entry per project ever viewed. */
  const turnCache = new LRUCache<string, ProjectMessageTurn[]>({
    max: TURN_CACHE_MAX_PROJECTS,
  })

  /** Append one per-step Mastra message snapshot to `agent-messages.jsonl`. */
  function appendAgentMessages(
    id: string,
    entry: AgentMessageEntry,
  ): Promise<void> {
    assertLifecycleWriteAllowed(id)
    return chainProjectWrite(id, async () => {
      await ensureLifecycleProjectDir(id)
      await appendFile(
        join(projectDir(id), AGENT_MESSAGES_JSONL),
        `${JSON.stringify(entry)}\n`,
        'utf8',
      )
    })
  }

  /** Append one client-facing event/request to `client-messages.jsonl`. */
  function appendClientMessage(
    id: string,
    entry: ClientMessageEntry,
  ): Promise<CommittedClientMessageEntry> {
    assertLifecycleWriteAllowed(id)
    return trackProjectMutation(id, async () => {
      try {
        const committed = await clientJournal(id).appendCommitted(entry)
        advanceTurnCacheGeneration(id)
        publishProjectRevision(id)
        notifyProjectCommit(id, committed)
        return committed
      } catch (error) {
        try {
          projectWriteFailureLogger(id, error)
        } catch {
          // Preserve the authoritative append failure when the logger fails.
        }
        throw error
      }
    })
  }

  /** Append one OCR/vision call to `vision-messages.json` (read-modify-write;
   *  OCR is infrequent so a full rewrite per call is fine). */
  function appendVisionMessage(
    id: string,
    entry: Omit<VisionMessageEntry, 'seq'>,
  ): Promise<VisionMessageEntry[]> {
    assertLifecycleWriteAllowed(id)
    let result: VisionMessageEntry[] = []
    const done = chainProjectWrite(id, async () => {
      const existing = await readVisionMessages(id)
      result = [...existing, { ...entry, seq: existing.length + 1 }]
      await ensureLifecycleProjectDir(id)
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
  async function flushProjectLogs(id: string): Promise<void> {
    const results = await Promise.allSettled([
      projectWriteChains.get(id) ?? Promise.resolve(),
      clientJournals.get(id)?.flush() ?? Promise.resolve(),
    ])
    const failures = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    )
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) {
      throw new AggregateError(failures, `Project ${id} log flush failed.`)
    }
  }

  async function commitDocumentChange(
    id: string,
    turnId: string,
  ): Promise<CommittedClientMessageEntry | undefined> {
    const document = readHtmlDocumentSync(id)
    if (!document) return undefined
    const html = renderHtmlDocument(document)
    const hash = createHash('sha256').update(html).digest('hex')
    const journal = await readClientJournal(id)
    if (journal.status !== 'clean') {
      throw new Error(
        `Project journal requires recovery before recording document revision: ${join(projectDir(id), CLIENT_MESSAGES_JSONL)}`,
      )
    }
    const prior = journal.records.findLast(
      (record) => record.event === 'document_changed',
    )
    if (prior && isRecord(prior.payload) && prior.payload.hash === hash)
      return prior
    return appendClientMessage(id, {
      dir: 'out',
      event: 'document_changed',
      payload: {
        bytes: Buffer.byteLength(html, 'utf8'),
        hash,
        ...(prior &&
        isRecord(prior.payload) &&
        typeof prior.payload.hash === 'string'
          ? { previousHash: prior.payload.hash }
          : {}),
      },
      ts: new Date().toISOString(),
      turnId,
    })
  }

  /** Read the full agent message log (oldest first). Empty when absent. */
  async function readAgentMessages(id: string): Promise<AgentMessageEntry[]> {
    return readJsonl<AgentMessageEntry>(
      join(projectDir(id), AGENT_MESSAGES_JSONL),
    )
  }

  /** Read the full client message log (oldest first). Empty when absent. */
  async function readClientMessages(id: string): Promise<ClientMessageEntry[]> {
    return (await clientJournal(id).readCommitted()).records
  }

  /** Read committed client events plus their validated journal state. */
  function readClientJournal(
    id: string,
    afterSeq = 0,
  ): Promise<EventJournalRead<CommittedClientMessageEntry>> {
    return clientJournal(id).readCommitted(afterSeq)
  }

  /** Explicitly quarantine and remove a recoverable trailing fragment. */
  function recoverClientJournal(
    id: string,
  ): Promise<EventJournalRecovery<CommittedClientMessageEntry>> {
    return trackProjectMutation(id, async () => {
      const recovery = await clientJournal(id).recoverTail()
      advanceTurnCacheGeneration(id)
      publishProjectRevision(id)
      return recovery
    })
  }

  /** Read the vision/OCR call log. Empty array when absent/malformed. */
  async function readVisionMessages(id: string): Promise<VisionMessageEntry[]> {
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

  /** Atomically update the run-lifecycle state for a project (sync RMW over
   *  `run-state.json`). The single chokepoint for run-status writes — Phase 4
   *  hooks a list-bus fan-out here so status changes broadcast to list
   *  subscribers. */
  function setRunStatusSync(id: string, partial: Partial<RunState>): RunState {
    assertLifecycleWriteAllowed(id)
    const next = { ...readRunStateSync(id), ...partial }
    writeRunStateSync(id, next)
    // Fan out to any open project-list SSE subscribers so status badges update
    // live. No-op when none are connected (e.g. boot reconcile).
    broadcastStatus({
      projectId: id,
      runStartedAt: next.startedAt,
      runTurnId: next.turnId,
      status: next.status,
    })
    return next
  }

  /** Set the title from the prompt if it is still the default. Sync, server-side. */
  function setTitleIfUntitled(id: string, title: string): null | ProjectMeta {
    assertOrdinaryWriteAllowed(id)
    const meta = readMetaSync(id)
    if (!meta) return null
    meta.brief ??= title.trim()
    if (meta.title === 'Untitled' && meta.titleSource !== 'user') {
      meta.title = truncateTitle(title)
      meta.titleSource = 'brief'
    }
    meta.updatedAt = new Date().toISOString()
    writeMetaSync(id, meta)
    return structuredClone(meta)
  }

  /** Persist the current model selection for a project. */
  async function updateProjectModel(
    id: string,
    selection: ProjectModelSelection,
  ): Promise<null | (ProjectMeta & ProjectRunMeta)> {
    assertOrdinaryWriteAllowed(id)
    // Synchronous read-modify-write so the single-threaded event loop serializes
    // this against the other sync project.json writers (markHasHtmlSync,
    // setTitleIfUntitled) — see plan 017. Only provided selection fields change.
    const meta = readMetaSync(id)
    if (!meta) return null

    const title = selection.title?.trim()
    const textModel = selection.textModel?.trim()
    const imageModel = selection.imageModel?.trim()
    const visionModel = selection.visionModel?.trim()

    const changed =
      (title !== undefined &&
        (meta.title !== title || meta.titleSource !== 'user')) ||
      (textModel !== undefined && meta.model !== textModel) ||
      (imageModel !== undefined && meta.imageModel !== imageModel) ||
      (visionModel !== undefined && meta.visionModel !== visionModel)
    if (!changed) return { ...meta, ...composeRunMeta(id) }

    const next: ProjectMeta = {
      ...meta,
      ...(title !== undefined ? { title, titleSource: 'user' as const } : {}),
      ...(textModel !== undefined ? { model: textModel } : {}),
      ...(imageModel !== undefined ? { imageModel } : {}),
      ...(visionModel !== undefined ? { visionModel } : {}),
      updatedAt: new Date().toISOString(),
    }
    writeMetaSync(id, next)
    await appendClientMessage(id, {
      dir: 'out',
      event: 'project_meta',
      payload: {
        brief: next.brief,
        imageModel: next.imageModel,
        model: next.model,
        title: next.title,
        titleSource: next.titleSource,
        visionModel: next.visionModel,
      },
      ts: new Date().toISOString(),
      turnId: null,
    })
    if (title !== undefined) {
      runBus.broadcast(id, 'project_meta', { title: next.title })
    }
    return { ...next, ...composeRunMeta(id) }
  }

  /**
   * Persist a captured screenshot (base64 dataUrl from the client POST-back) to
   * `screenshots/<seq>-<requestId>.<ext>` and return its project-relative URL.
   * The single durable copy of the bytes — referenced by path from the logs so
   * no base64 ever lands in a JSON file. Sync so the file exists before the
   * agent message snapshot that points at it.
   */
  /** Bound the debug `screenshots/` dir per project (debug-only; not replay-critical). */
  const MAX_SCREENSHOTS_PER_PROJECT = 50

  function writeProjectScreenshotSync(
    id: string,
    requestId: string,
    dataUrl: string,
    mediaType: string,
  ): ProjectScreenshot {
    assertOrdinaryWriteAllowed(id)
    const ext = mediaTypeToExt(mediaType)
    const dir = join(projectDir(id), SCREENSHOTS_DIR)
    mkdirSync(dir, { recursive: true })
    const files = readdirSync(dir).filter((name) => name.endsWith(ext))
    // max(prefix)+1 (not count+1) so sequence numbers stay monotonic + unique
    // after pruning deletes older files.
    const seq =
      files.reduce((max, name) => {
        const n = Number.parseInt(name.slice(0, 3), 10)
        return Number.isFinite(n) && n > max ? n : max
      }, 0) + 1
    const fileName = `${String(seq).padStart(3, '0')}-${requestId}${ext}`
    writeFileSync(join(dir, fileName), decodeBase64DataUrl(dataUrl, mediaType))
    pruneScreenshots(dir, [...files, fileName])
    return { ext, path: `/api/projects/${id}/screenshots/${fileName}` }
  }

  /** Serialize a project's debug-log writes on one per-project chain. The chain
   *  is registered SYNCHRONOUSLY (before any await) so `flushProjectLogs` always
   *  sees the latest pending write — fire-and-forget callers from the stream
   *  loop can't race project cleanup. A rejected `run` (or a rejected previous
   *  chain link) is logged via the project write-failure logger
   *  (`setProjectWriteFailureLogger`, default `console.error`) and then
   *  swallowed — the chain never rejects, so fire-and-forget callers in
   *  `route.ts` keep working, but operators get a stderr line per failure
   *  instead of silent data loss. */
  function chainProjectWrite(
    id: string,
    run: () => Promise<unknown>,
  ): Promise<void> {
    const prev = projectWriteChains.get(id) ?? Promise.resolve()
    const next = prev.then(run, run).then(
      () => undefined,
      (error: unknown) => {
        projectWriteFailureLogger(id, error)
        return undefined // never-reject contract preserved
      },
    )
    projectWriteChains.set(id, next)
    void next.finally(() => {
      if (projectWriteChains.get(id) === next) projectWriteChains.delete(id)
    })
    return next
  }

  const defaultProjectWriteFailureLogger = logger

  let projectWriteFailureLogger = logger

  /** Restore the default `console.error` write-failure logger. */
  function resetProjectWriteFailureLogger(): void {
    projectWriteFailureLogger = defaultProjectWriteFailureLogger
  }

  /** Override the per-project write-failure logger. Pass a no-op to silence,
   *  or a PinoLogger-backed sink to route failures through the server's
   *  observability stack. The sink MUST NOT throw — `chainProjectWrite` calls
   *  it from a promise-rejection handler where a throw becomes an unhandled
   *  rejection. */
  function setProjectWriteFailureLogger(sink: ProjectWriteFailureLogger): void {
    projectWriteFailureLogger = sink
  }

  /** Serialize appends to one JSONL file so concurrent calls never interleave
   *  lines. Resolves once the line is durably appended. */
  function copyAgentImageSync(
    projectId: string,
    imgId: string,
    ext: string,
  ): null | string {
    assertOrdinaryWriteAllowed(projectId)
    const mappingKey = `${projectId}\0${imgId}`
    const mapped = persistedImageUrls.get(mappingKey)
    if (mapped) return mapped
    const stored = getImage(imgId)
    const dir = join(projectDir(projectId), IMAGES_DIR)
    mkdirSync(dir, { recursive: true })
    const matchingFiles = readdirSync(dir).filter((name) =>
      name.startsWith(`${imgId}.`),
    )
    for (const existingName of matchingFiles) {
      const existingPath = join(dir, existingName)
      if (stored && !readFileSync(existingPath).equals(stored.buffer)) {
        throw new ProjectAssetConflictError(existingPath)
      }
      syncExistingAsset(existingPath, dir)
      const existingUrl = `/api/projects/${projectId}/images/${existingName}`
      persistedImageUrls.set(mappingKey, existingUrl)
      persistedImagesById.set(imgId, {
        filePath: existingPath,
        mediaType: mediaTypeForName(existingName),
        projectId,
      })
      releaseImage(imgId)
      return existingUrl
    }
    if (!stored) return null

    const extension = ext || `.${stored.extension}` || '.png'
    const fileName = `${imgId}${extension}`
    const filePath = join(dir, fileName)
    let created = false
    let file: number | undefined
    let fileSynced = false
    try {
      file = fileSystem.openSync(filePath, 'wx')
      created = true
      writeFileSync(file, stored.buffer)
      fileSystem.fsyncSync(file)
      fileSynced = true
      fileSystem.closeSync(file)
      file = undefined
      syncDirectorySync(fileSystem, dir)
    } catch (error) {
      if (file !== undefined) {
        try {
          fileSystem.closeSync(file)
        } catch {
          // Preserve the asset write failure.
        }
      }
      if (created && !fileSynced) {
        try {
          rmSync(filePath, { force: true })
        } catch {
          // Preserve the asset write failure.
        }
      }
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        const existing = readFileSync(filePath)
        if (existing.equals(stored.buffer)) {
          syncExistingAsset(filePath, dir)
          const url = `/api/projects/${projectId}/images/${fileName}`
          persistedImageUrls.set(mappingKey, url)
          persistedImagesById.set(imgId, {
            filePath,
            mediaType: stored.mediaType,
            projectId,
          })
          releaseImage(imgId)
          return url
        }
        throw new ProjectAssetConflictError(filePath)
      }
      throw fileSynced
        ? new ProjectFileCommitError(
            'Project image is visible, but directory durability is uncertain.',
            'durabilityUncertain',
            { cause: error },
          )
        : error
    }
    const url = `/api/projects/${projectId}/images/${fileName}`
    persistedImageUrls.set(mappingKey, url)
    persistedImagesById.set(imgId, {
      filePath,
      mediaType: stored.mediaType,
      projectId,
    })
    releaseImage(imgId)
    return url
  }

  function syncExistingAsset(filePath: string, directory: string): void {
    let file: number | undefined
    try {
      file = fileSystem.openSync(filePath, 'r')
      fileSystem.fsyncSync(file)
      fileSystem.closeSync(file)
      file = undefined
      syncDirectorySync(fileSystem, directory)
    } catch (error) {
      if (file !== undefined) {
        try {
          fileSystem.closeSync(file)
        } catch {
          // Preserve the durability failure.
        }
      }
      throw new ProjectFileCommitError(
        'Project image is visible, but durability is uncertain.',
        'durabilityUncertain',
        { cause: error },
      )
    }
  }

  function decodeBase64DataUrl(dataUrl: string, mediaType: string): Buffer {
    const prefix = `data:${mediaType};base64,`
    const start = dataUrl.startsWith(prefix)
      ? prefix.length
      : dataUrl.indexOf(',') + 1
    return Buffer.from(dataUrl.slice(start), 'base64')
  }

  async function ensureOrdinaryProjectDir(id: string) {
    assertOrdinaryWriteAllowed(id)
    await mkdir(projectDir(id), { recursive: true })
  }

  async function ensureLifecycleProjectDir(id: string) {
    assertLifecycleWriteAllowed(id)
    await mkdir(projectDir(id), { recursive: true })
  }

  function createClientJournal(id: string) {
    return createEventJournal<CommittedClientMessageEntry>({
      filePath: join(projectDir(id), CLIENT_MESSAGES_JSONL),
      fileSystem,
      prepare: () => ensureLifecycleProjectDir(id),
    })
  }

  function clientJournal(id: string): ReturnType<typeof createClientJournal> {
    let journal = clientJournals.get(id)
    if (!journal) {
      journal = createClientJournal(id)
      clientJournals.set(id, journal)
    }
    return journal
  }

  function projectMutationState(id: string) {
    let state = projectMutationStates.get(id)
    if (!state) {
      state = { generation: 0, pending: new Set(), revision: 0 }
      projectMutationStates.set(id, state)
    }
    return state
  }

  function assertOrdinaryWriteAllowed(id: string): void {
    if (deletionStates.has(id)) throw new ProjectMutationBlockedError(id)
  }

  function assertLifecycleWriteAllowed(id: string): void {
    if (deletionStates.get(id) === 'deleted') {
      throw new ProjectMutationBlockedError(id)
    }
  }

  function beginProjectDeletion(id: string): void {
    if (deletionStates.get(id) !== 'deleted') {
      deletionStates.set(id, 'draining')
    }
    beginSynchronousMutation(id)
  }

  function cancelProjectDeletion(id: string): void {
    if (deletionStates.get(id) === 'draining') deletionStates.delete(id)
    beginSynchronousMutation(id)
  }

  function completeProjectDeletion(id: string): void {
    deletionStates.set(id, 'deleted')
    beginSynchronousMutation(id)
  }

  async function flushProjectMutations(id: string): Promise<void> {
    while (true) {
      const pending = [
        ...(projectMutationStates.get(id)?.pending ?? []),
        ...(projectWriteChains.get(id) ? [projectWriteChains.get(id)!] : []),
        ...(clientJournals.get(id) ? [clientJournals.get(id)!.flush()] : []),
      ]
      if (pending.length === 0) return
      const results = await Promise.allSettled(pending)
      const failures = results.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : [],
      )
      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          `Project ${id} mutation flush failed.`,
        )
      }
      if (
        (projectMutationStates.get(id)?.pending.size ?? 0) === 0 &&
        !projectWriteChains.has(id)
      ) {
        return
      }
    }
  }

  function publishProjectRevision(id: string): void {
    projectMutationState(id).revision += 1
    for (const listener of listInvalidationSubscribers) {
      try {
        listener(id)
      } catch (error) {
        logger(id, error)
      }
    }
  }

  function readProjectMetaSync(id: string): null | ProjectMeta {
    const meta = readMetaSync(id)
    return meta ? structuredClone(meta) : null
  }

  function notifyProjectCommit(
    id: string,
    record: CommittedClientMessageEntry,
  ): void {
    for (const listener of commitSubscribers.get(id) ?? []) {
      try {
        listener(id, structuredClone(record))
      } catch (error) {
        logger(id, error)
      }
    }
  }

  function subscribeProjectCommits(
    id: string,
    listener: ProjectCommitListener,
  ): () => void {
    let listeners = commitSubscribers.get(id)
    if (!listeners) {
      listeners = new Set()
      commitSubscribers.set(id, listeners)
    }
    listeners.add(listener)
    return () => {
      const current = commitSubscribers.get(id)
      current?.delete(listener)
      if (current?.size === 0) commitSubscribers.delete(id)
    }
  }

  function subscribeProjectListInvalidations(
    listener: ProjectListInvalidationListener,
  ): () => void {
    listInvalidationSubscribers.add(listener)
    return () => listInvalidationSubscribers.delete(listener)
  }

  function beginSynchronousMutation(id: string) {
    const state = projectMutationState(id)
    state.generation += 1
    return state
  }

  function trackProjectMutation<T>(
    id: string,
    run: () => Promise<T>,
  ): Promise<T> {
    const state = projectMutationState(id)
    state.generation += 1
    let reject!: (error: unknown) => void
    let resolve!: (value: PromiseLike<T> | T) => void
    const tracked = new Promise<T>((accept, deny) => {
      resolve = accept
      reject = deny
    })
    state.pending.add(tracked)
    let operation: Promise<T>
    try {
      operation = run()
    } catch (error) {
      operation = Promise.reject(error)
    }
    void operation.then(resolve, reject)
    void tracked.then(
      () => state.pending.delete(tracked),
      () => state.pending.delete(tracked),
    )
    return tracked
  }

  async function ensureProjectsRoot() {
    await mkdir(PROJECTS_DIR, { recursive: true })
  }

  function invalidateTurnCache(id: string): void {
    turnCache.delete(id)
  }

  function advanceTurnCacheGeneration(id: string): void {
    turnCacheGeneration.set(id, (turnCacheGeneration.get(id) ?? 0) + 1)
    invalidateTurnCache(id)
  }

  async function readProjectTurns(id: string): Promise<ProjectMessageTurn[]> {
    for (;;) {
      const cached = turnCache.get(id)
      if (cached) return cached
      const generation = turnCacheGeneration.get(id) ?? 0
      const replayed = replayClientEvents(await readClientMessages(id))
      const messages = replayed.length > 0 ? replayed : await readMessages(id)
      if ((turnCacheGeneration.get(id) ?? 0) !== generation) continue
      turnCache.set(id, messages)
      return messages
    }
  }

  // ── image URL normalization (sync) ───────────────────────────────

  function isProjectRawTurnMessages(
    value: unknown,
  ): value is ProjectRawTurnMessages {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return false
    const data = value as Record<string, unknown>
    return typeof data.turnId === 'string' && Array.isArray(data.messages)
  }

  function isSafeImageName(name: string): boolean {
    return (
      new RegExp(
        `^(?:${IMAGE_ID_SOURCE})(?:\\.[a-z0-9]+)?$|^[a-z0-9_-]+\\.[a-z0-9]+$`,
        'i',
      ).test(name) &&
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

  function markHasHtmlSync(id: string, html: string) {
    const meta = readMetaSync(id)
    if (!meta) return
    const title = pageTitle(html)
    const titleChanged = Boolean(title && meta.titleSource !== 'user')
    if (titleChanged && title) {
      meta.brief ??= meta.title === 'Untitled' ? '' : meta.title
      meta.title = title
      meta.titleSource = 'page'
    }
    meta.hasHtml = true
    meta.updatedAt = new Date().toISOString()
    writeMetaSync(id, meta)
    if (titleChanged && title) {
      runBus.broadcast(id, 'project_meta', { title })
    }
  }

  // ── sync fs helpers ──────────────────────────────────────────────

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
   *   - `${origin}/images/img-<id>.ext` agent endpoint, absolute (fresh generation)
   *   - `/images/img-<id>.ext`          agent endpoint, root-relative
   *   - `${origin}/api/projects/<id>/images/<file>` or root-relative (already persisted)
   *
   * Agent-endpoint images are copied from the in-memory `image-store` and
   * rewritten to `/api/projects/<projectId>/images/img-<id>.ext`. Unknown ids are
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

    const AGENT_IMG = new RegExp(
      `(?:https?:\\/\\/[^"' )\\]]+)?\\/images\\/(${IMAGE_ID_SOURCE})(\\.[a-z0-9]+)?(?=$|[?#"' )\\]])`,
      'gi',
    )
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

  /** Keep only the newest MAX_SCREENSHOTS_PER_PROJECT screenshots (NNN-prefixed →
   *  chronological by name). Best-effort: a failed unlink is swallowed so a
   *  retention sweep can never break a capture. */
  function pruneScreenshots(dir: string, files: string[]): void {
    if (files.length <= MAX_SCREENSHOTS_PER_PROJECT) return
    const excess = [...files]
      .sort()
      .slice(0, files.length - MAX_SCREENSHOTS_PER_PROJECT)
    for (const name of excess) {
      try {
        rmSync(join(dir, name), { force: true })
      } catch {
        // best-effort retention
      }
    }
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
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  function readIndexHtmlSync(id: string): null | string {
    try {
      return readFileSync(join(projectDir(id), INDEX_HTML), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
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
    const filePath = join(projectDir(id), MESSAGES_JSON)
    if (!existsSync(filePath)) return []
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      throw new Error(`Legacy project messages are malformed: ${filePath}`)
    }
    return parsed as ProjectMessageTurn[]
  }

  async function readMeta(id: string): Promise<null | ProjectMeta> {
    const filePath = join(projectDir(id), PROJECT_JSON)
    if (!existsSync(filePath)) return null
    const raw = await readFile(filePath, 'utf8')
    return withDefaultModelFields(JSON.parse(raw) as ProjectMeta)
  }

  function readMetaSync(id: string): null | ProjectMeta {
    const filePath = join(projectDir(id), PROJECT_JSON)
    if (!existsSync(filePath)) return null
    const raw = readFileSync(filePath, 'utf8')
    return withDefaultModelFields(JSON.parse(raw) as ProjectMeta)
  }

  const DEFAULT_RUN_STATE: RunState = {
    error: null,
    finishedAt: null,
    runBlocked: false,
    startedAt: null,
    status: 'idle',
    turnId: null,
  }

  const RUN_STATUSES: readonly RunStatus[] = [
    'error',
    'idle',
    'interrupted',
    'running',
    'stopped',
  ]

  /** Compose the run-lifecycle fields onto a `ProjectMeta` at a read boundary
   *  (list/get). Reads `run-state.json`; defaults to `idle` when absent so all
   *  pre-existing projects + fresh drafts read cleanly. */
  function composeRunMeta(id: string): ProjectRunMeta {
    const state = readRunStateSync(id)
    return {
      runStartedAt: state.startedAt,
      runTurnId: state.turnId,
      status: state.status,
      ...(state.runBlocked ? { runBlocked: true } : {}),
    }
  }

  function isRunStatus(value: unknown): value is RunStatus {
    return (
      typeof value === 'string' &&
      (RUN_STATUSES as readonly string[]).includes(value)
    )
  }

  async function readOrCreateHtmlDocument(
    id: string,
  ): Promise<HtmlDocumentJsonV1> {
    const existing = await readHtmlDocument(id)
    if (existing) return existing
    return trackProjectMutation(id, async () => {
      const legacyHtml = await readIndexHtml(id)
      const document = createHtmlDocumentFromString(
        legacyHtml ?? PLACEHOLDER_INDEX_HTML,
      )
      await writeHtmlDocument(id, document)
      await removeIndexHtml(id)
      return document
    })
  }

  function readOrCreateHtmlDocumentSync(id: string): HtmlDocumentJsonV1 {
    const existing = readHtmlDocumentSync(id)
    if (existing) return existing

    const legacyHtml = readIndexHtmlSync(id)
    const document = createHtmlDocumentFromString(
      legacyHtml ?? PLACEHOLDER_INDEX_HTML,
    )
    assertAtomicWrite(
      writeHtmlDocumentSync(id, document),
      'legacy project document',
    )
    removeIndexHtmlSync(id)
    return document
  }

  function readRunStateSync(id: string): RunState {
    try {
      const raw = readFileSync(join(projectDir(id), RUN_STATE_JSON), 'utf8')
      const parsed = JSON.parse(raw) as Partial<RunState>
      return {
        error: typeof parsed.error === 'string' ? parsed.error : null,
        finishedAt:
          typeof parsed.finishedAt === 'string' ? parsed.finishedAt : null,
        runBlocked: parsed.runBlocked === true,
        startedAt:
          typeof parsed.startedAt === 'string' ? parsed.startedAt : null,
        status: isRunStatus(parsed.status) ? parsed.status : 'idle',
        turnId: typeof parsed.turnId === 'string' ? parsed.turnId : null,
      }
    } catch {
      return { ...DEFAULT_RUN_STATE }
    }
  }

  async function removeIndexHtml(id: string) {
    assertOrdinaryWriteAllowed(id)
    await rm(join(projectDir(id), INDEX_HTML), { force: true })
  }

  function removeIndexHtmlSync(id: string) {
    assertOrdinaryWriteAllowed(id)
    rmSync(join(projectDir(id), INDEX_HTML), { force: true })
  }

  function stripOrigin(url: string): string {
    return url.replace(/^https?:\/\/[^/]+/i, '')
  }

  function truncateTitle(value: string): string {
    const trimmed = value.trim().replace(/\s+/g, ' ')
    return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed
  }

  /** Normalize legacy project.json missing per-role model fields to ''. Legacy
   *  files (persisted before image/vision model storage) self-heal on first read;
   *  the next write persists the normalized form. */
  function withDefaultModelFields(meta: ProjectMeta): ProjectMeta {
    return {
      ...meta,
      imageModel: meta.imageModel ?? '',
      visionModel: meta.visionModel ?? '',
    }
  }

  function writeHtmlDocument(
    id: string,
    document: HtmlDocumentJsonV1,
  ): Promise<void> {
    return trackProjectMutation(id, async () => {
      await ensureOrdinaryProjectDir(id)
      const result = await atomicWriteFile(
        fileSystem,
        join(projectDir(id), HTML_JSON),
        `${JSON.stringify(normalizeHtmlDocument(document), null, 2)}\n`,
        'utf8',
      )
      if (result.state !== 'notCommitted') publishProjectRevision(id)
      assertAtomicWrite(result, 'project document')
    })
  }

  function writeHtmlDocumentSync(
    id: string,
    document: HtmlDocumentJsonV1,
  ): AtomicWriteResult {
    assertOrdinaryWriteAllowed(id)
    beginSynchronousMutation(id)
    mkdirSync(projectDir(id), { recursive: true })
    const result = atomicWriteFileSync(
      fileSystem,
      join(projectDir(id), HTML_JSON),
      `${JSON.stringify(normalizeHtmlDocument(document), null, 2)}\n`,
      'utf8',
    )
    if (result.state !== 'notCommitted') publishProjectRevision(id)
    return result
  }

  function writeMessages(
    id: string,
    messages: ProjectMessageTurn[],
  ): Promise<void> {
    return trackProjectMutation(id, async () => {
      await ensureOrdinaryProjectDir(id)
      await writeFile(
        join(projectDir(id), MESSAGES_JSON),
        JSON.stringify(messages, null, 2),
        'utf8',
      )
      advanceTurnCacheGeneration(id)
      publishProjectRevision(id)
    })
  }

  function writeMeta(id: string, meta: ProjectMeta): Promise<void> {
    return trackProjectMutation(id, async () => {
      await ensureOrdinaryProjectDir(id)
      const result = await atomicWriteFile(
        fileSystem,
        join(projectDir(id), PROJECT_JSON),
        JSON.stringify(meta, null, 2),
        'utf8',
      )
      if (result.state !== 'notCommitted') publishProjectRevision(id)
      assertAtomicWrite(result, 'project metadata')
    })
  }

  function writeMetaSync(id: string, meta: ProjectMeta) {
    assertOrdinaryWriteAllowed(id)
    beginSynchronousMutation(id)
    mkdirSync(projectDir(id), { recursive: true })
    const result = atomicWriteFileSync(
      fileSystem,
      join(projectDir(id), PROJECT_JSON),
      JSON.stringify(meta, null, 2),
      'utf8',
    )
    if (result.state !== 'notCommitted') publishProjectRevision(id)
    assertAtomicWrite(result, 'project metadata')
  }

  function writeRunStateSync(id: string, state: RunState) {
    beginSynchronousMutation(id)
    mkdirSync(projectDir(id), { recursive: true })
    const result = atomicWriteFileSync(
      fileSystem,
      join(projectDir(id), RUN_STATE_JSON),
      `${JSON.stringify(state, null, 2)}\n`,
      'utf8',
    )
    if (result.state !== 'notCommitted') publishProjectRevision(id)
    assertAtomicWrite(result, 'project run state')
  }

  return {
    appendAgentMessages,
    appendClientMessage,
    appendProjectMessageTurn,
    appendVisionMessage,
    beginProjectDeletion,
    cancelProjectDeletion,
    commitDocumentChange,
    completeProjectDeletion,
    createProject,
    createProjectHtmlStore,
    dataDir: resolve(dataDir),
    deleteProject,
    async dispose() {
      const pendingOperations = new Set<Promise<unknown>>([
        ...creations.values(),
        ...projectWriteChains.values(),
        ...[...clientJournals.values()].map((journal) => journal.flush()),
        ...[...projectMutationStates.values()].flatMap((state) => [
          ...state.pending,
        ]),
      ])
      const results = await Promise.allSettled(pendingOperations)
      creations.clear()
      projectWriteChains.clear()
      clientJournals.clear()
      persistedImageUrls.clear()
      persistedImagesById.clear()
      deletionStates.clear()
      commitSubscribers.clear()
      listInvalidationSubscribers.clear()
      turnCache.clear()
      turnCacheGeneration.clear()
      projectMutationStates.clear()
      const failures = results.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : [],
      )
      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          'Project repository disposal failed.',
        )
      }
    },
    flushProjectLogs,
    flushProjectMutations,
    getProject,
    getProjectHtmlInlined,
    inlineProjectImagesForCapture,
    listProjectIds,
    listProjects,
    listProjectTombstones,
    persistAcceptedAttachmentSync,
    persistGeneratedImage,
    projectsDir: PROJECTS_DIR,
    readAgentMessages,
    readClientJournal,
    readClientMessages,
    readGeneratedImage,
    readProjectImage,
    readProjectMetaSync,
    readProjectRawMessages,
    readProjectScreenshot,
    readProjectTombstoneSync,
    readRunStateSync,
    readSnapshot,
    readVisionMessages,
    recoverClientJournal,
    removeAcceptedAttachmentSync,
    resetProjectWriteFailureLogger,
    saveProjectMessageTurn,
    saveProjectRawMessages,
    setProjectWriteFailureLogger,
    setRunStatusSync,
    setTitleIfUntitled,
    subscribeProjectCommits,
    subscribeProjectListInvalidations,
    updateProjectModel,
    writeProjectScreenshotSync,
    writeProjectTombstone,
  }
}

function assertAtomicWrite(result: AtomicWriteResult, label: string): void {
  if (result.state === 'committed') return
  throw new ProjectFileCommitError(
    result.state === 'notCommitted'
      ? `${label} was not committed.`
      : `${label} is visible, but directory durability is uncertain.`,
    result.state,
    { cause: result.error },
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function pageTitle(html: string): null | string {
  const raw = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  if (!raw) return null
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }
  const title = raw
    .replace(
      /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
      (entity, code: string) => {
        if (!code.startsWith('#')) return named[code.toLowerCase()] ?? entity
        const value =
          code[1]?.toLowerCase() === 'x'
            ? parseInt(code.slice(2), 16)
            : Number(code.slice(1))
        return value > 0 && value <= 0x10ffff
          ? String.fromCodePoint(value)
          : entity
      },
    )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return title || null
}
