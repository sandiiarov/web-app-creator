import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { env } from 'node:process'

import { gateway } from '@ai-sdk/gateway'
import { generateText } from 'ai'

const CLIENT_ORIGIN = env.CLIENT_ORIGIN ?? '*'
const DEFAULT_MODEL = env.AI_MODEL ?? 'deepseek/deepseek-v4-pro'
const EDIT_SYSTEM_PROMPT = `You edit a small Vite React preview app.
Return only JSON. Do not wrap it in markdown.
The JSON shape must be:
{
  "summary": "short human-readable summary",
  "files": [
    { "path": "/src/App.tsx", "content": "full file contents" },
    { "path": "/src/style.css", "content": "full file contents" }
  ]
}
Return only changed files. You may edit only /src/App.tsx and /src/style.css.
Preserve valid React/TypeScript and CSS. Use the selected element context when present.`
const EDITABLE_FILE_PATHS = new Set(['/src/App.tsx', '/src/style.css'])
const HOST = env.HOST ?? '0.0.0.0'
const PORT = parsePort(env.PORT ?? '3001')

type CompletionRequest = {
  model?: string
  prompt: string
  system?: string
}

type EditFile = {
  content: string
  path: string
}

type EditRequest = {
  files: EditFile[]
  model?: string
  prompt: string
  selection?: unknown
}

type EditResponse = {
  files: EditFile[]
  summary?: string
}

type GenerateRequest = {
  model?: string
  prompt: string
}

type JsonRange = {
  end: number
  start: number
}

type Route = {
  handle: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => Promise<void> | void
  matches: (request: IncomingMessage, pathname: string) => boolean
}

const ROUTES: Route[] = [
  {
    handle: handleHealthRoute,
    matches: isHealthRoute,
  },
  {
    handle: handleGenerate,
    matches: isGenerateRoute,
  },
  {
    handle: handleEdit,
    matches: isEditRoute,
  },
]

const server = createServer(async (request, response) => {
  setCorsHeaders(response)

  try {
    await routeRequest(request, response)
  } catch (error) {
    sendJson(response, 500, {
      error: errorMessage(error),
    })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Server listening at http://${HOST}:${PORT}`)
})

function createEditPrompt(request: EditRequest) {
  return [
    'User request:',
    request.prompt,
    '',
    'Selected element context:',
    JSON.stringify(request.selection ?? null, null, 2),
    '',
    'Editable files:',
    request.files.map(formatFileForPrompt).join('\n\n'),
  ].join('\n')
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error'
}

function extractBracedJson(text: string) {
  const range = jsonRange(text)

  if (!range) {
    throw new Error('AI response did not include a JSON object.')
  }

  return text.slice(range.start, range.end + 1)
}

function extractFencedJson(text: string) {
  return text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim() ?? null
}

function extractJsonObject(text: string) {
  return extractFencedJson(text) ?? extractBracedJson(text)
}

function formatFileForPrompt(file: EditFile) {
  return [`File: ${file.path}`, '```', file.content, '```'].join('\n')
}

async function generateCompletion({
  model,
  prompt,
  system,
}: CompletionRequest) {
  const result = await generateText({
    model: gateway(model ?? DEFAULT_MODEL),
    prompt,
    system,
  })

  return result.text
}

async function handleEdit(request: IncomingMessage, response: ServerResponse) {
  const body = await readJson(request)

  if (!isEditRequest(body)) {
    sendJson(response, 400, {
      error: 'Expected JSON body with prompt and editable files.',
    })
    return
  }

  const text = await generateCompletion({
    model: body.model,
    prompt: createEditPrompt(body),
    system: EDIT_SYSTEM_PROMPT,
  })

  sendJson(response, 200, parseEditResponse(text))
}

async function handleGenerate(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const body = await readJson(request)

  if (!isGenerateRequest(body)) {
    sendJson(response, 400, {
      error: 'Expected JSON body with a string prompt.',
    })
    return
  }

  const text = await generateCompletion(body)

  sendJson(response, 200, {
    text,
  })
}

function handleHealth(response: ServerResponse) {
  sendJson(response, 200, {
    aiGatewayConfigured: Boolean(env.AI_GATEWAY_API_KEY),
    ok: true,
  })
}

function handleHealthRoute(
  _request: IncomingMessage,
  response: ServerResponse,
) {
  handleHealth(response)
}

function hasEditableFiles(value: unknown) {
  return Array.isArray(value) && value.every(isEditableFile)
}

function hasOptionalModel(value: unknown) {
  return value === undefined || typeof value === 'string'
}

function hasPrompt(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}

function isEditableFile(value: unknown): value is EditFile {
  return (
    isRecord(value) &&
    typeof value.content === 'string' &&
    typeof value.path === 'string' &&
    EDITABLE_FILE_PATHS.has(value.path)
  )
}

function isEditRequest(value: unknown): value is EditRequest {
  return isRecord(value) && isEditRequestRecord(value)
}

function isEditRequestRecord(value: Record<string, unknown>) {
  return (
    hasPrompt(value.prompt) &&
    hasOptionalModel(value.model) &&
    hasEditableFiles(value.files)
  )
}

function isEditResponse(value: unknown): value is EditResponse {
  return isRecord(value) && isEditResponseRecord(value)
}

function isEditResponseRecord(value: Record<string, unknown>) {
  return (
    (value.summary === undefined || typeof value.summary === 'string') &&
    hasEditableFiles(value.files)
  )
}

function isEditRoute(request: IncomingMessage, pathname: string) {
  return request.method === 'POST' && pathname === '/api/edit'
}

function isGenerateRequest(value: unknown): value is GenerateRequest {
  if (!isRecord(value)) {
    return false
  }

  return hasPrompt(value.prompt) && hasOptionalModel(value.model)
}

function isGenerateRoute(request: IncomingMessage, pathname: string) {
  return request.method === 'POST' && pathname === '/api/generate'
}

function isHealthRoute(request: IncomingMessage, pathname: string) {
  return request.method === 'GET' && pathname === '/health'
}

function isOptionsRequest(request: IncomingMessage) {
  return request.method === 'OPTIONS'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function jsonRange(text: string): JsonRange | null {
  const end = text.lastIndexOf('}')
  const start = text.indexOf('{')

  return start === -1 || end < start ? null : { end, start }
}

function parseEditResponse(text: string): EditResponse {
  const parsed = JSON.parse(extractJsonObject(text)) as unknown

  if (!isEditResponse(parsed)) {
    throw new Error('AI response did not match the edit response schema.')
  }

  return parsed
}

function parsePort(value: string) {
  const port = Number(value)

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid PORT value: ${value}`)
  }

  return port
}

async function readJson(request: IncomingMessage) {
  const body = await readRequestBody(request)

  return body.trim().length > 0 ? (JSON.parse(body) as unknown) : {}
}

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  return Buffer.concat(chunks).toString('utf8')
}

function requestPathname(request: IncomingMessage) {
  return new URL(request.url ?? '/', `http://${request.headers.host}`).pathname
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (isOptionsRequest(request)) {
    sendNoContent(response)
    return
  }

  const pathname = requestPathname(request)
  const route = ROUTES.find((candidate) => candidate.matches(request, pathname))

  if (!route) {
    sendNotFound(response)
    return
  }

  await route.handle(request, response)
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
  sendJson(response, 404, {
    error: 'Not found',
  })
}

function setCorsHeaders(response: ServerResponse) {
  response.setHeader('access-control-allow-headers', 'content-type')
  response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
  response.setHeader('access-control-allow-origin', CLIENT_ORIGIN)
}
