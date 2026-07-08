import { isAbsolute, resolve } from 'node:path'

export const DEFAULT_MAX_LINES = 400
export const DEFAULT_MAX_BYTES = 32 * 1024

/** Resolve a model-provided path against the working directory. */
export function resolvePath(path: string, cwd: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path)
}

/** Split text into lines (LF-normalized). */
export function splitLines(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const parts = normalized.split('\n')
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop()
  return parts
}
