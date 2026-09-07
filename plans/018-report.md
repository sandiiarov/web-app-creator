# Plan 018 execution and review

- **Status:** DONE; implementation independently APPROVED, applied to the original workspace, and verified with the current UI changes.
- **Plan:** [018 recoverable event protocol](018-recoverable-event-protocol.md).
- **Prerequisites:** 014–017 applied and independently verified.
- **Worktree:** `/var/folders/r6/hvrdhtjj5jj1v_xm7m1jy8rr0000gn/T/web-app-architecture-1q63bcj3/worktree`, branch `codex/architecture-1q63bcj3`.
- **Execution baseline:** `baseline018/` and `manifest018.json` beside the worktree; 596 Git-visible paths, manifest SHA-256 `41f009f49e397ab789e8386a15961367d1d2291395755fdc9cd682765e0b1220`. Parent independently verified the manifest hash and five refreshed source fingerprints.
- **Integration context:** baseline original main `6cac7a35` plus all current uncommitted source, UI, skills, staged moves/deletions, and plans. Original main subsequently advanced to `fe880dea` with the approved glass studio and animated assistant. Preserve all later changes during three-way integration and destination preflight. The two excluded tracked Mastra metadata files originate from historical commit `dd95cd41` and remain unchanged.

## Independent review targets

- Schema validation covers actual domain variants, version, identity, numeric values, and escaped UTF-8 limits without introducing a conversation-to-contracts dependency.
- One continuous committed-event queue covers snapshot reads, writes, enrichment, and drain; run projection agrees with the snapshot cursor. Slow sockets, overflow, errors, and close release resources.
- Every committed record advances the cursor through an event or checkpoint. Missing document enrichment triggers fresh hydration; durable logs exclude HTML.
- List snapshots authoritatively replace even an empty list and retain invalidations during refresh, remote creation, rename, status changes, and deletion.
- Client parser/transport handles fragmented frames, CRLF, multiline data, heartbeat, EOF, idle timeouts, fatal failures, bounded retry, and cancellation.
- Session reconciliation preserves run identity, terminal stats, blocked state, immutable pending inputs, same-ID retries, and acceptance precedence over late HTTP failures.
- Panel revision and mounted-session checks protect newer drafts and attachments. Existing IndexedDB restoration and approved layout remain preserved.
- Real loopback clients cover acceptance, editing, disconnect, Stop, completion, and reconstruction; browser verification uses an isolated deterministic fixture.

## Verification and delivery

Early independent contracts checks passed typecheck and five schema tests with coverage disabled. Native Node probes confirmed rejection of malformed stats, empty live turn identity, and mismatched terminal identity after development corrections. A subsequent probe found that an incomplete cost breakdown still passed validation and crashed the existing spend summary; this was returned to the executor before final review.

Early server probes reproduced an unresolved initial writer retaining a drain listener after socket close, and two simultaneous list reads when invalidation arrived during the initial refresh. After development corrections, independent reruns confirmed the closed writer settles with zero drain listeners and only one initial list read remains active. Poisoned and incomplete journals no longer emit a healthy idle snapshot. Frame-cap enforcement, transient-versus-fatal errors, heartbeat backpressure, and full regression coverage remain review targets.

The incomplete cost-breakdown probe now rejects. A legacy prompt plus its canonical interrupted repair still produced an idle/null run projection in an early server revision; that mismatch was returned for correction. Initial client reducer probes reproduced a rejected submission leaving run state running, a successful HTTP acknowledgment failing to mark accepted evidence, and a late rejection replacing a terminal turn when a real pending entry existed. Hook review also identified reconnect-time pending reset and duplicate optimistic-turn insertion. These are development findings, not a final review verdict.

Parser probes reproduced truncated EOF classified as fatal, an uncancelled response body after a malformed complete frame, and delivery of an ordinary text event exceeding its 1 MiB data limit. The executor received these reproductions with the required retry, cleanup, and cap behavior.

Independent reruns confirmed the incomplete cost breakdown is rejected; rejected pending submissions return to idle; HTTP acceptance records authoritative evidence; and a canonical terminal survives a late rejection. Parser reruns confirmed truncated EOF is retryable, fatal parsing cancels the body, and ordinary event data above 1 MiB is rejected.

The independent server delivery suite passed all 16 tests, including snapshot/tail ordering, drain cleanup, initial-list invalidation, authoritative empty/create/delete lists, queue overflow, deterministic schema failure, legacy interrupted repair, and byte boundaries. The early focused client run passed 27 tests and failed six hook tests, beginning with a timeout when an unresolved initial POST was submitted again as an uncertain retry. That failure and the subsequent cascade were returned for correction. Remaining development review includes synchronous submission locking, remote-run precedence over local rejection, exact draft revision fencing, deterministic command rejection, and fatal list-refresh classification.

Independent [browser verification](018-browser/report.md) passed two-editor acceptance/text, reload during generation, Stop from the other editor, successful completion, completed reload without duplicates, preservation of the other editor's unsent draft, live library rename, and remote deletion to an empty list. Both browser error logs were empty. The temporary fixture and both browsers were closed after verification.

## Final independent implementation review

Verdict: APPROVE. The combined candidate preserves original main `48b382e5` and its current dirty UI through a three-way integration. The five overlapping files were reviewed: client and prompt-panel DOX, ProjectsPage, PromptPanel, and the lockfile. The lockfile adds contracts workspace links and its importer without changing dependency versions. Conversation reducer/type changes only reorder unchanged declarations for lint compliance.

- `manifest018b.json`: 610 paths, SHA-256 `a2ba4662f59139c88521b00c2a006ef821c5f7adfce79ef76f26c2ea06b9e93b`.
- `plan018-integration.json`: SHA-256 `22756c9f35667ae0f69aac8c2fc79262a62409429e58cd88446802d86863a6a1`.
- `plan018-changed-files.json`: 53 paths (31 modified, 22 added), SHA-256 `76411bde0541cbd25526da337027b8dcfcb9d292245207f26b5ba1c4823d1e16`.
- Parent verified every baseline and result hash, no destination drift, and no unlisted non-plan source change. Symlinks use SHA-256 of raw link-target bytes consistently.

All five full gates independently passed in the combined worktree with `--force --env-mode=loose`, zero cache:

| Gate | Result |
|---|---|
| Format | 12/12 workspaces |
| Lint | 12/12; existing warnings only |
| Typecheck | 12/12 |
| Tests | 563 passed, 1 live smoke skipped; 6 tasks |
| Build | 2/2; existing large-chunk warning |

Test counts: server 440, client 47, prompt panel 31, conversation 28, preview 12, contracts 5. Regression review covers the corrected submission lock, canonical run precedence, delayed file conversion, already-aborted stream cleanup, raw and encoded byte limits, later invalid-list failure, committed HTML before Stop, successful completion, and disk reconstruction. Browser verification is linked above.

All ordinary tests disable the live Firecrawl smoke and use isolated data; coverage-writing suites do not overlap.

## Original-workspace application and final verification

The executor applied the exact 53-path approved result after checking every destination against the final baseline. The application record `plan018-application.json` has SHA-256 `3c5cad096949617e669e4824d4c993dca4b8e5542393ce3eb40bec417b29ba49`. The parent independently verified all 53 applied hashes and the entire combined source against the reviewed baseline plus result.

The original workspace passed uncached root formatting (12 tasks), lint (12), typecheck (12), tests (6), and build (2), using `RUN_FIRECRAWL_SMOKE=0 pnpm_config_verify_deps_before_run=false pnpm run <task> --force --env-mode=loose`. Tests passed 563 with one live-provider smoke skipped, matching the per-package counts above. Existing lint, Node deprecation, and Vite large-chunk warnings remain nonfatal. The first test attempt stopped because the new contracts package lacked local executable shims; the executor repaired only ignored dependency links to existing locked packages, then the full suite passed without source changes.

During closeout, independent UI commit `05d1044a` updated the collapsed assistant's layered SVG, its CSS, and its owning DOX. These three changes were reviewed against the final baseline and preserved. Focused UI formatting, lint, and typecheck passed, followed by another successful forced full build. A final source comparison found no unexplained differences and confirmed all 53 architecture result hashes still matched. Current app, UI, memory, model, and skill changes are included in the user-authorized delivery scope.

The ongoing UI task then refined the same launcher into centered 48/40/32px layers with a transparent hit area, updating the corresponding client, prompt-panel, and UI DOX. Those five paths were reviewed and included in the final staged delivery. Focused UI formatting, lint, and typecheck and the forced full build passed again; this final UI change does not alter the reviewed protocol or run behavior.

DOX closeout updated the root/package indexes and the owning client, server, Mastra, application, storage, provider, HTTP, testing, contracts, and prompt-panel contracts across plans 014–018. `plans/AGENTS.md`, `apps/AGENTS.md`, shared configuration guidance, and preview DOX remain unchanged at final closeout because their ownership and operating contracts did not change. The plan index, completion criteria, report links, and browser evidence are current. Git publication follows the user's explicit instruction to merge all current app changes into main and push without force.

The complete staged delivery includes the pre-existing installed skill sources and copies as requested. Their original CRLF/trailing whitespace produces Git whitespace diagnostics; those vendored bytes are preserved. The application and plan paths pass the staged whitespace check (one extra final blank line in the new plans DOX was removed). No generated dependencies, build outputs, local environment files, or project databases are staged.
