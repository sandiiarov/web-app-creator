# Plan 002: Extract route.ts tool-display helpers into lib/tool-display.ts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat e0cae5de..HEAD -- apps/server/src/mastra/route.ts`
> **NOTE — dirty working tree at planning time:** `route.ts` had uncommitted
> WIP edits when this plan was written; the "Current state" excerpts below were
> captured from the *live working tree*, not from commit `e0cae5de`. If the
> drift check above is non-empty AND the live `route.ts` does not match the
> excerpts (line numbers, function bodies), STOP — the file moved under you.

## Status

- **Priority**: P3
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt (behavior-preserving refactor)
- **Planned at**: commit `e0cae5de`, 2026-07-14 (route.ts had uncommitted WIP)
- **Issue**: (only when published via `--issues`)

## Why this matters

`apps/server/src/mastra/route.ts` is the repo's #1 churn hotspot (most-changed
file over the last 60 commits) at 1634 lines, and its `activeStreamLandingAgent`
function alone spans lines 244–892 (~648 lines) — SSE mapping, cost accounting,
edit-failure tracking, cost cap, and stats all interleaved. The bottom ~550
lines are a cluster of **pure leaf helpers** that turn `(toolName, args/result)`
into display strings and image lists; they hold zero route-loop state. They
cannot be unit-tested in isolation today (only exercised through the heavy
integration suite) and force a reviewer to scroll past ~550 lines of display
plumbing to read the stream loop. Extracting them into a focused module
shrinks the god file, makes the summarization logic independently testable,
and is near-zero risk: the move is pure code motion, and the existing 30+
route integration tests (`route.test.ts`) pin the exact behavior.

## Current state

The functions below are all **module-private** (`function`/`const`, not
`export`ed) in `route.ts` and are consumed only within `route.ts`. They form a
self-contained cluster with no dependence on route-loop state, Mastra, or the
HTTP layer.

Move these into the new module **and export the ones route.ts still needs**
(listed under Step 1):

| Symbol | Kind | route.ts line (planning-time) | Route.ts still uses it? |
|--------|------|-------------------------------|-------------------------|
| `type ToolArgs = Record<string, unknown>` | type | 130 | yes (loop + display fns) |
| `interface ToolCallDisplay` | type | 132 | yes (`startToolCallDisplay`/`getToolCallDisplay` stay in route.ts) |
| `INVALID_EDIT_RESULT_MESSAGE` | const | 50 | no — only used by `summarizeToolResult` |
| `asToolArgs` | function | 1071 | yes (loop: tool-call/error/result cases) |
| `booleanValue` | function | 1076 | no (internal to helpers) |
| `defaultToolAction` | function | 1235 | yes (used by `startToolCallDisplay`) |
| `isValidEditResult` | function | 1290 | no (internal to helpers) |
| `numberValue` | function | 1295 | no (internal to helpers) |
| `stringArrayValue` | function | 1340 | no (internal to helpers) |
| `stringValue` | function | 1346 | no (internal to helpers) |
| `summarizeArgsForTool` | const (Record) | 1382 | no (internal; used by `summarizeToolArgs`) |
| `summarizeFindOrGrepResult` | function | 1450 | no (internal) |
| `summarizeToolArgs` | function | 1458 | yes (used by `startToolCallDisplay`) |
| `summarizeToolError` | function | 1462 | yes (loop: tool-error/result cases) |
| `summarizeResultForTool` | const (Record) | 1485 | no (internal; used by `summarizeToolResult`) |
| `expandScreenshotUrl` | function | 1571 | no (internal; used by `toolCallImages`) |
| `summarizeToolResult` | function | 1579 | yes (loop: tool-result case) |
| `toolCallImages` | function | 1595 | yes (loop: tool-result case) |
| `toolResultIndicatesFailure` | function | 1619 | yes (loop: tool-result case) |

**Leave in route.ts** (route-loop coupled or unrelated — do NOT move):
- `startToolCallDisplay` (line ~1310) and `getToolCallDisplay` (line ~1266) —
  they mutate the loop's `callDisplay`/`completedCallIds` maps. They stay in
  route.ts and will import `defaultToolAction`, `summarizeToolArgs`,
  `ToolArgs`, `ToolCallDisplay` from the new module.
- `hashHtml`, `recordAttachmentAnalysis`, the `summarizeToolError`-adjacent
  helpers that touch `ProjectMessageTurn`, all of `activeStreamLandingAgent`,
  `analyzePromptAttachments`, `buildAgentMessages`, etc.
- `REPEATED_EDIT_FAILURE_MESSAGE` (49) and `NO_GENERATED_HTML_MESSAGE` (52) —
  used by the route body, not by helpers. Leave them.

### Repo conventions to match

- ESM with explicit `.ts` extensions on relative imports (this repo uses
  `verbatimModuleSyntax`). route.ts already imports like
  `from './lib/cost.ts'` — the new import must be `from './lib/tool-display.ts'`.
- **Types use `import type`** — see route.ts line 4 (`import type { ... }`).
  Import `ToolArgs` / `ToolCallDisplay` with `import type`; value functions
  with a separate `import`.
- The hashline dir is the only place exempt from the server's strict lint
  rules (`apps/server/oxlint.config.ts` overrides `lib/hashline/`). The new
  file is `lib/tool-display.ts`, **NOT** under `lib/hashline/`, so it gets the
  default server rules — identical to what these functions already pass today.
  Copy bodies verbatim; do not relax types.
- Exemplar leaf-helper module in the same package: `apps/server/src/mastra/lib/cost.ts`
  (small pure functions, named exports, no app state).

## Commands you will need

| Purpose    | Command                                              | Expected on success |
|------------|------------------------------------------------------|---------------------|
| Typecheck  | `pnpm --filter @workspace/server typecheck`          | exit 0, no errors   |
| Lint       | `pnpm --filter @workspace/server lint`               | exit 0              |
| Tests      | `pnpm --filter @workspace/server test`               | all pass; **same test count** as before the move |
| Dead code  | `pnpm run fallow:dead-code`                          | exit 0 (CI gate; flags any moved-but-unwired export) |

## Scope

**In scope** (the only files you should modify):
- `apps/server/src/mastra/lib/tool-display.ts` (CREATE)
- `apps/server/src/mastra/route.ts` (remove moved definitions, add imports)

**Out of scope** (do NOT touch, even though they look related):
- `apps/server/src/mastra/route.test.ts` — the existing tests are the
  regression net; they must pass **unchanged**. If a test needs editing, that
  is a STOP (the move was not behavior-preserving).
- Any other file. Do not "tidy" route.ts beyond removing the moved symbols and
  adding the import line.
- Do not move `startToolCallDisplay` / `getToolCallDisplay` (keep the diff
  minimal and the risk low).

## Git workflow

- Branch: `advisor/002-extract-tool-display` (repo uses conventional commits;
  no evident branch convention — see `git log --oneline -10`).
- Commit message style (match repo): e.g.
  `refactor(server): extract tool-display helpers from route.ts`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Capture the baseline test count

Before changing anything, run the suite once and record the number of tests:

**Verify**: `pnpm --filter @workspace/server test 2>&1 | grep -E "Tests +[0-9]"` →
note the count (e.g. `Tests  N passed`). You will compare against this after
the move. (Exit 0.)

### Step 2: Create `apps/server/src/mastra/lib/tool-display.ts`

Create the new file containing, copied **verbatim** from route.ts (bodies
unchanged — same formatting, same types, same `as ToolArgs` casts):

- `type ToolArgs = Record<string, unknown>`
- `interface ToolCallDisplay { action: null | string; detail: null | string; id: string; tool: string }`
- `const INVALID_EDIT_RESULT_MESSAGE` (the full string literal from route.ts:50-51)
- The internal helpers, NOT exported: `booleanValue`, `numberValue`,
  `stringValue`, `stringArrayValue`, `isValidEditResult`,
  `summarizeArgsForTool`, `summarizeFindOrGrepResult`, `summarizeResultForTool`,
  `expandScreenshotUrl`
- **Exported** (`export function` / `export const`): `asToolArgs`,
  `defaultToolAction`, `summarizeToolArgs`, `summarizeToolError`,
  `summarizeToolResult`, `toolCallImages`, `toolResultIndicatesFailure`
- **Exported types**: `ToolArgs`, `ToolCallDisplay`

Order within the file: types first, then the constant, then value-coercion
helpers, then the summarize/display functions. (`summarizeToolResult`
references `INVALID_EDIT_RESULT_MESSAGE`, `isValidEditResult`,
`summarizeResultForTool`, and `summarizeToolError` — all present in this file.)
`toolCallImages` references `expandScreenshotUrl` and `stringValue` — present.
`defaultToolAction` references `stringValue` — present. No imports from
route.ts are needed — this module is a pure leaf with **no** imports from
`../route.ts` (a cycle is a STOP condition).

The file needs no imports at all except possibly none — every moved function
operates only on its arguments. (If you find one truly needs an external
symbol, STOP — you grabbed something outside the listed set.)

**Verify**: the file parses — `pnpm --filter @workspace/server typecheck 2>&1 | grep tool-display`
→ no errors mentioning the new file (route.ts will still error because it now
has duplicate/missing definitions; that's expected until Step 3).

### Step 3: Rewire `route.ts`

In `apps/server/src/mastra/route.ts`:

1. **Delete** every symbol listed in the table above from route.ts (the two
   types, `INVALID_EDIT_RESULT_MESSAGE`, and all 16 functions/consts marked
   "Move"). Do NOT delete `startToolCallDisplay`, `getToolCallDisplay`,
   `hashHtml`, `recordAttachmentAnalysis`, `REPEATED_EDIT_FAILURE_MESSAGE`, or
   `NO_GENERATED_HTML_MESSAGE`.
2. **Add the import** near the existing `./lib/*` imports (group with them):
   ```ts
   import {
     asToolArgs,
     defaultToolAction,
     summarizeToolArgs,
     summarizeToolError,
     summarizeToolResult,
     toolCallImages,
     toolResultIndicatesFailure,
   } from './lib/tool-display.ts'
   import type { ToolArgs, ToolCallDisplay } from './lib/tool-display.ts'
   ```
3. Leave `startToolCallDisplay` / `getToolCallDisplay` in place — they now
   reference `defaultToolAction`, `summarizeToolArgs`, `ToolArgs`, and
   `ToolCallDisplay` via the new imports. Confirm their bodies compile
   unchanged.

**Verify**: `pnpm --filter @workspace/server typecheck` → exit 0, no errors.

### Step 4: Lint, tests, dead-code

**Verify** (all must pass):
- `pnpm --filter @workspace/server lint` → exit 0.
- `pnpm --filter @workspace/server test` → exit 0, and
  `grep -E "Tests +[0-9]"` shows the **same count** as Step 1 (no test added,
  removed, or skipped). If the count differs, STOP.
- `pnpm run fallow:dead-code` → exit 0 (this is a CI gate; if it flags a moved
  function as unused, you forgot to import+use it in route.ts — wire the
  import and re-run).

### Step 5: Confirm the move is complete

**Verify** (all must hold):
- `grep -nE "^function (asToolArgs|booleanValue|defaultToolAction|isValidEditResult|numberValue|stringValue|stringArrayValue|summarizeToolArgs|summarizeToolError|summarizeFindOrGrepResult|toolCallImages|toolResultIndicatesFailure|expandScreenshotUrl)\b|^const (summarizeArgsForTool|summarizeResultForTool|INVALID_EDIT_RESULT_MESSAGE)\b" apps/server/src/mastra/route.ts`
  → **no matches** (every listed symbol is gone from route.ts).

## Test plan

This is a **behavior-preserving refactor** — the existing 30+ integration
tests in `route.test.ts` are the characterization net. They mock `agent.stream`
and assert the exact SSE event payloads that these helpers produce
(`tool_call` action/detail/result/images, error summaries, etc.), so any
behavior drift fails a test. Requirements:

- No new tests required for this plan. Do not edit `route.test.ts`.
- Assert the test **count is unchanged** before/after (Step 1 vs Step 4) — that
  proves nothing was silently skipped.
- OPTIONAL follow-up (explicitly deferred, out of scope): add focused unit
  tests for the pure helpers in a new `lib/tool-display.test.ts` once they
  live in isolation. Do not do this in this plan — keep the diff to pure code
  motion so review is trivial.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm --filter @workspace/server typecheck` exits 0
- [ ] `pnpm --filter @workspace/server lint` exits 0
- [ ] `pnpm --filter @workspace/server test` exits 0 with the **same test count** recorded in Step 1
- [ ] `pnpm run fallow:dead-code` exits 0
- [ ] The Step 5 `grep` returns no matches in `route.ts`
- [ ] `git status --short` lists ONLY `apps/server/src/mastra/route.ts` (modified) and `apps/server/src/mastra/lib/tool-display.ts` (new)
- [ ] `lib/tool-display.ts` has **no** import from `../route.ts` (no cycle)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check at the top is non-empty AND the live `route.ts` does not
  match the line numbers / excerpts above (someone landed route.ts changes
  since planning). Re-confirm the symbol list before proceeding.
- Any `route.test.ts` test fails after the move, or the test count changes.
  This means the extraction was not pure code motion — re-check that every
  function body was copied verbatim and that `route.ts` imports every symbol
  it still references. Do not edit the tests to make them pass.
- `pnpm run fallow:dead-code` flags a moved function as unused (export not
  imported) — wire the missing import; if you cannot, STOP.
- typecheck reports a cyclic import (`tool-display.ts` importing from
  `../route.ts`). The new module must be a pure leaf.
- You discover one of the "internal (no)" symbols in the table is actually
  referenced elsewhere outside the listed cluster. Report it; the boundary
  needs revisiting.

## Maintenance notes

- After this lands, **display/summarization** changes go in
  `lib/tool-display.ts`; **SSE event-mapping / run-lifecycle** changes stay
  in `route.ts`.
- Adding a new agent tool: add its entries to `summarizeArgsForTool` and
  `summarizeResultForTool` in the new module (and to `defaultToolAction` if the
  tool needs a derived intent when the agent omits `action`). Then add the
  `toolName` branches in route.ts's cost/scrape/image accounting — that part
  stays in the loop.
- Reviewer: the diff should be pure code motion + one import block. Reject any
  change to function bodies, the test file, or `startToolCallDisplay` /
  `getToolCallDisplay`. If the SSE output of any `route.test.ts` case changed,
  the move altered behavior — block it.
- Follow-up (separate plan): once isolated, add `lib/tool-display.test.ts`
  unit tests for the summarize helpers so future display tweaks don't require
  the full integration suite.
