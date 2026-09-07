# Plan 015 execution and review

- **Status:** DONE; reviewed, applied, and independently verified.
- **Plan:** [015 durable project storage](015-durable-project-storage.md).
- **Review baseline:** current workspace after 014, including concurrent draft creation and title changes; final baseline015b contains 504 Git-visible files.
- **Worktree:** `/var/folders/r6/hvrdhtjj5jj1v_xm7m1jy8rr0000gn/T/web-app-architecture-1q63bcj3/worktree`, branch `codex/architecture-1q63bcj3`.
- **Baseline evidence:** `baseline015b/` and `manifest015b.json` beside that worktree. Initial reviewed output is archived in `reviewed015a/`. HEAD alone does not reproduce this baseline.

## Scope and review decisions

- Same-directory atomic replacement owns only the temporary files it successfully creates. The filesystem adapter also guards synchronous file descriptors.
- Client journals serialize append and explicit repair, publish confirmed watermarks only after flush, and preserve uncertain observed sequences. First-file creation includes parent-directory synchronization where supported.
- `recoverClientJournal` is an explicit operation. Ordinary reads and startup do not automatically quarantine or truncate operator journals. Tail quarantine preserves raw bytes, including incomplete UTF-8.
- Route emission commits replayable events before broadcasting and drains queued work through finalization failures.
- UUID assets use exclusive creation and same-byte idempotency; successful retries must flush again after a previous durability failure. Project-bound image generation persists before success and returns its stable project URL.
- Repository snapshots include legacy fallback data within the same mutation/revision check. Local concurrent mutations cause retries; stable corruption remains an error.
- Narrow adjacent changes to `project-filesystem.ts`, its safety test, and `landing-tools.ts` persistence wiring serve these contracts. No dependency upgrades or paid-provider behavior changes are included.

## Development verification

All ordinary tests use `RUN_FIRECRAWL_SMOKE=0` and `pnpm_config_verify_deps_before_run=false`. Test counts below describe separate runs and are not additive.

| Check | Evidence | Result |
|---|---|---|
| Atomic write, rename, file flush, directory flush | Reviewer probe using a fresh OS temporary directory | Passed; canonical bytes replaced, probe removed |
| Atomic-file and event-journal tests | Independent reviewer run, two files, coverage disabled | 16 passed |
| Atomic/journal/repository integration | Executor step 2 milestone | 56 passed |
| Route integration | Executor step 2 milestone | 38 passed |
| Image/repository/tool/HTTP/route set | Executor step 3 milestone | 124 passed |
| Server typecheck | Executor milestones | Passed |

## Initial independent review

- The combined storage and HTML regression command passed all 91 tests across seven files.
- Server typecheck, lint, package format check, and build exited 0.
- Forced full repository tests passed 419 tests with one live smoke skipped: server 347, conversation 21, prompt panel 22, preview 12, client 17. All five test tasks executed with zero cache hits. Server coverage reported 87.57% statements and 89.47% lines; no coverage threshold is configured.
- Reviewed all 21 source/document changes against baseline015 and verified their result hashes against `plan015-changed-files.json` (SHA-256 `ffbd795d840da2bc9775de3c69f36b1b1bc5b66d541486bf0942e68b28dd8885`). Whitespace check passed.
- Apply preflight found concurrent changes in server AGENTS, index, Mastra AGENTS, project-store, and project-store tests. No files were applied. Those changes add creationKey retries and project brief/title identity; the executor is rebasing the approved storage changes onto a fresh baseline while preserving them.

## Final integration review and application

- Reviewed all five rebased files and verified that the remaining sixteen retain the previously reviewed bytes. Keyed creation is tracked before preparation, disposal awaits actual pending promises, and automatic title broadcasts follow metadata commit; tests cover each adaptation.
- Executor storage tests: 77 passed across four files; HTML regression tests: 18 passed across three files. Final server coverage run: 352 passed, one live smoke skipped.
- Independent server typecheck, lint, package format check, and build exited 0.
- Independent forced full repository test run passed 430 tests with one live smoke skipped: server 352, conversation 21, prompt panel 22, preview 12, client 23. Five tasks ran with zero cache hits. Server coverage: 87.43% statements and 89.3% lines.
- Verified final 21-file manifest `plan015b-changed-files.json`, SHA-256 `bb311425ef183977ab11741824d955134fe64d6a72b70d89966039b422b2ce65`. Fresh preflight found zero conflicts. Executor applied exactly those files; independent verification confirmed all 21 destination hashes.
- Post-application forced full repository tests again passed 430 tests with one live smoke skipped and zero cache hits. Whitespace check passed. Existing staged deletions and unrelated client/UI edits remain intact.

## DOX closeout and limits

- Updated server and Mastra contracts and added storage AGENTS with the server child index. Root, apps, packages, and plans AGENTS remained unchanged because their ownership and direct child boundaries did not change.
- Exact full-test command: `RUN_FIRECRAWL_SMOKE=0 pnpm_config_verify_deps_before_run=false pnpm run test --force --env-mode=loose`. Focused server checks use the same environment prefix with package scripts.
- Single-process filesystem coordination remains the boundary. Incomplete-tail recovery is an explicit repository operation; no automatic operator-data rewrite or new recovery UI/CLI was added.
- No dependency upgrade, commit, merge, push, paid/live provider smoke, or browser QA was performed. Provider cancellation, lifecycle ownership, and recoverable wire contracts remain plans 016–018.
