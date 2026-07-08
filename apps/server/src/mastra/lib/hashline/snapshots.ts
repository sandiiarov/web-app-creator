import { LRUCache } from 'lru-cache/raw'

import { computeFileHash } from './format.ts'

export interface Snapshot {
  readonly hash: string
  readonly path: string
  recordedAt: number
  seenLines?: Set<number>
  readonly text: string
}

export abstract class SnapshotStore {
  abstract byHash(path: string, hash: string): null | Snapshot
  abstract clear(): void
  abstract head(path: string): null | Snapshot
  abstract invalidate(path: string): void
  abstract record(
    path: string,
    fullText: string,
    seenLines?: Iterable<number>,
  ): Promise<string>
  abstract recordSeenLines(
    path: string,
    hash: string,
    lines: Iterable<number>,
  ): void
  /** All recorded snapshots for `path` in record order (oldest first). */
  abstract versions(path: string): readonly Snapshot[]
}

export class InMemorySnapshotStore extends SnapshotStore {
  private cache: LRUCache<string, Snapshot[]>

  private maxVersionsPerPath: number

  constructor(maxPaths = 100, maxVersionsPerPath = 10) {
    super()
    this.cache = new LRUCache<string, Snapshot[]>({
      dispose: () => {},
      max: maxPaths,
    })
    this.maxVersionsPerPath = maxVersionsPerPath
  }

  byHash(path: string, hash: string): null | Snapshot {
    const versions = this.cache.get(path)
    if (!versions) return null
    return versions.find((v) => v.hash === hash) ?? null
  }

  clear(): void {
    this.cache.clear()
  }
  head(path: string): null | Snapshot {
    const versions = this.cache.get(path)
    if (!versions || versions.length === 0) return null
    return versions[versions.length - 1] ?? null
  }

  invalidate(path: string): void {
    this.cache.delete(path)
  }

  async record(
    path: string,
    fullText: string,
    seenLines?: Iterable<number>,
  ): Promise<string> {
    const hash = await computeFileHash(fullText)
    const existing = this.byHash(path, hash)
    if (existing) {
      if (seenLines) {
        existing.seenLines ??= new Set()
        for (const line of seenLines) existing.seenLines.add(line)
      }
      return hash
    }
    const snapshot: Snapshot = {
      hash,
      path,
      recordedAt: Date.now(),
      seenLines: seenLines ? new Set(seenLines) : undefined,
      text: fullText,
    }
    let versions = this.cache.get(path)
    if (!versions) {
      versions = []
      this.cache.set(path, versions)
    }
    versions.push(snapshot)
    if (versions.length > this.maxVersionsPerPath) versions.shift()
    return hash
  }

  recordSeenLines(path: string, hash: string, lines: Iterable<number>): void {
    const snap = this.byHash(path, hash)
    if (!snap) return
    snap.seenLines ??= new Set()
    for (const line of lines) snap.seenLines.add(line)
  }

  versions(path: string): readonly Snapshot[] {
    const versions = this.cache.get(path)
    return versions ? [...versions] : []
  }
}
