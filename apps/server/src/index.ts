import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { fileURLToPath } from 'node:url'

import { config } from './config.ts'
import { readRequestBody } from './http-body.ts'
import { getImage } from './mastra/lib/image-store.ts'
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  readProjectImage,
} from './mastra/lib/project-store.ts'
import { resolveModelId, streamLandingAgent } from './mastra/route.ts'

type AgentRequestBody = { model?: string; projectId?: unknown; prompt?: unknown }

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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error'
}

/**
 * Single landing-page-agent endpoint. Accepts `{ prompt: string, model?: string }`.
 *
 * The Mastra agent + custom SSE protocol wire in here — see
 * `mastra-migration-plan.md`, Phase 2.
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

  if (body.model !== undefined && typeof body.model !== 'string') {
    sendJson(response, 400, {
      error: 'Expected { model?: string }',
      ok: false,
    })
    return
  }

  await streamLandingAgent({
    modelId: resolveModelId(body.model),
    projectId: body.projectId,
    prompt: body.prompt,
    request,
    response,
  })
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
const PROJECT_ITEM_RE = /^\/api\/projects\/([a-f0-9-]+)$/i
const PROJECT_IMAGE_RE = /^\/api\/projects\/([a-f0-9-]+)\/images\/([^/]+)$/i

async function handleCreateProject(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const body = await readJsonObject(request)
  const project = await createProject({
    model: typeof body.model === 'string' ? body.model : undefined,
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
  response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
  response.setHeader('access-control-allow-origin', config.clientOrigin)
}
