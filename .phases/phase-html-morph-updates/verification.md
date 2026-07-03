# Verification — html-morph-updates

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

## Phase 1: Re-run focused verification commands

### Description
Re-run the client/server checks and workspace diff check from the implementation worktree. Acceptance criteria: each command is recorded with pass/fail and known non-blocking warnings.

### Todo
- [x] Run client format, lint, test, typecheck, and build.
- [x] Run server format, lint, test, typecheck, and build.
- [x] Run `git diff --check`.

### Results
- `pnpm --filter @workspace/client format:check` — passed.
- `pnpm --filter @workspace/client lint` — passed with existing `react-refresh(only-export-components)` warning in `src/main.tsx` and Node `DEP0205` warning.
- `pnpm --filter @workspace/client test` — passed (2 files, 9 tests).
- `pnpm --filter @workspace/client typecheck` — passed.
- `pnpm --filter @workspace/client build` — passed with existing Node `DEP0205` and Vite chunk-size warnings.
- `pnpm --filter @workspace/server format:check` — passed.
- `pnpm --filter @workspace/server lint` — passed.
- `pnpm --filter @workspace/server test` — passed (11 files, 61 tests).
- `pnpm --filter @workspace/server typecheck` — passed.
- `pnpm --filter @workspace/server build` — passed.
- `git diff --check` — passed.

### Gotchas
- Build/lint warnings are non-blocking and were known before this verification pass.

## Phase 2: Adversarial contract and diff review

### Description
Inspect committed morph changes plus the current worktree for requirement mismatches, stale docs, accidental full refresh paths, debug leftovers, dependency mistakes, and scope leakage. Acceptance criteria: every concrete concern is resolved as disproven/not-a-bug or loops back to implementation if proven.

### Todo
- [x] Review recent commits/diffs for morph-related files and dependency/catalog changes.
- [x] Search for stale no-HTML/pull-after-edit contract text and client HTML write paths.
- [x] Inspect current dirty worktree so pre-existing screenshot changes are not confused with morph deliverables.
- [x] Record findings and final decision.

### Results
- Reviewed recent morph commits: `7f05c7a`, `044b4b1`, `eb2b849`, `0f4b82a`, `b193492`, `58ad5d4`, and `9660a58`.
- Committed morph diff from `a0ccb78..HEAD` covers the expected files: phase/research evidence, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, client dependency/types/helpers/preview/hook/event type, server route/tests, and DOX files.
- Stale-contract search found historical `refreshHtml`/no-push facts only in older phase research/plan files; active `AGENTS.md` contracts and source code no longer contain the old pull-after-edit contract.
- Client write-path search found no `PUT`/save-HTML path. Current HTML writes in the client are initial `getProject(projectId)` load and `html_update` state application in `use-landing-page.ts`, matching the server-owned HTML contract.
- Full-refresh concern — **disproven for routine edits**: `LandingPreview` renders `srcDoc={srcDoc}` from local state, not raw `html`, and routine prop changes call `morphPreviewDocument`; reloads are limited to empty/initial/loading/error/script-change fallback paths.
- Server event concern — **disproven**: `route.ts` compares `store.get()` to `lastHtmlUpdate`, emits `html_update` only after successful changed edits, and route tests cover changed, failed, and unchanged edit outcomes.
- Dependency concern — **disproven**: `idiomorph` is in the catalog, client dependency list, lockfile, installed package exports named `Idiomorph`, and `apps/client/src/types/idiomorph.d.ts` typechecks/lints.
- Debug/TODO search found existing console logs in `mastra-smoke.ts`/server startup and test `stub*` helpers, but no morph debug logs, `debugger`, or TODO/FIXME left in morph implementation files.
- Current dirty worktree after morph commits contains pre-existing screenshot-selector/viewport changes in client/server files and AGENTS docs plus this verification file before commit; these are not part of the morph deliverable and were intentionally kept unstaged from morph commits.

Final decision: no proven morph bug found; verification complete.

### Gotchas
- Worktree is intentionally not clean because unrelated screenshot tool changes predated this morph implementation and remain unstaged.
