# Plan 004: Delete the dead `grep` tool and its search helper

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5daf56ef..HEAD -- apps/server/src/mastra/tools/grep.ts apps/server/src/mastra/lib/grep-search.ts apps/server/src/mastra/tools/external-tools.test.ts apps/server/src/mastra/tools/landing-tools.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt (dead-code removal)
- **Planned at**: commit `5daf56ef`, 2026-07-19
- **Issue**: (only when published via `--issues`)

## Why this matters

The landing-page agent moved to the hashline edit DSL (`read`/`find`/`edit`
with `[#TAG]` snapshot headers). The older `grep` tool — a pre-hashline
line search that returns `rawMatches` for an `oldText`-style edit DSL — is
**not registered** in `apps/server/src/mastra/tools/landing-tools.ts`
(verified: the registry contains `scrape`, `read`, `find`, `edit`,
`screenshot`, `generate_image` only). So `createGrepTool` and its helper
`grepHtml` have no production callers; they survive only as a
`describe('grepHtml', ...)` block in `external-tools.test.ts`. The DOX
calls them "legacy grep helpers [that] stay internal, not public landing
tools" — but if nothing internal actually uses them either, "internal"
just means "dead." Deleting removes 225 lines of unmaintained code that
implies a tool surface the agent no longer offers.

## Current state

Two source files plus one test block. All line numbers from recon at
commit `5daf56ef`.

1. `apps/server/src/mastra/tools/grep.ts` (73 lines) — exports
   `createGrepTool(store: HtmlStore)`. Builds a Mastra `createTool` whose
   `id: 'grep'` and whose description references "edit.oldText" (the
   pre-hashline edit DSL — the current `edit` tool takes `{ action, diff }`
   hashline DSL, no `oldText`). Imports `grepHtml` from
   `'../lib/grep-search.ts'`.
2. `apps/server/src/mastra/lib/grep-search.ts` (152 lines) — exports
   `grepHtml(content, pattern, options)` plus types `GrepMatch`,
   `GrepOptions`, `GrepResult`. Pure line-based regex/literal search with
   context + truncation.
3. `apps/server/src/mastra/tools/external-tools.test.ts` — imports both
   (`grepHtml` at line 3, `createGrepTool` at line 7) and has a
   `describe('grepHtml', ...)` block (lines 21-70) with three tests:
   - `'searches literal text with context, limits, and truncation notices'`
     (~line 22)
   - `'reports invalid regexes and no-match searches'` (~line 41)
   - `'wraps grep results in the Mastra tool response shape'` (~line 53)

   The file's other `describe` blocks (`image-store`,
   `createGenerateImageTool`, `createScrapeTool`, `createScreenshotTool`)
   are unrelated and stay.

**Production tool registry** — `apps/server/src/mastra/tools/landing-tools.ts`
contains the canonical `LANDING_TOOL_DEFINITIONS` array. The `grep` tool
is NOT in it. (Sanity check the registry did not change: run
`grep -n "'grep'" apps/server/src/mastra/tools/landing-tools.ts` after
the drift check — should return no matches.)

### Repo conventions to match

- ESM with explicit `.ts` extensions on relative imports
  (`verbatimModuleSyntax`).
- Vitest tests use `describe`/`it`/`expect` from `vitest`.
- The server test script enforces 90% line coverage — deleting tested
  code can drop coverage of the deleted file to 0%, which is fine (the
  file is gone), but the **project-wide** coverage must stay ≥90%.
  Confirm in Step 4.

## Commands you will need

| Purpose    | Command                                              | Expected on success |
|------------|------------------------------------------------------|---------------------|
| Typecheck  | `pnpm --filter @workspace/server typecheck`          | exit 0, no errors   |
| Lint       | `pnpm --filter @workspace/server lint`               | exit 0              |
| Tests      | `pnpm --filter @workspace/server test`               | all pass; coverage ≥ 90% |
| Dead code  | `pnpm run fallow:dead-code`                          | exit 0 (CI gate) |

## Scope

**In scope** (the only files you should modify or delete):
- `apps/server/src/mastra/tools/grep.ts` — **delete the file**.
- `apps/server/src/mastra/lib/grep-search.ts` — **delete the file**.
- `apps/server/src/mastra/tools/external-tools.test.ts` — delete the
  `describe('grepHtml', ...)` block (lines ~21-70) and remove the two
  grep-related imports.

**Out of scope** (do NOT touch):
- `apps/server/src/mastra/tools/landing-tools.ts` — `grep` is not
  registered; no change needed. (If the drift check shows it WAS added,
  STOP — grep became live and this plan is wrong.)
- Any other tool file (`read.ts`, `find.ts`, `edit.ts`, `scrape.ts`,
  `screenshot.ts`, `generate-image.ts`). They have live registry entries.
- `apps/server/src/mastra/route.ts` — does not import grep (verified).
- `apps/server/src/mastra/lib/tool-display.ts` — has a `grep:` case in
  `summarizeArgsForTool` and `summarizeResultForTool` inherited from plan
  002 (the prior extraction). Those branches are documented as harmless
  dead code that mirrors the also-dead `skill*` branches — leave them;
  they cost nothing and removing them is out of scope for this plan.
- DOX files — `apps/server/src/mastra/AGENTS.md` mentions "legacy grep
  helpers stay internal, not public landing tools" in passing; this plan
  deletes them outright, so update that one phrase to past tense OR
  remove it (see Step 4).

## Git workflow

- Branch: `advisor/004-delete-dead-grep-tool`.
- Commit message style (match repo): e.g.
  `refactor(server): delete dead grep tool and grep-search helper`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm zero production callers

Before deleting, verify nothing in `apps/server/src/**` outside the files
listed above imports the dead symbols.

**Verify**:
```
grep -rn "createGrepTool\|grepHtml\|from.*'tools/grep'\|from.*'lib/grep-search'\|from.*'./grep'" apps/server/src --include="*.ts" | grep -v external-tools.test.ts
```
→ no matches. (The two source files reference each other internally, but
those don't count — they're being deleted together. The only EXTERNAL
caller should be `external-tools.test.ts`.) If anything else matches,
STOP — grep has a live caller and this plan is wrong.

Also confirm the tool registry still excludes grep:

**Verify**: `grep -n "'grep'" apps/server/src/mastra/tools/landing-tools.ts`
→ no matches.

### Step 2: Delete the `describe('grepHtml', ...)` block and imports from `external-tools.test.ts`

In `apps/server/src/mastra/tools/external-tools.test.ts`:

1. Delete the entire `describe('grepHtml', () => { ... })` block (lines
   ~21-70, from `describe('grepHtml', () => {` through its closing `})`.
2. Remove these two imports from the top of the file:
   - `import { grepHtml } from '../lib/grep-search.ts'` (line 3)
   - `import { createGrepTool } from './grep.ts'` (line 7)
3. Leave `import { createHtmlStore } from '../lib/html-store.ts'` (line 5)
   IF it is still used by other tests in the file. Check with
   `grep -n createHtmlStore apps/server/src/mastra/tools/external-tools.test.ts`:
   if the only remaining usage was inside the deleted grep block, remove
   that import too; otherwise keep it.

**Verify**: `grep -nE 'grepHtml|createGrepTool|grep-search|tools/grep' apps/server/src/mastra/tools/external-tools.test.ts`
→ no matches.

### Step 3: Delete the two source files

```
rm apps/server/src/mastra/tools/grep.ts
rm apps/server/src/mastra/lib/grep-search.ts
```

**Verify**: `ls apps/server/src/mastra/tools/grep.ts apps/server/src/mastra/lib/grep-search.ts 2>&1`
→ both report "No such file or directory".

### Step 4: Update the one DOX phrase in `apps/server/src/mastra/AGENTS.md`

`apps/server/src/mastra/AGENTS.md` says:

> `tools/`: Mastra tool factories + landing tool registry —
> scrape/read/find/edit/generate_image/screenshot; legacy grep helpers
> stay internal, not public landing tools.

After deletion, "legacy grep helpers stay internal" is wrong. Update to
reflect reality — remove the trailing clause:

> `tools/`: Mastra tool factories + landing tool registry —
> scrape/read/find/edit/generate_image/screenshot.

(The file's "Style" guidance elsewhere in the project says to delete
stale notes rather than explain history, so a clean removal beats
"formerly had grep.")

**Verify**: `grep -n 'grep' apps/server/src/mastra/AGENTS.md` → no
matches (the word shouldn't appear anywhere else in that doc).

### Step 5: Full verification

**Verify** (all must pass):
- `pnpm --filter @workspace/server typecheck` → exit 0. (A typecheck
  failure pointing at a missing `'./grep'` or `'../lib/grep-search'`
  import means you missed a caller — find and remove it before
  continuing.)
- `pnpm --filter @workspace/server lint` → exit 0.
- `pnpm --filter @workspace/server test` → exit 0; test count drops by
  exactly 3 from baseline (the three deleted `grepHtml` tests); coverage
  ≥ 90%.
- `pnpm run fallow:dead-code` → exit 0 (or fails ONLY on the
  pre-existing `@workspace/agent-skills` dormant-dep flag already in the
  README rejected list — record in NOTES but do not chase).

### Step 6: Confirm scope

**Verify**: `git status --short` lists ONLY:
- `D apps/server/src/mastra/tools/grep.ts`
- `D apps/server/src/mastra/lib/grep-search.ts`
- `M apps/server/src/mastra/tools/external-tools.test.ts`
- `M apps/server/src/mastra/AGENTS.md` (DOX phrase update)

Reject any other modified file.

## Test plan

Pure deletion — the existing tool integration tests in
`screenshot.test.ts`, `read.test.ts`, `find.test.ts`, `edit.test.ts`, and
`external-tools.test.ts` (the surviving blocks) are the regression net.
No new tests required.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm --filter @workspace/server typecheck` exits 0
- [ ] `pnpm --filter @workspace/server lint` exits 0
- [ ] `pnpm --filter @workspace/server test` exits 0; test count is
      baseline − 3; coverage ≥ 90%
- [ ] `pnpm run fallow:dead-code` exits 0 (or only the pre-existing
      `@workspace/agent-skills` flag)
- [ ] The two source files are deleted (Step 3 `ls` returns "No such
      file or directory")
- [ ] `git status --short` lists ONLY the four in-scope changes
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's grep finds a production caller of `createGrepTool` or
  `grepHtml` outside `external-tools.test.ts`. The dead-code assumption
  is wrong; report the caller.
- `landing-tools.ts` contains a `'grep'` entry. The tool became live
  since planning; this plan would break it. STOP and let the reviewer
  decide whether to register grep properly or proceed with deletion.
- `typecheck` after Step 3 reports a missing import. You missed a
  caller; find and remove it (do NOT re-add the deleted file).
- Project-wide coverage drops below 90% after deletion. That would mean
  grep was loading coverage for some neighboring module — unlikely, but
  if it happens, report which file's coverage dropped.

## Maintenance notes

- After this lands, the agent's only search surface is the hashline
  `read` (with `ranges`) and `find` (regex/literal + context) tools. The
  old line-search + `oldText`-edit workflow is gone.
- `tool-display.ts` retains its `grep:` cases in
  `summarizeArgsForTool`/`summarizeResultForTool` — those are
  behavior-neutral dead branches left over from plan 002, mirroring the
  also-dead `skill*` branches. Removing them is a separate, even smaller
  cleanup; do not bundle.
- Reviewer: the diff should be two file deletions, one trimmed
  `describe` block in `external-tools.test.ts` (plus its two imports),
  and one DOX phrase update. Reject any change to other tool files or
  to the tool registry.
