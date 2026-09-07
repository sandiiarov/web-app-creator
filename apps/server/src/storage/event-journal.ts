import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'

import type { AtomicFileSystem } from './atomic-file.ts'
import { atomicWriteFile, syncDirectory } from './atomic-file.ts'

export interface EventJournalEntry extends Record<string, unknown> {
  dir: 'in' | 'out'
  seq: number
  ts: string
}

export interface EventJournalRead<T extends EventJournalEntry> {
  observedWatermark: number
  records: T[]
  status: 'clean' | 'durabilityUncertain' | 'incompleteTail' | 'poisoned'
  tail: null | { byteLength: number; offset: number }
  watermark: number
}

export interface EventJournalRecovery<T extends EventJournalEntry> {
  quarantinePath: null | string
  read: EventJournalRead<T>
}

export interface EventJournalSnapshot<
  T extends EventJournalEntry,
> extends EventJournalRead<T> {
  generation: number
}

type JournalInput = Record<string, unknown> & { dir: 'in' | 'out'; ts: string }

type Poison = {
  error: EventJournalRecoveryRequiredError
  kind: 'failed' | 'uncertain'
}

export class EventJournalBusyError extends Error {
  readonly retryable = true

  constructor() {
    super('Event journal changed too frequently to read a stable snapshot.')
    this.name = 'EventJournalBusyError'
  }
}

export class EventJournalCorruptionError extends Error {
  readonly filePath: string
  readonly line: number

  constructor(filePath: string, line: number, reason: string) {
    super(`Corrupt event journal ${filePath} at line ${line}: ${reason}`)
    this.filePath = filePath
    this.line = line
    this.name = 'EventJournalCorruptionError'
  }
}

export class EventJournalRecoveryRequiredError extends Error {
  readonly filePath: string

  constructor(filePath: string, options?: ErrorOptions) {
    super(
      `Event journal ${filePath} requires explicit recovery before appending.`,
      options,
    )
    this.filePath = filePath
    this.name = 'EventJournalRecoveryRequiredError'
  }
}

/** One single-process, durably flushed JSONL journal. */
export function createEventJournal<T extends EventJournalEntry>({
  filePath,
  fileSystem,
  prepare,
}: {
  filePath: string
  fileSystem: AtomicFileSystem
  prepare?: () => Promise<void>
}) {
  let chain: Promise<void> = Promise.resolve()
  let confirmedWatermark = 0
  let confirmedWatermarkKnown = false
  let generation = 0
  let initialized = false
  let initializationWaiter:
    | undefined
    | {
        promise: Promise<void>
        reject(error: unknown): void
        resolve(): void
      }
  let nextSequence = 1
  let pendingAppends = 0
  let poison: Poison | undefined
  let journalExists = false

  async function appendCommitted(entry: JournalInput): Promise<T> {
    validateAppendInput(entry)
    pendingAppends += 1
    if (!initialized && !initializationWaiter) {
      let resolve!: () => void
      let reject!: (error: unknown) => void
      const promise = new Promise<void>((accept, deny) => {
        resolve = accept
        reject = deny
      })
      void promise.catch(() => {})
      initializationWaiter = { promise, reject, resolve }
    }
    const previous = chain
    let committed!: T
    const operation = previous.then(async () => {
      if (poison) throw poison.error
      await prepare?.()
      await initializeForAppend()
      initializationWaiter?.resolve()
      if (!Number.isSafeInteger(nextSequence)) {
        throw new RangeError(`Event journal ${filePath} sequence overflow.`)
      }
      const record = { ...entry, seq: nextSequence } as T
      const line = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8')
      let wroteCompleteLine = false
      let handle: Awaited<ReturnType<AtomicFileSystem['open']>> | undefined
      try {
        handle = await fileSystem.open(filePath, 'a')
        await handle.writeFile(line)
        wroteCompleteLine = true
        await handle.sync()
        await handle.close()
        handle = undefined
        if (!journalExists) {
          await syncDirectory(fileSystem, dirname(filePath))
          journalExists = true
        }
      } catch (error) {
        await handle?.close().catch(() => {})
        const blocked = new EventJournalRecoveryRequiredError(filePath, {
          cause: error,
        })
        poison = {
          error: blocked,
          kind: wroteCompleteLine ? 'uncertain' : 'failed',
        }
        throw blocked
      }
      nextSequence += 1
      confirmedWatermark = record.seq
      confirmedWatermarkKnown = true
      generation += 1
      committed = record
    })
    chain = operation.then(
      () => undefined,
      (error) => {
        initializationWaiter?.reject(error)
        throw error
      },
    )
    void chain.catch(() => {})
    try {
      await operation
      return committed
    } finally {
      pendingAppends -= 1
      if (pendingAppends === 0) initializationWaiter = undefined
    }
  }

  function currentChain(): Promise<void> {
    return chain
  }

  function currentGeneration(): number {
    return generation
  }

  async function flush(): Promise<void> {
    await chain
    if (poison) throw poison.error
  }

  async function initializeForAppend(): Promise<void> {
    if (initialized) return
    const scanned = await scanJournal<T>(fileSystem, filePath)
    confirmedWatermark = scanned.watermark
    confirmedWatermarkKnown = true
    journalExists = scanned.exists
    if (scanned.tail) {
      poison = {
        error: new EventJournalRecoveryRequiredError(filePath),
        kind: 'failed',
      }
      throw poison.error
    }
    initialized = true
    nextSequence = scanned.watermark + 1
  }

  async function readCommitted(afterSeq = 0): Promise<EventJournalRead<T>> {
    if (!initialized && pendingAppends > 0) {
      await initializationWaiter?.promise.catch(() => {})
    }
    const scanned = await scanJournal<T>(fileSystem, filePath)
    if (!confirmedWatermarkKnown && !poison && pendingAppends === 0) {
      confirmedWatermark = scanned.watermark
      confirmedWatermarkKnown = true
      nextSequence = scanned.watermark + 1
      initialized = !scanned.tail
    }
    const watermark = confirmedWatermarkKnown
      ? Math.min(confirmedWatermark, scanned.watermark)
      : scanned.watermark
    const status = scanned.tail
      ? 'incompleteTail'
      : poison?.kind === 'uncertain'
        ? 'durabilityUncertain'
        : poison
          ? 'poisoned'
          : 'clean'
    return {
      observedWatermark: scanned.watermark,
      records: scanned.records.filter(
        (record) => record.seq > afterSeq && record.seq <= watermark,
      ),
      status,
      tail: scanned.tail
        ? {
            byteLength: scanned.tail.byteLength,
            offset: scanned.tail.offset,
          }
        : null,
      watermark,
    }
  }

  async function readSnapshot(): Promise<EventJournalSnapshot<T>> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const capturedChain = chain
      await capturedChain.catch(() => {})
      const capturedGeneration = generation
      const read = await readCommitted()
      if (capturedChain === chain && capturedGeneration === generation) {
        return { ...read, generation: capturedGeneration }
      }
    }
    throw new EventJournalBusyError()
  }

  function recoverTail(): Promise<EventJournalRecovery<T>> {
    const previous = chain
    let recovery!: EventJournalRecovery<T>
    const operation = previous
      .catch(() => {})
      .then(async () => {
        recovery = await performRecovery()
      })
    chain = operation.then(
      () => undefined,
      (error) => {
        poison = {
          error:
            error instanceof EventJournalRecoveryRequiredError
              ? error
              : new EventJournalRecoveryRequiredError(filePath, {
                  cause: error,
                }),
          kind: 'failed',
        }
        throw error
      },
    )
    void chain.catch(() => {})
    return operation.then(() => recovery)
  }

  async function performRecovery(): Promise<EventJournalRecovery<T>> {
    const scanned = await scanJournal<T>(fileSystem, filePath)
    let quarantinePath: null | string = null
    if (scanned.tail) {
      quarantinePath = `${filePath}.tail-${randomUUID()}.quarantine`
      const quarantine = await atomicWriteFile(
        fileSystem,
        quarantinePath,
        scanned.tail.bytes,
      )
      if (quarantine.state !== 'committed') {
        throw new EventJournalRecoveryRequiredError(filePath, {
          cause: quarantine.error,
        })
      }
      const replacement = await atomicWriteFile(
        fileSystem,
        filePath,
        scanned.validPrefix,
      )
      if (replacement.state !== 'committed') {
        throw new EventJournalRecoveryRequiredError(filePath, {
          cause: replacement.error,
        })
      }
    } else if (scanned.exists) {
      let handle: Awaited<ReturnType<AtomicFileSystem['open']>> | undefined
      try {
        handle = await fileSystem.open(filePath, 'r+')
        await handle.sync()
        await handle.close()
        handle = undefined
      } catch (error) {
        await handle?.close().catch(() => {})
        throw new EventJournalRecoveryRequiredError(filePath, { cause: error })
      }
      try {
        await syncDirectory(fileSystem, dirname(filePath))
      } catch (error) {
        throw new EventJournalRecoveryRequiredError(filePath, { cause: error })
      }
    }

    const recovered = await scanJournal<T>(fileSystem, filePath)
    if (recovered.tail) throw new EventJournalRecoveryRequiredError(filePath)
    confirmedWatermark = recovered.watermark
    confirmedWatermarkKnown = true
    generation += 1
    initialized = true
    journalExists = recovered.exists
    nextSequence = recovered.watermark + 1
    poison = undefined
    return {
      quarantinePath,
      read: {
        observedWatermark: recovered.watermark,
        records: recovered.records,
        status: 'clean',
        tail: null,
        watermark: recovered.watermark,
      },
    }
  }

  return {
    appendCommitted,
    currentChain,
    currentGeneration,
    flush,
    readCommitted,
    readSnapshot,
    recoverTail,
  }
}

function isJournalEnvelope(
  value: unknown,
): value is JournalInput & { seq?: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    (record.dir === 'in' || record.dir === 'out') &&
    typeof record.ts === 'string' &&
    (record.seq === undefined || Number.isSafeInteger(record.seq))
  )
}

async function scanJournal<T extends EventJournalEntry>(
  fileSystem: AtomicFileSystem,
  filePath: string,
): Promise<{
  exists: boolean
  records: T[]
  tail: null | { byteLength: number; bytes: Buffer; offset: number }
  validPrefix: Buffer
  watermark: number
}> {
  let bytes: Buffer
  try {
    const handle = await fileSystem.open(filePath, 'r')
    try {
      bytes = await handle.readFile()
    } finally {
      await handle.close()
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        exists: false,
        records: [],
        tail: null,
        validPrefix: Buffer.alloc(0),
        watermark: 0,
      }
    }
    throw error
  }

  const lastNewline = bytes.lastIndexOf(0x0a)
  const prefixLength = lastNewline === -1 ? 0 : lastNewline + 1
  const validPrefix = bytes.subarray(0, prefixLength)
  const tailBytes = bytes.subarray(prefixLength)
  const records: T[] = []
  let lastSequence = 0
  let line = 0
  let start = 0
  for (let offset = 0; offset < validPrefix.length; offset += 1) {
    if (validPrefix[offset] !== 0x0a) continue
    line += 1
    const lineBytes = validPrefix.subarray(start, offset)
    start = offset + 1
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(lineBytes)
    } catch {
      throw new EventJournalCorruptionError(filePath, line, 'invalid UTF-8')
    }
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch {
      throw new EventJournalCorruptionError(filePath, line, 'invalid JSON')
    }
    if (!isJournalEnvelope(value)) {
      throw new EventJournalCorruptionError(filePath, line, 'invalid envelope')
    }
    const sequence = value.seq ?? lastSequence + 1
    if (!Number.isSafeInteger(sequence) || sequence <= lastSequence) {
      throw new EventJournalCorruptionError(
        filePath,
        line,
        'non-monotonic sequence',
      )
    }
    lastSequence = sequence
    records.push({ ...value, seq: sequence } as T)
  }
  return {
    exists: true,
    records,
    tail:
      tailBytes.length > 0
        ? {
            byteLength: tailBytes.length,
            bytes: Buffer.from(tailBytes),
            offset: prefixLength,
          }
        : null,
    validPrefix: Buffer.from(validPrefix),
    watermark: lastSequence,
  }
}

function validateAppendInput(entry: JournalInput): void {
  if (!isJournalEnvelope(entry)) {
    throw new TypeError('Event journal append has an invalid envelope.')
  }
  try {
    const serialized = JSON.stringify({ ...entry, seq: 0 })
    if (serialized === undefined) {
      throw new TypeError('Event journal append is not serializable.')
    }
  } catch (error) {
    throw new TypeError('Event journal append is not serializable.', {
      cause: error,
    })
  }
}
