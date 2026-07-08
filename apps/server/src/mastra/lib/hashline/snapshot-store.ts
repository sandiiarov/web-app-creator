import { InMemorySnapshotStore, type SnapshotStore } from './snapshots.ts'

/**
 * Per-request snapshot store for the hashline engine. Mirrors the per-request
 * `HtmlStore` isolation (one store per live agent run); keyed internally by the
 * synthetic doc path so the model's `[path#TAG]` headers resolve.
 */
export function createSnapshotStore(): SnapshotStore {
  return new InMemorySnapshotStore()
}
