# Plan 006: Extract the shared client-event → turns reducer (kill server/client drift)

> **Executor instructions**: Follow step by step; run each verification. On a "STOP conditions" event, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 87e1666b..HEAD -- apps/server/src/mastra/lib/project-store.ts apps/client/src/hooks/use-landing-page.ts packages/prompt-panel/src/domain.ts pnpm-workspace.yaml`. On a mismatch with "Current state", STOP.

## Status
- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `87e1666b`, 2026-07-07

## Why this matters
The same event→turns reduction exists twice: `replayClientMessages` in `apps/server/src/mastra/lib/project-store.ts` (used to hydrate `getProject` on reload) and the inline `switch` in `apps/client/src/hooks/use-landing-page.ts` (used to render the live SSE stream). They must produce identical output or a reload renders differently from the live run. Two copies will drift. Extracting one pure reducer into a shared package both consume removes the duplicate and makes drift impossible. The server's `replayClientMessages` is the reference implementation — it already handles text/thinking merging, tool_call upsert/drop, stats, error, done/terminalize — move it, don't rewrite it.

## Current state
- `apps/server/src/mastra/lib/project-store.ts`:
  - `replayClientMessages(entries: ClientMessageEntry[]): ProjectMessageTurn[]` (line ~548) + helpers `appendDelta` and `terminalizeTools`. This is the reference impl.
  - Types: `ProjectMessageTurn`, `ProjectMessagePart` (+ stats/text/thinking/tool_call variants), `ClientMessageEntry`.
- `apps/client/src/hooks/use-landing-page.ts`: an inline `switch (event)` over `done/error/html_update/retry/screenshot_request/stats/text/thinking/tool_call/tool_call_drop` (lines ~190–360) that mutates React state via `patchTurn`/`appendPart`. The pure transformation core (how one event changes a turns array) is what duplicates the server.
- `packages/prompt-panel/src/domain.ts`: owns the client-side mirror types — `LandingTurn`, `TurnPart` (structurally identical to `ProjectMessageTurn`/`ProjectMessagePart`).
- `pnpm-workspace.yaml`: workspace `packages/*` and `apps/*`; deps use the `catalog:` (catalogMode strict). A new package needs a `package.json` with `name: "@workspace/conversation"`, `"type": "module"`, and `tsc`/oxlint/oxfmt config matching siblings (copy `packages/typescript-config` etc. usage from e.g. `packages/prompt-panel/package.json`).
- The event payload shapes are defined by the server's `emit()` calls (`RecordedToolPayload`, `RecordedStatsPayload`, etc. in `route.ts`) — the reducer must accept those exact shapes.

## Commands you will need
| Purpose | Command | Expected on success |
|---|---|---|
| Install (new package) | `pnpm install` | exit 0; workspace links `@workspace/conversation` |
| Typecheck (all) | `pnpm run typecheck` | exit 0 across all packages |
| Tests (all) | `pnpm run test` | all pass |
| Lint (all) | `pnpm run lint` | exit 0 |
| Format | `pnpm run format:check` | exit 0 |

## Scope
**In scope**:
- `packages/conversation/` — NEW package: shared `Turn`/`Part` types + the pure reducer.
- `pnpm-workspace.yaml` — already globs `packages/*` (confirm; no change expected).
- `apps/server/src/mastra/lib/project-store.ts` — re-export shared types; replace local reducer with the shared one.
- `apps/client/src/hooks/use-landing-page.ts` — use the shared reducer for live streaming.
- `packages/prompt-panel/src/domain.ts` — re-export shared `Turn`/`Part` (keep `LandingTurn` alias for back-comat).

**Out of scope**:
- The SSE wire format (`emit` payloads in `route.ts`) — unchanged.
- React state plumbing in the hook (`patchTurn`/`appendPart`/`setTurns`) — keep; only the per-event transform is shared.

## Git workflow
- Branch: `advisor/006-shared-reducer`
- Commits (per logical unit): `feat(conversation): add shared event→turns reducer`; `refactor(server): use shared reducer for hydration`; `refactor(client): use shared reducer for live stream`.

## Steps

### Step 1: Create the `@workspace/conversation` package
Create `packages/conversation/package.json` (copy the structure of `packages/prompt-panel/package.json`: `name: "@workspace/conversation"`, `"type": "module"`, `"main"/"types"` pointing to `src/index.ts`, devDeps `@workspace/typescript-config`, `@workspace/oxlint-config`, `@workspace/oxfmt-config`, `typescript`, and `tsc`/`lint`/`format`/`typecheck` scripts matching siblings). Add `src/index.ts` re-exporting the public API.

### Step 2: Move the types + reducer into it
Create `packages/conversation/src/types.ts` with `Turn`, `Part` (union: text/thinking/tool_call/stats), and `ClientEvent` (the `{dir, event, payload, ...}` entry shape — copy `ClientMessageEntry`'s effective shape). Create `packages/conversation/src/reducer.ts` by MOVING `replayClientMessages` + `appendDelta` + `terminalizeTools` from `project-store.ts` verbatim, retyped against the shared types. Export `replayClientEvents(events: ClientEvent[]): Turn[]` and a single-event `applyClientEvent(turns, event): Turn[]` (factor the per-event transform out of the loop so the client can call it per SSE frame).

**Verify**: `pnpm install` then `pnpm --filter @workspace/conversation typecheck` → exit 0.

### Step 3: Server uses the shared reducer
In `project-store.ts`, import `replayClientEvents` + types from `@workspace/conversation`; delete the local `replayClientMessages`/`appendDelta`/`terminalizeTools`. Update `getProject`'s call (`replayClientEvents(await readClientMessages(id))`). Keep `ClientMessageEntry` as a local alias if other code references it, or re-export the shared `ClientEvent`. The local `ProjectMessageTurn`/`ProjectMessagePart` types become aliases of the shared `Turn`/`Part` (re-export) so the rest of the server compiles unchanged.

**Verify**: `pnpm --filter @workspace/server typecheck` + `pnpm --filter @workspace/server test -- --run` → exit 0 / all pass (the existing hydration tests now exercise the shared reducer).

### Step 4: Client uses the shared reducer for live streaming
In `use-landing-page.ts`, replace the inline `switch (event)` body's transform with a call to the shared `applyClientEvent` (feed the current `turns` + the SSE event; `setTurns` with the result). Keep the React side-effects that aren't pure-transforms (`setHtml` on `html_update`, `respondToScreenshotRequest` on `screenshot_request`) OUTSIDE the reducer call — the reducer handles only turn/part mutations. In `packages/prompt-panel/src/domain.ts`, re-export `Turn`/`Part` from `@workspace/conversation` and keep `export type LandingTurn = Turn` for back-comat.

**Verify**: `pnpm --filter @workspace/client typecheck` + `pnpm --filter @workspace/client test -- --run` → exit 0 / all pass.

### Step 5: Whole-repo gate
**Verify**: `pnpm run typecheck && pnpm run lint && pnpm run test` → all green.

## Test plan
- Move/add reducer unit tests into `packages/conversation/src/reducer.test.ts`: text-merge, thinking-merge, tool_call upsert by id, tool_call_drop removal, stats append, error (non-`stopped`) sets turn.error + terminalizes, done sets isStreaming + terminalizes, attachments_update sets turn.attachments, and a multi-turn fixture (prompt-in starts a new turn with the real turnId). Pattern: the existing `project-store` replay assertions.
- Keep the server hydration test and the client landing-agent test green (they now indirectly test the shared reducer).

## Done criteria
- [ ] `pnpm install` links `@workspace/conversation`.
- [ ] `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, `pnpm run format:check` all exit 0.
- [ ] `grep -rn "function replayClientMessages\|function appendDelta\|function terminalizeTools" apps/server/src` → no matches (moved out).
- [ ] `grep -rn "switch (event)" apps/client/src/hooks/use-landing-page.ts` → the pure-transform cases are gone (only non-transform side-effects like html_update/screenshot_request may remain).
- [ ] No `ProjectMessageTurn`/`ProjectMessagePart` definitions remain in `project-store.ts` (only re-exports/aliases of shared types).

## STOP conditions
- The client reducer has behavior the server's `replayClientMessages` lacks (e.g. a `retry` part type the server omits) — confirm by diffing the two switch bodies first. If they genuinely differ, STOP and reconcile the behavior BEFORE moving code (the shared reducer must match the intended behavior, which is the server's — `retry`/`html_update` have no turn-structure effect and are intentionally skipped server-side).
- `packages/prompt-panel/package.json` build/format setup is too different to copy for the new package — STOP and ask (don't invent a novel package config).
- The client hook's React state model can't cleanly call a pure `applyClientEvent(turns, event)` (e.g. it relies on closure state the pure fn can't see) — STOP and report; the extraction may need a different factoring.

## Maintenance notes
- After this lands, ALL event→turn logic changes go in `packages/conversation/src/reducer.ts`. A reviewer seeing a per-event change in either the server or client should redirect it here.
- Lighter alternative if this plan feels heavy: skip extraction, add a drift-prevention test (plan 008) that runs both reducers over the same fixture and asserts equality. This keeps the duplication but makes drift fail CI. Extraction is the durable fix.
- Reviewer: confirm the live stream and a reload of the same project render identically (manual: run a turn, reload, compare).
