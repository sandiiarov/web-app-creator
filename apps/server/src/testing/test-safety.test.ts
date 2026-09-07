import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import { readFile, rm } from 'node:fs/promises'
import http from 'node:http'
import { syncBuiltinESMExports } from 'node:module'
import net from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { allowNetworkOrigin } from './deny-network.ts'
import type { RuntimeFixture } from './runtime-fixture.ts'

let fixture: RuntimeFixture | undefined

afterEach(async () => {
  await fixture?.dispose()
  fixture = undefined
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  syncBuiltinESMExports()
})

describe('server test safety', () => {
  it('denies fetch, Node HTTP, and TCP unless a fixture registers its exact port', async () => {
    await expect(fetch('https://provider.invalid/path')).rejects.toThrow(
      'Unexpected network request',
    )
    await expect(fetch('http://127.0.0.1:9/path')).rejects.toThrow(
      'Unexpected network request',
    )
    expect(() => http.request('http://provider.invalid/path')).toThrow(
      'Unexpected network request',
    )
    expect(() => net.connect({ host: '127.0.0.1', port: 9 })).toThrow(
      'Unexpected TCP connection',
    )
    expect(() =>
      new net.Socket().connect({ host: '127.0.0.1', port: 9 }),
    ).toThrow('Unexpected TCP connection')

    vi.stubEnv('RUN_FIRECRAWL_SMOKE', '1')
    await expect(fetch('https://provider.invalid/path')).rejects.toThrow(
      'Unexpected network request',
    )
  })

  it('allows a direct Socket connection only to a registered fixture port', async () => {
    const server = net.createServer((socket) => socket.end())
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once('error', rejectListen)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', rejectListen)
        resolveListen()
      })
    })
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('fixture server did not expose a TCP address')
    }
    const disallow = allowNetworkOrigin(`http://127.0.0.1:${address.port}`)
    try {
      await expect(
        new Promise<void>((resolveConnect, rejectConnect) => {
          const socket = new net.Socket()
          socket.once('error', rejectConnect)
          socket.connect({ host: '127.0.0.1', port: address.port }, () => {
            socket.destroy()
            resolveConnect()
          })
        }),
      ).resolves.toBeUndefined()
    } finally {
      disallow()
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) rejectClose(error)
          else resolveClose()
        })
      })
    }
  })

  it('imports fresh factory modules behind filesystem mutation guards', async () => {
    const mutation = vi.fn<() => never>(() => {
      throw new Error('filesystem mutation denied during factory import')
    })
    vi.spyOn(fs, 'appendFileSync').mockImplementation(mutation)
    vi.spyOn(fs, 'createWriteStream').mockImplementation(mutation as never)
    vi.spyOn(fs, 'mkdirSync').mockImplementation(mutation)
    vi.spyOn(fs, 'rmSync').mockImplementation(mutation)
    vi.spyOn(fs, 'writeFileSync').mockImplementation(mutation)
    vi.spyOn(fsPromises, 'appendFile').mockImplementation(async () =>
      mutation(),
    )
    vi.spyOn(fsPromises, 'mkdir').mockImplementation(async () => mutation())
    vi.spyOn(fsPromises, 'rm').mockImplementation(async () => mutation())
    vi.spyOn(fsPromises, 'writeFile').mockImplementation(async () => mutation())
    const writeFlags = (flags: number | string) =>
      typeof flags === 'number'
        ? (flags &
            (fs.constants.O_WRONLY |
              fs.constants.O_RDWR |
              fs.constants.O_CREAT |
              fs.constants.O_TRUNC |
              fs.constants.O_APPEND)) !==
          0
        : !['r', 'rs'].includes(flags)
    const originalOpenSync = fs.openSync
    vi.spyOn(fs, 'openSync').mockImplementation(((
      path: fs.PathLike,
      flags: number | string,
      ...rest: unknown[]
    ) => {
      if (writeFlags(flags)) return mutation()
      return Reflect.apply(originalOpenSync, fs, [path, flags, ...rest])
    }) as typeof fs.openSync)
    const originalOpen = fsPromises.open
    vi.spyOn(fsPromises, 'open').mockImplementation(((
      path: fs.PathLike,
      flags: number | string,
      ...rest: unknown[]
    ) => {
      if (writeFlags(flags)) return mutation()
      return Reflect.apply(originalOpen, fsPromises, [path, flags, ...rest])
    }) as typeof fsPromises.open)
    syncBuiltinESMExports()
    vi.resetModules()

    await import('../runtime.ts')
    await import('../mastra/create-mastra-runtime.ts')
    await import('../index.ts')
    expect(mutation).not.toHaveBeenCalled()
    expect(() =>
      fs.writeFileSync('/tmp/deliberate-safety-probe', 'blocked'),
    ).toThrow('filesystem mutation denied')
    expect(mutation).toHaveBeenCalledOnce()
  })

  it('keeps repository and database destinations beneath its temporary root', async () => {
    const { createRuntimeFixture } = await import('./runtime-fixture.ts')
    fixture = await createRuntimeFixture()
    const ownedPrefix = `${resolve(fixture.root)}/`
    expect(fixture.dataDir.startsWith(ownedPrefix)).toBe(true)
    expect(fixture.runtime.repository.projectsDir.startsWith(ownedPrefix)).toBe(
      true,
    )
    expect(fileURLToPath(fixture.memoryStoreUrl).startsWith(ownedPrefix)).toBe(
      true,
    )
    expect(fixture.observabilityStorePath.startsWith(ownedPrefix)).toBe(true)

    const project = await fixture.runtime.repository.createProject({
      title: 'Owned write',
    })
    const metadata = join(
      fixture.dataDir,
      'projects',
      project.id,
      'project.json',
    )
    expect(JSON.parse(await readFile(metadata, 'utf8'))).toMatchObject({
      id: project.id,
    })
  })

  it('rejects parent, sibling, and prefix-similar paths through the repository adapter', async () => {
    const { createRuntimeFixture } = await import('./runtime-fixture.ts')
    fixture = await createRuntimeFixture()
    const siblingRoot = `${fixture.dataDir}-other`
    const attempts = [
      join(dirname(fixture.dataDir), 'parent-file'),
      join(dirname(fixture.dataDir), 'sibling', 'file'),
      join(siblingRoot, 'file'),
    ]
    for (const path of attempts) {
      expect(() => fixture!.fileSystem.writeFile(path, 'blocked')).toThrow(
        'outside its owned root',
      )
    }
    await rm(siblingRoot, { force: true, recursive: true })
  })

  it('rejects file descriptors opened outside the repository adapter', async () => {
    const { createRuntimeFixture } = await import('./runtime-fixture.ts')
    fixture = await createRuntimeFixture()
    const outside = join(dirname(fixture.dataDir), 'outside-descriptor')
    const file = fs.openSync(outside, 'w')
    try {
      expect(() => fixture!.fileSystem.writeFileSync(file, 'blocked')).toThrow(
        'unowned file descriptor',
      )
      expect(() => fixture!.fileSystem.fsyncSync(file)).toThrow(
        'unowned file descriptor',
      )
      expect(() => fixture!.fileSystem.closeSync(file)).toThrow(
        'unowned file descriptor',
      )
    } finally {
      fs.closeSync(file)
      await rm(outside, { force: true })
    }
  })
})
