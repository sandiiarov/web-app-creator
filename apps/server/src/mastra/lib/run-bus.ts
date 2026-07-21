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

/** Persistent per-project SSE subscribers (one per open editor tab's
 *  `GET /api/projects/:id/events`). Independent of the run lifecycle — survives
 *  run start/end so a tab that subscribed while the project was IDLE still
 *  receives events when a run starts later (e.g. the user sends a prompt from
 *  that same tab). `broadcast` reaches these AND the active run entry's own
 *  subscribers. */
const projectSubscribers = new Map<string, Set<ServerResponse>>()

/** SSE responses tailing the project LIST for live status badges (one per
 *  `ProjectsPage` mount). Distinct from per-project `subscribeProject` (which
 *  tails a single project's run events). */
const listSubscribers = new Set<ServerResponse>()

/** Payload of one `project_status` event on the list SSE. `status` is a
 *  `RunStatus` string; kept as `string` here so this module doesn't import from
 *  project-store (project-store imports `broadcastStatus` from here — one-way). */
export interface ProjectStatusPayload {
  projectId: string
  runStartedAt: null | string
  runTurnId: null | string
  status: string
}

/** Fan one event out to every subscriber: the active run entry's own
 *  subscribers (registered atomically w/ the claim via `startLandingAgent`'s
 *  `subscriber` param) PLUS every persistent per-project subscriber (open
 *  editor tabs). Best-effort; dead sockets are swallowed by `sendSse`'s
 *  writability guard. */
export function broadcast(
  projectId: string,
  event: string,
  payload: unknown,
): void {
  const entry = runs.get(projectId)
  if (entry) {
    for (const response of entry.subscribers) {
      sendSse(response, event, payload)
    }
  }
  const project = projectSubscribers.get(projectId)
  if (project) {
    for (const response of project) {
      sendSse(response, event, payload)
    }
  }
}

/** Fan one `project_status` event to every list subscriber. Called from
 *  `setRunStatusSync` so any status write (run claim, terminal, stop, boot
 *  reconcile) reaches all open list pages. */
export function broadcastStatus(payload: ProjectStatusPayload): void {
  for (const response of listSubscribers) {
    sendSse(response, 'project_status', payload)
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

/** Register a list SSE response for live `project_status` updates. Returns an
 *  unsubscribe fn. Caller emits the initial snapshot of statuses itself before
 *  subscribing (snapshot-then-tail). */
export function subscribeList(response: ServerResponse): () => void {
  listSubscribers.add(response)
  return () => {
    listSubscribers.delete(response)
  }
}

/** Register a PERSISTENT per-project subscriber SSE response for live event
 *  tail. Survives run start/end — so a tab subscribed while the project is idle
 *  still receives events when a run starts later. Returns an unsubscribe fn. */
export function subscribeProject(
  projectId: string,
  response: ServerResponse,
): () => void {
  let subs = projectSubscribers.get(projectId)
  if (!subs) {
    subs = new Set<ServerResponse>()
    projectSubscribers.set(projectId, subs)
  }
  subs.add(response)
  return () => {
    const current = projectSubscribers.get(projectId)
    if (!current) return
    current.delete(response)
    if (current.size === 0) projectSubscribers.delete(projectId)
  }
}
