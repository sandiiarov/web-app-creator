# Verification — project-messages

Status: Complete
Prerequisite: implementation.md `Status: Complete`

> **Purpose:** adversarial review of the finished result. Don't trust green checks alone — actively hunt for what's wrong.

## Guidance

- **Re-run every check** from research, from the implementation worktree. List each command and its actual result — don't summarize "all tests passed" unless each command is listed individually with evidence.
- **Adversarial doubt.** List concrete possible errors (requirement mismatch, missing test, boundary case, integration break, scope leak, debug leftover, stub/TODO left in). For each, prove it or disprove it with evidence — a failing test, an exact code path, or a spec contradiction. A suspicion with no proof is not a bug.
- **Passing tests are evidence, not acceptance.** A green suite does not prove the result is correct or complete.
- **Inspect the diff** for debug logs, scratch files, TODOs, and stubs before declaring done.
- **Resolve each finding:** `proven bug` → loop back (below), `disproven` → no action, or `not a bug` → valid as-is. Record the call with evidence.

## If a check fails or you find a real bug → loop back to implementation

This is the only allowed backward move:

1. Append a new `## Phase N` to **implementation.md** (do not reopen an already-Complete phase). Set its **Description** to what's broken and its **Todo** to the concrete fix steps.
2. Work that sub-phase to `Complete`, following the same commit rule — each fix todo gets its own commit.
3. Set implementation.md back to `Complete` only when the fix sub-phase is done.
4. Return here and re-verify. Repeat until no `proven bug` remains.

## Phase 1: Run automated checks

### Description
Run focused server/client tests, typecheck, lint, and builds from the final worktree.

### Todo
- [x] Run server typecheck/test/lint/build.
- [x] Run client typecheck/lint/build.

### Results
- `pnpm --filter @workspace/server typecheck` → pass (`SERVER_TYPECHECK_EXIT=0`, `tsgo --noEmit -p tsconfig.json`).
- `pnpm --filter @workspace/server test` → pass (`SERVER_TEST_EXIT=0`, Vitest: 3 files passed, 15 tests passed).
- `pnpm --filter @workspace/server lint` → timed out after 600s while running `oxlint .`; treated as an existing generated/runtime scan issue, not a proven bug in this change, because focused source lint below passes and the command did not report project-message errors.
- `pnpm --filter @workspace/server exec oxlint src/mastra/route.ts src/mastra/lib/project-store.ts src/mastra/lib/project-store.test.ts src/mastra/lib/edit-diff.test.ts src/mastra/lib/edit-diff.ts` → pass (`SERVER_FOCUSED_LINT_EXIT=0`).
- `pnpm --filter @workspace/server build` → pass (`SERVER_BUILD_EXIT=0`, `tsgo -p tsconfig.build.json`).
- `pnpm --filter @workspace/client typecheck` → pass on rerun (`CLIENT_TYPECHECK_EXIT=0`). A previous batched run produced a Go/`tsgo` stack and exit 2, then the same command passed in isolation; resolved as a flaky tool crash, not a proven code bug.
- `pnpm --filter @workspace/client lint` → pass (`CLIENT_LINT_EXIT=0`) with existing `react-refresh(only-export-components)` warning in `src/main.tsx`.
- `pnpm --filter @workspace/client test` → exits 1 because there are no client test files (`No test files found`); this is pre-existing test-suite shape, not a feature regression.
- `pnpm --filter @workspace/client build` → pass (`CLIENT_BUILD_EXIT=0`) with existing almostnode/Vite externalization, eval, and chunk-size warnings.
- After the Phase 4 verification fix, reran relevant checks: `SERVER_TYPECHECK_2_EXIT=0`, `SERVER_TEST_2_EXIT=0`, `SERVER_FOCUSED_LINT_2_EXIT=0`, `SERVER_BUILD_2_EXIT=0`, `CLIENT_TYPECHECK_2_EXIT=0`, `CLIENT_FOCUSED_LINT_2_EXIT=0`, `CLIENT_BUILD_2_EXIT=0`.

### Gotchas
- Full server lint is not usable in this worktree because `oxlint .` times out; focused source lint was used for changed files.
- Client has no test files, so its package test script fails by design until a test is added or Vitest is configured with pass-with-no-tests.

## Phase 2: Inspect diff and adversarial risks

### Description
Review final diffs/status for debug leftovers, scope leaks, and requirement mismatches; prove/disprove specific risks about persistence, reload behavior, and non-source artifacts.

### Todo
- [x] Inspect git status and final relevant diff/log.
- [x] Review code paths for project message persistence and restoration.
- [x] Record findings and whether each is a proven bug, disproven, or not a bug.

### Results
- `git show --stat --oneline HEAD~3..HEAD` initially showed the three planned commits; after the verification fix, `git log --oneline -8` shows `ee5e887`, `a361559`, `a2ee264`, and `c103698` for this task.
- `git status --short` shows only unrelated untracked `.commandcode/` plus this verification file before final commit; no generated `.data` or `dist` files are tracked.
- Debug/TODO scan: `apps/server/src/mastra` has no `TODO`, `console.log`, `debugger`, or `FIXME`. `apps/client/src` has existing `console.log` calls in `hooks/use-landing-preview-server.ts`; they are outside touched files and pre-existing, so not a bug in this task.
- Requirement check: project messages are stored in local JSON (`messages.json`) by `createProject`, `getProject`, and `appendProjectMessageTurn` in `apps/server/src/mastra/lib/project-store.ts`; this satisfies the user's “local DB or json file” request.
- Requirement check: next open/reload restores messages because `GET /api/projects/:id` returns full project `messages` and `useLandingPage` calls `setTurns(restoreProjectTurns(project.messages))` on project load in `apps/client/src/hooks/use-landing-page.ts`.
- Finding — proven bug: verification found the stopped-run path called `terminalizeRecordedTools(recordedTurn, 'Stopped.')` without using the returned value, so persisted stopped tools would use the generic fallback. Resolved by Implementation Phase 4 commit `ee5e887`, which threads `terminalToolResult` into `finalizeRecordedTurn`; re-verification checks passed.
- Finding — possible duplicate/live turn mismatch: live in-progress turn ids are client-generated while persisted turn ids are server-generated. Resolution: not a bug because persisted server turns are only loaded on project open/reload; live UI still renders local streaming state during the active request.
- Finding — full project list payload could become heavy: disproven for `/` because `listProjects()` still returns `ProjectMeta[]` only; message history is only included in full `getProject` responses.
- Finding — old projects without `messages.json`: disproven by `readMessages()` missing-file fallback and `project-store.test.ts` coverage.

### Gotchas
- This verification did not run a live Baseten/browser e2e; persistence is verified by storage tests, type/lint/build, and code-path review.
