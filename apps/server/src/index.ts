import { Buffer } from 'node:buffer'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { fileURLToPath } from 'node:url'

import { config } from './config.ts'
import { readRequestBody } from './http-body.ts'
import { saveBenchmarkReport } from './mastra/lib/benchmark-report-store.ts'
import {
  rejectPendingBrowserScreenshot,
  resolvePendingBrowserScreenshot,
  type BrowserScreenshotMediaType,
  type BrowserScreenshotResult,
} from './mastra/lib/browser-screenshot.ts'
import { getImage } from './mastra/lib/image-store.ts'
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  readProjectImage,
  updateProjectModel,
} from './mastra/lib/project-store.ts'
import {
  resolveModelId,
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
    imageModel: body.imageModel
      ? resolveModelId(body.imageModel)
      : undefined,
    projectId: body.projectId,
    prompt: body.prompt,
    request,
    response,
    textModel: resolveModelId(body.textModel),
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

  if (await routeBenchmarkReports(request, response, pathname)) {
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

const BENCHMARK_REPORTS_RE = /^\/api\/benchmark-reports\/?$/i
const PROJECT_LIST_RE = /^\/api\/projects\/?$/i
const SCREENSHOT_RESPONSE_RE = /^\/api\/screenshot-responses\/([a-f0-9-]+)$/i
const PROJECT_ITEM_RE = /^\/api\/projects\/([a-f0-9-]+)$/i
const PROJECT_IMAGE_RE = /^\/api\/projects\/([a-f0-9-]+)\/images\/([^/]+)$/i

async function handleCreateBenchmarkReport(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const body = await readJsonObject(request)
  const error = validateBenchmarkReport(body)

  if (error) {
    sendJson(response, 400, { error, ok: false })
    return
  }

  const report = await saveBenchmarkReport(body)
  sendJson(response, 201, { ok: true, report })
}

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

  const project = await updateProjectModel(id, resolveModelId(body.textModel))
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
    if (!rejectPendingBrowserScreenshot(requestId, error)) {
      sendJson(response, 404, {
        error: 'Screenshot request not found',
        ok: false,
      })
      return
    }
    sendJson(response, 200, { ok: true })
    return
  }

  const screenshot = validateScreenshotResponse(body)
  if (typeof screenshot === 'string') {
    sendJson(response, 400, { error: screenshot, ok: false })
    return
  }

  if (!resolvePendingBrowserScreenshot(requestId, screenshot)) {
    sendJson(response, 404, {
      error: 'Screenshot request not found',
      ok: false,
    })
    return
  }

  sendJson(response, 200, { ok: true })
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

async function routeBenchmarkReports(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (!BENCHMARK_REPORTS_RE.test(pathname)) return false
  if (request.method !== 'POST') return false

  await handleCreateBenchmarkReport(request, response)
  return true
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

function validateBenchmarkReport(body: Record<string, unknown>): null | string {
  if (
    typeof body.reportVersion !== 'string' ||
    body.reportVersion.trim() === '' ||
    !Array.isArray(body.runs)
  ) {
    return 'Expected benchmark report with reportVersion and runs'
  }

  return null
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

  return { dataUrl, height, mediaType, width }
}
