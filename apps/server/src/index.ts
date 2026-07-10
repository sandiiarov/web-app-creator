import { Buffer } from 'node:buffer'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { fileURLToPath } from 'node:url'

import { config } from './config.ts'
import { readRequestBody } from './http-body.ts'
import {
  rejectPendingBrowserScreenshot,
  resolvePendingBrowserScreenshot,
  type BrowserScreenshotMediaType,
  type BrowserScreenshotResult,
} from './mastra/lib/browser-screenshot.ts'
import { getImage } from './mastra/lib/image-store.ts'
import {
  appendClientMessage,
  createProject,
  deleteProject,
  getProject,
  getProjectHtmlInlined,
  listProjects,
  readProjectImage,
  readProjectScreenshot,
  updateProjectModel,
  writeProjectScreenshotSync,
  type ClientMessageEntry,
} from './mastra/lib/project-store.ts'
import {
  resolveModelId,
  stopLandingAgent,
  streamLandingAgent,
  type AgentAttachmentInput,
  type AgentElementAttachmentInput,
  type AgentImageAttachmentInput,
} from './mastra/route.ts'

const ACCEPTED_ATTACHMENT_MEDIA_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])
const MAX_ATTACHMENT_COUNT = 4
const MAX_ATTACHMENT_ELEMENT_HTML_SIZE = 256 * 1024
const MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024
const MAX_ATTACHMENT_TOTAL_SIZE = 16 * 1024 * 1024
const SCREENSHOT_MEDIA_TYPES = new Set<BrowserScreenshotMediaType>([
  'image/jpeg',
  'image/png',
  'image/webp',
])

type AgentRequestBody = {
  attachments?: unknown
  imageModel?: unknown
  projectId?: unknown
  prompt?: unknown
  textModel?: unknown
  turnId?: unknown
  visionModel?: unknown
}

const server = createServer(async (request, response) => {
  setCorsHeaders(response)

  try {
    await routeRequest(request, response)
  } catch (error) {
    if (!response.headersSent) {
      sendJson(response, 500, { error: errorMessage(error), ok: false })
    } else {
      response.end()
    }
  }
})

// Only start our custom HTTP server when run directly (`node src/index.ts`),
// not when Mastra dev/build imports this module as a library entry point.
const isMainModule =
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.argv[1]?.endsWith('src/index.ts')

if (isMainModule) {
  server.listen(config.port, config.host, () => {
    console.log(`Server listening at http://${config.host}:${config.port}`)
  })
}

export { server }

function attachmentSize(attachment: AgentAttachmentInput) {
  return (
    attachment.size +
    (attachment.kind === 'element'
      ? Buffer.byteLength(attachment.html, 'utf8')
      : 0)
  )
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error'
}

/**
 * Single landing-page-agent endpoint. Accepts
 * `{ prompt: string, projectId: string, textModel?: string, imageModel?: string, visionModel?: string }`.
 */
async function handleAgent(request: IncomingMessage, response: ServerResponse) {
  const body = await readJson(request)

  if (typeof body.prompt !== 'string' || body.prompt.trim() === '') {
    sendJson(response, 400, {
      error: 'Expected { prompt: string }',
      ok: false,
    })
    return
  }

  if (typeof body.projectId !== 'string' || body.projectId.trim() === '') {
    sendJson(response, 400, {
      error: 'Expected { projectId: string }',
      ok: false,
    })
    return
  }

  if (
    body.textModel !== undefined &&
    (typeof body.textModel !== 'string' || body.textModel.trim() === '')
  ) {
    sendJson(response, 400, {
      error: 'Expected { textModel?: string }',
      ok: false,
    })
    return
  }

  if (
    body.turnId !== undefined &&
    (typeof body.turnId !== 'string' ||
      body.turnId.trim() === '' ||
      body.turnId.length > 128)
  ) {
    sendJson(response, 400, {
      error: 'Expected { turnId?: string (1-128 characters) }',
      ok: false,
    })
    return
  }

  if (
    body.imageModel !== undefined &&
    (typeof body.imageModel !== 'string' || body.imageModel.trim() === '')
  ) {
    sendJson(response, 400, {
      error: 'Expected { imageModel?: string }',
      ok: false,
    })
    return
  }

  if (
    body.visionModel !== undefined &&
    (typeof body.visionModel !== 'string' || body.visionModel.trim() === '')
  ) {
    sendJson(response, 400, {
      error: 'Expected { visionModel?: string }',
      ok: false,
    })
    return
  }

  const attachments = validateAgentAttachments(body.attachments)
  if (typeof attachments === 'string') {
    sendJson(response, 400, {
      error: attachments,
      ok: false,
    })
    return
  }

  // Only `textModel` falls back to the chat default here. `imageModel` and
  // `visionModel` must stay `undefined` when omitted so `streamLandingAgent`
  // applies their own role-specific defaults (image / vision models). Routing
  // them through `resolveModelId` would silently substitute the chat model,
  // which is neither an image nor a vision model and 404s at the provider.
  await streamLandingAgent({
    attachments,
    imageModel: body.imageModel ? resolveModelId(body.imageModel) : undefined,
    projectId: body.projectId,
    prompt: body.prompt,
    request,
    response,
    textModel: resolveModelId(body.textModel),
    turnId: body.turnId,
    visionModel: body.visionModel
      ? resolveModelId(body.visionModel)
      : undefined,
  })
}

function isPositiveDimension(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 4096
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isValidImageDataUrl(dataUrl: string, mediaType: string) {
  if (!dataUrl.startsWith(`data:${mediaType};base64,`)) return false
  const payload = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return /^[A-Za-z0-9+/=\s]+$/.test(payload) && payload.trim().length > 0
}

async function readJson(request: IncomingMessage): Promise<AgentRequestBody> {
  const body = await readRequestBody(request)

  return body.trim().length > 0 ? (JSON.parse(body) as AgentRequestBody) : {}
}

function requestPathname(request: IncomingMessage) {
  return new URL(request.url ?? '/', `http://${request.headers.host}`).pathname
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (request.method === 'OPTIONS') {
    sendNoContent(response)
    return
  }

  const pathname = requestPathname(request)

  if (request.method === 'POST' && pathname === '/agent') {
    await handleAgent(request, response)
    return
  }

  if (await routeScreenshotResponse(request, response, pathname)) {
    return
  }

  if (await routeProjects(request, response, pathname)) {
    return
  }

  if (request.method === 'GET') {
    const imageMatch = pathname.match(/^\/images\/(img-\d+)(?:\.[a-z0-9]+)?$/i)
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
const SCREENSHOT_RESPONSE_RE = /^\/api\/screenshot-responses\/([a-f0-9-]+)$/i
const PROJECT_ITEM_RE = /^\/api\/projects\/([a-f0-9-]+)$/i
const PROJECT_IMAGE_RE = /^\/api\/projects\/([a-f0-9-]+)\/images\/([^/]+)$/i
const PROJECT_HTML_RE = /^\/api\/projects\/([a-f0-9-]+)\/html$/i

async function handleCreateProject(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const body = await readJsonObject(request)
  const project = await createProject({
    model: typeof body.textModel === 'string' ? body.textModel : undefined,
    title: typeof body.title === 'string' ? body.title : undefined,
  })
  sendJson(response, 201, { ok: true, project })
}

async function handleDeleteProject(id: string, response: ServerResponse) {
  await deleteProject(id)
  sendJson(response, 200, { ok: true })
}

async function handleGetProject(id: string, response: ServerResponse) {
  const project = await getProject(id)
  if (!project) {
    sendJson(response, 404, { error: 'Project not found', ok: false })
    return
  }
  sendJson(response, 200, { ok: true, project })
}

async function handleListProjects(response: ServerResponse) {
  const all = await listProjects()
  // Drafts (no generated HTML yet) are hidden from the list.
  const projects = all.filter((project) => project.hasHtml)
  sendJson(response, 200, { ok: true, projects })
}

async function handlePatchProject(
  id: string,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const body = await readJsonObject(request)

  if (typeof body.textModel !== 'string' || body.textModel.trim() === '') {
    sendJson(response, 400, {
      error: 'Expected { textModel: string }',
      ok: false,
    })
    return
  }

  for (const field of ['imageModel', 'visionModel'] as const) {
    const value = body[field]
    if (
      value !== undefined &&
      (typeof value !== 'string' || value.trim() === '')
    ) {
      sendJson(response, 400, {
        error: `Expected { ${field}?: string }`,
        ok: false,
      })
      return
    }
  }

  const project = await updateProjectModel(id, {
    imageModel:
      typeof body.imageModel === 'string'
        ? resolveModelId(body.imageModel)
        : undefined,
    textModel: resolveModelId(body.textModel),
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

async function handleScreenshotResponse(
  requestId: string,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const body = await readJsonObject(request)
  const error = stringField(body.error, 500)

  if (error) {
    const projectId = rejectPendingBrowserScreenshot(requestId, error)
    if (!projectId) {
      sendJson(response, 404, {
        error: 'Screenshot request not found',
        ok: false,
      })
      return
    }
    recordScreenshotResponse(projectId, requestId, { error, ok: false })
    sendJson(response, 200, { ok: true })
    return
  }

  const screenshot = validateScreenshotResponse(body)
  if (typeof screenshot === 'string') {
    sendJson(response, 400, { error: screenshot, ok: false })
    return
  }

  const projectId = resolvePendingBrowserScreenshot(requestId, screenshot)
  if (!projectId) {
    sendJson(response, 404, {
      error: 'Screenshot request not found',
      ok: false,
    })
    return
  }

  // Persist the captured bytes (single durable copy under screenshots/) and
  // record the inbound response in client-messages.jsonl — metadata + file
  // path only, never base64. The agent's screenshot tool still receives the
  // live image; this is debugging persistence.
  const shot = writeProjectScreenshotSync(
    projectId,
    requestId,
    screenshot.dataUrl,
    screenshot.mediaType,
  )
  recordScreenshotResponse(projectId, requestId, {
    height: screenshot.height,
    mediaType: screenshot.mediaType,
    ok: true,
    screenshotFile: shot.path,
    width: screenshot.width,
  })

  sendJson(response, 200, { ok: true })
}

async function handleStopProject(id: string, response: ServerResponse) {
  // Graceful stop: aborts the run's Mastra stream but leaves its SSE response
  // open so terminal cost/stats + `done` are still delivered to the client.
  const stopped = stopLandingAgent(id)
  sendJson(response, 200, { ok: true, stopped })
}

async function readJsonObject(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const body = await readRequestBody(request)
  if (body.trim().length === 0) return {}
  const parsed = JSON.parse(body)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {}
}

/** Record an inbound screenshot POST-back (client→server) in the client log. */
function recordScreenshotResponse(
  projectId: string,
  requestId: string,
  detail: Record<string, unknown>,
): void {
  void appendClientMessage(projectId, {
    ...detail,
    dir: 'in',
    requestId,
    ts: new Date().toISOString(),
    type: 'screenshot_response',
  } satisfies ClientMessageEntry)
}

/** REST router for project CRUD + persisted project images. Returns true if handled. */
async function routeProjects(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
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

async function routeScreenshotResponse(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  const match = pathname.match(SCREENSHOT_RESPONSE_RE)
  if (!match) return false
  if (request.method !== 'POST') return false

  await handleScreenshotResponse(match[1]!, request, response)
  return true
}

function screenshotMediaType(
  value: unknown,
): BrowserScreenshotMediaType | undefined {
  return typeof value === 'string' &&
    SCREENSHOT_MEDIA_TYPES.has(value as BrowserScreenshotMediaType)
    ? (value as BrowserScreenshotMediaType)
    : undefined
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
  const image = getImage(id)

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
  const result = await getProjectHtmlInlined(id)
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
  const image = await readProjectImage(projectId, file)
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
  const screenshot = await readProjectScreenshot(projectId, file)
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
  const base = validateAgentImageAttachment(value, SCREENSHOT_MEDIA_TYPES)
  if (typeof base === 'string') return base

  const html = typeof value.html === 'string' ? value.html.trim() : ''
  const selector = stringField(value.selector, 300)
  const screenshotHeight = value.screenshotHeight
  const screenshotWidth = value.screenshotWidth

  if (!html) return 'expected selected element html'
  if (Buffer.byteLength(html, 'utf8') > MAX_ATTACHMENT_ELEMENT_HTML_SIZE) {
    return 'selected element html must be 256 KiB or smaller'
  }
  if (!isPositiveDimension(screenshotWidth)) {
    return 'expected screenshotWidth between 1 and 4096'
  }
  if (!isPositiveDimension(screenshotHeight)) {
    return 'expected screenshotHeight between 1 and 4096'
  }

  const mediaType = base.mediaType as AgentElementAttachmentInput['mediaType']

  return {
    ...base,
    html,
    kind: 'element',
    mediaType,
    ...(selector ? { selector } : {}),
    screenshotHeight,
    screenshotWidth,
  }
}

function validateAgentImageAttachment(
  value: Record<string, unknown>,
  mediaTypes: ReadonlySet<string> = ACCEPTED_ATTACHMENT_MEDIA_TYPES,
): AgentImageAttachmentInput | string {
  const id = stringField(value.id, 100)
  const mediaType = stringField(value.mediaType, 32)
  const name = stringField(value.name, 200)
  const dataUrl = typeof value.dataUrl === 'string' ? value.dataUrl.trim() : ''
  const size = typeof value.size === 'number' ? value.size : undefined

  if (!id) return 'expected non-empty id'
  if (!name) return 'expected non-empty name'
  if (!mediaType || !mediaTypes.has(mediaType)) {
    return 'expected PNG, JPEG, WEBP, or GIF mediaType'
  }
  if (
    typeof size !== 'number' ||
    !Number.isInteger(size) ||
    size <= 0 ||
    size > MAX_ATTACHMENT_SIZE
  ) {
    return 'expected size between 1 byte and 8 MiB'
  }
  if (!isValidImageDataUrl(dataUrl, mediaType)) {
    return 'expected matching base64 dataUrl'
  }

  return {
    dataUrl,
    id,
    mediaType,
    name,
    size,
  }
}

function validateScreenshotResponse(
  value: Record<string, unknown>,
): BrowserScreenshotResult | string {
  const mediaType = screenshotMediaType(value.mediaType)
  const dataUrl = typeof value.dataUrl === 'string' ? value.dataUrl.trim() : ''
  const height = value.height
  const width = value.width

  if (!mediaType)
    return 'Expected screenshot mediaType image/jpeg, image/png, or image/webp.'
  if (!isValidImageDataUrl(dataUrl, mediaType)) {
    return 'Expected matching screenshot base64 dataUrl.'
  }
  if (
    typeof width !== 'number' ||
    !Number.isInteger(width) ||
    width <= 0 ||
    width > 4096
  ) {
    return 'Expected screenshot width between 1 and 4096.'
  }
  if (
    typeof height !== 'number' ||
    !Number.isInteger(height) ||
    height <= 0 ||
    height > 4096
  ) {
    return 'Expected screenshot height between 1 and 4096.'
  }

  const elementMap =
    typeof value.elementMap === 'string' && value.elementMap.length <= 8000
      ? value.elementMap
      : undefined

  return { dataUrl, elementMap, height, mediaType, width }
}
