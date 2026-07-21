import type { ServerResponse } from 'node:http'

import { sendSse } from './sse.ts'

/** One active landing-agent run: its abort controller + the set of SSE responses
 *  tailing it live. In Phase 3 the only subscriber is the originating
 *  `POST /agent` response; Phase 4's `GET /api/projects/:id/events` adds
 *  reopened-tab subscribers. Process-local + ephemeral — durable run lifecycle
 *  lives in `run-state.json` (project-store); the bus is just live fan-out. */
export interface RunEntry {
  controller: AbortController
  startedAt: string
  subscribers: Set<ServerResponse>
  turnId: string
}

const runs = new Map<string, RunEntry>()

/** Fan one event out to every current subscriber (best-effort; dead sockets are
 *  swallowed by `sendSse`'s writability guard). No-op when no active run. */
export function broadcast(
  projectId: string,
  event: string,
  payload: unknown,
): void {
  const entry = runs.get(projectId)
  if (!entry) return
  for (const response of entry.subscribers) {
    sendSse(response, event, payload)
  }
}

/** Claim the run slot for a project. Returns false if a run is already active
 *  (overlap guard). The single mutation point for claim/release so the overlap
 *  check + insert is atomic on the single-threaded event loop. */
export function claimRun(projectId: string, entry: RunEntry): boolean {
  if (runs.has(projectId)) return false
  runs.set(projectId, entry)
  return true
}

export function getRun(projectId: string): RunEntry | undefined {
  return runs.get(projectId)
}

/** Release the run slot only if it still owns it (completion / graceful stop),
 *  so a later run that already claimed the same id is not accidentally freed. */
export function releaseRun(projectId: string, entry: RunEntry): void {
  if (runs.get(projectId) === entry) runs.delete(projectId)
}

/** Register a subscriber SSE response for live event tail. Returns an
 *  unsubscribe fn. No-op (returns a no-op) when no active run — callers doing
 *  catch-up must snapshot state BEFORE subscribing so the tail picks up where
 *  the snapshot left off. */
export function subscribe(
  projectId: string,
  response: ServerResponse,
): () => void {
  const entry = runs.get(projectId)
  if (!entry) return () => {}
  entry.subscribers.add(response)
  return () => {
    entry.subscribers.delete(response)
  }
}
