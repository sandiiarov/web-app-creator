# Verification — html-anchor-edit

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

## Phase 1: Run Final Verification Commands

### Description
Run the verification commands recorded in research from the repository root. Capture each command and result individually. Because unrelated pre-existing worktree changes are present outside this task, classify any failure by evidence before deciding whether it belongs to this implementation.

### Todo
- [x] Run full root format/lint/typecheck/test/build checks.
- [x] Run focused server verification checks if any full command fails or needs narrower evidence.

### Results
Full root checks from `/Users/alexsandiiarov/Documents/web-app-creator`:

- `pnpm run format:check` — failed in `@workspace/ui` only. Evidence: server/client/config packages reported formatted; `@workspace/ui` reported format issues in `packages/ui/src/components/*.tsx`, which are outside this task's changed files.
- `pnpm run lint` — failed in `@workspace/ui` only. Evidence: errors were in `packages/ui/src/components/input-group.tsx`, `command.tsx`, and `dialog.tsx`, outside this task's changed files.
- `pnpm run typecheck` — passed, 8/8 tasks successful.
- `pnpm run test` — passed, client 2 files/9 tests and server 15 files/80 tests.
- `pnpm run build` — passed, client and server build tasks successful.

Focused server checks from repo root:

- `pnpm --filter @workspace/server format:check` — passed.
- `pnpm --filter @workspace/server lint` — passed.
- `pnpm --filter @workspace/server typecheck` — passed.
- `pnpm --filter @workspace/server test` — passed, 15 files/80 tests.
- `pnpm --filter @workspace/server build` — passed.

Resolution: full root format/lint failures are disproven as implementation bugs because they occur exclusively in pre-existing `packages/ui` files outside the task scope, while all server-focused checks covering the changed workspace pass.

### Gotchas
- The worktree contains unrelated user changes outside this task, so root format/lint cannot be used as clean acceptance until those unrelated `packages/ui` style issues are handled.

## Phase 2: Adversarial Diff and Contract Audit

### Description
Inspect the committed task diff and current worktree for scope leaks, debug leftovers, stale public guidance, source-of-truth mismatches, missing tests, and unrelated changes. Resolve every finding as proven bug, disproven, or not a bug with evidence.

### Todo
- [x] Inspect changed files and recent commits for this phase task.
- [x] Search for stale public `index.html`/`grep`/`oldText` guidance in active agent/tool docs.
- [x] Confirm `html.json` is the only ongoing HTML content file and legacy `index.html` is import-only.
- [x] Record remaining risks or confirm none.

### Results
Audit evidence:

- `git log --oneline -9` shows one implementation commit per completed todo, including the verification-loop fix commit `54ff2e9 fix(server): report actual changed anchors [html-anchor-edit][phase-7][changed-anchor-metadata]`.
- `git show --stat --oneline HEAD~5..HEAD` plus log inspection showed task changes were limited to phase docs, server Mastra/lib/tool tests, server prompt/tool guidance, and server DOX. No client/runtime preview contract changes were introduced.
- `git status --short` after the fix shows only `.phases/phase-html-anchor-edit/verification.md` from this task is uncommitted; existing unrelated changes remain in root `AGENTS.md`, `apps/client/AGENTS.md`, `apps/client/src/components/prompt/turn-steps.tsx`, and `.commandcode/`.
- Search for debug leftovers (`console.log`, `TODO`, `stub`) found only existing test helper calls such as `vi.stubEnv`/`vi.stubGlobal`, not debug code in new implementation.
- Search of active landing tool registry confirms public tools use `read`, `find`, and `edit` guidance; `createGrepTool` remains only in legacy source files and is not imported by `landing-tools.ts`.
- Search of `project-store.ts` confirms ongoing writes go through `writeHtmlDocument`/`writeHtmlDocumentSync` to `HTML_JSON`; `INDEX_HTML` is read and removed only for legacy migration.

Findings and resolution:

1. Proven bug: `applyAnchorEdits()` initially reported `firstChangedAnchor`/`lastChangedAnchor` from the bounded `changedText` context region rather than the actual changed lines. Evidence: code used `lines[0]` and `lines[lines.length - 1]` after slicing context around `firstIndex`. Resolution: appended Implementation Phase 7, fixed metadata in `html-anchor-document.ts`, added assertions in `html-anchor-document.test.ts` and `edit.test.ts`, committed `54ff2e9`, and reran focused server `format:check`, `lint`, `typecheck`, `test`, and `build` successfully.
2. Disproven bug: stale public `grep`/`oldText` guidance. Evidence: active `landing-tools.ts`, `landing-page-agent.ts`, `design-skill.ts`, screenshot descriptions, and Mastra DOX now reference project HTML, `read`/`find`, and anchor-range `edit`; remaining `grep`/`oldText` matches are legacy helper files/tests or route compatibility summaries, not public landing tool guidance.
3. Disproven bug: `index.html` still being written as an ongoing mirror. Evidence: `project-store.ts` writes only `HTML_JSON`; tests assert new projects and store edits do not create `index.html`, and legacy `index.html` is removed after migration.

No remaining proven bugs in the implemented server path.

### Gotchas
- Root format/lint remain blocked by unrelated `packages/ui` style/lint issues outside this task; focused server checks pass after the verification-loop fix.
