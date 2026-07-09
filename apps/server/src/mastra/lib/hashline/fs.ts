export interface WriteResult {
  text: string
}

export abstract class Filesystem {
  abstract readText(path: string): Promise<string>
  abstract writeText(path: string, text: string): Promise<WriteResult>
}

class NotFoundError extends Error {
  readonly code = 'ENOENT'
  constructor(path: string, cause?: unknown) {
    super(`File not found: ${path}`)
    this.name = 'NotFoundError'
    if (cause !== undefined) (this as Error & { cause?: unknown }).cause = cause
  }
}

export function isNotFound(error: unknown): boolean {
  if (error instanceof NotFoundError) return true
  if (
    error instanceof Error &&
    (error as Error & { code?: string }).code === 'ENOENT'
  )
    return true
  return false
}
