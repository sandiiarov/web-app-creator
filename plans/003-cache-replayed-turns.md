# Plan 003: Cache the replayed client log in getProject (avoid O(n) replay per request)

> **Executor instructions**: Follow step by step; run each verification. On a "STOP conditions" event, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 87e1666b..HEAD -- apps/server/src/mastra/lib/project-store.ts`. On a mismatch with "Current state", STOP.

## Status
- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `87e1666b`, 2026-07-07

## Why this matters
Every `getProject(id)` call does `replayClientMessages(await readClientMessages(id))` — it reads the entire `client-messages.jsonl`, JSON.parses every line, and reduces them into `ProjectMessageTurn[]`. This is O(events) per call. `getProject` runs on project load and can be called repeatedly during a session; for long, many-turn projects (thousands of events) this re-reads/re-parses/re-reduces the whole history each time. It is not a hot bug today (typical projects are small and a model call dwarfs it), but it scales poorly and is pure waste on repeat calls within one server process. A small in-memory cache, invalidated whenever the client log is appended to, removes the repeated work.

## Current state
- `apps/server/src/mastra/lib/project-store.ts`:
  - `getProject(id)` (line ~296): `const replayed = replayClientMessages(await readClientMessages(id)); const messages = replayed.length > 0 ? replayed : await readMessages(id)`.
  - All writes to `client-messages.jsonl` go through `appendClientMessage(id, entry)` (line ~455), which routes through `chainProjectWrite` (the per-project serialized write chain). `appendAgentMessages` and `appendVisionMessage` write to *different* files and do NOT change the client log.
  - `flushProjectLogs(id)` (line ~478) awaits the per-project chain.
- Convention: the per-project write chain (`projectWriteChains`) is already a module-level `Map`. A turn cache fits the same pattern.

## Commands you will need
| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm --filter @workspace/server typecheck` | exit 0 |
| Tests | `pnpm --filter @workspace/server test -- --run` | all pass |
| Lint | `pnpm --filter @workspace/server lint` | exit 0 |

## Scope
**In scope**:
- `apps/server/src/mastra/lib/project-store.ts` — add a replay cache + invalidation in `appendClientMessage`.
- `apps/server/src/mastra/lib/project-store.test.ts` — add a cache test.

**Out of scope**:
- `getProject`'s return shape (unchanged).
- `replayClientMessages` logic (unchanged).
- `readClientMessages` (still used on cache miss).

## Git workflow
- Branch: `advisor/003-cache-replay`
- Commit: `perf(server): cache replayed client messages in getProject`.

## Steps

### Step 1: Add a per-project replay cache
Near `projectWriteChains`, add:
```ts
const turnCache = new Map<string, ProjectMessageTurn[]>()

function invalidateTurnCache(id: string): void {
  turnCache.delete(id)
}
```
(perfectionist ordering — run `lint:fix`.)

### Step 2: Use the cache in `getProject`
Change the messages line to:
```ts
let messages = turnCache.get(id)
if (!messages) {
  const replayed = replayClientMessages(await readClientMessages(id))
  messages = replayed.length > 0 ? replayed : await readMessages(id)
  turnCache.set(id, messages)
}
```
Keep `const` for `messages` (reassign via `let`). Do NOT cache the legacy `readMessages` fallback separately — the cached value already reflects whichever branch produced it; invalidation (step 3) clears it on any new client-log write, and legacy projects don't write the client log so they won't be invalidated spuriously (they also won't change).

**Verify**: `pnpm --filter @workspace/server typecheck` → exit 0.

### Step 3: Invalidate on client-log writes
In `appendClientMessage`, call `invalidateTurnCache(id)` (synchronously, before/after the chain write — synchronous delete is fine). Do NOT add it to `appendAgentMessages`/`appendVisionMessage` (they don't change the client log).

**Verify**: `grep -n "invalidateTurnCache" apps/server/src/mastra/lib/project-store.ts` → 1 in `appendClientMessage` + the def + the call.

### Step 4: Test
In `project-store.test.ts`: create a project, append a client prompt+text event, `getProject` → assert 1 turn / expected part. Append another text event, `getProject` again → assert the NEW part appears (proves invalidation). Without invalidation the second get would return stale cached turns.

**Verify**: `pnpm --filter @workspace/server test -- --run project-store` → all pass incl. new test.

## Test plan
- New test: "getProject reflects new client-messages appends (cache invalidates)". Append → get → append → get; assert the second get sees the second event.
- Pattern: existing `appendClientMessage`/`getProject` tests in the same file.

## Done criteria
- [ ] `pnpm --filter @workspace/server typecheck` exits 0.
- [ ] `pnpm --filter @workspace/server test -- --run` all pass, incl. 1 new test.
- [ ] `pnpm --filter @workspace/server lint` exits 0.
- [ ] Only the 2 in-scope files modified.

## STOP conditions
- `getProject` or `appendClientMessage` don't match "Current state" (drift) — STOP.
- If invalidation must also cover the legacy `messages.json` path (e.g. a test pre-seeds `messages.json` via `appendProjectMessageTurn` and expects a later `getProject` to see it) — the legacy append path does NOT invalidate the cache. If such a test fails, STOP and add invalidation to `appendProjectMessageTurn`/`saveProjectMessageTurn` too, rather than weakening the cache.

## Maintenance notes
- The cache is process-local; on server restart it's cold (fine). It grows with distinct projects opened in a session — bounded by usage; if that ever matters, cap it (LRU).
- Reviewer: the correctness hinge is step 3 — every mutation of `client-messages.jsonl` must invalidate. Confirm no other code writes that file outside `appendClientMessage` (grep `CLIENT_MESSAGES_JSONL`).
