# Plan 017: Give each run one durable lifecycle owner

> **Executor instructions:** Follow this plan in order after 014–016. Keep legacy HTTP/SSE behavior working while moving authority into the coordinator. Mark this plan DONE only after fault-injection and restart/delete tests pass.
>
> **Drift check:** Run `git diff --stat d2ae1e6c..HEAD -- apps/server packages/conversation`, `git diff HEAD -- apps/server packages/conversation`, and `git status --short`. Resolve factory, journal, immutable-asset, and provider-scope symbols from completed prerequisite diffs. Do not restore their old implementations.

## Status

- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH
- **Depends on:** `plans/014-isolate-server-runtime.md`, `plans/015-durable-project-storage.md`, `plans/016-provider-execution.md`
- **Category:** bug, architecture
- **Planned at:** commit `d2ae1e6c` plus audited working tree, 2026-09-05
- **Status:** DONE; implementation and independent verification recorded in [017-report.md](017-report.md)

Integration context (2026-09-06): the current repository independently added UUID `creationKey` project creation, brief/title/titleSource, protected user renames, and postcommit metadata notifications. Preserve those behaviors. The existing creation key is also the resulting project ID, so keyed creation must participate in the deletion gate: a delayed retry cannot recreate a tombstoned or completed-deletion project. This is compatibility wiring for the new lifecycle owner, not a replacement project-creation protocol.

## Why this matters

A run is acknowledged before its prompt is persisted; setup failures and terminal events have different cleanup paths. Deletion bypasses running work and queued writes. A coordinator should own acceptance, execution, draining, terminal commit, recovery, and deletion so these paths cannot disagree.

## Historical audited state

`apps/server/src/mastra/route.ts:180`:

```ts
if (!claimRun(projectId, entry)) return { ok: false, reason: 'overlap' }
setRunStatusSync(projectId, {
  startedAt,
  status: 'running',
  turnId: resolvedTurnId,
})
```

It launches detached work and returns success at line 206. The prompt is appended only at line 692, after capability lookup. A state-write exception occurs before the cleanup wrapper is launched.

`mastra/lib/run-finalize.ts:123` writes terminal run state before `route.ts:923` emits done and line 951 flushes logs. Recovery only checks `running` records, so it cannot repair every interrupted terminal sequence. Setup exceptions in `runLandingAgentBody` set status but do not emit terminal editor events.

`apps/server/src/index.ts:347` deletes project files, then calls `landingMemory.deleteThread(id).catch(() => {})`, without stopping/awaiting a run. Later queued writes recreate directories.

## Execution baseline after 016

Plans 014–016 are applied and independently verified on the current original workspace. The uncached repository suite passes 462 non-live tests with one live smoke skipped; exact server typecheck, lint, format check, and build pass. Create a fresh baseline017 snapshot of all current Git-visible paths, including staged skill moves, current UI work, and parent-maintained plans, before source edits. Review against that snapshot, not HEAD.

The current runner owns bounded provider operations and fences replacement runs/deletion after failed draining or metadata timeout. `index.ts` temporarily rejects DELETE whenever a run owns the bus slot; replace that temporary rule with the cooperative deletion service. Acceptance still precedes prompt journal persistence, terminal status and legacy output still have separate owners, and memory deletion still swallows operational failures after file deletion. Those remaining lifecycle gaps are the target. Preserve the committed emission queue, title notifications, immutable asset writes, provider usage sink, and all new cancellation regressions.

The provider scope's `drain()` and `drainChildren()` track actual registered promises, revoke writes on grace expiry, and preserve a sticky failed result. The new coordinator needs the explicit late-settlement observation described in Step 3. Preserve the main Mastra adapter and exact installed memory version. Memory deletion wiring may touch `mastra/create-mastra-runtime.ts` and its tests solely to expose reliable thread/Observational Memory cleanup.

Use `RUN_FIRECRAWL_SMOKE=0 pnpm_config_verify_deps_before_run=false` for every test. Full independent gates use `--force --env-mode=loose`. Worktree dependency symlinks are read-only; never install through them. Do not overlap coverage-writing suites. Full repository format checking previously found existing formatting in `packages/conversation/src/reducer.ts`; this plan owns that file, so format it when implementing its lifecycle changes.

Cross-package isolation preflight: the existing whole-directory node_modules links resolve `@workspace/conversation` back to the original workspace. Before testing changes to that shared package, replace relevant worktree dependency directories with owned link layouts whose `@workspace/*` links resolve to this worktree; external packages may remain read-only links to installed versions. Keep `.tmp` and other generated metadata worktree-owned. Verify actual server/client module resolution, not only the link text. Do not edit the original dependency directories through a symlink.

## Repository conventions and baseline

- Repository root: `/Users/alexsandiiarov/Documents/web-app-creator`. Run commands there.
- pnpm 11.1.3, Node >=22.19, strict ESM TypeScript. Match existing extensionful server imports, small factories, Zod tool boundaries, Vitest tests, Oxfmt/Oxlint, and package-local scripts.
- Read root `AGENTS.md` and every owning child before editing. Update affected DOX contracts and indexes when implementing this plan; describe proposed behavior as implemented only after it works.
- This plan describes a single local server with one active run per project. Closing a browser tab does not cancel generation. Keep the anchored single-file HTML format, legacy reads, provider-reported OpenRouter cost, and Mastra Observational Memory keyed by project ID.
- Keep the existing @mastra/core patch and exact @mastra/memory pin. Read installed Mastra docs/types before changing its construction/storage APIs. Do not introduce framework or dependency upgrades.
- The audit ran against commit `d2ae1e6c` **plus substantial uncommitted changes**. The commit alone does not reproduce the audited state. Check both committed and working-tree diffs; preserve the user's changes.
- Audit baseline: typecheck passed; lint passed with warnings; 362 tests passed across the repo run and a focused rerun of 20 HTTP tests that initially hit sandbox `listen EPERM`; one live screenshot smoke was skipped. Some results were Turbo cache hits. Root format check stopped at existing formatting in `packages/conversation/src/reducer.ts`. No build, paid provider smoke, or browser QA was run for this audit. This is historical evidence, not an executor's verification result.
- Existing storage tests are unsafe beside the development app until plan 014 isolates them. Do not run broad server tests before completing that isolation.
- Prefix every ordinary test command in this plan with `RUN_FIRECRAWL_SMOKE=0` (for example, `RUN_FIRECRAWL_SMOKE=0 pnpm run test`) so an inherited environment cannot enable the live paid-provider smoke.

## Git workflow

Use a `codex/` branch when creating a branch. Preserve the current working tree; an isolated checkout must include the approved uncommitted baseline, not just HEAD. Record the initial changed-path set and compare your own diff against it. On 2026-09-06 the user explicitly authorized merging the completed architecture work to `main` and pushing it. Perform that final delivery only after the selected backlog passes review and verification, including all current app changes and ongoing UI work, as the user explicitly confirmed. Refresh and verify the combined tree before committing; preserve concurrent edits and do not force-push. The reviewer coordinates source application and final Git integration.


## Commands you will need

| Purpose | Command | Expected result |
|---|---|---|
| Lifecycle tests | `pnpm --filter @workspace/server exec vitest run src/application/run-coordinator.test.ts src/application/project-service.test.ts --coverage=false` | All pass with injected faults |
| Replay compatibility | `pnpm --filter @workspace/conversation test` | Legacy/new lifecycle replay passes |
| Existing API/agent tests | `pnpm --filter @workspace/server exec vitest run src/index.test.ts src/mastra/route.test.ts src/mastra/lib/project-store.test.ts --coverage=false` | All pass |
| Server gates | `pnpm --filter @workspace/server <task>` for `typecheck`, `lint`, `format:check`, `test`, `build` | Each exits 0 |
| Full gates | `pnpm run typecheck`, `pnpm run test`, `pnpm run build` | Each exits 0 |

## Scope

**In scope:** create `apps/server/src/application/{run-coordinator,project-service}.ts`, matching tests, and `application/AGENTS.md`; runtime wiring; `src/index.ts`; `mastra/route.ts`; `mastra/lib/{run-bus,run-finalize,run-stats,run-stream-loop,project-store}.ts`; journal interfaces from 015 and operation-scope integration from 016; `packages/conversation/src/{types,reducer,reducer.test}.ts`; corresponding existing server tests; affected AGENTS/README and plan index.

**Out of scope:** client protocol/reconnect implementation (018), new renderer, database replacement, distributed workers/queues, automatic paid-run resumption, model/prompt changes, version-history UI, production data migrations or deletion outside explicit runtime requests.

Memory lifecycle integration may also touch `mastra/agents/landing-page-agent.ts` and actual-factory/SDK tests solely to ensure Observational Memory work is awaited by the run. Preserve the selected models, observation semantics, and prompts; do not rely on an unobservable background timeout as proof of settlement.

## Target contract

`RunCoordinator.start(command)`, `stop(projectId)`, `waitForCompletion(projectId, turnId)`, `recover()`, and `dispose()` own run lifetime. `ProjectService.delete(projectId)` cooperates with it through an exclusive deletion gate.

Keep public status values compatible; use internal states for accepting, executing, draining, and committing. Distinguish connection lifetime from run lifetime.

### Durable lifecycle records

Use the sequenced, committed journal from 015 as the authority; `run-state.json` is a rebuildable projection.

- **Acceptance:** one committed inbound prompt record includes project/turn identity, timestamp, selected models, compaction input, sanitized attachment manifest, and a digest of the accepted request. Persist uploaded attachment bytes through the immutable asset repository before acceptance; JSON contains references, never inline image bytes.
- **Terminal:** one committed `event: 'run_terminal'` record contains `turnId`, outcome (`completed|stopped|error|interrupted`), finishedAt, final stats, and a safe error/reason when applicable. It is the authority from which status and legacy stats/error/done output are projected. Do not append multiple canonical terminal records for the same turn.
- The conversation reducer supports these records while retaining all legacy prompt/stats/error/done readers. The server's old live stream maps the terminal record to the existing terminal stats/error/done order exactly once.
- A nonterminal `event:'run_blocked'` record contains turn ID, safe reason, and known-usage snapshot when draining/metadata settlement fails. Project status projects to error with additive `runBlocked:true`; the coordinator retains the exclusive run gate. Do not fabricate a successful Stop or complete deletion. If local work later settles, commit one error terminal record with the available usage; otherwise restart recovery interrupts it. Failed journal storage may prevent even the blocked record: log the fault, keep the in-memory gate, and reject new starts until recovery.
- Every new run event carries its turn ID; token/tool output is committed in order before terminalization. Inspection logs remain separate. Full HTML remains outside the conversation journal.
- No cross-file or Mastra/file transaction is claimed. Recovery repairs projections from authoritative lifecycle records.

### Start, stop, and deletion semantics

- Claim ownership exception-safely; await acceptance commit before returning success or starting slow provider work. A failed acceptance write starts no provider work and releases the provisional claim.
- The supplied turn ID is an idempotency key within a project. Repeating the same accepted request returns its existing run identity/outcome without a second prompt or provider call. Same ID with different normalized request content is a conflict. A different ID during an active run retains the existing overlap rejection. Concurrent same-ID requests join the same provisional acceptance promise; they do not each write attachments or launch work.
- Terminalize through one path after the provider operation scope drains and final accounting is known. Release the slot in `finally`, but surface failed durable terminal commits and block new starts on an unhealthy project until recovery succeeds.
- Restart recovery does not automatically repeat paid generation. Accepted nonterminal runs become interrupted; already committed terminal runs repair projections without gaining duplicate terminal events.
- Deletion first acquires the synchronous per-project exclusive admission gate, then durably writes intent outside the directory being removed under `dataDir/project-tombstones/<projectId>.json`, then aborts/drains the current owner. No start can pass the gate while intent is being written. If intent fails before commit, roll back only the deletion gate and leave the pre-existing run ownership intact; an uncertain intent write keeps the gate until reconciled.
- During deletion draining, reject new commands and ordinary asset/document mutations, but allow the existing owner's accounting, inspection flush, and one terminal journal commit. After drain/terminal commit, revoke every old write lease, delete memory/files, and complete cleanup. Repeated deletion resumes an incomplete operation. Only a verified missing memory thread is success; other failures remain retryable. A drain failure leaves the tombstone/gate and cannot complete deletion.
- Tombstoned projects cannot be recreated by late callbacks. Recovery completes outstanding deletions before accepting new work.
- Preserve a minimal completed-deletion marker outside the removed project directory, containing identity/state rather than prompt or attachment data. Reject a retry using that deleted project's creationKey with a stable conflict/missing result; a genuinely new draft uses a fresh key. Apply the same synchronous gate to keyed creation before its asynchronous preparation. Repeated DELETE remains idempotent, including after reconstruction.

### Request digest and legacy migration

Hash a versioned, explicitly ordered canonical JSON object with SHA-256: validated/trimmed prompt, effective text/image/vision model IDs (existing prefix/default rules), effective compaction setting or null, and attachments in request order. Uploaded attachments include kind, name, normalized media type, decoded byte length, and SHA-256 of decoded bytes; selector attachments include kind and the validated selector verbatim. Exclude timestamps, generated asset IDs, transport/base URLs, SSE connection IDs, and client attachment IDs. The project/turn ID is the lookup key, not a newly generated digest input.

Store this canonical DTO/digest with acceptance. For a repeated key, resolve omitted model/default fields against the stored accepted effective values, so a later configuration-default change cannot turn an identical retry into new work. Explicitly changed values or changed attachment bytes conflict. Use the existing ID's acceptance promise before expensive attachment persistence; cleanup only unreferenced assets owned by a failed attempt. A legacy turn without a verifiable digest must never be automatically re-executed under that same ID; return a typed conflict requiring a new turn.

| Existing storage | Recovery action |
|---|---|
| Canonical acceptance + terminal | Rebuild status; never append another terminal or rerun a provider. |
| Canonical acceptance without terminal, including run_blocked | Append one interrupted terminal after repository recovery; preserve prompt/input and known usage. |
| Legacy prompt + legacy done/error/stopped terminal | Preserve old records and derive terminal state with the legacy reducer; repair a stale running projection without inventing a new user turn. |
| Legacy open prompt + running projection | Append one canonical interrupted repair associated with its stable turn ID; preserve all old records. |
| Legacy running projection but no saved prompt | Record an interrupted lifecycle diagnostic keyed by its saved turn ID; do not manufacture user text or resume a provider. |
| Mixed history | Use per-turn identity and chronological accepted/terminal boundaries; old completed turns remain unchanged and only the active open turn is repaired. |
| Tombstone exists | Resume deletion before ordinary run recovery/admission. |

If an old open prompt has no turn ID, derive a stable legacy ID from project ID plus its original journal position; repeat recovery must find the same repair instead of appending another. Malformed interior journals remain explicit storage failures from 015.

Honor 015's explicit journal-repair boundary: startup lifecycle recovery reads valid history but does not automatically quarantine or truncate an incomplete tail. A journal requiring repair keeps that project unavailable and reports the storage condition; it cannot receive a new repair/terminal record until `recoverClientJournal(projectId)` has deliberately completed. Once journal repair succeeds, lifecycle recovery can perform the idempotent projections and interrupted-run repairs above. Partial-tail recovery tests must verify preserved raw bytes and blocked admission before that explicit repair.

## Steps

### Step 1: Add lifecycle records and recovery projections

Extend the journal-facing types and shared conversation reducer for accepted/terminal records. Preserve legacy replay. Implement functions that derive public status and terminal display from the new canonical records. Update restart recovery to inspect journal lifecycle rather than trusting only `run-state.json`.

Use a single terminal record to avoid an impossible multi-file transaction. A crash after terminal append but before projection/broadcast must still reopen as terminal. A crash before terminal append must recover as interrupted exactly once.

**Verify:** conversation tests and new coordinator recovery tests → pass for legacy logs, accepted-only journal, terminal-with-stale-status, partial journal tail, repeated recovery, and duplicate-terminal rejection.

### Step 2: Move start and execution ownership into the coordinator

Move admission, accepted request persistence, run registry updates, and completion handles out of route orchestration. Route validation continues to return existing 400/404/409 behavior; repeated same-ID acceptance may return the existing result additively. Persist the full sanitized acceptance manifest before capability lookup, attachment analysis, or Agent construction.

Wrap provisional claim/acceptance/launch in exception-safe cleanup. The Mastra adapter performs generation and reports results through injected callbacks; it does not own authoritative status or independently emit terminal events. Remove competing terminal-status writes from `run-finalize.ts` only after the coordinator replaces them.

**Verify:** lifecycle tests, existing route tests, and server typecheck → pass. Inject failures at claim persistence, attachment persistence, capability lookup, Agent creation, iteration, and terminal commit; no accepted input disappears and no abandoned slot prevents a later valid start after recovery. Include concurrent identical same-ID requests, changed attachment bytes with identical metadata, reordered attachments, changed explicit models, changed server defaults with omitted retry fields, and a retry after runtime reconstruction.

### Step 3: Make stop, cost-cap failure, and completion share the terminal path

Wire explicit Stop and fatal conditions to the run signal. Close new operation registration and await the bounded 016 drain/metadata result. On success collect known usage, commit one terminal record, refresh status projection, publish legacy terminal output, and release ownership. On failure record run_blocked when storage permits, retain the admission gate, and revoke ordinary write leases; do not complete deletion or call the run stopped successfully. Ensure publication failure does not undo a committed result; committed events remain recoverable.

Give tests an actual completion promise. Distinguish journal failure from delivery failure: an authoritative storage failure is visible to the operator, cannot be silently logged as success, and excludes another start until reconciliation succeeds.

The 016 scope's bounded `drain()` result is sticky: a failed result does not become success merely because a late promise settles. Add an explicit settlement observation port as part of the scope integration, retaining the actual registered promises and final metadata settlements. The coordinator may observe that port in the background after reporting `run_blocked`; it must not block the original Stop response indefinitely or restore revoked write leases. When every owned local operation and required metadata promise has actually settled, use the same terminal commit path to record the error outcome with all available usage exactly once. A permanently unresolved promise keeps the gate until restart recovery. Test a deferred operation that first exceeds drain grace and later reports usage and settles, including a concurrent repeated Stop/delete attempt.

Track the main execution/iterator promise as well as provider and metadata work: an iterator that ignores abort must produce a bounded blocked Stop result and remain owned until actual settlement. Calling `recover()` in a live runtime must preserve locally active/blocked ownership; only a reconstructed runtime can treat that prior execution as interrupted. Test both cases.

**Verify:** lifecycle + route tests → pass for Stop during each provider stage, clean iterator completion after abort, never-settling provider/body/stream metadata (predictable blocked result and retained known cost), fatal cost cap, throwing subscriber, terminal projection failure, terminal append failure, and multiple stop calls.

### Step 4: Add deletion as an exclusive lifecycle operation

Route DELETE through `ProjectService`. Acquire the admission gate synchronously before awaiting tombstone persistence, then follow the ordered protocol above. Preserve the current owner's narrowly permitted terminal/accounting writes during drain. On successful settlement revoke those remaining leases, remove memory with typed error classification, then remove files. Handle interrupted stages idempotently and clean runtime caches/subscribers only after they can no longer write.

Installed deletion preflight (2026-09-06): `@mastra/memory` 1.25.0 `Memory.deleteThread` reads the thread, deletes it, then clears Observational Memory only when the previously read thread has a resource ID. LibSQL's thread deletion is idempotent for a missing row and propagates operational failures. If OM cleanup fails after the thread row was deleted, a naive retry can skip that orphaned OM state. The runtime memory-deletion port must preserve or derive the known project thread/resource identity through retries and explicitly guarantee both thread and OM cleanup before declaring deletion complete. Verify this with an injected failure between the two stages and a successful retry/reconstruction. The current runtime does not configure a vector store; do not introduce one for this work.

The production memory factory currently enables default asynchronous observation/reflection buffering. Installed `omEngine.waitForBuffering()` resolves `void` both after actual settlement and after its timeout (`@mastra/memory/dist/src-BgdYYHLc.js`, `BufferingCoordinator.awaitBuffering` and `ObservationalMemory.waitForBuffering`); it is not a trustworthy drain result. Use a supported lifetime boundary. The minimal supported configuration is `observation.bufferTokens:false`, which disables detached buffering and keeps memory processing awaited by the main run; preserve observation and reflection themselves. This may move compaction latency into the run and should be documented. The earlier real SDK test already used this setting, so add coverage of the actual production factory plus delayed memory processing/deletion. Do not access private static buffering maps or declare deletion complete based on the public wait's timeout. If another supported port proves actual settlement, report and verify it before choosing that alternative.

No callbacks can write to a deleted project: check operation ownership/tombstone in project-bound repository writes. Do not recreate the project directory to record cleanup after deletion.

**Verify:** project-service tests and existing API tests → pass for deletion during image generation, queued log append, terminalization while tombstoned, tombstone preparation/uncertain-commit failure, memory deletion failure, filesystem deletion failure, server reconstruction between stages, simultaneous start/delete, delayed same-creationKey retry during/after deletion and after reconstruction, unresolved drain, and repeated DELETE. Temporary roots must contain no resurrected project after completion; the minimal deletion marker may remain outside that project directory.

### Step 5: Update composition and ownership docs

HTTP handlers call the application services. Mastra route owns model/tool execution only. Storage owns commits; bus owns delivery only. Document lifecycle/journal/tombstone contracts and add the application child DOX index. Keep actual production memory/project files untouched during migration and verification.

**Verify:** all server/full gates above → pass; review all `setRunStatusSync`, `claimRun`, `releaseRun`, `deleteProject`, and terminal emit callers with `rg`; authority must be in the coordinator/service, with explicit migration/projection helpers only.

## Test plan

Use 014 temporary runtimes and 016 fake provider operations. At each boundary, reconstruct runtime from fixture storage and assert one accepted request, at most one canonical terminal record, and a consistent public state. Test same-ID retries, conflicting reuse, distinct overlapping runs, all setup/finalize failures, abort/drain, tombstones, memory errors, and legacy replay. No live paid providers or production data.

## Done criteria

- [x] Accepted input is durable before acknowledgment/provider work.
- [x] Same-turn retries cannot create duplicate generation.
- [x] One terminal owner and record covers success, Stop, setup failure, cost cap, and restart.
- [x] Missing projections are repaired from journal state without duplicate history.
- [x] Deletion cannot race new starts or resurrect files through late writes.
- [x] Known provider work is drained before terminal accounting/deletion.
- [x] Scoped changes, DOX, tests, and index are complete.

## STOP conditions

- Exactly-once remote provider execution or a transaction spanning Mastra and filesystem is required; this plan promises neither.
- Required lifecycle records cannot be replayed without losing legacy turns.
- The installed memory API cannot distinguish missing threads from operational failure.
- Acceptance would require writing secret values or base64 bytes into JSON.
- Prerequisite ports are missing/incompatible, unexplained drift appears, or gates fail after two reasonable fixes.

## Maintenance notes

Future run entry points and deletion routes must use these services. The journal is authority for lifecycle; run-state JSON is a projection. Keep attachment asset references valid for accepted runs. Plan 018 builds the client protocol from these committed records and explicit turn identity.

## Audited file fingerprints

SHA-256 of the post-016 original workspace. Review changed hashes against prerequisite diffs; do not overwrite current code to match them.

| File | SHA-256 |
|---|---|
| `apps/server/src/mastra/route.ts` | `e3c9c6017098cb6902b6f9211dc901ce22a275a10bb50f17da461d02ed618424` |
| `apps/server/src/mastra/lib/run-finalize.ts` | `daabaa16f7ff973859c882288f28245743061ee50693460f4f02e160c1992adf` |
| `apps/server/src/mastra/lib/run-bus.ts` | `731c17e6052d3295351a9d7d50964e694b0b3889cc8b6c42e4de675dfda0ed39` |
| `apps/server/src/index.ts` | `1f20cc8bb39ed986c8be14e3abe88ef563e5b64ded3f6f9b7f31135789c1946e` |
| `packages/conversation/src/reducer.ts` | `1b7fe3e0f493a92b1682acf7be3f1d213d8b99147a0520b945e709b48ccbb4b3` |
