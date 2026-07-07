# Plan 008: Comprehensive characterization tests for the shared event→turn reducer

> **Executor instructions**: Follow step by step; run each verification. On a "STOP conditions" event, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 87e1666b..HEAD -- packages/conversation/ apps/server/src/mastra/lib/project-store.ts apps/client/src/hooks/use-landing-page.ts`. On a mismatch with "Current state", STOP.

## Status
- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: `plans/006-shared-reducer.md` (this plan tests the package 006 creates; if 006 is rejected, see the STOP/alternative below)
- **Category**: tests
- **Planned at**: commit `87e1666b`, 2026-07-07

## Why this matters
Hydration correctness (`getProject` reload == live stream) depends entirely on the event→turn reducer being right, and until now it had almost no direct test coverage — only indirect coverage through server hydration assertions and ~5 client tests. Once plan 006 extracts the reducer into `@workspace/conversation`, that package becomes the single place to lock down every rule: text/thinking coalescing, tool_call upsert/dedup, fan-out drop, stats append, error terminalization, attachments update, and multi-turn boundaries. A thorough suite here means future reducer edits fail loudly instead of silently desyncing reloads.

## Current state
- After plan 006: `packages/conversation/src/reducer.ts` exports `replayClientEvents(events): Turn[]` and `applyClientEvent(turns, event): Turn[]`; `packages/conversation/src/types.ts` exports `Turn`, `Part`, `ClientEvent`.
- Plan 006's Step 2 already moves/creates a basic `reducer.test.ts`. This plan extends it to a full characterization suite.
- The reducer's rules (from the server's reference impl in `project-store.ts` before extraction): text delta merges into the trailing text part else creates `${turnId}-text`; thinking merges into trailing thinking else `${turnId}-think`; `tool_call` upserts by `id` (preserving prior action/detail/result when the new payload omits them); `tool_call_drop` removes by id; `edit`+`done` increments `htmlSwaps`; `stats` appends; `error` (unless message `stopped`) sets `turn.error` + terminalizes; `done` sets `isStreaming=false` + terminalizes; on restore any `running`/`start` tool becomes `error`.
- Test conventions: vitest; the server's `project-store.test.ts` and the existing `apps/client/src/lib/landing-agent.test.ts` are the patterns. The `@workspace/vitest-preset` is the shared config.

## Commands you will need
| Purpose | Command | Expected on success |
|---|---|---|
| Tests (package) | `pnpm --filter @workspace/conversation test -- --run` | all pass |
| Tests (all) | `pnpm run test` | all pass |
| Coverage | `pnpm --filter @workspace/conversation test -- --run --coverage` | reducer.ts ≥95% lines |

## Scope
**In scope**:
- `packages/conversation/src/reducer.test.ts` — extend to the full suite below.

**Out of scope**:
- The reducer implementation (plan 006).
- Server/client code.

## Git workflow
- Branch: `advisor/008-reducer-tests`
- Commit: `test(conversation): characterize the event→turn reducer`.

## Steps

### Step 1: Add a multi-turn fixture + golden replay
Build a `ClientEvent[]` fixture spanning 2 turns (prompt-in → thinking deltas → text deltas → tool_call running → tool_call done → stats → done; then a second prompt-in → tool_call error → done). Assert `replayClientEvents(fixture)` produces exactly 2 turns with the expected parts, `htmlSwaps`, `isStreaming:false`, and the real `turnId` from each prompt-in.

### Step 2: Add focused case tests (one per rule)
- text: two deltas coalesce into ONE text part; a thinking delta between them starts a new thinking part.
- thinking: same coalescing; a later text delta starts a new text part (doesn't merge into thinking).
- tool_call upsert: `running` then `done` with same `id` → ONE part, final `state:'done'`, `result` from the done payload preserved.
- tool_call preserve-on-omit: a later payload missing `action` keeps the earlier `action`.
- tool_call_drop: a `running` tool_call followed by `tool_call_drop{id}` → part removed.
- edit htmlSwaps: an `edit` tool_call with `state:'done'` increments the turn's `htmlSwaps`; a non-edit `done` does not.
- stats: a `stats` event appends a part with the stats fields (no `id`).
- error: an `error` with `message:'stopped'` is ignored (no `turn.error`); any other message sets `turn.error`.
- done terminalize: a turn that ends with a `running` tool_call and then `done` → that part becomes `state:'error'` with the default "did not return a result" result.
- restore terminalize: a turn with NO `done` (interrupted) → its `running` tools are terminalized to `error` on return; `isStreaming` stays `true`.
- attachments_update: an `attachments_update` event sets `turn.attachments` (with `analysisText`).
- prompt-in turnId: the turn `id` equals the prompt-in entry's `turnId`.

### Step 3: Add a drift guard (if server still has its own reducer path)
If `project-store.ts` still wraps the shared reducer, add one test in `apps/server/src/mastra/lib/project-store.test.ts` that replays the SAME fixture via `replayClientMessages` (server entry point) and asserts deep-equal to `replayClientEvents` (shared) — so a future divergence fails. (If 006 fully removed the server wrapper, skip this step.)

**Verify**: `pnpm --filter @workspace/conversation test -- --run` → all pass; `pnpm run test` → all green.

## Test plan
- This plan IS the test plan — see Step 2's case list. Pattern: existing vitest tests in `project-store.test.ts`.

## Done criteria
- [ ] `pnpm --filter @workspace/conversation test -- --run` passes with ≥12 cases covering every rule in Step 2.
- [ ] `pnpm run test` all green.
- [ ] Reducer coverage ≥95% lines (`--coverage`).
- [ ] Only `packages/conversation/src/reducer.test.ts` (+ optionally one server drift test) modified.

## STOP conditions
- Plan 006 was NOT done — the `@workspace/conversation` package doesn't exist. STOP. Alternative (record in the report): write the same case suite against the server's current `replayClientMessages` in `project-store.test.ts` instead, and add ONE drift-equality test comparing it to the client reducer over the fixture (this catches drift without extraction). Do not invent the package here.
- A reducer rule in Step 2 doesn't hold against the real code — STOP; either the rule description is wrong or there's a real bug (report it; don't change the reducer in this plan).

## Maintenance notes
- New reducer rules (new event types) must add a case here. A PR touching `reducer.ts` with no test change should draw scrutiny.
- Reviewer: the `error:'stopped'`-ignored and restore-terminalize cases are the subtle ones — confirm they assert the exact behavior.
