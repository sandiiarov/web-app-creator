# Plan 011: Extract `runAgentStream` into composable units (660 LOC → ~200)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 09236e63 -- apps/server/src/mastra/route.ts apps/server/src/mastra/route.test.ts apps/server/src/mastra/lib/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Hard rule for this plan**: this is a BEHAVIOR-PRESERVING refactor. Move
> code verbatim (modulo mechanical renaming at call sites). Any logic
> "improvement" you notice belongs in a follow-up, not this diff.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (touches the hot run loop; mitigated by a large integration
  test suite and step-wise extraction with a green gate after each step)
- **Depends on**: none (run after plan 009 so the fallow gate is green and
  measures your change accurately)
- **Category**: tech-debt
- **Planned at**: commit `09236e63`, 2026-08-02

## Why this matters

`apps/server/src/mastra/route.ts:717` `runAgentStream` is 660 lines with
cognitive complexity 146 / cyclomatic 88 (fallow's #1 refactor target,
pri 30.8). It interleaves five concerns — run setup, cost/stats accounting,
the SSE-emitting stream-loop switch, attachment analysis, and terminal
finalization — and it grows every feature cycle (this month alone it gained
capability detection + direct-mode branches). Every edit to the run loop
risks breaking cost accounting or SSE ordering because the shared mutable
state spans ~20 closure variables. Splitting it into three cohesive units
makes each independently reviewable and shrinks the blast radius of future
changes.

## Current state

`apps/server/src/mastra/route.ts` (~1511 LOC). `runAgentStream`
(signature below, line 717) contains, in order:

```ts
async function runAgentStream({
  attachments, baseUrl, controller, imageModel, project, projectId,
  prompt, textModel, turnId, visionModel,
}: RunBodyOptions) {
```

1. **Setup** (~:718-760): `updateProjectModel`, `setTitleIfUntitled`,
   `createRecordedTurn`, the `emit(event, payload)` helper (appends to
   `client-messages.jsonl` + broadcasts, skipping `html_update`),
   `createProjectHtmlStore`, `supportsImageInput` capability detection,
   `createLandingPageAgent(...)`, the inbound-prompt
   `appendClientMessage({ dir: 'in' })`.
2. **Stream-loop mutable state** (~:761-830): `callDisplay`,
   `completedCallIds`, `callAction`, `toolCallSeq`, `scrapeCredits` /
   `scrapeCalls`, `imageCostUsd` / `imageCount`, `visionCalls` /
   `visionCostUsd` / `visionImages`, `llmProviderCostUsd`,
   `scrapeOcrCalls` / `scrapeOcrCostUsd` / `scrapeOcrImages`,
   `editFailures`, `fatalRunError`, `costCapUsd` + `checkCostCap`,
   `liveUsage`, `createStatsPayload(usage, finishReason)`,
   `emitStats(finishReason?)`.
3. **Main body** (~:831-1330): `try { analyzePromptAttachments(...)`,
   `attachments_update` emit, vision-cost accumulation from attachments,
   `agentPrompt` assembly, `readAgentRawByTurn` + `buildAgentMessages`,
   `agent.stream(agentMessages, {...})`, then
   `for await (const chunk of stream.fullStream)` with a giant `switch
   (chunk.type)` — cases: `error`, `raw`, `reasoning-delta`,
   `step-finish`, `text-delta`, `tool-call`,
   `tool-call-input-streaming-start`, `tool-error`, `tool-result`
   (the largest, ~150 lines: display resolution, `edit` html_update +
   edit-failure circuit breaker, `scrape`/`generate_image`/`screenshot`
   cost accumulation), `default`.
4. **catch** (~:1331-1360): captures `streamError` unless `fatalRunError`.
5. **finally** (~:1361-1450): terminal usage/finishReason resolution,
   `emitStats(finishReason)`, final agent-message snapshot
   (`appendAgentMessages` with `sanitizeAgentMessages`), terminal error
   emit (`stopped` / `streamError` / empty-draft), terminal
   `setRunStatusSync`, persist `stats`/`done` parts, `flushProjectLogs`,
   `releaseRun`.

Helpers already extracted (do NOT re-extract): `analyzePromptAttachments`,
`buildAgentMessages`, `createRecordedTurn`, `sanitizeAgentMessages` /
`stripReasoning` / `stripInlineImageData`, `startToolCallDisplay` +
`getToolCallDisplay`, `createHtmlUpdatePayload`, tool-display helpers in
`lib/tool-display.ts`, `createLandingAgentErrorProcessors` in
`lib/retry.ts`.

### Repo conventions to match

- Small pure helpers live in `apps/server/src/mastra/lib/*.ts` (per the
  child DOX: "Prefer `zod` schemas at tool boundaries, small pure helpers
  in `lib/`"). New lib modules get tight JSDoc headers like
  `lib/bounded-fetch.ts` / `lib/tool-display.ts` (read one first).
- `lib/` stays Mastra-free where possible, but stateful run helpers that
  need Mastra chunk types may type against structural interfaces instead
  (see `UsageSnapshot` in route.ts — a hand-rolled structural type).
- File-local function order is enforced by `perfectionist(sort-modules)`
  (oxlint) — after moving functions, run `pnpm --filter @workspace/server
  lint:fix` and accept only reordering.
- The integration suite `apps/server/src/mastra/route.test.ts` (2900+
  lines, boots real runs against mocked agent streams) is the regression
  net — it asserts SSE event sequences, cost/stats payloads, tool-call
  lifecycle, stop/abort behavior, and log persistence. It must pass
  byte-for-byte after each step with ZERO edits to it.

## Commands you will need

| Purpose    | Command                                              | Expected on success |
|------------|------------------------------------------------------|---------------------|
| Typecheck  | `pnpm --filter @workspace/server typecheck`          | exit 0, no errors   |
| Lint       | `pnpm --filter @workspace/server lint`               | exit 0              |
| Tests      | `pnpm --filter @workspace/server test`               | all pass            |
| Focused    | `pnpm --filter @workspace/server test -- --run route 2>&1 \| tail -20` | route tests pass |
| Complexity | `pnpm run fallow:health 2>&1 \| grep -A2 runAgentStream` | complexity drops   |

## Scope

**In scope** (the only files you should modify/create):
- `apps/server/src/mastra/route.ts` — shrink `runAgentStream`; rewire to the new units.
- `apps/server/src/mastra/lib/run-stats.ts` (create) — cost/stats accounting unit (Step 1).
- `apps/server/src/mastra/lib/run-stream-loop.ts` (create) — stream-loop chunk handler unit (Step 2).
- Optional: `apps/server/src/mastra/lib/run-stats.test.ts` (create) — only if you add the optional unit tests (Step 1 note).

**Out of scope** (do NOT touch):
- `apps/server/src/mastra/route.test.ts` — it is the regression net; zero edits.
- `analyzePromptAttachments` and everything it calls — already extracted; leave in route.ts or move verbatim in a follow-up.
- `lib/tool-display.ts`, `lib/retry.ts`, `lib/project-store.ts`, `lib/run-bus.ts` — no changes needed.
- Tool files, agent factory, SSE protocol shapes — no behavior change.
- DOX — `apps/server/src/mastra/AGENTS.md` describes `route.ts` behavior, not function layout; no update needed for a pure move. (If you DO change any behavior, you must also update that doc — and you've violated the hard rule.)

## Git workflow

- Branch: `advisor/011-extract-run-agent-stream`.
- One commit per step (three commits): e.g.
  `refactor(server): extract run stats/cost tracker from runAgentStream`,
  `refactor(server): extract stream-loop chunk handler from runAgentStream`,
  `refactor(server): extract run finalization from runAgentStream`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract the cost/stats accounting unit

Create `apps/server/src/mastra/lib/run-stats.ts`. Move the section-2 state
and functions listed in "Current state" into a factory:

```ts
export interface RunStatsTracker {
  checkCostCap(): boolean
  emitStats(finishReason?: string): void
  recordGenerateImage(result: { cost?: number; imagesGenerated?: number }): void
  recordRawProviderCost(cost: number): void
  recordScrape(result: { creditsUsed?: number; imageOcr?: {...} }): void
  recordScreenshotOcr(result: { imageOcr?: {...} }): void
  recordStepUsage(usage: UsageSnapshot, raw?: unknown): void
  recordVisionAttachment(cost: number, images: number, ok: boolean): void
}
export function createRunStatsTracker(deps: {
  emit: (event: string, payload: unknown) => void
  controller: AbortController
  onFatal: (message: string) => void   // sets fatalRunError + emits 'error' + aborts
  startedAt: number
  textModel: string
}): RunStatsTracker
```

Move `createStatsPayload`/`emitStats`/`checkCostCap` and every
`scrape*`/`image*`/`vision*`/`llmProviderCostUsd` accumulator into it,
VERBATIM. The per-tool accumulation `if` blocks from the `tool-result`
case become the `record*` methods (they mutate only tracker state; the
`html_update` + edit-failure logic stays in the loop).

Back in `route.ts`, replace the accumulators with one
`const stats = createRunStatsTracker({...})` and swap call sites
(`emitStats()` → `stats.emitStats()`, etc.).

OPTIONAL (recommended): add `lib/run-stats.test.ts` unit-testing the cost
accumulation math (model after `lib/cost.test.ts`). If you skip it, the
route.test.ts stats-payload assertions are the net — acceptable.

**Verify** (gate — do not proceed until green):
`pnpm --filter @workspace/server typecheck && pnpm --filter @workspace/server lint && pnpm --filter @workspace/server test` → all exit 0.

### Step 2: Extract the stream-loop chunk handler

Create `apps/server/src/mastra/lib/run-stream-loop.ts`. Move the entire
`switch (chunk.type)` body into a handler factory:

```ts
export function createStreamChunkHandler(deps: {
  // state objects the loop mutates — pass the actual Maps/Sets/objects:
  callAction: Map<string, null | string>
  callDisplay: Map<string, ToolCallDisplay>
  completedCallIds: Set<string>
  controller: AbortController
  emit: (event: string, payload: unknown) => void
  onEditSuccess(nextHtml: string): void      // html_update emit + lastHtmlUpdate bookkeeping
  onFatal(message: string): 'break'          // fatal edit-failure path
  stats: RunStatsTracker
  toolCallSeq: { next(): number }            // wraps the counter
}): (chunk: FullStreamChunk) => 'break' | undefined
```

Move each case's body verbatim into the handler. The `break streamLoop`
statements become `return 'break'`; the loop in route.ts becomes:

```ts
const handleChunk = createStreamChunkHandler({...})
streamLoop: for await (const chunk of stream.fullStream) {
  if (handleChunk(chunk) === 'break') break streamLoop
}
```

`chunk` typing: derive from `Awaited<ReturnType<typeof agent.stream>>['fullStream']`
the way route.ts already infers it; do NOT invent new type imports from
`@mastra/core` without checking they are exported — prefer structural
inference (`type FullStreamChunk = ...` via `AsyncIterableElement`).

**Verify** (gate): same trio as Step 1 → all exit 0, and
`pnpm --filter @workspace/server test -- --run route 2>&1 | tail -5`
shows the route suite passing.

### Step 3: Extract terminal finalization

Move the `finally` block's body into
`finalizeRun({...})` in `lib/run-stream-loop.ts` (same module — it shares
types) or a third module `lib/run-finalize.ts` if lint sorting fights you:

```ts
export async function finalizeRun(deps: {
  agentStep: number
  controller: AbortController
  emit: (event: string, payload: unknown) => void
  fatalRunError: null | string
  htmlUpdateSequence: number
  project: Project
  projectId: string
  recordedTurn: ProjectMessageTurn
  stats: RunStatsTracker
  stream: undefined | Awaited<ReturnType<Agent['stream']>>
  streamError: string | undefined
  turnId: string
}): Promise<void>
```

It performs, verbatim: usage/finishReason resolution with the
`stream.usage`/`finishReason` try/catch fallbacks, `stats.emitStats(finishReason)`,
final `appendAgentMessages` (sanitized), terminal error / empty-draft emit,
terminal `setRunStatusSync`, and the persisted terminal `stats`/`done`
part appends. `flushProjectLogs` + `releaseRun` STAY in route.ts's outer
`finally` (the DOX requires flush-before-release ordering — keep it
visible at the call site with its existing comment).

**Verify** (gate): same trio → all exit 0.

### Step 4: Measure + confirm scope

**Verify**:
- `pnpm run fallow:health 2>&1 | grep -E "runAgentStream|route.ts" | head -5`
  → `runAgentStream` no longer appears as a CRITICAL large/complex
  function (target: ≤ ~200 lines; the extraction, not a number, is the
  goal — report the final size).
- `git status --short` lists ONLY the in-scope files (route.ts + the new
  lib module(s) + optional new test file).
- `pnpm run build` → exit 0.

## Test plan

No new required tests — `route.test.ts` is the net and must pass
UNEDITED (it covers: attachment OCR/direct modes, SSE event order,
tool-call lifecycle, edit-failure circuit breaker, cost cap, stop/abort,
stats payloads, log persistence). Optional `lib/run-stats.test.ts` in
Step 1 is the only addition.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm --filter @workspace/server typecheck` exits 0
- [ ] `pnpm --filter @workspace/server lint` exits 0
- [ ] `pnpm --filter @workspace/server test` exits 0 with the SAME test
      count as baseline (+N only if the optional run-stats tests were added)
- [ ] `route.test.ts` has zero modifications (`git diff --name-only` does
      not list it)
- [ ] `runAgentStream` body ≤ ~250 lines (report final count)
- [ ] No new imports of `@mastra/core` runtime symbols in the new lib
      modules beyond what route.ts already imported (type-only is fine)
- [ ] `git status --short` lists ONLY in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check is non-empty AND `runAgentStream`'s structure no longer
  matches the five-section map in "Current state" (e.g. someone already
  extracted part of it, or direct-mode added a sixth concern). Re-map
  before proceeding; if the map differs materially, STOP.
- A step's verification gate fails twice after reasonable fix attempts —
  you have likely altered behavior (event ordering and closure capture
  are the classic traps). Revert to the last green commit and report.
- You find yourself editing `route.test.ts` to make a test pass. That is
  the signal you changed behavior, not the test's problem. STOP.
- The `chunk` type cannot be inferred without new `@mastra/core` type
  imports that are not exported. Report the missing type rather than
  `any`-casting (the server's oxlint config warns on `no-explicit-any`;
  `route.ts` is NOT in the exempt list — only `lib/anchor-edit/` is).

## Maintenance notes

- Future stream-chunk cases go into `run-stream-loop.ts`; future cost
  categories go into `run-stats.ts` (add a `record*` method + wire one
  call site). The DOX rule "additions/removals of tools must update SSE
  mapping, cost accounting, client event types" now maps to specific
  modules.
- The shared-state objects passed into the factories (`callDisplay`,
  `callAction`, `completedCallIds`) stay in route.ts because the
  attachment-analysis path also sequences tool ids via `nextToolSeq` —
  keep the counter owner singular.
- A natural follow-up (NOT this plan): move `analyzePromptAttachments`
  into `lib/run-attachments.ts` for symmetry. It was left because it is
  already a cohesive unit and this plan is big enough.
- Reviewer: verify the diff is moves-only — sort hunks by file and check
  that every deleted block in route.ts reappears (modulo call-site
  renames) in the new modules. Reject any logic change.
