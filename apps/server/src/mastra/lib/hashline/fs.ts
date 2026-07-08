import * as pathModule from 'node:path'

export interface WriteResult {
  text: string
}

export abstract class Filesystem {
  abstract readText(path: string): Promise<string>
  abstract writeText(path: string, text: string): Promise<WriteResult>
}

export class InMemoryFilesystem extends Filesystem {
  private files = new Map<string, string>()

  clear(): void {
    this.files.clear()
  }

  getFile(path: string): string | undefined {
    return this.files.get(pathModule.resolve(path))
  }

  async readText(path: string): Promise<string> {
    const content = this.files.get(pathModule.resolve(path))
    if (content === undefined) throw new NotFoundError(path)
    return content
  }

  setFile(path: string, content: string): void {
    this.files.set(pathModule.resolve(path), content)
  }

  async writeText(path: string, text: string): Promise<WriteResult> {
    this.files.set(pathModule.resolve(path), text)
    return { text }
  }
}

export class NodeFilesystem extends Filesystem {
  async readText(path: string): Promise<string> {
    const fs = await import('node:fs/promises')
    try {
      return await fs.readFile(path, 'utf8')
    } catch (err: any) {
      if (err.code === 'ENOENT') throw new NotFoundError(path, err)
      throw err
    }
  }

  async writeText(path: string, text: string): Promise<WriteResult> {
    const fs = await import('node:fs/promises')
    await fs.writeFile(path, text, 'utf8')
    return { text }
  }
}

export class NotFoundError extends Error {
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
