import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createProjectFileSystem } from '../mastra/lib/project-filesystem.ts'
import {
  atomicWriteFile,
  atomicWriteFileSync,
  type AtomicFileSystem,
} from './atomic-file.ts'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'atomic-file-test-'))
})

afterEach(async () => {
  await rm(root, { force: true, recursive: true })
})

describe('atomic file replacement', () => {
  it('flushes and replaces a canonical file asynchronously', async () => {
    const path = join(root, 'state.json')
    await writeFile(path, 'old')
    const fileSystem = createProjectFileSystem(root)

    await expect(
      atomicWriteFile(fileSystem, path, 'new', 'utf8'),
    ).resolves.toEqual({ state: 'committed' })
    await expect(readFile(path, 'utf8')).resolves.toBe('new')
    expect(await readdir(root)).toEqual(['state.json'])
  })

  it('flushes and replaces a canonical file synchronously', async () => {
    const path = join(root, 'state.json')
    await writeFile(path, 'old')
    const fileSystem = createProjectFileSystem(root)

    expect(atomicWriteFileSync(fileSystem, path, 'new', 'utf8')).toEqual({
      state: 'committed',
    })
    await expect(readFile(path, 'utf8')).resolves.toBe('new')
    expect(await readdir(root)).toEqual(['state.json'])
  })

  it('preserves canonical bytes when rename fails', async () => {
    const path = join(root, 'state.json')
    await writeFile(path, 'old')
    const base = createProjectFileSystem(root)
    const fileSystem: AtomicFileSystem = {
      ...base,
      async rename() {
        throw new Error('rename failed')
      },
    }

    await expect(
      atomicWriteFile(fileSystem, path, 'new', 'utf8'),
    ).resolves.toMatchObject({ state: 'notCommitted' })
    await expect(readFile(path, 'utf8')).resolves.toBe('old')
    expect(await readdir(root)).toEqual(['state.json'])
  })

  it('does not remove a colliding async temporary file it did not create', async () => {
    const path = join(root, 'state.json')
    await writeFile(path, 'old')
    const base = createProjectFileSystem(root)
    let collision = ''
    const fileSystem: AtomicFileSystem = {
      ...base,
      async open(target, flags) {
        if (flags === 'wx') {
          collision = target
          await writeFile(target, 'owned by another operation')
          const error = new Error('already exists') as NodeJS.ErrnoException
          error.code = 'EEXIST'
          throw error
        }
        return base.open(target, flags)
      },
    }

    await expect(
      atomicWriteFile(fileSystem, path, 'new', 'utf8'),
    ).resolves.toMatchObject({ state: 'notCommitted' })
    await expect(readFile(collision, 'utf8')).resolves.toBe(
      'owned by another operation',
    )
  })

  it('does not remove a colliding sync temporary file it did not create', async () => {
    const path = join(root, 'state.json')
    await writeFile(path, 'old')
    const base = createProjectFileSystem(root)
    let collision = ''
    const fileSystem: AtomicFileSystem = {
      ...base,
      openSync(target, flags) {
        if (flags === 'wx') {
          collision = target
          base.writeFileSync(target, 'owned by another operation', 'utf8')
          const error = new Error('already exists') as NodeJS.ErrnoException
          error.code = 'EEXIST'
          throw error
        }
        return base.openSync(target, flags)
      },
    }

    expect(atomicWriteFileSync(fileSystem, path, 'new', 'utf8')).toMatchObject({
      state: 'notCommitted',
    })
    await expect(readFile(collision, 'utf8')).resolves.toBe(
      'owned by another operation',
    )
  })

  it('reports uncertain durability when directory sync fails after rename', async () => {
    const path = join(root, 'state.json')
    await writeFile(path, 'old')
    const base = createProjectFileSystem(root)
    const fileSystem: AtomicFileSystem = {
      ...base,
      async open(target, flags) {
        const handle = await base.open(target, flags)
        if (target !== root) return handle
        return new Proxy(handle, {
          get(value, property, receiver) {
            if (property === 'sync') {
              return async () => {
                throw new Error('directory sync failed')
              }
            }
            const member = Reflect.get(value, property, receiver) as unknown
            return typeof member === 'function' ? member.bind(value) : member
          },
        })
      },
    }

    await expect(
      atomicWriteFile(fileSystem, path, 'new', 'utf8'),
    ).resolves.toMatchObject({ state: 'durabilityUncertain' })
    await expect(readFile(path, 'utf8')).resolves.toBe('new')
    expect(await readdir(root)).toEqual(['state.json'])
  })
})
