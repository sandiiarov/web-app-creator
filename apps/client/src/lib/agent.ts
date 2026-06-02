export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

export type AgentPreviewFile = {
  content: string
  encoding: 'utf8'
  path: string
}

export type AgentRequest = {
  files: AgentPreviewFile[]
  preview: {
    entrypoint: string
    rootFiles: string[]
  }
  prompt: string
  selectedElement: null | SelectedElement
  selectedJsx?: string
  version: 1
}

export type AgentResponse =
  | {
      changedFiles: AgentPreviewFile[]
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

export type ElementDescriptor = {
  className?: string
  id?: string
  rect: {
    height: number
    width: number
    x: number
    y: number
  }
  tagName: string
  text?: string
}

export type SelectedElement = {
  componentName?: string
  element: ElementDescriptor
  ownerStack: string[]
  source?: null | SourceLocation
}

export type SourceLocation = {
  columnNumber?: number
  fileName: string
  lineNumber?: number
}

export function agentResponseMessage(response: AgentResponse) {
  if (!response.ok) {
    return response.error
  }

  const changedCount = response.changedFiles.length
  const deletedCount = response.deletedPaths.length

  if (changedCount === 0 && deletedCount === 0) {
    return response.message || 'AI finished without file changes.'
  }

  const suffix = [
    changedCount > 0
      ? `${changedCount} file${changedCount === 1 ? '' : 's'} changed`
      : '',
    deletedCount > 0
      ? `${deletedCount} file${deletedCount === 1 ? '' : 's'} deleted`
      : '',
  ]
    .filter(Boolean)
    .join(', ')

  return `${response.message || 'AI finished.'} (${suffix})`
}

export function createAgentRequest({
  files,
  prompt,
  selectedElement,
}: {
  files: AgentPreviewFile[]
  prompt: string
  selectedElement: null | SelectedElement
}): AgentRequest {
  return {
    files,
    preview: {
      entrypoint: '/src/main.tsx',
      rootFiles: ['/index.html', '/package.json'],
    },
    prompt,
    selectedElement,
    version: 1,
  }
}
