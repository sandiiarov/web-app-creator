# Plan 001: Delete the dead legacy turn writers

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5daf56ef..HEAD -- apps/server/src/mastra/lib/project-store.ts apps/server/src/mastra/lib/project-store.test.ts apps/server/src/mastra/route.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt (dead-code removal)
- **Planned at**: commit `5daf56ef`, 2026-07-19
- **Issue**: (only when published via `--issues`)

## Why this matters

`apps/server/src/mastra/lib/project-store.ts` exposes three production-dead
functions — `appendProjectMessageTurn`, `saveProjectMessageTurn`, and the
internal `writeMessages` — that write to the legacy `messages.json` file.
Grep confirms their **only callers are tests**; the production stream loop
in `apps/server/src/mastra/route.ts` writes the append-only logs
exclusively (`appendClientMessage`, `appendAgentMessages`,
`appendVisionMessage`). `getProject`'s legacy fallback reads
`messages.json` for pre-refactor projects, so `readMessages` (and the
`MESSAGES_JSON` constant) must stay — but the writers are dead weight in a
1087-line module and mislead readers into thinking a dual-write path is
active. The DOX already says `messages.json` is a "read-only fallback";
this plan brings the code into compliance. Removing these now also shrinks
the surface for the planned god-module split (plan 009).

## Current state

The three symbols to delete live in `apps/server/src/mastra/lib/project-store.ts`:

- `appendProjectMessageTurn` (exported, `project-store.ts:163-171`):
  ```ts
  export async function appendProjectMessageTurn(
    id: string,
    turn: ProjectMessageTurn,
  ): Promise<ProjectMessageTurn[]> {
    const messages = await readMessages(id)
    const next = [...messages, turn]
    await writeMessages(id, next)
    return next
  }
  ```
- `saveProjectMessageTurn` (exported, `project-store.ts:418-430`):
  ```ts
  export async function saveProjectMessageTurn(
    id: string,
    turn: ProjectMessageTurn,
  ): Promise<ProjectMessageTurn[]> {
    const messages = await readMessages(id)
    const index = messages.findIndex((entry) => entry.id === turn.id)
    const next =
      index === -1
        ? [...messages, turn]
        : messages.map((entry, i) => (i === index ? turn : entry))
    await writeMessages(id, next)
    return next
  }
  ```
- `writeMessages` (internal helper, `project-store.ts:1061-1069`):
  ```ts
  async function writeMessages(id: string, messages: ProjectMessageTurn[]) {
    invalidateTurnCache(id)
    await ensureProjectDir(id)
    await writeFile(
      join(projectDir(id), MESSAGES_JSON),
      JSON.stringify(messages, null, 2),
      'utf8',
    )
  }
  ```

**KEEP** (still used by `getProject`'s legacy read fallback at
`project-store.ts:255-262`):
- `readMessages` (`project-store.ts:959-967`) — reads legacy `messages.json`.
- `MESSAGES_JSON` constant (`project-store.ts:71`).

### Test callers that must be removed/refactored

1. `apps/server/src/mastra/lib/project-store.test.ts` imports both
   `appendProjectMessageTurn` and `saveProjectMessageTurn` (lines 11, 25)
   and exercises them in two tests under
   `describe('project message storage')`:
   - `'appends and reads project message turns'` (~line 124)
   - `'upserts a project message turn by id for incremental checkpoints'`
     (~line 137)

   These two tests are characterization tests for the dead writers — delete
   them and remove the two imports.

2. `apps/server/src/mastra/route.test.ts:1435` destructures
   `appendProjectMessageTurn` to seed legacy history for a "history replay"
   test. The test's intent is **`getProject`'s legacy-`messages.json`
   fallback**, not the writer itself — so refactor it to write
   `messages.json` directly via `node:fs/promises`. The test currently
   looks like:
   ```ts
   const { appendProjectMessageTurn, createProject } =
     await import('./lib/project-store.ts')
   const project = await createProject()
   createdProjectIds.push(project.id)
   await appendProjectMessageTurn(project.id, { /* a ProjectMessageTurn */ })
   ```
   Replace with a direct `writeFile` to the project's `messages.json` (see
   Step 2 for the exact shape — model it on the existing test data; the
   on-disk shape is `JSON.stringify([turn], null, 2)`).

### Repo conventions to match

- ESM with explicit `.ts` extensions on relative imports
  (`verbatimModuleSyntax`).
- `apps/server/src/mastra/lib/project-store.ts` follows the project's strict
  Oxlint rules (perfectionist sort + `no-explicit-any`); the surrounding
  function definitions are already sorted alphabetically by `oxlint --fix`.
- Tests use `vitest` (`describe`/`it`/`expect`); the project's test script
  enforces 90% line coverage — confirm coverage stays ≥90% after the
  deletion (covered by the test step below).
- Exemplar leaf-helper module in the same package:
  `apps/server/src/mastra/lib/cost.ts`.

## Commands you will need

| Purpose    | Command                                              | Expected on success |
|------------|------------------------------------------------------|---------------------|
| Typecheck  | `pnpm --filter @workspace/server typecheck`          | exit 0, no errors   |
| Lint       | `pnpm --filter @workspace/server lint`               | exit 0              |
| Tests      | `pnpm --filter @workspace/server test`               | all pass; coverage ≥ 90% |
| Dead code  | `pnpm run fallow:dead-code`                          | exit 0 (CI gate; pre-existing `@workspace/agent-skills` flag is unrelated — see README rejected) |

(Exact commands from this repo — verified during recon. The server test
command runs `vitest run --coverage`.)

## Scope

**In scope** (the only files you should modify):
- `apps/server/src/mastra/lib/project-store.ts` — delete the 3 symbols above.
- `apps/server/src/mastra/lib/project-store.test.ts` — delete the 2 tests
  above and remove the unused imports.
- `apps/server/src/mastra/route.test.ts` — refactor the single test that
  seeds legacy history via `appendProjectMessageTurn` to write
  `messages.json` directly via `node:fs/promises`.

**Out of scope** (do NOT touch, even though they look related):
- `readMessages` and the `MESSAGES_JSON` constant — `getProject` still
  reads legacy `messages.json` for old projects.
- Any other writer in `project-store.ts` (`appendClientMessage`,
  `appendAgentMessages`, `appendVisionMessage`, `writeMeta`,
  `writeHtmlDocument`, `saveProjectRawMessages`). They have live callers.
- The DOX files — `apps/server/AGENTS.md` and
  `apps/server/src/mastra/AGENTS.md` already describe `messages.json` as a
  read-only legacy fallback; the code is being brought INTO compliance, so
  no doc change is needed.

## Git workflow

- Branch: `advisor/001-delete-dead-turn-writers` (repo uses conventional
  commits; no evident branch convention — see `git log --oneline -10`).
- Commit message style (match repo): e.g.
  `refactor(server): delete dead legacy turn writers`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Capture the baseline test count and coverage

Before changing anything, record the baseline so you can prove the move is
behavior-preserving for everything EXCEPT the deleted tests.

**Verify**: `pnpm --filter @workspace/server test 2>&1 | tail -25` → note
the test count and coverage percent. You will compare against this after
the change. The count should drop by exactly 2 (the deleted
project-store.test.ts cases); the route.test.ts case stays (refactored, not
removed). Coverage must stay ≥90%.

### Step 2: Refactor the `route.test.ts` legacy-history test FIRST

Open `apps/server/src/mastra/route.test.ts` around line 1430. The test at
that location uses `appendProjectMessageTurn` to seed a `ProjectMessageTurn`
into legacy storage, then exercises the agent's history-replay path
(`getProject` falling back to `messages.json`).

Replace the import + seeding with a direct `writeFile` of `messages.json`
into the project dir. Concretely:

1. Drop `appendProjectMessageTurn` from the dynamic import; keep
   `createProject` and any other symbols the test still uses.
2. Add an import of `writeFile` from `node:fs/promises` and `join` from
   `node:path` if not already present at the top of the file (check the
   existing imports — the test file already imports `node:fs/promises`
   helpers elsewhere; reuse them).
3. Replace the `appendProjectMessageTurn(project.id, { ... })` call with:
   ```ts
   const turn = { /* the same ProjectMessageTurn literal the test had */ }
   const messagesPath = join(
     PROJECTS_DIR,            // already defined at the top of project-store.test.ts; in route.test.ts use the equivalent path resolution the file already uses for project dirs
     project.id,
     'messages.json',
   )
   await writeFile(messagesPath, JSON.stringify([turn], null, 2), 'utf8')
   ```
   The on-disk shape produced by the deleted `writeMessages` is
   `JSON.stringify(messages, null, 2)` — match it exactly so `readMessages`
   parses the file identically.

**Verify**: `pnpm --filter @workspace/server test -- --run route.test 2>&1 | tail -15`
→ the refactored test still passes (proves the legacy read fallback works
when `messages.json` is seeded directly). If you cannot find the project
dir constant in `route.test.ts`, STOP — the test layout has drifted.

### Step 3: Delete the two characterization tests in `project-store.test.ts`

In `apps/server/src/mastra/lib/project-store.test.ts`:

1. Delete the two `it(...)` blocks: `'appends and reads project message
   turns'` (~line 124) and `'upserts a project message turn by id for
   incremental checkpoints'` (~line 137). Delete each block from its
   opening `it(` through its closing `})`.
2. Remove the now-unused imports `appendProjectMessageTurn` and
   `saveProjectMessageTurn` from the `import { ... } from
   './project-store.ts'` block at the top of the file.

**Verify**: `grep -nE 'appendProjectMessageTurn|saveProjectMessageTurn'
apps/server/src/mastra/lib/project-store.test.ts` → no matches.

### Step 4: Delete the three symbols from `project-store.ts`

In `apps/server/src/mastra/lib/project-store.ts`:

1. Delete the `appendProjectMessageTurn` function (~line 163-171, including
   its leading JSDoc comment that starts with `/** Append a completed
   project conversation turn...`).
2. Delete the `saveProjectMessageTurn` function (~line 405-430, including
   its leading JSDoc comment block that explains the streaming-checkpoint
   semantics).
3. Delete the internal `writeMessages` helper (~line 1059-1069, including
   its leading JSDoc if any).

**Verify**: `grep -nE '^export async function (appendProjectMessageTurn|saveProjectMessageTurn)|^async function writeMessages' apps/server/src/mastra/lib/project-store.ts`
→ no matches.

### Step 5: Typecheck + lint + tests + dead-code

**Verify** (all must pass):
- `pnpm --filter @workspace/server typecheck` → exit 0. If it reports a
  missing symbol anywhere, you missed a caller — find and fix it before
  continuing (do NOT just re-add the deleted function).
- `pnpm --filter @workspace/server lint` → exit 0. If `oxlint --fix`
  reorders anything, run it manually and confirm only formatting changed.
- `pnpm --filter @workspace/server test` → exit 0; the count dropped by
  exactly 2 from Step 1's baseline; coverage ≥ 90%.
- `pnpm run fallow:dead-code` → exit 0. (If this exits non-zero on
  `@workspace/agent-skills` instead of any `project-store.ts` symbol, that
  is the pre-existing dormant-dep flag already in the README's rejected
  list — not introduced by this plan; record it in NOTES but do not chase
  it.)

### Step 6: Confirm nothing in production still imports the deleted symbols

**Verify**: `grep -rn "appendProjectMessageTurn\|saveProjectMessageTurn"
apps/server/src --include="*.ts"` → matches only inside this plan file
(`plans/001-...`) if at all; no source-file matches.

## Test plan

This is a **pure deletion** — the existing integration tests in
`route.test.ts` (30+ cases, including the refactored legacy-history test)
are the regression net. Requirements:

- No new tests required. The refactored `route.test.ts` case is the proof
  that the legacy READ path still works for old projects.
- Assert the test count drops by exactly 2 (the two deleted
  `project-store.test.ts` cases); if it drops by more, you accidentally
  removed a live test.
- Coverage must stay ≥90% (the server's test script enforces this).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm --filter @workspace/server typecheck` exits 0
- [ ] `pnpm --filter @workspace/server lint` exits 0
- [ ] `pnpm --filter @workspace/server test` exits 0; test count is
      baseline − 2; coverage ≥ 90%
- [ ] `pnpm run fallow:dead-code` exits 0 (or fails ONLY on the
      pre-existing `@workspace/agent-skills` flag, which is recorded in the
      README rejected list)
- [ ] The Step 4 + Step 6 `grep`s return no matches
- [ ] `git status --short` lists ONLY the three in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check is non-empty AND the live code does not match the
  excerpts (someone changed `project-store.ts` or its tests since
  planning). Re-confirm the symbol list before proceeding.
- `route.test.ts` does not have an obvious way to resolve the project dir
  path (no `PROJECTS_DIR` constant or equivalent) — the test refactor in
  Step 2 needs that, and improvising a path resolver risks the test
  passing for the wrong reason.
- `typecheck` after Step 4 reports a caller of `appendProjectMessageTurn`
  or `saveProjectMessageTurn` outside the three in-scope files. The dead-
  code assumption is wrong; report the caller.
- The test count in Step 5 drops by anything other than 2.

## Maintenance notes

- After this lands, the **only** writers for project conversation data are
  the append-only log functions (`appendClientMessage`,
  `appendAgentMessages`, `appendVisionMessage`). The legacy
  `messages.json` is genuinely read-only — matches the DOX.
- If a future feature needs to seed a project with prior turns (e.g. an
  import flow), write to `client-messages.jsonl` via `appendClientMessage`
  so the new hydration path picks it up; do NOT reintroduce a
  `messages.json` writer.
- Reviewer: the diff should be deletions in `project-store.ts`, deletions
  of two `it(...)` blocks + their imports in `project-store.test.ts`, and
  a small refactor of one `route.test.ts` test (writer call → direct
  `writeFile`). Reject any change to a non-dead writer, to `readMessages`,
  or to production code in `route.ts`.
- This plan is the prerequisite for plan 009 (god-module split): deleting
  ~40 lines first shrinks the surface that gets carved up.
