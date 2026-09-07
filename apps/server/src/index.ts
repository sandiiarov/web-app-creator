import { Buffer } from 'node:buffer'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { fileURLToPath } from 'node:url'

import { StartRunCommandSchema } from '@workspace/contracts'
import { replayClientEventsLive } from '@workspace/conversation'

import {
  ProjectCreationBlockedError,
  ProjectDeletionBlockedError,
} from './application/project-service.ts'
import { readRequestBody, RequestBodyTooLargeError } from './http-body.ts'
import {
  createProjectEventDelivery,
  writeUnsupportedVersion,
} from './http/project-events.ts'
import { IMAGE_ID_SOURCE } from './mastra/lib/image-store.ts'
import {
  ProjectCreationConflictError,
  ProjectDeletedError,
} from './mastra/lib/project-store.ts'
import { endSse, sendSse, startSse } from './mastra/lib/sse.ts'
import {
  resolveModelId,
  type AgentAttachmentInput,
  type AgentElementAttachmentInput,
  type AgentImageAttachmentInput,
} from './mastra/route.ts'
import type { ModelPricingCatalog } from './model-catalog.ts'
import type { ServerRuntime } from './runtime.ts'

const ACCEPTED_ATTACHMENT_MEDIA_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])
const MAX_ATTACHMENT_COUNT = 4
const MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024
const MAX_ATTACHMENT_TOTAL_SIZE = 16 * 1024 * 1024
const MAX_MEDIA_JSON_BODY_SIZE = 24 * 1024 * 1024
const MAX_PROJECT_JSON_BODY_SIZE = 64 * 1024
/** Upper bound on `/api/models?ids=` entries — each chat-catalog-absent id
 *  triggers one upstream images-API fetch, so an unbounded list is a
 *  request-amplification vector. The first-party client sends ~25. */
const MAX_MODEL_IDS = 64

type AgentRequestBody = {
  attachments?: unknown
  compactionPercent?: unknown
  imageModel?: unknown
  projectId?: unknown
  prompt?: unknown
  textModel?: unknown
  turnId?: unknown
  visionModel?: unknown
}

export function createApiServer(runtime: ServerRuntime) {
  const {
    agentRunner,
    config,
    imageStore,
    modelCatalog,
    projectService,
    repository,
    runBus,
  } = runtime
  const projectEvents = createProjectEventDelivery(repository)

  const server = createServer(async (request, response) => {
    try {
      if (!isRequestOriginAllowed(request)) {
        sendJson(response, 403, {
          error: 'Origin is not allowed.',
          ok: false,
          ...(request.url?.split('?')[0] === '/agent'
            ? { reason: 'forbidden' }
            : {}),
        })
        return
      }

      setCorsHeaders(response)
      await routeRequest(request, response)
    } catch (error) {
      if (!response.headersSent) {
        if (error instanceof RequestBodyTooLargeError) {
          sendJson(response, 413, {
            error: 'Request body exceeds the allowed size.',
            ok: false,
            ...(request.url?.split('?')[0] === '/agent'
              ? { reason: 'validation' }
              : {}),
          })
        } else {
          // Log the full error server-side for operator debuggability; return a
          // generic message to the client so internal details (fs paths, provider
          // error bodies, stack strings) don't leak when the server is exposed
          // on a non-loopback interface.
          console.error('[server] unhandled error:', error)
          sendJson(response, 500, {
            error: 'Internal server error.',
            ok: false,
          })
        }
      } else {
        response.end()
      }
    }
  })

  function attachmentSize(attachment: AgentAttachmentInput) {
    return attachment.kind === 'element' ? 0 : attachment.size
  }

  function decodedDataUrlSize(dataUrl: string) {
    const payload = dataUrl.slice(dataUrl.indexOf(',') + 1).replace(/\s/g, '')
    return Buffer.from(payload, 'base64').byteLength
  }

  function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error'
  }

  /**
   * Single landing-page-agent endpoint. Accepts
   * `{ prompt: string, projectId: string, textModel?: string, imageModel?: string, visionModel?: string }`.
   */
  async function handleAgent(
    request: IncomingMessage,
    response: ServerResponse,
  ) {
    const body = await readJson(request, MAX_MEDIA_JSON_BODY_SIZE)
    const rejectValidation = (error: string) =>
      sendJson(response, 400, { error, ok: false, reason: 'validation' })

    if (typeof body.prompt !== 'string' || body.prompt.trim() === '') {
      rejectValidation('Expected { prompt: string }')
      return
    }

    if (typeof body.projectId !== 'string' || body.projectId.trim() === '') {
      rejectValidation('Expected { projectId: string }')
      return
    }

    if (
      body.textModel !== undefined &&
      (typeof body.textModel !== 'string' || body.textModel.trim() === '')
    ) {
      rejectValidation('Expected { textModel?: string }')
      return
    }

    if (
      body.turnId !== undefined &&
      (typeof body.turnId !== 'string' ||
        body.turnId.trim() === '' ||
        body.turnId.length > 128)
    ) {
      rejectValidation('Expected { turnId?: string (1-128 characters) }')
      return
    }

    if (
      body.imageModel !== undefined &&
      (typeof body.imageModel !== 'string' || body.imageModel.trim() === '')
    ) {
      rejectValidation('Expected { imageModel?: string }')
      return
    }

    if (
      body.visionModel !== undefined &&
      (typeof body.visionModel !== 'string' || body.visionModel.trim() === '')
    ) {
      rejectValidation('Expected { visionModel?: string }')
      return
    }

    if (
      body.compactionPercent !== undefined &&
      (typeof body.compactionPercent !== 'number' ||
        !Number.isFinite(body.compactionPercent) ||
        body.compactionPercent < 1 ||
        body.compactionPercent > 100)
    ) {
      rejectValidation('Expected { compactionPercent?: number (1-100) }')
      return
    }

    const attachments = validateAgentAttachments(body.attachments)
    if (typeof attachments === 'string') {
      rejectValidation(attachments)
      return
    }

    const command = StartRunCommandSchema.safeParse({ ...body, attachments })
    if (!command.success) {
      rejectValidation('The run command is invalid.')
      return
    }

    // Only `textModel` falls back to the chat default here. `imageModel` and
    // `visionModel` must stay `undefined` when omitted so `startLandingAgent`
    // applies their own role-specific defaults (image / vision models). Routing
    // them through `resolveModelId` would silently substitute the chat model,
    // which is neither an image nor a vision model and 404s at the provider.
    const baseUrl = config.serverBaseUrl
    const result = await agentRunner.start({
      attachments,
      baseUrl,
      compactionPercent: command.data.compactionPercent,
      imageModel: command.data.imageModel
        ? resolveModelId(command.data.imageModel)
        : undefined,
      projectId: command.data.projectId,
      prompt: command.data.prompt,
      textModel: command.data.textModel
        ? resolveModelId(command.data.textModel)
        : undefined,
      turnId: command.data.turnId,
      visionModel: command.data.visionModel
        ? resolveModelId(command.data.visionModel)
        : undefined,
    })
    if (result.ok) {
      sendJson(response, 200, {
        ...(result.existing ? { existing: true } : {}),
        ok: true,
        ...(result.outcome ? { outcome: result.outcome } : {}),
        status: result.status,
        turnId: result.turnId,
      })
    } else if (result.reason === 'not_found') {
      sendJson(response, 404, {
        error: 'Project not found',
        ok: false,
        reason: result.reason,
      })
    } else {
      const error =
        result.reason === 'overlap'
          ? 'A run is already active for this project.'
          : result.reason === 'conflict'
            ? 'The turn ID conflicts with a different accepted request.'
            : result.reason === 'deleted'
              ? 'The project is being deleted or was deleted.'
              : 'Project lifecycle storage requires recovery.'
      sendJson(response, 409, {
        error,
        ok: false,
        reason: result.reason,
      })
    }
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
  }

  function isRequestOriginAllowed(request: IncomingMessage) {
    const origin = request.headers.origin
    return origin === undefined || origin === config.clientOrigin
  }

  function isValidImageDataUrl(dataUrl: string, mediaType: string) {
    if (!dataUrl.startsWith(`data:${mediaType};base64,`)) return false
    const payload = dataUrl.slice(dataUrl.indexOf(',') + 1)
    return /^[A-Za-z0-9+/=\s]+$/.test(payload) && payload.trim().length > 0
  }

  async function readJson(
    request: IncomingMessage,
    maxBytes: number,
  ): Promise<AgentRequestBody> {
    const body = await readRequestBody(request, maxBytes)

    return body.trim().length > 0 ? (JSON.parse(body) as AgentRequestBody) : {}
  }

  async function routeRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ) {
    if (request.method === 'OPTIONS') {
      sendNoContent(response)
      return
    }

    const requestUrl = new URL(
      request.url ?? '/',
      `http://${request.headers.host}`,
    )
    const pathname = requestUrl.pathname

    if (request.method === 'POST' && pathname === '/agent') {
      await handleAgent(request, response)
      return
    }

    if (request.method === 'GET' && pathname === '/api/models') {
      await handleModelCatalog(request, response)
      return
    }

    if (await routeProjects(request, response, pathname, requestUrl)) {
      return
    }

    if (request.method === 'GET') {
      const imageMatch = pathname.match(
        new RegExp(`^\\/images\\/(${IMAGE_ID_SOURCE})(?:\\.[a-z0-9]+)?$`, 'i'),
      )
      if (imageMatch) {
        serveImage(imageMatch[1]!, response)
        return
      }
    }

    sendNotFound(response)
  }

  const PROJECT_LIST_RE = /^\/api\/projects\/?$/i
  const PROJECT_SCREENSHOT_RE =
    /^\/api\/projects\/([a-f0-9-]+)\/screenshots\/([^/]+)$/i
  const PROJECT_STOP_RE = /^\/api\/projects\/([a-f0-9-]+)\/stop$/i
  const PROJECT_ITEM_RE = /^\/api\/projects\/([a-f0-9-]+)$/i
  const PROJECT_IMAGE_RE = /^\/api\/projects\/([a-f0-9-]+)\/images\/([^/]+)$/i
  const PROJECT_HTML_RE = /^\/api\/projects\/([a-f0-9-]+)\/html$/i
  const PROJECT_EVENTS_RE = /^\/api\/projects\/([a-f0-9-]+)\/events$/i
  const PROJECT_LIST_EVENTS_RE = /^\/api\/projects\/events\/?$/i

  async function handleCreateProject(
    request: IncomingMessage,
    response: ServerResponse,
  ) {
    const body = await readJsonObject(request, MAX_PROJECT_JSON_BODY_SIZE)
    if (
      body.creationKey !== undefined &&
      (typeof body.creationKey !== 'string' ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          body.creationKey,
        ))
    ) {
      sendJson(response, 400, {
        error: 'Expected a UUID creationKey',
        ok: false,
      })
      return
    }
    try {
      const project = await projectService.create({
        creationKey: body.creationKey as string | undefined,
        model: typeof body.textModel === 'string' ? body.textModel : undefined,
        title: typeof body.title === 'string' ? body.title : undefined,
      })
      sendJson(response, 201, { ok: true, project })
    } catch (error) {
      if (
        error instanceof ProjectCreationBlockedError ||
        error instanceof ProjectCreationConflictError ||
        error instanceof ProjectDeletedError
      ) {
        sendJson(response, 409, {
          error: 'The project creation key is unavailable.',
          ok: false,
          reason: 'creation_conflict',
        })
        return
      }
      throw error
    }
  }

  async function handleDeleteProject(id: string, response: ServerResponse) {
    try {
      await projectService.delete(id)
    } catch (error) {
      if (error instanceof ProjectDeletionBlockedError) {
        sendJson(response, 409, {
          error: 'Project deletion is blocked by unsettled run work.',
          ok: false,
          reason: 'run_unsettled',
        })
        return
      }
      throw error
    }
    sendJson(response, 200, { ok: true })
  }

  async function handleGetProject(id: string, response: ServerResponse) {
    const project = await repository.getProject(id)
    if (!project) {
      sendJson(response, 404, { error: 'Project not found', ok: false })
      return
    }
    sendJson(response, 200, { ok: true, project })
  }

  async function handleListProjects(response: ServerResponse) {
    const all = await repository.listProjects()
    // Drafts (no generated HTML yet) are hidden from the list.
    const projects = all.filter((project) => project.hasHtml)
    sendJson(response, 200, { ok: true, projects })
  }

  async function handleModelCatalog(
    request: IncomingMessage,
    response: ServerResponse,
  ) {
    // `?ids=a/b,c/d` scopes the response to the app's supported models (the
    // picker's option ids); without it the full slim catalog is returned.
    const idsParam = new URL(
      request.url ?? '/',
      `http://${request.headers.host}`,
    ).searchParams.get('ids')
    const ids = idsParam
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean)
    if (ids && ids.length > MAX_MODEL_IDS) {
      sendJson(response, 400, {
        error: `Too many model ids (max ${MAX_MODEL_IDS}).`,
        ok: false,
      })
      return
    }
    try {
      const catalog = await modelCatalog.get()
      const models: ModelPricingCatalog = ids?.length
        ? modelCatalog.filter(catalog, ids)
        : catalog
      // Image-generation-only models (Seedream, GPT Image, Grok Imagine) are
      // absent from the chat catalog — enrich them from the images API so the
      // picker can price every image option. Failures skip the id silently.
      const chatAbsent = (ids ?? []).filter((id) => !(id in models))
      if (chatAbsent.length > 0) {
        const imagePricing = await modelCatalog.getImages(chatAbsent)
        for (const [id, pricing] of Object.entries(imagePricing)) {
          models[id] = { input: 0, output: 0, ...pricing }
        }
      }
      sendJson(response, 200, { models, ok: true })
    } catch (error) {
      sendJson(response, 502, { error: errorMessage(error), ok: false })
    }
  }

  async function handlePatchProject(
    id: string,
    request: IncomingMessage,
    response: ServerResponse,
  ) {
    const body = await readJsonObject(request, MAX_PROJECT_JSON_BODY_SIZE)

    if (body.textModel === undefined && body.title === undefined) {
      sendJson(response, 400, {
        error: 'Expected { textModel: string }',
        ok: false,
      })
      return
    }

    for (const field of [
      'textModel',
      'imageModel',
      'visionModel',
      'title',
    ] as const) {
      const value = body[field]
      if (
        value !== undefined &&
        (typeof value !== 'string' ||
          value.trim() === '' ||
          (field === 'title' && value.trim().length > 120))
      ) {
        sendJson(response, 400, {
          error: `Expected { ${field}?: string }`,
          ok: false,
        })
        return
      }
    }

    const project = await repository.updateProjectModel(id, {
      imageModel:
        typeof body.imageModel === 'string'
          ? resolveModelId(body.imageModel)
          : undefined,
      textModel:
        typeof body.textModel === 'string'
          ? resolveModelId(body.textModel, config.openrouter.defaultChatModel)
          : undefined,
      title: typeof body.title === 'string' ? body.title : undefined,
      visionModel:
        typeof body.visionModel === 'string'
          ? resolveModelId(body.visionModel)
          : undefined,
    })
    if (!project) {
      sendJson(response, 404, { error: 'Project not found', ok: false })
      return
    }

    sendJson(response, 200, { ok: true, project })
  }

  /** GET /api/projects/:id/events — SSE. Emit a `state` snapshot (current HTML +
   *  per-role models + status + live-replayed turns), then tail the run bus so a
   *  reopened tab watches live progress. Snapshot-then-subscribe: a run rejoined
   *  mid-flight may miss events in the sub-ms window between snapshot read and
   *  subscribe registration — self-heals on refresh (html_update carries full
   *  HTML; stats are rolling). Stays open until the client closes. */
  async function handleProjectEvents(id: string, response: ServerResponse) {
    const project = await repository.getProject(id)
    if (!project) {
      sendJson(response, 404, { error: 'Project not found', ok: false })
      return
    }

    startSse(response)
    const turns = replayClientEventsLive(
      await repository.readClientMessages(id),
    )
    sendSse(response, 'state', {
      brief: project.brief,
      html: project.indexHtml,
      models: {
        image: project.imageModel,
        text: project.model,
        vision: project.visionModel,
      },
      status: project.status,
      title: project.title,
      turns,
    })

    const unsubscribe = runBus.subscribeProject(id, response)
    response.on('close', () => {
      unsubscribe()
      endSse(response)
    })
  }

  /** GET /api/projects/events — SSE. Emit one `project_status` per project as an
   *  initial snapshot, then tail lifecycle projection changes from the list bus.
   *  Stays open until the client closes. */
  async function handleProjectListEvents(response: ServerResponse) {
    startSse(response)
    const projects = await repository.listProjects()
    for (const project of projects) {
      sendSse(response, 'project_status', {
        projectId: project.id,
        runStartedAt: project.runStartedAt,
        runTurnId: project.runTurnId,
        status: project.status,
      })
    }
    const unsubscribe = runBus.subscribeList(response)
    response.on('close', () => {
      unsubscribe()
      endSse(response)
    })
  }

  async function handleStopProject(id: string, response: ServerResponse) {
    // Graceful stop: aborts the run's Mastra stream but leaves its SSE response
    // open so terminal cost/stats + `done` are still delivered to the client.
    const result = await agentRunner.stop(id)
    sendJson(response, 200, result)
  }

  async function readJsonObject(
    request: IncomingMessage,
    maxBytes: number,
  ): Promise<Record<string, unknown>> {
    const body = await readRequestBody(request, maxBytes)
    if (body.trim().length === 0) return {}
    const parsed = JSON.parse(body)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  }

  /** REST router for project CRUD + persisted project images. Returns true if handled. */
  async function routeProjects(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
    requestUrl: URL,
  ): Promise<boolean> {
    if (PROJECT_LIST_RE.test(pathname)) {
      if (request.method === 'GET') {
        await handleListProjects(response)
        return true
      }
      if (request.method === 'POST') {
        await handleCreateProject(request, response)
        return true
      }
      return false
    }

    if (PROJECT_LIST_EVENTS_RE.test(pathname) && request.method === 'GET') {
      const version = requestUrl.searchParams.get('v')
      if (version === '2') {
        await projectEvents.openList(response)
      } else if (version !== null) {
        await writeUnsupportedVersion(response)
      } else {
        await handleProjectListEvents(response)
      }
      return true
    }

    const imageMatch = pathname.match(PROJECT_IMAGE_RE)
    if (imageMatch && request.method === 'GET') {
      await serveProjectImage(imageMatch[1]!, imageMatch[2]!, response)
      return true
    }

    const screenshotMatch = pathname.match(PROJECT_SCREENSHOT_RE)
    if (screenshotMatch && request.method === 'GET') {
      await serveProjectScreenshot(
        screenshotMatch[1]!,
        screenshotMatch[2]!,
        response,
      )
      return true
    }

    const stopMatch = pathname.match(PROJECT_STOP_RE)
    if (stopMatch && request.method === 'POST') {
      await handleStopProject(stopMatch[1]!, response)
      return true
    }

    const htmlMatch = pathname.match(PROJECT_HTML_RE)
    if (htmlMatch && request.method === 'GET') {
      await serveProjectHtml(htmlMatch[1]!, response)
      return true
    }

    const eventsMatch = pathname.match(PROJECT_EVENTS_RE)
    if (eventsMatch && request.method === 'GET') {
      const version = requestUrl.searchParams.get('v')
      if (version === '2') {
        const found = await projectEvents.openProject(eventsMatch[1]!, response)
        if (!found) {
          sendJson(response, 404, { error: 'Project not found', ok: false })
        }
      } else if (version !== null) {
        await writeUnsupportedVersion(response)
      } else {
        await handleProjectEvents(eventsMatch[1]!, response)
      }
      return true
    }

    const itemMatch = pathname.match(PROJECT_ITEM_RE)
    if (itemMatch) {
      const id = itemMatch[1]!
      if (request.method === 'GET') {
        await handleGetProject(id, response)
        return true
      }
      if (request.method === 'DELETE') {
        await handleDeleteProject(id, response)
        return true
      }
      if (request.method === 'PATCH') {
        await handlePatchProject(id, request, response)
        return true
      }
    }

    return false
  }

  function sendJson(
    response: ServerResponse,
    statusCode: number,
    payload: unknown,
  ) {
    response.writeHead(statusCode, {
      'content-type': 'application/json; charset=utf-8',
    })
    response.end(JSON.stringify(payload))
  }

  function sendNoContent(response: ServerResponse) {
    response.writeHead(204)
    response.end()
  }

  function sendNotFound(response: ServerResponse) {
    sendJson(response, 404, { error: 'Not found', ok: false })
  }

  function serveImage(id: string, response: ServerResponse) {
    const image = imageStore.getImage(id) ?? repository.readGeneratedImage(id)

    if (!image) {
      sendJson(response, 404, { error: 'Image not found', ok: false })
      return
    }

    response.writeHead(200, {
      'cache-control': 'public, max-age=86400, immutable',
      'content-length': image.buffer.length,
      'content-type': image.mediaType,
    })
    response.end(image.buffer)
  }

  /** Serve the project HTML as a portable single-file download (images inlined). */
  async function serveProjectHtml(id: string, response: ServerResponse) {
    const result = await repository.getProjectHtmlInlined(id)
    if (!result) {
      sendJson(response, 404, { error: 'Project not found', ok: false })
      return
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-disposition': `attachment; filename="${result.filename}"`,
      'content-type': 'text/html; charset=utf-8',
    })
    response.end(result.html)
  }

  async function serveProjectImage(
    projectId: string,
    file: string,
    response: ServerResponse,
  ) {
    const image = await repository.readProjectImage(projectId, file)
    if (!image) {
      sendJson(response, 404, { error: 'Image not found', ok: false })
      return
    }
    response.writeHead(200, {
      'cache-control': 'public, max-age=86400, immutable',
      'content-length': image.buffer.length,
      'content-type': image.mediaType,
    })
    response.end(image.buffer)
  }

  async function serveProjectScreenshot(
    projectId: string,
    file: string,
    response: ServerResponse,
  ) {
    const screenshot = await repository.readProjectScreenshot(projectId, file)
    if (!screenshot) {
      sendJson(response, 404, { error: 'Screenshot not found', ok: false })
      return
    }
    response.writeHead(200, {
      'cache-control': 'public, max-age=86400, immutable',
      'content-length': screenshot.buffer.length,
      'content-type': screenshot.mediaType,
    })
    response.end(screenshot.buffer)
  }

  function setCorsHeaders(response: ServerResponse) {
    response.setHeader('access-control-allow-headers', 'content-type')
    response.setHeader(
      'access-control-allow-methods',
      'DELETE,GET,PATCH,POST,OPTIONS',
    )
    response.setHeader('access-control-allow-origin', config.clientOrigin)
    response.appendHeader('vary', 'Origin')
  }

  function stringField(value: unknown, maxLength: number): string | undefined {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    if (!trimmed || trimmed.length > maxLength) return undefined
    return trimmed
  }

  function validateAgentAttachment(
    value: unknown,
  ): AgentAttachmentInput | string {
    if (!isRecord(value)) return 'expected an object'

    return value.kind === 'element'
      ? validateAgentElementAttachment(value)
      : validateAgentImageAttachment(value)
  }

  function validateAgentAttachments(
    value: unknown,
  ): AgentAttachmentInput[] | string {
    if (value === undefined) return []
    if (!Array.isArray(value)) return 'Expected { attachments?: attachment[] }'
    if (value.length > MAX_ATTACHMENT_COUNT) {
      return `Attach up to ${MAX_ATTACHMENT_COUNT} items.`
    }

    const attachments: AgentAttachmentInput[] = []
    let totalSize = 0
    for (const [index, item] of value.entries()) {
      const attachment = validateAgentAttachment(item)
      if (typeof attachment === 'string') {
        return `Invalid attachment ${index + 1}: ${attachment}.`
      }
      totalSize += attachmentSize(attachment)
      if (totalSize > MAX_ATTACHMENT_TOTAL_SIZE) {
        return 'Attached items must be 16 MiB or smaller in total.'
      }
      attachments.push(attachment)
    }

    return attachments
  }

  function validateAgentElementAttachment(
    value: Record<string, unknown>,
  ): AgentElementAttachmentInput | string {
    const selector = stringField(value.selector, 300)
    if (!selector) return 'expected a non-empty selector (1–300 characters)'
    return { kind: 'element', selector }
  }

  function validateAgentImageAttachment(
    value: Record<string, unknown>,
    mediaTypes: ReadonlySet<string> = ACCEPTED_ATTACHMENT_MEDIA_TYPES,
  ): AgentImageAttachmentInput | string {
    const id = stringField(value.id, 100)
    const mediaType = stringField(value.mediaType, 32)
    const name = stringField(value.name, 200)
    const dataUrl =
      typeof value.dataUrl === 'string' ? value.dataUrl.trim() : ''
    const size = typeof value.size === 'number' ? value.size : undefined

    if (!id) return 'expected non-empty id'
    if (!name) return 'expected non-empty name'
    if (!mediaType || !mediaTypes.has(mediaType)) {
      return 'expected PNG, JPEG, WEBP, or GIF mediaType'
    }
    if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
      return 'expected a positive integer size'
    }
    if (!isValidImageDataUrl(dataUrl, mediaType)) {
      return 'expected matching base64 dataUrl'
    }

    const decodedSize = decodedDataUrlSize(dataUrl)
    if (decodedSize <= 0 || decodedSize > MAX_ATTACHMENT_SIZE) {
      return 'decoded image must be between 1 byte and 8 MiB'
    }
    if (size !== decodedSize) {
      return 'declared size must match decoded dataUrl bytes'
    }

    return {
      dataUrl,
      id,
      mediaType: mediaType as AgentImageAttachmentInput['mediaType'],
      name,
      size: decodedSize,
    }
  }

  return server
}

/** Recover interrupted work and start one explicitly constructed runtime. */
export async function startApiServer(runtime: ServerRuntime) {
  try {
    const resumedDeletions = await runtime.projectService.recover()
    const reconciled = await runtime.agentRunner.recover()
    if (resumedDeletions > 0) {
      console.log(`Resumed ${resumedDeletions} project deletion(s) on startup.`)
    }
    if (reconciled > 0) {
      console.log(`Reconciled ${reconciled} interrupted run(s) on startup.`)
    }
    const server = createApiServer(runtime)
    await new Promise<void>((resolveListen, reject) => {
      const onError = (error: Error) => reject(error)
      server.once('error', onError)
      server.listen(runtime.config.port, runtime.config.host, () => {
        server.off('error', onError)
        console.log(
          `Server listening at http://${runtime.config.host}:${runtime.config.port}`,
        )
        resolveListen()
      })
    })
    return server
  } catch (error) {
    await runtime.dispose()
    throw error
  }
}

const isMainModule =
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.argv[1]?.endsWith('src/index.ts')

if (isMainModule) {
  const { createProductionRuntime } = await import('./production-runtime.ts')
  const runtime = await createProductionRuntime()
  await startApiServer(runtime)
}
