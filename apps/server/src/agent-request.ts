export type AgentPreviewFile = {
  content: string
  encoding?: string
  path: string
}

export type AgentRequest = {
  chatId?: string
  files: AgentPreviewFile[]
  preview?: unknown
  prompt: string
  selectedElement?: unknown
  selectedJsx?: string
  version: 1
}

export type AgentResponse =
  | {
      changedFiles: AgentPreviewFile[]
      chatId: string
      deletedPaths: string[]
      diagnostics: string[]
      message: string
      ok: true
    }
  | {
      diagnostics?: string[]
      error: string
      ok: false
    }

export function parseAgentRequest(value: unknown): AgentRequest {
  if (!isRecord(value)) {
    throw new Error('Expected JSON object request body.')
  }

  if (value.version !== 1) {
    throw new Error('Expected agent request version 1.')
  }

  if (typeof value.prompt !== 'string') {
    throw new Error('Expected prompt to be a string.')
  }

  if (!Array.isArray(value.files)) {
    throw new Error('Expected files array.')
  }

  return {
    files: value.files.map(parseAgentFile),
    preview: value.preview,
    prompt: value.prompt,
    selectedElement: value.selectedElement,
    ...(parseOptionalString(value.chatId, 'chatId') === undefined
      ? {}
      : { chatId: parseOptionalString(value.chatId, 'chatId') }),
    ...(parseOptionalString(value.selectedJsx, 'selectedJsx') === undefined
      ? {}
      : { selectedJsx: parseOptionalString(value.selectedJsx, 'selectedJsx') }),
    version: 1,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseAgentFile(value: unknown): AgentPreviewFile {
  if (!isRecord(value)) {
    throw new Error('Expected every file to be an object.')
  }

  if (typeof value.path !== 'string') {
    throw new Error('Expected every file path to be a string.')
  }

  if (typeof value.content !== 'string') {
    throw new Error(`Expected file content to be a string: ${value.path}`)
  }

  const encoding = parseOptionalString(value.encoding, 'encoding')

  return {
    content: value.content,
    ...(encoding === undefined ? {} : { encoding }),
    path: value.path,
  }
}

function parseOptionalString(value: unknown, fieldName: string) {
  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value !== 'string') {
    throw new Error(`Expected ${fieldName} to be a string when provided.`)
  }

  return value
}
