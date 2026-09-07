import { randomUUID } from 'node:crypto'
import type { FileHandle } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

export interface AtomicFileSystem {
  closeSync(file: number): void
  fsyncSync(file: number): void
  open(path: string, flags: string): Promise<FileHandle>
  openSync(path: string, flags: string): number
  rename(from: string, to: string): Promise<void>
  renameSync(from: string, to: string): void
  rm(path: string, options: { force: true }): Promise<void>
  rmSync(path: string, options: { force: true }): void
  writeFileSync(
    path: number | string,
    data: string | Uint8Array,
    encoding?: BufferEncoding,
  ): void
}

export type AtomicWriteResult =
  | { error: unknown; state: 'durabilityUncertain' }
  | { error: unknown; state: 'notCommitted' }
  | { state: 'committed' }

/** Replace one canonical file through a flushed same-directory temporary file. */
export async function atomicWriteFile(
  fileSystem: AtomicFileSystem,
  path: string,
  data: string | Uint8Array,
  encoding?: BufferEncoding,
): Promise<AtomicWriteResult> {
  const directory = dirname(path)
  const temporary = temporaryPath(path)
  let committed = false
  let createdTemporary = false
  let handle: FileHandle | undefined
  try {
    handle = await fileSystem.open(temporary, 'wx')
    createdTemporary = true
    await handle.writeFile(data, encoding)
    await handle.sync()
    await handle.close()
    handle = undefined
    await fileSystem.rename(temporary, path)
    committed = true
    await syncDirectory(fileSystem, directory)
    return { state: 'committed' }
  } catch (error) {
    if (handle) await handle.close().catch(() => {})
    if (createdTemporary && !committed) {
      await fileSystem.rm(temporary, { force: true }).catch(() => {})
    }
    return committed
      ? { error, state: 'durabilityUncertain' }
      : { error, state: 'notCommitted' }
  }
}

/** Synchronous equivalent used by the synchronous agent HTML store. */
export function atomicWriteFileSync(
  fileSystem: AtomicFileSystem,
  path: string,
  data: string | Uint8Array,
  encoding?: BufferEncoding,
): AtomicWriteResult {
  const directory = dirname(path)
  const temporary = temporaryPath(path)
  let committed = false
  let createdTemporary = false
  let file: number | undefined
  try {
    file = fileSystem.openSync(temporary, 'wx')
    createdTemporary = true
    fileSystem.writeFileSync(file, data, encoding)
    fileSystem.fsyncSync(file)
    fileSystem.closeSync(file)
    file = undefined
    fileSystem.renameSync(temporary, path)
    committed = true
    syncDirectorySync(fileSystem, directory)
    return { state: 'committed' }
  } catch (error) {
    if (file !== undefined) {
      try {
        fileSystem.closeSync(file)
      } catch {
        // Preserve the operation failure as the authoritative result.
      }
    }
    if (createdTemporary && !committed) {
      try {
        fileSystem.rmSync(temporary, { force: true })
      } catch {
        // Preserve the operation failure as the authoritative result.
      }
    }
    return committed
      ? { error, state: 'durabilityUncertain' }
      : { error, state: 'notCommitted' }
  }
}

export async function syncDirectory(
  fileSystem: AtomicFileSystem,
  directory: string,
): Promise<void> {
  let handle: FileHandle | undefined
  try {
    handle = await fileSystem.open(directory, 'r')
    await handle.sync()
  } catch (error) {
    if (!isUnsupportedDirectorySync(error)) throw error
  } finally {
    await handle?.close()
  }
}

export function syncDirectorySync(
  fileSystem: AtomicFileSystem,
  directory: string,
): void {
  let file: number | undefined
  try {
    file = fileSystem.openSync(directory, 'r')
    fileSystem.fsyncSync(file)
  } catch (error) {
    if (!isUnsupportedDirectorySync(error)) throw error
  } finally {
    if (file !== undefined) fileSystem.closeSync(file)
  }
}

function isUnsupportedDirectorySync(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'EINVAL' || code === 'EISDIR' || code === 'ENOTSUP'
}

function temporaryPath(path: string): string {
  return join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`)
}
