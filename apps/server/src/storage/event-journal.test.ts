import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createProjectFileSystem } from '../mastra/lib/project-filesystem.ts'
import type { AtomicFileSystem } from './atomic-file.ts'
import {
  createEventJournal,
  EventJournalCorruptionError,
  EventJournalRecoveryRequiredError,
  type EventJournalEntry,
} from './event-journal.ts'

let filePath: string
let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'event-journal-test-'))
  filePath = join(root, 'events.jsonl')
})

afterEach(async () => {
  await rm(root, { force: true, recursive: true })
})

describe('event journal', () => {
  it('validates append data and sequence capacity before opening the append file', async () => {
    const base = createProjectFileSystem(root)
    let appendOpens = 0
    const fileSystem: AtomicFileSystem = {
      ...base,
      async open(path, flags) {
        if (flags === 'a') appendOpens += 1
        return base.open(path, flags)
      },
    }
    const journal = createJournal(fileSystem)
    const cyclic: Record<string, unknown> = { dir: 'out', ts: 't0' }
    cyclic.self = cyclic

    await expect(
      journal.appendCommitted(cyclic as never),
    ).rejects.toBeInstanceOf(TypeError)
    expect(appendOpens).toBe(0)

    await writeFile(
      filePath,
      `${JSON.stringify({ dir: 'out', seq: Number.MAX_SAFE_INTEGER, ts: 't0' })}\n`,
    )
    const before = await readFile(filePath)
    await expect(
      journal.appendCommitted({ dir: 'out', ts: 't1' }),
    ).rejects.toBeInstanceOf(RangeError)
    await expect(readFile(filePath)).resolves.toEqual(before)
    expect(appendOpens).toBe(0)
  })

  it('assigns stable positions to legacy records then appends monotonic sequences', async () => {
    await writeFile(
      filePath,
      `${JSON.stringify({ dir: 'in', prompt: 'first', ts: 't0' })}\n${JSON.stringify({ dir: 'out', event: 'done', payload: {}, ts: 't1' })}\n`,
    )
    const journal = createJournal(createProjectFileSystem(root))

    await expect(journal.readCommitted()).resolves.toMatchObject({
      records: [{ seq: 1 }, { seq: 2 }],
      status: 'clean',
      watermark: 2,
    })
    await expect(
      journal.appendCommitted({ dir: 'out', event: 'text', ts: 't2' }),
    ).resolves.toMatchObject({ seq: 3 })
    await expect(journal.readCommitted(1)).resolves.toMatchObject({
      records: [{ seq: 2 }, { seq: 3 }],
      watermark: 3,
    })
  })

  it('serializes concurrent appends in call order', async () => {
    const journal = createJournal(createProjectFileSystem(root))

    const records = await Promise.all([
      journal.appendCommitted({ dir: 'out', event: 'a', ts: 'a' }),
      journal.appendCommitted({ dir: 'out', event: 'b', ts: 'b' }),
      journal.appendCommitted({ dir: 'out', event: 'c', ts: 'c' }),
    ])

    expect(records.map((record) => record.seq)).toEqual([1, 2, 3])
    expect((await journal.readCommitted()).records).toEqual(records)
  })

  it('surfaces interior JSON and UTF-8 corruption with file and line context', async () => {
    const first = Buffer.from(
      `${JSON.stringify({ dir: 'in', prompt: 'ok', ts: 't0' })}\n`,
    )
    await writeFile(filePath, Buffer.concat([first, Buffer.from('{bad}\n')]))
    const journal = createJournal(createProjectFileSystem(root))

    await expect(journal.readCommitted()).rejects.toMatchObject({
      filePath,
      line: 2,
    } satisfies Partial<EventJournalCorruptionError>)

    await writeFile(
      filePath,
      Buffer.concat([first, Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x7d, 0x0a])]),
    )
    await expect(journal.readCommitted()).rejects.toMatchObject({
      filePath,
      line: 2,
    } satisfies Partial<EventJournalCorruptionError>)
  })

  it('reports an incomplete multibyte tail without mutating it, then quarantines exact bytes on explicit recovery', async () => {
    const prefix = Buffer.from(
      `${JSON.stringify({ dir: 'in', prompt: 'ok', ts: 't0' })}\n`,
    )
    const emojiPrefix = Buffer.from('🙂').subarray(0, 2)
    const tail = Buffer.concat([
      Buffer.from('{"dir":"out","ts":"t1","x":"'),
      emojiPrefix,
    ])
    const damaged = Buffer.concat([prefix, tail])
    await writeFile(filePath, damaged)
    const journal = createJournal(createProjectFileSystem(root))

    await expect(journal.readCommitted()).resolves.toMatchObject({
      records: [{ seq: 1 }],
      status: 'incompleteTail',
      tail: { byteLength: tail.length, offset: prefix.length },
      watermark: 1,
    })
    const damagedRead = await journal.readCommitted()
    expect(Object.keys(damagedRead.tail ?? {}).sort()).toEqual([
      'byteLength',
      'offset',
    ])
    await expect(
      journal.appendCommitted({ dir: 'out', event: 'blocked', ts: 't2' }),
    ).rejects.toBeInstanceOf(EventJournalRecoveryRequiredError)
    await expect(readFile(filePath)).resolves.toEqual(damaged)

    const recovery = await journal.recoverTail()
    expect(recovery.quarantinePath).not.toBeNull()
    await expect(readFile(recovery.quarantinePath!)).resolves.toEqual(tail)
    await expect(readFile(filePath)).resolves.toEqual(prefix)
    await expect(
      journal.appendCommitted({ dir: 'out', event: 'next', ts: 't2' }),
    ).resolves.toMatchObject({ seq: 2 })
  })

  it('poisons queued appends after a partial write and keeps later calls off disk', async () => {
    const base = createProjectFileSystem(root)
    let appendOpens = 0
    const fileSystem: AtomicFileSystem = {
      ...base,
      async open(path, flags) {
        const handle = await base.open(path, flags)
        if (flags !== 'a') return handle
        appendOpens += 1
        return proxyHandle(handle, {
          async writeFile(data) {
            const bytes = Buffer.isBuffer(data)
              ? data
              : Buffer.from(String(data))
            await handle.writeFile(
              bytes.subarray(0, Math.max(1, bytes.length - 3)),
            )
            throw new Error('partial append')
          },
        })
      },
    }
    const journal = createJournal(fileSystem)

    const first = journal.appendCommitted({ dir: 'out', event: 'a', ts: 'a' })
    const second = journal.appendCommitted({ dir: 'out', event: 'b', ts: 'b' })
    await expect(first).rejects.toBeInstanceOf(
      EventJournalRecoveryRequiredError,
    )
    await expect(second).rejects.toBeInstanceOf(
      EventJournalRecoveryRequiredError,
    )
    const damaged = await readFile(filePath)
    await expect(
      journal.appendCommitted({ dir: 'out', event: 'c', ts: 'c' }),
    ).rejects.toBeInstanceOf(EventJournalRecoveryRequiredError)
    await expect(journal.flush()).rejects.toBeInstanceOf(
      EventJournalRecoveryRequiredError,
    )
    await expect(readFile(filePath)).resolves.toEqual(damaged)
    expect(appendOpens).toBe(1)
  })

  it('does not confirm or reuse a complete line after its flush fails', async () => {
    const base = createProjectFileSystem(root)
    let failNextAppendSync = false
    const fileSystem: AtomicFileSystem = {
      ...base,
      async open(path, flags) {
        const handle = await base.open(path, flags)
        if (flags !== 'a') return handle
        return proxyHandle(handle, {
          async sync() {
            if (failNextAppendSync) {
              failNextAppendSync = false
              throw new Error('flush failed')
            }
            await handle.sync()
          },
        })
      },
    }
    const journal = createJournal(fileSystem)
    await expect(
      journal.appendCommitted({ dir: 'out', event: 'first', ts: 't1' }),
    ).resolves.toMatchObject({ seq: 1 })
    failNextAppendSync = true

    await expect(
      journal.appendCommitted({ dir: 'out', event: 'uncertain', ts: 't2' }),
    ).rejects.toBeInstanceOf(EventJournalRecoveryRequiredError)
    await expect(journal.readCommitted()).resolves.toMatchObject({
      observedWatermark: 2,
      records: [{ seq: 1 }],
      status: 'durabilityUncertain',
      watermark: 1,
    })
    await expect(journal.readSnapshot()).resolves.toMatchObject({
      observedWatermark: 2,
      status: 'durabilityUncertain',
      watermark: 1,
    })

    await expect(journal.recoverTail()).resolves.toMatchObject({
      quarantinePath: null,
      read: { watermark: 2 },
    })
    await expect(
      journal.appendCommitted({ dir: 'out', event: 'third', ts: 't3' }),
    ).resolves.toMatchObject({ seq: 3 })
  })

  it('does not expose append bytes before their flush commits', async () => {
    const base = createProjectFileSystem(root)
    const syncEntered = deferred<void>()
    const releaseSync = deferred<void>()
    let pauseNextSync = false
    const fileSystem: AtomicFileSystem = {
      ...base,
      async open(path, flags) {
        const handle = await base.open(path, flags)
        if (flags !== 'a') return handle
        return proxyHandle(handle, {
          async sync() {
            if (pauseNextSync) {
              pauseNextSync = false
              syncEntered.resolve()
              await releaseSync.promise
            }
            await handle.sync()
          },
        })
      },
    }
    const journal = createJournal(fileSystem)
    await journal.appendCommitted({ dir: 'out', event: 'first', ts: 't1' })
    pauseNextSync = true

    const pending = journal.appendCommitted({
      dir: 'out',
      event: 'pending',
      ts: 't2',
    })
    await syncEntered.promise
    await expect(journal.readCommitted()).resolves.toMatchObject({
      observedWatermark: 2,
      records: [{ seq: 1 }],
      watermark: 1,
    })
    releaseSync.resolve()
    await expect(pending).resolves.toMatchObject({ seq: 2 })
  })

  it('treats a first-entry directory sync failure as an uncertain commit', async () => {
    const base = createProjectFileSystem(root)
    let failDirectorySync = true
    const directoryHandles = new WeakSet<object>()
    const fileSystem: AtomicFileSystem = {
      ...base,
      async open(path, flags) {
        const handle = await base.open(path, flags)
        if (path === root) directoryHandles.add(handle)
        return proxyHandle(handle, {
          async sync() {
            if (directoryHandles.has(handle) && failDirectorySync) {
              failDirectorySync = false
              throw new Error('directory sync failed')
            }
            await handle.sync()
          },
        })
      },
    }
    const journal = createJournal(fileSystem)

    await expect(
      journal.appendCommitted({ dir: 'out', event: 'first', ts: 't1' }),
    ).rejects.toBeInstanceOf(EventJournalRecoveryRequiredError)
    await expect(journal.readCommitted()).resolves.toMatchObject({
      observedWatermark: 1,
      records: [],
      status: 'durabilityUncertain',
      watermark: 0,
    })
    await expect(journal.recoverTail()).resolves.toMatchObject({
      read: { records: [{ seq: 1 }], watermark: 1 },
    })
  })

  it('serializes explicit recovery callers and appends admitted during recovery', async () => {
    const prefix = Buffer.from(
      `${JSON.stringify({ dir: 'in', prompt: 'ok', ts: 't0' })}\n`,
    )
    await writeFile(filePath, Buffer.concat([prefix, Buffer.from('{"dir":')]))
    const base = createProjectFileSystem(root)
    const renameEntered = deferred<void>()
    const releaseRename = deferred<void>()
    let pauseReplacement = true
    let appendOpens = 0
    const fileSystem: AtomicFileSystem = {
      ...base,
      async open(path, flags) {
        if (flags === 'a') appendOpens += 1
        return base.open(path, flags)
      },
      async rename(from, to) {
        if (to === filePath && pauseReplacement) {
          pauseReplacement = false
          renameEntered.resolve()
          await releaseRename.promise
        }
        await base.rename(from, to)
      },
    }
    const journal = createJournal(fileSystem)
    await expect(
      journal.appendCommitted({ dir: 'out', event: 'blocked', ts: 't1' }),
    ).rejects.toBeInstanceOf(EventJournalRecoveryRequiredError)

    const firstRecovery = journal.recoverTail()
    await renameEntered.promise
    const secondRecovery = journal.recoverTail()
    const appended = journal.appendCommitted({
      dir: 'out',
      event: 'after-recovery',
      ts: 't2',
    })
    await Promise.resolve()
    expect(appendOpens).toBe(0)

    releaseRename.resolve()
    await expect(firstRecovery).resolves.toMatchObject({
      read: { watermark: 1 },
    })
    await expect(secondRecovery).resolves.toMatchObject({
      read: { watermark: 1 },
    })
    await expect(appended).resolves.toMatchObject({ seq: 2 })
    await expect(journal.readCommitted()).resolves.toMatchObject({
      records: [{ seq: 1 }, { seq: 2 }],
      watermark: 2,
    })
    expect(appendOpens).toBe(1)
  })
})

function createJournal(fileSystem: AtomicFileSystem) {
  return createEventJournal<EventJournalEntry>({ filePath, fileSystem })
}

function deferred<T>() {
  let reject!: (error: unknown) => void
  let resolve!: (value: PromiseLike<T> | T) => void
  const promise = new Promise<T>((accept, deny) => {
    resolve = accept
    reject = deny
  })
  return { promise, reject, resolve }
}

function proxyHandle(
  handle: Awaited<ReturnType<AtomicFileSystem['open']>>,
  overrides: Partial<Awaited<ReturnType<AtomicFileSystem['open']>>>,
) {
  return new Proxy(handle, {
    get(value, property) {
      const member =
        property in overrides
          ? Reflect.get(overrides, property)
          : Reflect.get(value, property)
      return typeof member === 'function' ? member.bind(value) : member
    },
  })
}
