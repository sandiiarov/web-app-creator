# Plan 016 execution and review

- **Status:** DONE; APPROVE, applied and independently verified on 2026-09-06.
- **Plan:** [016 provider execution](016-provider-execution.md).
- **Worktree:** `/var/folders/r6/hvrdhtjj5jj1v_xm7m1jy8rr0000gn/T/web-app-architecture-1q63bcj3/worktree`, branch `codex/architecture-1q63bcj3`.
- **Baseline:** `baseline016/` and `manifest016.json` beside the worktree, 511 Git-visible paths. Review compares against that snapshot, not HEAD.

## Implemented behavior

- Shared injected JSON/text/byte transport owns requests through body consumption and cleanup, enforces incremental limits, and keeps retries within operation deadlines. Paid POSTs have no automatic retry; dispatched failures preserve unknown remote outcomes.
- Run and Studio tool operations register before work, track actual promises and child cleanup, deduplicate provider usage by operation/report identity, and check write leases at document/asset mutations.
- Known charges survive downstream extraction, screenshot download, partial viewport batches, mobile retry, and generated-image persistence failures. All known cost buckets participate in the cap.
- Failed draining revokes writes and fences both replacement runs and HTTP deletion. Final metadata settles independently under a deadline, retaining fulfilled usage when the other value hangs; unresolved accounting cannot produce successful completion.
- Existing runtime isolation, durable image publication, committed event queue, keyed draft creation, and title/brief identity remain integrated.

## Verification

Every test used `RUN_FIRECRAWL_SMOKE=0 pnpm_config_verify_deps_before_run=false`. Full repository tests used `--force --env-mode=loose` to bypass cache and forward the smoke guard. Coverage-writing runs were sequential.

| Check | Executor | Independent reviewer |
|---|---|---|
| Provider boundary tests | 25 passed | Included in focused 75-test run and full suite |
| Tool/cost regressions | 78 passed | Included in focused 75-test run and full suite |
| Runner/HTTP/edit regressions | 81 passed | Included in full suite |
| Server typecheck, lint, format check, build | Each exit 0 | Each exit 0 |
| Server coverage | 384 passed, 1 live smoke skipped | Same, via uncached repository gate |
| Forced repository tests in worktree | 462 passed, 1 skipped; 5/5 tasks, 0 cached | Same; exit 0 |
| Forced repository tests after application | — | 462 passed, 1 skipped; 5/5 tasks, 0 cached; exit 0 |

Repository counts: server 384, conversation 21, prompt panel 22, preview 12, client 23. Server coverage: 88.15% statements, 89.84% lines. The outbound source inventory leaves only the shared transport's direct Fetch boundary.

Independent development probes/review caught report-ID collisions across operations, false success/uncancelled bodies after late headers, paid error-body uncertainty, capability lookup escaping cleanup, and screenshot child promise identity. Corrections and relevant regressions were reviewed before approval. An intermediate oversized-error fixture failed because it did not exceed the separate error-body cap; the corrected final suite passes.

## Scope and application evidence

- Reviewed result: `plan016-changed-files.json`, 40 paths, SHA-256 `55bc70fa06eb2becb0d85a6bc7d5533ca5102d763245a99f81774e19f750d968`.
- Application: `plan016-application.json`, SHA-256 `345df97c783be83ee12365667b6ed1743a50f9565bccc78464d1f72b1b4898f0`.
- All 40 destinations passed conflict preflight before any write and matched reviewed hashes afterward. Applied 39 files and removed only obsolete `mastra/lib/bounded-fetch.ts`.
- Generated Mastra files and unchanged skill symlinks are excluded. Root AGENTS, plans, staged skill moves, and concurrent UI paths were preserved during source application.

## DOX and limits

Provider, server, and Mastra owning docs, README, and environment example describe the implemented transport and cleanup contracts. Root/apps/packages/testing/storage AGENTS remain unchanged: their ownership/workflows did not change in this step; parent indexes already reach the updated server boundary. Parent maintains plans and status.

No live/paid provider call or operator data mutation was used for verification. Cancellation cannot guarantee remote cancellation or refunds. This step retains an in-memory fence after incomplete cleanup; durable lifecycle recovery and late settlement handling are owned by [017](017-run-lifecycle.md), and event recovery by [018](018-recoverable-event-protocol.md).

Before application, full original-workspace typecheck and lint passed all 11 tasks. The full format gate retained the documented pre-existing `packages/conversation/src/reducer.ts` issue, outside 016 and inside 017; scoped server formatting passes. Full combined verification remains required for final publication.

The user authorized final merge to main and push of all current app changes, including UI work, after the selected backlog is complete. No Git publication has occurred at this step.
