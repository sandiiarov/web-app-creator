# Plan 007: Delete the dead `record*` in-memory recording code in route.ts

> **Executor instructions**: Follow step by step; run each verification. On a "STOP conditions" event, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 87e1666b..HEAD -- apps/server/src/mastra/route.ts`. On a mismatch with "Current state", STOP.

## Status
- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (but sequence after 004/005 if those land first — they touch the same stream loop)
- **Category**: tech-debt
- **Planned at**: commit `87e1666b`, 2026-07-07

## Why this matters
After the data-layer refactor moved persistence to append-only logs, the in-memory turn recording in `route.ts` became dead work. `recordStats`, `recordTextDelta`, `recordToolCall`, `recordTurnError`, and `removeToolCall` mutate `recordedTurn.parts` / `.htmlSwaps` / `.error` / `.isStreaming` — and **none of those fields is ever read** (the client log + `replayClientMessages` are the source of truth; `getProject` does not read `recordedTurn`). Only `recordedTurn.id` and `recordedTurn.attachments` are still used (the `attachments_update` emit and agent-message `turnId`). ~100 LOC of confusing dead code sits in the hot stream loop, implying state that no longer exists. Removing it makes the stream loop say what it does.

## Current state
- `apps/server/src/mastra/route.ts` — the helpers to DELETE (all mutate unread state):
  - `recordStats(turn, statsPayload)` (line ~1203)
  - `recordTextDelta(turn, type, delta)` (line ~1207)
  - `recordToolCall(turn, payload)` (line ~1227)
  - `recordTurnError(turn, message)` (line ~1257)
  - `removeToolCall(turn, id)` (line ~1264)
  - Their call sites are interleaved with `emit(...)` calls throughout the `streamLoop` and in `analyzePromptAttachments`.
- KEEP (still live):
  - `recordAttachmentAnalysis(turn, text)` (line ~1192) — mutates `recordedTurn.attachments`, which IS read (the `attachments_update` emit at route.ts ~280).
  - `recordedTurn.id` — used as `turnId` for `appendAgentMessages` and the inbound prompt log.
  - `createRecordedTurn(...)` — keep as-is (its unused fields are harmless; thinning it is out of scope).
- Proof of deadness: `grep -rn "recordedTurn\." apps/server/src/mastra/route.ts` — every read is `.id` or `.attachments`. The `.parts`/`.htmlSwaps`/`.error`/`.isStreaming` references are all writes (inside the `record*` helpers or `+= 1` lines).
- Convention: every `emit(event, payload)` line MUST remain (it drives the client + the client log). Only the adjacent `recordX(...)` line is removed.

## Commands you will need
| Purpose | Command | Expected on success |
|---|---|---|
| List call sites | `grep -nE "recordToolCall|recordTextDelta|recordStats|recordTurnError|removeToolCall" apps/server/src/mastra/route.ts` | a list to work through |
| Typecheck | `pnpm --filter @workspace/server typecheck` | exit 0 |
| Tests | `pnpm --filter @workspace/server test -- --run` | 146 pass (unchanged) |
| Lint | `pnpm --filter @workspace/server lint` | exit 0 |

## Scope
**In scope**:
- `apps/server/src/mastra/route.ts` — delete the 5 helpers + their call sites + the `recordedTurn.htmlSwaps += 1` lines.

**Out of scope**:
- `recordAttachmentAnalysis`, `recordedTurn.id`, `recordedTurn.attachments`, `createRecordedTurn` — KEEP.
- `emit(...)`, `appendClientMessage`, `appendAgentMessages`, `appendVisionMessage` — KEEP (all live).
- Any change to the SSE wire or the logs.

## Git workflow
- Branch: `advisor/007-delete-dead-record-code`
- Commit: `refactor(server): remove dead in-memory turn recording`.

## Steps

### Step 1: Enumerate every call site
Run the grep in "Commands". You'll get a list of lines like `recordToolCall(recordedTurn, toolPayload)`, `recordTextDelta(recordedTurn, 'text', ...)`, `recordStats(recordedTurn, statsPayload)`, `recordTurnError(recordedTurn, ...)`, `removeToolCall(recordedTurn, display.id)`, and the `recordedTurn.htmlSwaps += 1` lines.

### Step 2: Delete each call site line (keep the adjacent `emit`)
For each match, delete ONLY that statement. The neighboring `emit(event, payload)` line(s) MUST stay. Example — before:
```ts
recordToolCall(recordedTurn, toolPayload)
emit('tool_call', toolPayload)
```
after:
```ts
emit('tool_call', toolPayload)
```
Also delete standalone `recordedTurn.htmlSwaps += 1` lines (they have no emit partner; they're pure dead writes). Do NOT delete `editSubIds`/`editFailures`/`htmlUpdateSequence` logic — those are live.

**Verify**: `grep -nE "recordToolCall|recordTextDelta|recordStats|recordTurnError|removeToolCall|recordedTurn\.htmlSwaps" apps/server/src/mastra/route.ts` → only the helper DEFINITIONS remain (no call sites). `pnpm --filter @workspace/server typecheck` → exit 0.

### Step 3: Delete the 5 helper definitions
Remove the function bodies of `recordStats`, `recordTextDelta`, `recordToolCall`, `recordTurnError`, `removeToolCall`. Run `pnpm --filter @workspace/server lint:fix` (perfectionist `sort-modules` will need reordering after deletions).

**Verify**: `grep -nE "^function (recordStats|recordTextDelta|recordToolCall|recordTurnError|removeToolCall)" apps/server/src/mastra/route.ts` → no matches. `pnpm --filter @workspace/server typecheck` → exit 0.

### Step 4: Full test gate (the deadness proof)
**Verify**: `pnpm --filter @workspace/server test -- --run` → all 146 pass, unchanged. If any test fails, one of the helpers was NOT dead — STOP (see STOP conditions).

## Test plan
- No new tests — this is a pure deletion of dead code; the existing 146 tests are the proof. If they stay green, the removed code was dead.

## Done criteria
- [ ] `pnpm --filter @workspace/server typecheck` exits 0.
- [ ] `pnpm --filter @workspace/server test -- --run` — exactly the same pass count as before (146), no new failures.
- [ ] `pnpm --filter @workspace/server lint` exits 0.
- [ ] `grep -nE "recordToolCall|recordTextDelta|recordStats|recordTurnError|removeToolCall" apps/server/src/mastra/route.ts` → no matches.
- [ ] `grep -nE "recordedTurn\.htmlSwaps" apps/server/src/mastra/route.ts` → no matches.
- [ ] `recordAttachmentAnalysis`, `recordedTurn.id`, `recordedTurn.attachments`, and every `emit(` remain.
- [ ] Only `apps/server/src/mastra/route.ts` modified.

## STOP conditions
- ANY existing test fails after a deletion — that helper/line was NOT dead. Revert that specific deletion and leave a `// NOTE: kept — read by <test>` comment, then continue. If you can't determine what reads it, STOP and report.
- A `recordX(...)` call site is NOT a standalone statement (e.g. its return value is used, or it's chained with an emit) — STOP; the plan assumes each is a standalone dead statement.
- `recordedTurn.attachments` or `recordedTurn.id` appears in a deletion you planned — STOP; those are live (KEEP).

## Maintenance notes
- After this, `recordedTurn` carries only run-scoped state actually used (`id`, `attachments`). A future change that needs per-run turn state should add it explicitly and read it — don't reintroduce a parallel "recording" copy of what the logs already hold.
- Reviewer: the safest review is the diff — every removed line should be a `recordX(...)` or `recordedTurn.htmlSwaps += 1`, and every remaining `emit(` should be intact.
- This plan is the natural follow-up to the data-layer refactor; if plan 004 (cost cap) landed and added a `recordTurnError` call in the abort path, that line is removed here too (it was added only for parity).
