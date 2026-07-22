# Plan 005: Accumulate `warnings` across multi-section edits

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5daf56ef..HEAD -- apps/server/src/mastra/tools/edit.ts apps/server/src/mastra/tools/edit.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: correctness (diagnostic data loss in multi-section edits)
- **Planned at**: commit `5daf56ef`, 2026-07-19
- **Issue**: (only when published via `--issues`)

## Why this matters

The `edit` tool's execute loop iterates over every `[#TAG]` section in a
batched diff and applies them sequentially through the hashline `Patcher`.
The AGENTS contract is explicit: one `edit` call may batch many
`SWAP`/`DEL`/`INS` ops and several `[#TAG]` sections, applied in order.
But the loop currently **overwrites** the per-section accumulators
(`warnings`, `firstChangedLine`) on each iteration, so only the LAST
section's diagnostics survive in the returned tool result. A multi-section
edit that triggers a rebalance warning on section 1 silently drops that
warning when section 2 lands. The agent loses signal mid-turn. This plan
makes `warnings` and `firstChangedLine` accumulate across sections.

## Current state

`apps/server/src/mastra/tools/edit.ts` — the loop (around lines 45-80 of
the `execute` body). Verbatim:

```ts
const patcher = new Patcher({ fs, snapshots })
let firstChangedLine = 0
let warnings: string[] = []
let tag = ''
let before = ''
let after = ''
for (const section of sections) {
  // prepare() validates the snapshot tag — throws MismatchError on stale.
  const prepared = await patcher.prepare(section)
  let nextHtml = prepared.applyResult.text
  let balanceWarnings: string[] = []
  const balance = checkHtmlBalance(nextHtml)
  if (!balance.ok) {
    // Conservative auto-repair before rejecting: collapse adjacent
    // duplicate tags that survived applyEdits' line-level self-hear.
    // (full comment in source)
    const fix = autofixHtmlBalance(nextHtml)
    if (fix.fixed && fix.html !== nextHtml) {
      prepared.applyResult.text = fix.html
      nextHtml = fix.html
      balanceWarnings = fix.applied.map((d) => `html autofix: ${d}`)
    } else {
      throw new Error(
        `Edit rejected: it would produce unbalanced HTML (${balance.issues.join('; ')}). Re-read the file and narrow the SWAP range to only the lines whose content changes.`,
      )
    }
  }
  const result = await patcher.commit(prepared)
  firstChangedLine = result.firstChangedLine ?? 0            // ← OVERWRITES
  warnings = [...result.warnings, ...balanceWarnings]        // ← OVERWRITES
  tag = result.fileHash
  before = result.before
  after = result.after
}
```

Two of those reassignments are wrong:

- `warnings = [...]` — reassigns; earlier sections' warnings are lost.
- `firstChangedLine = result.firstChangedLine ?? 0` — overwrites; if
  section 1 changed line 10 and section 2 changed line 50, the returned
  value is 50 (the agent thinks the first change is at line 50).

Three are intentional / harmless — leave them:

- `tag = result.fileHash` — correct. The last section's commit mints the
  hash of the FINAL document state, which is what the agent's next
  `read` will see. One fresh tag per call, as the DOX requires.
- `before = result.before` / `after = result.after` — used only for
  `diffPreview` (a 3-line head-only preview, informational). Multi-section
  previews showing only the last section's diff is misleading but not
  load-bearing; document the limitation in a maintenance note, don't try
  to fix it here (concatenating previews would balloon the tool result).

### Repo conventions to match

- ESM with explicit `.ts` relative imports.
- `apps/server/src/mastra/tools/edit.test.ts` uses Vitest and constructs
  edits against an in-memory `HtmlStore`/`HtmlStoreFilesystem` setup. Read
  it first to mirror the existing test pattern for multi-section edits.
- The hashline `Patcher` is under relaxed STYLE rules
  (`apps/server/oxlint.config.ts` override for `lib/hashline/**`), but
  `tools/edit.ts` is under the default strict rules — match them.

## Commands you will need

| Purpose    | Command                                              | Expected on success |
|------------|------------------------------------------------------|---------------------|
| Typecheck  | `pnpm --filter @workspace/server typecheck`          | exit 0, no errors   |
| Lint       | `pnpm --filter @workspace/server lint`               | exit 0              |
| Tests      | `pnpm --filter @workspace/server test`               | all pass; coverage ≥ 90% |
| Focused    | `pnpm --filter @workspace/server test -- --run edit 2>&1 \| tail -15` | edit tests pass |

## Scope

**In scope** (the only files you should modify):
- `apps/server/src/mastra/tools/edit.ts` — change two lines in the loop
  to accumulate instead of overwrite.
- `apps/server/src/mastra/tools/edit.test.ts` — add one regression test
  that asserts multi-section warnings survive.

**Out of scope** (do NOT touch):
- `before`/`after`/`tag` assignments — see "Current state" for why.
- The `diffPreview` builder at the bottom of `edit.ts` — informational
  only; out of scope.
- `apps/server/src/mastra/lib/hashline/apply.ts` and other hashline
  internals — the bug is in the tool layer's loop, not the engine.
- DOX files — no behavioral contract changes that need documenting (the
  DOX already promises "one fresh #TAG for call" + warnings; this plan
  makes the warnings promise true for multi-section).

## Git workflow

- Branch: `advisor/005-accumulate-edit-warnings`.
- Commit message style (match repo): e.g.
  `fix(edit): accumulate warnings across multi-section edit calls`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix `warnings` accumulation

In `apps/server/src/mastra/tools/edit.ts`, inside the `for (const section
of sections)` loop, change:

```ts
warnings = [...result.warnings, ...balanceWarnings]
```

to:

```ts
warnings = [...warnings, ...result.warnings, ...balanceWarnings]
```

That single change makes warnings from every section survive into the
returned tool result.

**Verify**: `pnpm --filter @workspace/server typecheck` → exit 0.

### Step 2: Fix `firstChangedLine` accumulation

In the same loop, change:

```ts
firstChangedLine = result.firstChangedLine ?? 0
```

to track the earliest non-zero changed line across sections:

```ts
const sectionFirstChanged = result.firstChangedLine ?? 0
if (
  sectionFirstChanged > 0 &&
  (firstChangedLine === 0 || sectionFirstChanged < firstChangedLine)
) {
  firstChangedLine = sectionFirstChanged
}
```

Semantics: the final `firstChangedLine` is the earliest line touched by
ANY section of the edit. (If all sections return `undefined`/`0`, the
value stays `0` as before.)

**Verify**: `pnpm --filter @workspace/server typecheck` → exit 0.

### Step 3: Add a regression test in `edit.test.ts`

Open `apps/server/src/mastra/tools/edit.test.ts`. Read it to find the
existing setup pattern (the file uses an in-memory `HtmlStore` and the
`Patcher` directly, or constructs the tool via `createEditTool`). Add a
new test inside the existing top-level `describe` (or a new `describe` if
the file groups tests by topic — match its structure).

The test must:

1. Seed a `HtmlStore` with HTML that has two clearly-separable regions
   (e.g. a `<style>` block and a `<body>` block), each large enough to
   trigger a balance autofix warning when one closer is duplicated.
2. Construct ONE `edit` call whose `diff` contains TWO `[#TAG]` sections
   — one per region — each producing at least one warning (the easiest
   reliable source is the `html autofix:` warning from
   `autofixHtmlBalance`; mirror whatever existing test produces one —
   search `edit.test.ts` for `autofix:` or `warnings` to find the
   pattern).
3. Call `execute({ action, diff })` and assert:
   - `result.ok === true`
   - `result.warnings.length >= 2` (both sections' warnings survive — the
     bug would have produced `<2`)
   - The warnings from BOTH sections are present (assert specific
     substrings if practical, e.g. two distinct `html autofix:` lines,
     or two distinct closer-tag mentions).

If you cannot reliably produce two warnings from two sections without
deep hashline surgery, the simpler fallback is a single-section test that
asserts `warnings.length` matches `[...result.warnings,
...balanceWarnings]` for one section (a smoke test for the spread change)
plus a multi-section edit that simply asserts `result.ok === true` and
the final tag matches a fresh read. Note which path you took in the
reviewer NOTES.

**Verify**: `pnpm --filter @workspace/server test -- --run edit 2>&1 | tail -15`
→ new test passes, all existing edit tests still pass.

### Step 4: Full verification

**Verify** (all must pass):
- `pnpm --filter @workspace/server typecheck` → exit 0.
- `pnpm --filter @workspace/server lint` → exit 0.
- `pnpm --filter @workspace/server test` → exit 0; baseline + 1 new test;
  coverage ≥ 90%.
- `pnpm run fallow:dead-code` → exit 0 (or only the pre-existing
  `@workspace/agent-skills` flag — record in NOTES, do not chase).

### Step 5: Confirm scope

**Verify**: `git status --short` lists ONLY
`apps/server/src/mastra/tools/edit.ts` and
`apps/server/src/mastra/tools/edit.test.ts`.

## Test plan

One new test (described in Step 3). It pins:

- Multi-section edits return the union of all per-section warnings, not
  just the last section's.
- `firstChangedLine` reflects the earliest changed line across all
  sections.

Pattern to follow: the existing `edit.test.ts` cases that exercise
balance-autofix or multi-op diffs. Read the file first to mirror its
setup (it constructs a `Patcher` against a real `HtmlStoreFilesystem`).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm --filter @workspace/server typecheck` exits 0
- [ ] `pnpm --filter @workspace/server lint` exits 0
- [ ] `pnpm --filter @workspace/server test` exits 0; test count is
      baseline + 1; coverage ≥ 90%
- [ ] `grep -nE 'warnings = \[\.\.\.result\.warnings' apps/server/src/mastra/tools/edit.ts`
      shows the accumulated form `[...warnings, ...result.warnings,
      ...balanceWarnings]` (not the overwrite form)
- [ ] `git status --short` lists ONLY the two in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check is non-empty AND the live `edit.ts` loop does not match
  the excerpt (someone reworked the multi-section path since planning).
- Constructing a two-warning multi-section edit requires changing
  `lib/hashline/` internals — that's out of scope. Fall back to the
  simpler test path described in Step 3 and note it in the reviewer
  NOTES.
- `edit.test.ts` does not have a balance-autofix test pattern to mirror
  — its setup has drifted. Report what patterns ARE available and pick
  the closest one.
- `result.warnings` from `Patcher.commit` is sometimes `undefined` rather
  than an array (the recon read the engine as returning an array, but if
  it does not, the spread `[...warnings, ...result.warnings, ...]` would
  throw). If so, add a defensive `(result.warnings ?? [])` — but first
  confirm by reading `lib/hashline/patcher.ts`'s `PatchSectionResult`
  type.

## Maintenance notes

- After this lands, multi-section edits return the full warning set. The
  agent sees every rebalance / closer-duplicate notice, not just the
  last section's.
- `before`/`after`/`diffPreview` still reflect only the LAST section.
  This is intentional for this plan (fixing it would balloon the tool
  result). A follow-up plan could either (a) drop `diffPreview` for
  multi-section edits, or (b) concatenate section previews — neither is
  worth doing standalone.
- `firstChangedLine` is now the earliest changed line across sections;
  the agent's UI uses this only as a hint, so the semantic change is
  safe.
- Reviewer: the diff should be two line-level edits in the loop + one
  new test. Reject any change to the hashline engine, to
  `before`/`after`/`tag`, or to other tools.
