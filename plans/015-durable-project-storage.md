# Plan 015: Make document commits, journals, and asset identities durable

> **Executor instructions:** Follow the steps and their verification gates. Plan 014 must be complete before running storage tests. Mark this plan DONE in `plans/README.md` only after restart/corruption tests pass.
>
> **Drift check:** Run `git diff --stat d2ae1e6c..HEAD -- apps/server packages/conversation`, `git diff HEAD -- apps/server packages/conversation`, and `git status --short`. Factory changes from 014 are expected. Locate the same behavior behind the new injected interfaces; do not restore the old globals.

## Status

- **Priority:** P1
- **Effort:** L
- **Risk:** MED
- **Depends on:** `plans/014-isolate-server-runtime.md`
- **Category:** bug, architecture
- **Planned at:** commit `d2ae1e6c` plus audited working tree, 2026-09-05
- **Status:** DONE; implemented and independently verified in the shared workspace. See [review report](015-report.md).

Execution used the completed 014 runtime factories and temporary fixtures. The final integration baseline records 504 Git-visible files in `baseline015b/` and `manifest015b.json` beside the isolated worktree. All 21 reviewed files were applied after a zero-conflict preflight and verified by hash; 430 uncached repository tests passed after application, with one live smoke skipped.

The integration preserves independently added UUID `creationKey` retries, separate brief/title/titleSource, protected user renames, page-derived titles, and title/brief SSE fields. Keyed creation remains tracked through snapshot publication and disposal, and metadata notifications follow their commit. These compatibility adaptations do not change the HTML edit engine or add a new product workflow.

## Why this matters

Generated image IDs repeat after server restart and overwrite older project assets. Canonical document/state files are overwritten in place, and one malformed journal line discards every valid message on read. Storage must publish only committed state and preserve existing data through failure.

## Historical audited state

`apps/server/src/mastra/lib/image-store.ts:27`:

```ts
counter += 1
const id = `img-${counter}`
images.set(id, {
```

`apps/server/src/mastra/lib/project-store.ts:857`:

```ts
const fileName = `${imgId}${extension}`
const dir = join(projectDir(projectId), IMAGES_DIR)
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, fileName), stored.buffer)
```

The streaming result handler at `run-stream-loop.ts:291` recognizes only numeric IDs via `/\/images\/(img-\d+)(\.[a-z0-9]+)?$/i`.

`project-store.ts:1075` parses every JSONL line inside one try/catch; any parse failure returns `[]`. Its `writeHtmlDocumentSync`, `writeMetaSync`, and `writeRunStateSync` write canonical files directly. `persistRenderedDocument` replaces its in-memory document before disk commit, and `appendClientMessage` invalidates its cache before the append resolves.

The anchored document is `HtmlDocumentJsonV1`; its `version: 1` is a format version, not edit history. Keep stable anchors intact.

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

Use a `codex/` branch when creating a branch. Preserve the current working tree; an isolated checkout must include the approved uncommitted baseline, not just HEAD. Record the initial changed-path set and compare your own diff against it. Commit, push, merge, and PR actions require the operator's instruction; this plan does not direct them.


## Commands you will need

| Purpose | Command | Expected result |
|---|---|---|
| Storage tests | `pnpm --filter @workspace/server exec vitest run src/mastra/lib/project-store.test.ts src/mastra/lib/image-store.test.ts src/storage/atomic-file.test.ts src/storage/event-journal.test.ts --coverage=false` | All pass in temp roots |
| HTML regressions | `pnpm --filter @workspace/server exec vitest run src/mastra/lib/html-anchor-document.test.ts src/mastra/tools/edit.test.ts src/project-html-route.test.ts --coverage=false` | All pass |
| Server gates | `pnpm --filter @workspace/server typecheck`, `lint`, `format:check`, `test`, `build` | Each task exits 0 |
| Full regression | `pnpm run test` | All non-live tests pass |

For the server-gates row, invoke each task as `pnpm --filter @workspace/server <task>`.

## Scope

**In scope:** `apps/server/src/mastra/lib/{project-store,image-store,run-stream-loop,html-anchor-document}.ts`; `mastra/route.ts` for committed emission/error plumbing only; `mastra/tools/generate-image.ts` and its persistence wiring in `mastra/tools/landing-tools.ts`; image routes in `src/index.ts`; their existing tests; create `mastra/lib/image-store.test.ts`; create `src/storage/{atomic-file,event-journal}.ts`, matching tests, and `src/storage/AGENTS.md`; runtime wiring from 014; `src/mastra/lib/project-filesystem.ts` and its tests for owned atomic-file operations and file-descriptor isolation; server/Mastra/root DOX indexes and README storage contract; this plan/index.

**Out of scope:** real `.data`/DB files, wholesale database migration, user-facing version-history UI, new renderer, run lifecycle transitions, new SSE/client protocol, model selection, provider retry/accounting, framework upgrades. Do not change `HtmlStore` from synchronous to asynchronous in this plan.

## Target contract

1. **Atomic snapshots:** write a complete temporary file in the destination directory, flush/close it, atomically replace the canonical file, and synchronize directory metadata where supported. Rename is the visibility commit point. Return/discriminate `notCommitted`, `committed`, and `durabilityUncertain`: preparation/rename failure preserves old memory/disk; failure after rename must reconcile memory from the new canonical document and report uncertainty. Metadata-projection failure reports a committed document with a failed projection. Do not describe several file replacements as one transaction.
2. **Journal commit boundary:** `appendCommitted(entry)` serializes per project, adds a monotonic project-level `seq`, writes and flushes the complete newline-delimited record, then publishes its cache generation and notifies subscribers. Return the committed record. The first append/flush failure poisons that project's queue: reject subsequent appends without touching the file and keep `flush()` rejecting until explicit recovery. Recovery scans and validates bytes, quarantines/truncates an incomplete tail, flushes the surviving prefix, and derives the next sequence from that prefix. A complete line whose flush failed is an uncertain commit: preserve its sequence during recovery; do not reuse it or blindly append a duplicate. Inspection-only agent/vision logs may remain separately best-effort.
3. **Recovery:** old records without `seq` receive stable logical positions in file order when read; new sequences start after the valid prefix. Never rewrite original journals merely to add sequence numbers. Recover only an incomplete trailing record, preserving its raw bytes in a quarantine artifact before truncating that tail. An invalid interior record is an explicit corruption error with file/line context; never silently return an empty history.
4. **Snapshot read:** expose `readSnapshot()` with rendered HTML/hash, metadata, valid conversation records, and committed event watermark. Maintain per-project `repositoryRevision`, `mutationGeneration`, and a Set of pending snapshot-affecting mutation promises. Register every async document/metadata/journal mutation and increment mutationGeneration **before its first await**; keep it pending through filesystem replacement, revision/cache publication, and error reconciliation. Synchronous HtmlStore writes replace and publish revision within one synchronous call. For a snapshot, await the captured pending mutations and journal chain, then capture revision/generation, read required files, and recheck that both tokens are unchanged, no mutation is pending, and the journal-chain identity is unchanged. Otherwise retry. This catches a rename that is visible before its async completion callback publishes revision. Publish immutable snapshot data and cursor together only when all checks pass. After eight attempts return a typed retryable busy result; callers retry rather than use torn data. HTML may be newer than its last notification record: include its actual hash and never claim cursor alone versions HTML. Register only local mutations, not provider work; keep synchronous HtmlStore methods synchronous.
5. **Immutable assets:** new asset IDs use `img-${randomUUID()}`; write immutable project-owned bytes with exclusive creation. A repeated ID with identical bytes is idempotent; different bytes is an error. Keep legacy `img-<number>` filenames/URLs readable. Unpersisted buffers remain bounded and are released on runtime disposal.

Explicit recovery is exposed as `repository.recoverClientJournal(projectId)`. Ordinary journal and repository snapshot reads expose the valid prefix and recovery status without mutating files. The existing array-shaped message reader remains compatible. Startup reconciliation does not automatically quarantine or truncate operator journals. Recovery joins the journal queue before its first await, durably preserves the exact raw tail bytes, flushes the surviving prefix, and only then clears the failed state. A complete record with uncertain durability retains its observed sequence separately from the confirmed watermark until recovery succeeds. This plan adds no HTTP or CLI recovery command.

The first journal-file creation must synchronize its parent directory where supported as well as flush the record. Releasing an image buffer must preserve the mapping from a tool's temporary URL to already persisted project bytes, so later HTML edits can still resolve that URL. Capacity limits may reject new allocations; they must not evict bytes before required persistence.

## Steps

### Step 1: Add and test atomic file primitives

Implement `storage/atomic-file.ts` with sync and async entry points matching current callers. Use injectable filesystem operations for failure tests and real temporary files for successful replacement tests. Apply it to canonical document, metadata, and run-state snapshots. Clean up only temporary files created by that operation.

Commit the normalized HTML and any referenced immutable image bytes before publishing the in-memory HtmlStore document. If replacement succeeded but directory sync or later metadata projection fails, reconcile memory from the canonical document, advance repositoryRevision, and report the committed/uncertain outcome explicitly. Only a pre-replacement failure leaves the old in-memory document unchanged.

**Verify:** atomic-file and project-store tests plus typecheck → pass, including separate failures before rename (old bytes/memory unchanged), after rename during directory sync (new canonical memory plus uncertainty), and during metadata projection (new document plus visible projection failure).

### Step 2: Make journal reads and cache publication commit-aware

Implement `storage/event-journal.ts` and migrate client-message reads/appends to it. Validate record structure; classify missing, incomplete tail, and interior corruption separately. Return authoritative write failures to callers instead of swallowing them through the debug logger. Invalidate or advance the turn-cache generation after commit; a read begun before a commit must not cache its stale replay under the new generation.

Provide `readCommitted(afterSeq?)`, `appendCommitted`, `flush`, and `readSnapshot`. Within the single-process model, initialize each project's next sequence once from its journal before accepting appends; no sequence reuse after reconstruction. Keep `html_update` full HTML out of the journal. Plan 017 owns lifecycle records, and 018 owns wire cursors.

Migrate `route.ts` callers now: use a serialized emission queue that awaits append before the corresponding broadcast. Synchronous stream callbacks enqueue work with a handled rejection; the queue retains the first error for awaited completion and aborts the active run on authoritative write failure. Handle the inbound prompt append promise and drain this queue before run release. Do not swallow journal failure in `flushProjectLogs` or produce an unhandled rejection through `void appendClientMessage`. This interim adapter preserves event names/order; lifecycle acceptance/idempotency ordering remains assigned to 017.

**Verify:** event-journal/project-store/route tests → pass for partial trailing bytes, interior corruption, legacy records, concurrent ordered appends, partial append followed by another queued append (second rejected without file mutation), complete-line flush failure and recovery, failed append causing no broadcast/unhandled rejection, and read-during-append cache freshness.

### Step 3: Replace restart-sensitive image IDs

Change image allocation to UUIDs and asset writes to exclusive immutable creation. Search with `rg -n 'img-|persistGeneratedImage|persistProjectImages|copyAgentImage' apps/server/src`; update every allocation, router matcher, stream-result parser, and HTML rewrite path to accept both legacy numeric and new UUID IDs. Keep extension validation and project ownership checks. Do not rewrite old saved HTML eagerly.

Retain the current temporary `/images/:id` reference path if needed by the tool contract; persist bytes under the project's stable URL before successful generation is published. Ensure eviction never removes a buffer before its required persistence step.

**Verify:** storage and image-store tests plus HTML regressions → pass. The restart test creates an asset, reconstructs runtime against the same temp project, generates another same-format asset, and asserts the old URL's bytes and old HTML are unchanged.

### Step 4: Expose stable repository reads and finish migration documentation

Expose document hash and committed-event watermark through the injected repository without changing existing HTTP shapes. Implement the revision/generation/pending-mutation snapshot algorithm above for plan 018, testing controlled document, metadata, and journal changes during async reads. Include a test paused after filesystem rename becomes visible but before its completion callback publishes revision: no snapshot may return until that mutation is reconciled. Retain all legacy fallback readers; if legacy parsing fails, surface corruption rather than silently inventing a blank page.

Document temp/quarantine artifacts, sequence migration, failure semantics, and ownership in `storage/AGENTS.md` and affected parents. This creates infrastructure for future history, not a user-facing restore feature.

**Verify:** all server gates and full regression above → pass. Inspect own diff for writes/migration commands targeting real application data; there must be none.

## Test plan

Use 014 temporary runtime fixtures with `RUN_FIRECRAWL_SMOKE=0`. Cover pre/post-replacement failure semantics, metadata failure visibility, sticky journal failure and explicit recovery, complete-line uncertain commits, trailing/interior corruption, monotonic sequences, stale-cache rejection, snapshot interleavings and bounded busy result, UUID/legacy routing, immutable-write collision, and restart asset preservation.

Use existing `project-store.test.ts` and `html-anchor-document.test.ts` patterns. Assert behavior/bytes, not private helper implementation or Markdown.

## Done criteria

- [x] All listed gates pass in isolated fixtures.
- [x] A failed snapshot preparation cannot truncate the current page.
- [x] A partial journal tail cannot erase valid history; interior corruption is surfaced.
- [x] Authoritative append failures reject, and cache/snapshot publication follows commit.
- [x] New asset IDs survive restarts without overwriting old bytes; legacy URLs still resolve.
- [x] A consistent snapshot includes its committed journal watermark.
- [x] DOX and index updated; own changes stay in scope.

## STOP conditions

- Atomic replacement semantics cannot be supported on the intended local filesystem.
- The change requires weakening stable anchors or dropping legacy data.
- A migration would need to rewrite the operator's projects automatically.
- A proposed multi-file operation is assumed transactional without recovery logic.
- Drift unrelated to 014 changes the persistence model, or a gate still fails after two reasonable fixes.

## Maintenance notes

These repositories are single-process; this plan does not make file storage safe for multiple server writers. Keep authoritative events distinct from inspection logs. Plan 017 uses one durable lifecycle record as the recovery source; run-state metadata remains a projection. Plan 018 uses the watermark and independent document hash to avoid event loss. Preserve those interfaces when reorganizing modules.

## Audited file fingerprints

SHA-256 of the working-tree files read for this plan. A changed hash calls for review, not restoration of old code. Changes explained by completed prerequisites are expected; unexplained behavioral changes require plan refresh.

| File | SHA-256 |
|---|---|
| `apps/server/src/mastra/lib/project-store.ts` | `17f047e27ad7ce68ed6c7dd2ccf25a5750560c096b1add104b523429f544774b` |
| `apps/server/src/mastra/lib/image-store.ts` | `16c045c36732151bb4417db7e0f37f1e8ef86cac58a08460dbbfe287bbda90e0` |
| `apps/server/src/mastra/lib/run-stream-loop.ts` | `5b5aae1b94057652dc19606390528f8573e3b6a58079ff757631ea7e0a5d4807` |
