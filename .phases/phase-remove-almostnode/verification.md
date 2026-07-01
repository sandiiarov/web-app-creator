# Verification — remove-almostnode

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

## Phase 1: Automated checks

### Description
Run the client verification commands from research plus focused checks that prove the direct iframe preview compiles after dependency removal.

### Todo
- [x] Run client format, typecheck, lint, test, and build commands.
- [x] Record each result and distinguish real failures from pre-existing/no-test behavior.

### Results
- `pnpm --filter @workspace/client format:check` → pass (`CLIENT_FORMAT_CHECK_EXIT=0`; 38 files checked).
- `pnpm --filter @workspace/client typecheck` → pass (`CLIENT_TYPECHECK_EXIT=0`; `tsgo --noEmit -p tsconfig.json`).
- `pnpm --filter @workspace/client lint` → pass (`CLIENT_LINT_EXIT=0`) with existing `react-refresh(only-export-components)` warning in `src/main.tsx`.
- `pnpm --filter @workspace/client test` → exits 1 (`CLIENT_TEST_EXIT=1`) because no client test files exist. This matches the pre-existing client test-suite shape recorded in prior verification; not a remove-almostnode regression.
- `pnpm --filter @workspace/client build` → pass (`CLIENT_BUILD_EXIT=0`) with existing chunk-size warning. Build output no longer shows almostnode externalized-module or direct-eval warnings.

### Gotchas
- The client package still has no test files, so the package test script is not a usable pass/fail signal until a test exists or Vitest is configured to pass with no tests.

## Phase 2: Residual reference and diff review

### Description
Search for active almostnode traces, inspect final diff/status, and perform adversarial review for likely regressions introduced by switching to direct `srcDoc` iframe rendering.

### Todo
- [x] Search active source/manifests/lock/DOX/README for almostnode/runtime remnants.
- [x] Inspect git status/log/diff for unintended files, debug leftovers, TODOs, and stale docs.
- [x] Record each potential issue as proven bug, disproven, or not a bug.

### Results
- Active-source/package/lock/doc grep: `apps/client/src`, `apps/client/package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, root `AGENTS.md`, `apps/AGENTS.md`, `apps/client/AGENTS.md`, and `README.md` all had no matches for `almostnode|VirtualFS|ViteDevServer|__sw__|preview bridge` after Phase 3.
- Tracked active grep excluding historical paths (`git grep -n -E 'almostnode|VirtualFS|ViteDevServer|__sw__|preview bridge' -- ':!plans/**' ':!.phases/**' ':!mastra-migration-plan.md'`) found a proven bug: `.fallowrc.jsonc` still ignored deleted `apps/client/public/__sw__.js`. Fixed via Implementation Phase 4 commit `2eebb69`; rerunning the same grep produced no output.
- `apps/client/public` is empty after deleting the service worker; no ignored public asset remains.
- `git status --short` after final implementation commits shows only untracked `.phases/phase-remove-almostnode/verification.md`, which is this verification record. `git diff --check` produced no whitespace errors.
- Debug/TODO scan of active client source (`TODO|FIXME|debugger|console.log|almostnode|VirtualFS|ViteDevServer|__sw__`) found no matches.
- Requirement check: `apps/client/src/components/landing-preview.tsx` now renders `<iframe srcDoc={html}>` directly and contains no hook, bridge, VFS, server, or service-worker behavior.
- Requirement check: `apps/client/package.json`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml` no longer contain `almostnode`.
- Boundary case — persisted image URLs: not a bug. `apps/client/src/lib/projects-api.ts` still expands root-relative `/api/projects/:id/images/<file>` URLs to absolute server URLs before sandboxed iframe rendering.
- Boundary case — historical references: not a bug. `plans/*`, `mastra-migration-plan.md`, and older `.phases/*` records still mention almostnode as historical architecture/verification context, while active DOX/README/source/package/lock no longer present it as current behavior.
- Boundary case — unused-looking `bippy`: not a proven bug for this task. It is not an almostnode package and is not imported by active client source; leaving it is outside the explicit “get rid of almostnode” request.

### Gotchas
- Direct `srcDoc` rendering removes Vite HMR behavior by design; iframe documents are replaced from the latest server-owned HTML instead.
