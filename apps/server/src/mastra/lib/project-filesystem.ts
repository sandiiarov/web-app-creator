import type { Dirent } from 'node:fs'
import {
  closeSync as nodeCloseSync,
  existsSync,
  fsyncSync as nodeFsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import {
  appendFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export interface ProjectFileSystem {
  appendFile(
    path: string,
    data: string,
    encoding: BufferEncoding,
  ): Promise<void>
  closeSync(file: number): void
  existsSync(path: string): boolean
  fsyncSync(file: number): void
  mkdir(path: string, options: { recursive: true }): Promise<string | undefined>
  mkdirSync(path: string, options: { recursive: true }): string | undefined
  open(path: string, flags: string): ReturnType<typeof open>
  openSync(path: string, flags: string): number
  readdir(path: string, options: { withFileTypes: true }): Promise<Dirent[]>
  readdirSync(path: string): string[]
  readFile(path: string): Promise<Buffer>
  readFile(path: string, encoding: BufferEncoding): Promise<string>
  readFileSync(path: string): Buffer
  readFileSync(path: string, encoding: BufferEncoding): string
  rename(from: string, to: string): Promise<void>
  renameSync(from: string, to: string): void
  rm(path: string, options: RemoveOptions): Promise<void>
  rmSync(path: string, options: RemoveOptions): void
  root: string
  writeFile(
    path: string,
    data: string | Uint8Array,
    encoding?: BufferEncoding,
  ): Promise<void>
  writeFileSync(
    path: number | string,
    data: string | Uint8Array,
    encoding?: BufferEncoding,
  ): void
}

type RemoveOptions = { force?: boolean; recursive?: boolean }

/** Node filesystem adapter that refuses every path outside one runtime data root. */
export function createProjectFileSystem(root: string): ProjectFileSystem {
  if (!isAbsolute(root)) {
    throw new Error('Project filesystem root must be an absolute path.')
  }
  const ownedRoot = resolve(root)
  const ownedSyncFiles = new Set<number>()

  function assertOwned(path: string): string {
    const target = resolve(path)
    const fromRoot = relative(ownedRoot, target)
    if (
      fromRoot === '..' ||
      fromRoot.startsWith(`..${sep}`) ||
      isAbsolute(fromRoot)
    ) {
      throw new Error(
        `Project filesystem path is outside its owned root: ${target}`,
      )
    }
    return target
  }

  function assertOwnedSyncFile(file: number): number {
    if (!ownedSyncFiles.has(file)) {
      throw new Error('Project filesystem rejected an unowned file descriptor.')
    }
    return file
  }

  function readOwned(path: string): Promise<Buffer>
  function readOwned(path: string, encoding: BufferEncoding): Promise<string>
  function readOwned(
    path: string,
    encoding?: BufferEncoding,
  ): Promise<Buffer | string> {
    return encoding
      ? readFile(assertOwned(path), encoding)
      : readFile(assertOwned(path))
  }

  function readOwnedSync(path: string): Buffer
  function readOwnedSync(path: string, encoding: BufferEncoding): string
  function readOwnedSync(
    path: string,
    encoding?: BufferEncoding,
  ): Buffer | string {
    return encoding
      ? readFileSync(assertOwned(path), encoding)
      : readFileSync(assertOwned(path))
  }

  return {
    appendFile(path, data, encoding) {
      return appendFile(assertOwned(path), data, encoding)
    },
    closeSync(file) {
      try {
        nodeCloseSync(assertOwnedSyncFile(file))
      } finally {
        ownedSyncFiles.delete(file)
      }
    },
    existsSync(path) {
      return existsSync(assertOwned(path))
    },
    fsyncSync(file) {
      return nodeFsyncSync(assertOwnedSyncFile(file))
    },
    mkdir(path, options) {
      return mkdir(assertOwned(path), options)
    },
    mkdirSync(path, options) {
      return mkdirSync(assertOwned(path), options)
    },
    open(path, flags) {
      return open(assertOwned(path), flags)
    },
    openSync(path, flags) {
      const file = openSync(assertOwned(path), flags)
      ownedSyncFiles.add(file)
      return file
    },
    readdir(path, options) {
      return readdir(assertOwned(path), options)
    },
    readdirSync(path) {
      return readdirSync(assertOwned(path))
    },
    readFile: readOwned,
    readFileSync: readOwnedSync,
    rename(from, to) {
      return rename(assertOwned(from), assertOwned(to))
    },
    renameSync(from, to) {
      return renameSync(assertOwned(from), assertOwned(to))
    },
    rm(path, options) {
      return rm(assertOwned(path), options)
    },
    rmSync(path, options) {
      return rmSync(assertOwned(path), options)
    },
    root: ownedRoot,
    writeFile(path, data, encoding) {
      return writeFile(assertOwned(path), data, encoding)
    },
    writeFileSync(path, data, encoding) {
      return writeFileSync(
        typeof path === 'number'
          ? assertOwnedSyncFile(path)
          : assertOwned(path),
        data,
        encoding,
      )
    },
  }
}
