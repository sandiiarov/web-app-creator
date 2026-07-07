# Plan 004: Add a per-run cost cap to the /agent stream

> **Executor instructions**: Follow step by step; run each verification. On a "STOP conditions" event, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 87e1666b..HEAD -- apps/server/src/mastra/route.ts apps/server/src/config.ts`. On a mismatch with "Current state", STOP.

## Status
- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security (cost-control)
- **Planned at**: commit `87e1666b`, 2026-07-07

## Why this matters
`POST /agent` triggers paid OpenRouter model calls with no spend guard beyond `MAX_STEPS` (30) and `MAX_EDIT_FAILURES` (10). A runaway turn (looping edits, a verbose model, or an abusive caller) can spend an unbounded amount before those trip. A configurable per-run USD cap that hard-aborts the stream with a clear error bounds the worst-case cost of any single request. This is the minimum cost guardrail; it does not add authentication or distributed rate limiting (noted as follow-ups).

## Current state
- `apps/server/src/mastra/route.ts`:
  - `streamLandingAgent` accumulates cost across the run: `llmProviderCostUsd`, `imageCostUsd`, `visionCostUsd`, `scrapeCostUsd` → `totalCost` (computed after the stream loop, near `statsPayload`). The `raw`/`tool-result` chunks already update `llmProviderCostUsd` and image/scrape accumulators *during* the stream.
  - It uses `const controller = new AbortController()` and `controller.abort()` to hard-stop (e.g. on `MAX_EDIT_FAILURES`). Pattern to reuse.
  - `fatalRunError` is set + `emit('error', {message})` + `controller.abort()` + `break streamLoop` is the established abort sequence (see the `MAX_EDIT_FAILURES` block).
  - `config.agentRetry` is the existing config sub-object (read in `createLandingAgentErrorProcessors(config.agentRetry, …)`) — the pattern for a new config field.
- `apps/server/src/config.ts` — config schema. The executor must read it to see the exact shape (env loading, defaults) before adding a field.
- Convention: required env vars throw on missing; optional use `?? default`. `MAX_EDIT_FAILURES`/`MAX_STEPS` are module consts in `route.ts`.

## Commands you will need
| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm --filter @workspace/server typecheck` | exit 0 |
| Tests | `pnpm --filter @workspace/server test -- --run` | all pass |
| Lint | `pnpm --filter @workspace/server lint` | exit 0 |

## Scope
**In scope**:
- `apps/server/src/config.ts` — add an optional cost cap (e.g. `agentMaxCostUsd`).
- `apps/server/src/mastra/route.ts` — check accumulated cost during the stream; abort if exceeded.
- `apps/server/src/mastra/route.test.ts` — add a test that a run aborts when the cap is hit.

**Out of scope**:
- Authentication / authorization on `/agent`.
- Distributed or per-IP rate limiting (follow-up).
- Changing the `stats` event shape.

## Git workflow
- Branch: `advisor/004-cost-cap`
- Commit: `feat(server): hard-abort a run when its cost exceeds a configurable cap`.

## Steps

### Step 1: Add the config field
Read `apps/server/src/config.ts`. Add an optional field (name it to match the file's convention — likely `agentMaxCostUsd`), sourced from an env var (e.g. `AGENT_MAX_COST_USD`) with a sensible default (e.g. `0.50`) and `undefined`/`0` meaning "no cap". Follow exactly how `agentRetry` is declared and defaulted.

**Verify**: `pnpm --filter @workspace/server typecheck` → exit 0.

### Step 2: Track running cost during the stream
In `streamLandingAgent`, add a `let runCostUsd = 0` accumulator near the other cost accumulators. At each point a cost is realized during the stream — the `raw` chunk handler (where `llmProviderCostUsd` is set) and after image/scrape/vision costs accrue — fold those into `runCostUsd`. (The exact accumulation points are where `llmProviderCostUsd`, `imageCostUsd`, `scrapeCredits`/scrape cost, and `visionCostUsd` are updated; sum the same components used for `totalCost` post-loop.)

### Step 3: Abort when the cap is exceeded
Define `const costCapUsd = config.agentMaxCostUsd ?? 0` once (a `0`/falsy value disables the cap). After each cost update in step 2, check:
```ts
if (costCapUsd > 0 && runCostUsd >= costCapUsd) {
  fatalRunError = `Run exceeded the $${costCapUsd.toFixed(2)} cost cap.`
  recordTurnError(recordedTurn, fatalRunError) // keep for parity with other aborts (see STOP condition)
  emit('error', { message: fatalRunError })
  controller.abort()
  break streamLoop
}
```
Mirror the exact abort sequence used by the `MAX_EDIT_FAILURES` block. Place the check so it runs at least once per step (e.g. in the `raw` chunk handler and after tool-result cost accrual).

**Verify**: `pnpm --filter @workspace/server typecheck` → exit 0. `grep -n "costCapUsd\|fatalRunError" apps/server/src/mastra/route.ts` shows the new check.

### Step 4: Test
Add a `route.test.ts` test using the existing `fakeAgentStream` harness: set the cap low (e.g. stub `config.agentMaxCostUsd` via the test's config mock, or set the env var), fake a stream whose `raw` chunk reports a provider cost above the cap, and assert the response contains an `error` event with the cost-cap message and that `controller.abort` short-circuits the loop. Model it after the existing `MAX_EDIT_FAILURES`/fatal-abort test (`'records cost/stats and raw messages even when a fatal error aborts the run'`).

**Verify**: `pnpm --filter @workspace/server test -- --run route` → all pass incl. the new test.

## Test plan
- New test: "aborts the run when accumulated cost exceeds the cap" — fake a `raw` chunk with a provider-reported cost above a low cap; assert an `error` SSE event with the cost-cap message and that streaming stopped.
- Pattern: the fatal-abort test referenced above.

## Done criteria
- [ ] `pnpm --filter @workspace/server typecheck` exits 0.
- [ ] `pnpm --filter @workspace/server test -- --run` all pass, incl. 1 new test.
- [ ] `pnpm --filter @workspace/server lint` exits 0.
- [ ] With the cap disabled (`agentMaxCostUsd` unset/0), a normal run is unchanged (no spurious abort).
- [ ] Only the 3 in-scope files modified.

## STOP conditions
- `config.ts` doesn't have an `agentRetry`-style sub-object to mirror (drift) — STOP and report the actual config shape.
- The `raw` chunk / `llmProviderCostUsd` mechanism in route.ts doesn't match "Current state" — STOP (the cap depends on per-step cost visibility).
- If implementing the cap requires touching the public `stats` shape or the client — STOP (out of scope).

## Maintenance notes
- The cap is per-run only. A per-project/session cap and distributed rate limiting are deliberate follow-ups (they need a shared counter store).
- Reviewer: confirm the check fires on the `raw` provider-cost path (the most reliable per-step cost signal), not only post-loop where it can't abort.
- Note: `recordTurnError` is called for parity with other aborts; if plan 005 (delete dead `record*` code) lands first, drop that line there too.
