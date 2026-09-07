# Plan 017 execution and review

- **Status:** DONE; independent review APPROVED, all 29 reviewed paths applied and verified in the combined original workspace.
- **Plan:** [017 run lifecycle](017-run-lifecycle.md).
- **Prerequisites:** 014–016 applied and independently verified.
- **Worktree:** `/var/folders/r6/hvrdhtjj5jj1v_xm7m1jy8rr0000gn/T/web-app-architecture-1q63bcj3/worktree`, branch `codex/architecture-1q63bcj3`.
- **Execution baseline:** `baseline017/` and `manifest017.json` beside the worktree; 519 Git-visible paths, manifest SHA-256 `4bb0d1eae4762422013f78f43b3c0c157c46785768059bc97523b742c9d2a570`.
- **Reviewed result:** 29 scoped source/documentation paths in `plan017-changed-files.json`, SHA-256 `8b5208a9621f58699326197f24fa12e7cb4057c4339349f21ba06b9a79f77b05`. Parent independently verified every result hash and read the scoped implementation and tests. Generated Mastra outputs and dependency symlinks are excluded.

## Implemented behavior

- Durable accepted requests contain effective inputs, immutable attachment references, and a canonical digest before acknowledgment or provider work. Concurrent matching turn-ID requests join one acceptance; reconstructed retries reuse it without paid re-execution.
- One coordinator owns admission, bounded Stop, actual execution/provider/metadata settlement, canonical terminal commits, status projection, and recovery. A paused terminal commit coalesces concurrent callers. Late fulfillment and rejection eventually commit one error terminal after blocked work settles.
- Deletion takes an admission gate, persists external intent, drains owned work and writes, revokes old storage handles, verifies memory cleanup, removes files, and retains a minimal completed marker. Runtime shutdown retains resources while run or project-service work remains unsettled.
- Recovery preserves legacy turns, maps ID-less repairs to their original journal position, retains accepted attachment metadata, and rebuilds status without duplicate terminal records. Partial journal tails still require explicit storage repair.
- Production Observational Memory disables detached buffering, keeping compaction awaited by the run. This can add compaction latency; observation/reflection, selected models, and prompts remain preserved. The real installed SDK and LibSQL regression verifies delayed memory processing blocks deletion until settlement.

## Independent verification

Every ordinary test used `RUN_FIRECRAWL_SMOKE=0 pnpm_config_verify_deps_before_run=false`. Internal workspace imports were independently checked to resolve into the disposable worktree; external dependencies stayed read-only. Coverage-writing runs did not overlap.

| Command | Result |
|---|---|
| `pnpm --filter @workspace/server typecheck` | Exit 0 |
| `pnpm --filter @workspace/server lint` | Exit 0 |
| `pnpm --filter @workspace/server format:check` | Exit 0 |
| `pnpm --filter @workspace/server test` | Exit 0; 420 passed, 1 live smoke skipped |
| `pnpm --filter @workspace/server build` | Exit 0 |
| `pnpm run typecheck --force --env-mode=loose` | Exit 0; 11/11 tasks, zero cache |
| `pnpm run test --force --env-mode=loose` | Exit 0; 505 passed, 1 live smoke skipped; 5/5 tasks, zero cache |
| `pnpm run build --force --env-mode=loose` | Exit 0; 2/2 tasks, zero cache |

Full-test breakdown: server 420, conversation 28, prompt panel 22, landing preview 12, client 23. Existing Vite chunk-size and runtime deprecation/localStorage notices remain nonfatal.

Parent fault probes and subsequent regressions closed retained-store resurrection, duplicate terminal commits during Stop, lost ownership after adapter failure, late rejection, legacy streaming-state mismatch, and shutdown during memory deletion. Tests also exercise partial attachment persistence, uncertain acceptance commits, explicit journal repair, deletion retries/reconstruction, and both provider/metadata settlement orders with final combined cost. An initial real-memory fixture timeout was resolved using the installed SDK streaming observation path; the full independent suite then passed it.

## Integration and limits

Original `main` advanced to approved UI commit `4723be32` during implementation. Destination preflight found one expected source drift: `setTitleIfUntitled` now protects a user-renamed literal `Untitled` through `titleSource !== 'user'`. The reviewed result preserves it. All other 29 target destinations matched their baseline or were absent additions at parent preflight. The executor repeated whole-target preflight immediately before copying and applied all 29 paths. Parent independently verified all destination hashes afterward. Application evidence: `plan017-application.json` beside the worktree, SHA-256 `fd855e3cc7191fbe4ca14624c30472724a834f29243d25b78b93a1c0450a8f10`.

Post-application original verification passed the uncached full test suite (505 passed, one live smoke skipped) and all 11 typecheck tasks. A full format check found new concurrent UI formatting in `packages/landing-preview/src/landing-preview.tsx` and `packages/prompt-panel/src/composer.tsx`; server and conversation formatting passed. Those UI edits are preserved for the fresh 018 baseline and final combined verification. Original main has since advanced independently to UI commit `6cac7a35`; this does not change the reviewed lifecycle result.

Source DOX updates cover the application child, server/Mastra ownership and storage/memory contracts, and shared conversation behavior. Root, apps-wide, UI/client, provider, storage, testing, and plans ownership rails remain unchanged because their ownership boundaries and operating rules did not change. Parent maintains plan status and this report.

No production project data, paid providers, or live smoke were accessed. Browser/multiple-editor transport verification belongs to 018. Final merge and push include all current app changes as authorized, after 018 and combined verification; no Git publication has occurred for this architecture work yet.
