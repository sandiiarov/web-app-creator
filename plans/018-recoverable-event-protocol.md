# Plan 018: Share validated contracts and recover editor event subscriptions

> **Executor instructions:** Complete the steps in order after 014–017. Keep the shared conversation reducer framework-free and preserve legacy projects. Run real HTTP/SSE tests with deterministic providers, not only a mocked client transport.
>
> **Drift check:** Run `git diff --stat d2ae1e6c..HEAD -- apps/client apps/server packages/conversation packages/prompt-panel`, `git diff HEAD -- apps/client apps/server packages/conversation packages/prompt-panel`, and `git status --short`. Coordinator/journal changes from prerequisites are expected. Keep independent UI work intact.

## Status

- **Priority:** P1
- **Effort:** L
- **Risk:** MED
- **Depends on:** `plans/014-isolate-server-runtime.md`, `plans/015-durable-project-storage.md`, `plans/016-provider-execution.md`, `plans/017-run-lifecycle.md`
- **Category:** bug, architecture
- **Planned at:** initial audit `d2ae1e6c`, refreshed after 014–017 at `6cac7a35` plus all current working-tree changes, 2026-09-06
- **Status:** DONE; see [execution and independent review](018-report.md).

Integration context (2026-09-06): independent workspace changes added UUID `creationKey` draft retries, project brief/title/titleSource, protected user renames, and live `project_meta` title notifications. These behaviors are part of the current baseline; preserve them when migrating schemas, snapshots, hooks, and list subscriptions. This plan does not reimplement project-creation idempotency. Include current identity fields in validated project metadata and give committed metadata changes a v2 delivery or explicit snapshot-refresh path so a second editor retains live rename behavior.

That work also added `lib/reconnecting-stream.ts`, IndexedDB-backed `lib/project-drafts.ts`, `hooks/use-project-draft.ts`, and an awaited `Promise<boolean>` send callback. Reuse their behavior and tests while integrating the typed session and transport; do not restore the older one-shot/no-draft implementation described in the historical audit below. Keep the current visual layout, docking, compact panel, rename flow, and saved-request restoration. Current root preferences require square rectangular controls/surfaces and a collapsed chat control that remains draggable within the viewport on desktop and mobile, distinguishing drag from click; preserve these independently implemented interactions.

The approved compact glass workspace and project library are committed as `4723be32`, followed by placement/library refinements at `6cac7a35` on original `main`. Its 352 × 360 floating composition, in-panel project switcher, shared preview component, and current draft/reconnect behavior belong in the fresh post-017 execution baseline. Preserve later uncommitted UI changes too; review 018 against that full snapshot rather than either historical commit alone.

## Why this matters

The server reads a snapshot before subscribing to live events. Editors still infer the active turn from local state, so a second open tab can ignore an entire run. The newly added recovery wrapper reconnects on connection loss but has no committed cursor, validated wire schema, or heartbeat-based idle recovery. A validated protocol, coherent snapshot boundary, and explicit project-session state make reconnects and multiple views reliable.

## Historical audited state

`apps/client/src/lib/sse-client.ts:17` opens one fetch and returns when its reader reaches EOF:

```ts
const response = await fetch(url, { signal })
return readSseResponse(response, onEvent)
```

`apps/server/src/index.ts:468` reads the project, then reads conversation logs, sends state, and only afterward calls `subscribeProject` at line 487. Completion can happen in that gap.

`apps/client/src/hooks/use-landing-page.ts:113` derives the active turn from a replayed streaming turn, then lines 127–128 discard live events without it:

```ts
const turnId = activeTurnIdRef.current
if (!turnId) return
```

`apps/client/src/lib/projects-api.ts:5` declares snapshot run IDs/timestamps that the current server snapshot omits. `packages/conversation/src/types.ts:12` uses an intentionally permissive historical log type:

```ts
export type ClientEvent = Record<string, unknown> & {
  dir: 'in' | 'out'
  ts: string
}
```

Keep that compatibility reader; it is not a validated wire schema. At the audit baseline the prompt panel invoked void `onSend` and immediately cleared attachments (`prompt-panel.tsx:416`), and the hook cleared remaining attachment payloads on a rejected POST. The current integration behavior below supersedes that baseline.

## Current integration baseline

Plans 014–017 are applied and independently verified in the original workspace: 505 uncached tests passed, one live smoke skipped, and all 11 typecheck tasks passed. The coordinator now owns durable acceptance, effective-input idempotency, blocked state, one terminal record, restart recovery, and deletion tombstones. The snapshot/live ordering and local-turn routing gaps below remain verified targets. Create fresh `baseline018/` and `manifest018.json` from all current Git-visible paths before editing, including staged skill moves, current UI work, and plans. Review against that immutable snapshot, not HEAD. Preserve symlinks and deletions; exclude generated Mastra metadata.

The last combined format check found concurrent UI formatting in `packages/landing-preview/src/landing-preview.tsx` and `packages/prompt-panel/src/composer.tsx`. This plan may format those two files only, preserving their behavior and styling. Read their DOX chains first. Include these formatting-only changes in the result manifest. Other new unrelated failures must be reported with exact evidence.

- `subscribeWithRecovery` wraps the existing SSE reader with a 15-second connection timer and finite reconnect attempts. It identifies missing projects through error-message matching and stops after repeated failures. Preserve manual reconnect and visible connection status while replacing this with the specified typed, owned transport.
- `useLandingPage` still casts snapshot/event data and uses `activeTurnIdRef`; it merges a single pending POST turn into snapshots but turns every POST error into rejection and clears its pending identity. A lost acknowledgment can still disagree with committed server work.
- `prompt-panel.tsx` now awaits `onSend(): Promise<boolean>` and clears only a matching prompt/attachment reference on success. Extend this existing acknowledgment behavior with typed accepted/rejected/unknown outcomes and revision/session checks.
- `project-drafts.ts` persists drafts and per-turn attachment copies in IndexedDB, with a synchronous cache. Preserve saved drafts and request restoration; migrate only the submission/session metadata required by this plan. Do not remove this persistence in favor of memory-only session state.

## Repository conventions and baseline

- Repository root: `/Users/alexsandiiarov/Documents/web-app-creator`. Run commands there.
- pnpm 11.1.3, Node >=22.19, strict ESM TypeScript. Match existing extensionful server imports, small factories, Zod tool boundaries, Vitest tests, Oxfmt/Oxlint, and package-local scripts.
- Read root `AGENTS.md` and every owning child before editing. Update affected DOX contracts and indexes when implementing this plan; describe proposed behavior as implemented only after it works.
- This plan describes a single local server with one active run per project. Closing a browser tab does not cancel generation. Keep the anchored single-file HTML format, legacy reads, provider-reported OpenRouter cost, and Mastra Observational Memory keyed by project ID.
- Keep the existing @mastra/core patch and exact @mastra/memory pin. Read installed Mastra docs/types before changing its construction/storage APIs. Do not introduce framework or dependency upgrades.
- The audit ran against commit `d2ae1e6c` **plus substantial uncommitted changes**. The commit alone does not reproduce the audited state. Check both committed and working-tree diffs; preserve the user's changes.
- Audit baseline: typecheck passed; lint passed with warnings; 362 tests passed across the repo run and a focused rerun of 20 HTTP tests that initially hit sandbox `listen EPERM`; one live screenshot smoke was skipped. Some results were Turbo cache hits. Root format check stopped at existing formatting in `packages/conversation/src/reducer.ts`. No build, paid provider smoke, or browser QA was run for this audit. This is historical evidence, not an executor's verification result.
- Existing storage tests are unsafe beside the development app until plan 014 isolates them. Do not run broad server tests before completing that isolation.
- Prefix every ordinary test command with `RUN_FIRECRAWL_SMOKE=0 pnpm_config_verify_deps_before_run=false`. Do not overlap coverage-writing suites. Full independent gates use `--force --env-mode=loose`; no paid/live providers or production data. All prerequisite runtime fixtures are now isolated.

## Git workflow

Use a `codex/` branch when creating a branch. Preserve the current working tree; an isolated checkout must include the approved uncommitted baseline, not just HEAD. Record the initial changed-path set and compare your own diff against it. On 2026-09-06 the user explicitly authorized merging the completed architecture work to `main` and pushing it. Perform that final delivery only after the selected backlog passes review and verification, including all current app changes and ongoing UI work, as the user explicitly confirmed. Refresh and verify the combined tree before committing; preserve concurrent edits and do not force-push. The reviewer coordinates source application and final Git integration.


## Commands you will need

| Purpose | Command | Expected result |
|---|---|---|
| New contracts | `pnpm --filter @workspace/contracts typecheck` and `pnpm --filter @workspace/contracts test` | Exit 0, schema tests pass |
| Client protocol/session | `pnpm --filter @workspace/client exec vitest run src/lib/sse-client.test.ts src/lib/project-session.test.ts src/hooks/use-landing-page.test.tsx --coverage=false` | All pass |
| Server delivery | `pnpm --filter @workspace/server exec vitest run src/index.test.ts src/http/project-events.test.ts --coverage=false` | All pass using temporary runtimes |
| Shared replay/UI | `pnpm --filter @workspace/conversation test` and `pnpm --filter @workspace/prompt-panel test` | All pass |
| Full gates | `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run test`, `pnpm run build` | Exit 0, except separately reported unrelated baseline formatting |

Preserve the isolated dependency layout from 017: application and package `@workspace/*` links must resolve into the executor worktree, including the new contracts package. Keep external installed packages read-only and generated metadata local. Never run an install through node_modules symlinks to the original workspace. If an install is necessary, first establish worktree-owned dependency directories, then use `pnpm install --offline` with existing catalog versions. The installed pnpm 11.1.3 also supports `--lockfile-only --offline --ignore-scripts` for lockfile-only changes; review the resulting dependency diff. No dependency upgrades. Verify runtime and typecheck module resolution against the worktree, and later verify the combined original workspace before publication.

## Scope

**In scope:**

- Create `packages/contracts/` with `package.json`, shared-config-based TS/lint/format/Vitest configs, `src/{index,commands,project-events,project-snapshot,project-list,protocol-limits}.ts`, tests, and `AGENTS.md`.
- Export the existing `ConversationMemoryPart` type from `packages/conversation/src/index.ts` for schema alignment. Domain reducer behavior and dependency direction remain unchanged.
- Reorder existing declarations in `packages/conversation/src/{reducer,types}.ts` only to satisfy the full repository module-order lint rule. Review confirmed unchanged function bodies and type definitions; no domain behavior change is allowed.
- Create `apps/client/src/lib/{project-session,sse-client.test,project-session.test}.ts`; update `lib/{sse-client,projects-api,landing-agent}.ts`, `hooks/use-landing-page.ts`, its tests, `components/projects-page.tsx` and tests for list subscriptions.
- Adapt the existing `lib/reconnecting-stream.ts` and its tests, `lib/project-drafts.ts`, `hooks/use-project-draft.ts` and its tests, and `App.tsx` only as needed to preserve current reconnect/draft behavior and wire the typed send result. Retire a superseded helper only after all callers and tests migrate.
- Update `packages/prompt-panel/src/prompt-panel.tsx` only for the send acknowledgment contract and draft retention; related callback types and focused tests may change. Format-only cleanup of `packages/prompt-panel/src/composer.tsx` and `packages/landing-preview/src/landing-preview.tsx` is allowed for the existing combined gate failure. No visual restyling.
- Create `apps/server/src/http/project-events.ts`, its tests, and `http/AGENTS.md`; update `index.ts`, event publication in `mastra/route.ts`/`lib/run-bus.ts`, repository snapshot/event mapping, and `application/{project-service,run-coordinator}.ts` solely for committed list-change notifications from prior plans. Adjacent repository/route/API tests may change for these contracts. A deterministic browser fixture may live under the isolated server testing boundary with its owning DOX updated.
- Update client/server package manifests, pnpm lockfile, packages/root DOX indexes, client/server/Mastra/prompt-panel contracts, README API documentation, and plan index.

**Out of scope:** reimplementing the conversation reducer in React, moving UI components, thumbnail/gallery performance redesign, project-creation idempotency, renderer changes, incremental historical HTML storage, authentication/multi-user tenancy, replacing Mastra/SSE, dependency upgrades.

## Target contract

### Package dependency direction

`packages/conversation` remains the domain turn model and pure legacy/new-record reducer. It must not import contracts or React. `packages/contracts` may import conversation types and Zod; apps import both packages. Contracts define/validate HTTP inputs, start results, event envelopes, and snapshots. Validate snapshot turn/part fields with actual schemas matching ConversationTurn; do not label an unchecked `z.custom`/cast as validation. Type-check those schemas against domain types.

The prompt panel stays presentational. The client session owns connection/submission reconciliation.

### Protocol version 2

Opt in with `GET /api/projects/:id/events?v=2`; retain the legacy response path during migration. The first-party client moves to v2.

- Initial `state`: `{ version:2, projectId, cursor, documentHash, html, title, brief?, titleSource?, models, run:{turnId,startedAt,status,blocked}, turns }`. Preserve current identity metadata with executable schemas. A blocked run from 017 disables new submissions and shows its reason; it must not be inferred finished merely because public status is error.
- Live `project_event`: `{ version:2, projectId, seq, turnId, ts, type, payload }`, with a discriminated payload schema for accepted run, text/thinking/tool/memory/retry/stats, blocked run, terminal outcome, document change, project metadata change, and no-op checkpoint. Sequence is the durable project journal sequence, not the per-run HTML counter. Run events require a turn ID; project metadata changes outside a run use `turnId:null`, never an invented active turn. Deliver metadata changes through a lightweight committed record or an explicit bounded resnapshot signal; test a rename in another editor both during and outside a run.
- Every editor receives committed acceptance and terminal lifecycle records from 017, including those started in another tab.
- A lightweight committed document-change journal record contains hash and byte count, not full HTML. Live delivery enriches that event with current HTML only when its hash matches. Old document bytes are not required for replay.
- **Reconnect policy is a fresh authoritative snapshot**, then buffered/live events after its cursor. A client cursor is for deduplication and gap detection; do not promise incremental replay of historical HTML. A gap, missing live HTML, or uncertain projection requests another snapshot.
- SSE heartbeat comments keep the connection observable; the parser ignores them. Use standard event/id/data framing, handle CRLF and multiline data, and reject malformed/oversized frames through a typed transport error.

### Consistent snapshot and delivery

Register one bounded subscriber queue and close cleanup **before** any async snapshot read. Keep that same subscriber/queue for the entire connection; there is no detach/attach handoff. Enqueue committed records synchronously in sequence order. One asynchronous writer obtains the 015 snapshot, finishes writing it, removes queued records at/before its cursor, then serially enriches and writes later records. Events committed during snapshot output, HTML enrichment, or a socket drain remain on that same queue. The writer never writes a later event before an earlier one.

Never silently discard live events: if queued lightweight records exceed 1 MiB or 512 events, close the stream so the client reconnects for a new snapshot. Queue document hashes/metadata, not copies of full HTML. Permit only one enriched document or snapshot frame in flight at a time. Bound the socket's pending write path, respect drain, and never block generation on a subscriber.

Put byte constants/error codes in shared `protocol-limits.ts`. Limits apply to UTF-8 bytes: ordinary event data 1 MiB; raw HTML 8 MiB; encoded document-event frame 32 MiB; encoded project snapshot frame 64 MiB; encoded list snapshot frame 16 MiB. Check encoded size after JSON escaping; the parser has a 64 MiB absolute frame cap and applies the tighter event-specific cap after parsing. These are transport limits, not permission to truncate or delete stored projects. A larger existing project returns a small `protocol_error` with `SNAPSHOT_TOO_LARGE`, `DOCUMENT_TOO_LARGE`, or `EVENT_TOO_LARGE`; the client enters unavailable with a clear reason, retaining last valid state. Deterministic oversize, invalid schema, or unsupported version errors do not reconnect forever. Snapshot >1 MiB but below its own cap is valid.

### Project-list protocol

`GET /api/projects/events?v=2` emits a full `list_state` frame `{version:2,projects:ProjectMeta[]}`, including an empty array. Each frame authoritatively replaces the client's list; it is not a patch. Define its schema in `project-list.ts`.

Subscribe to runtime list invalidations before the initial read. Committed project creation, metadata/hasHtml changes, run-state changes, and completed deletion trigger invalidation through repository commit callbacks and ProjectService/RunCoordinator publication. Drafts remain filtered out until hasHtml is true. Coalesce invalidations for at most 50 ms, serialize reads/writes through one writer, and retain a dirty flag when a change arrives during refresh so another snapshot follows. On reconnect always send a full snapshot. This needs no durable global cursor; it must not miss remote creation/removal or suppress empty-list hydration. Legacy callers retain the existing individual status-event mode.

### Client session and submissions

Use one pure `project-session.ts` reducer for authoritative snapshot, accepted run, live events, terminal outcome, connection transitions, and pending submissions. It delegates turn updates to `@workspace/conversation` instead of maintaining a second event-to-turn implementation.

- Connection states: connecting, connected, reconnecting, unavailable. An EOF or non-user abort reconnects with bounded exponential backoff and jitter; reset the attempt delay after a valid snapshot. Fatal 404 marks missing; 403/unsupported protocol show a stable error instead of retrying forever.
- Reconnect delays start at 500 ms and cap at 10 seconds. Use an injected scheduler/random source for tests. Heartbeat interval 15 seconds; reset idle detection on any bytes; after 45 seconds of silence cancel/reconnect. Timers/listeners/readers clean up on project switch/unmount.
- Preserve authoritative running state while disconnected; do not fabricate success or enable a duplicate run because a socket closed.
- Before first snapshot, submission is unavailable. After hydration, optimistic submission uses one stable turn ID and immutable draft. A run-accepted event and POST acknowledgment merge by that ID rather than append duplicate turns.
- A rejected submission retains/restores the complete draft and attachments. A network-uncertain submission retains its ID/input and reconciles with a fresh snapshot or repeats the same idempotent command through 017. Do not clear attachment bytes until acceptance is confirmed.
- A snapshot cannot overwrite newer optimistic state indiscriminately. Merge only pending operations not represented in it; terminal records close the correct turn, including final stats even when an earlier error notification arrived.

Submission callback: `onSend(input): Promise<{turnId:string; outcome:'accepted'|'rejected'|'unknown'; reason?:string}>`. Capture an immutable input and the panel's draft revision at submit; increment draft revision on every prompt/attachment edit. Clear only that exact revision when accepted. If the user has since edited, keep the newer draft. Retain rejected/unknown submitted input by turn ID in session state; a stale failure cannot overwrite a newer draft.

Tag async results with project ID, a monotonically increasing mounted-session generation, and turn ID. Ignore results from an old project/session. Evidence precedence is terminal > committed acceptance > HTTP rejection/uncertainty. Once acceptance was observed, a delayed POST error cannot mark that turn rejected; a late running acknowledgment cannot regress a terminal turn. Response handlers reconcile their own pending operation only.

## Steps

### Step 1: Add the contracts workspace and executable schemas

Follow `packages/conversation/package.json` for source exports and package-local scripts. Add only existing catalog Zod and workspace dependencies. No React/Node runtime imports in contracts. Implement schemas for bounded commands, start results, v2 envelopes, snapshots, and domain turn payloads; derive public wire types from schemas.

Keep decoded attachment size validation at the server boundary; a string schema alone does not enforce decoded byte limits. Preserve current MIME, per-file, aggregate, model, and turn-ID validation behavior.

**Verify:** contracts typecheck/tests and full repo typecheck → pass. Tests reject wrong payload shapes, missing identity/cursor, invalid numeric values, and malformed snapshots; valid current tool/memory/stats/attachment variants parse.

### Step 2: Implement the server snapshot-to-tail boundary

Create `http/project-events.ts`. Buffer committed events before reading the consistent snapshot; install cleanup before any await. Publish v2 events only after journal commit, mapping every newly committed UI journal record to a known envelope or explicit no-op checkpoint so consumers do not infer loss from intentionally omitted records.

Add lightweight document-change records at content-changing commits, excluding full HTML from durable logs. If a document commit fails, emit no success event. If live HTML is unavailable/mismatched, send its committed hash and let the client resnapshot. Avoid claiming atomic document-plus-journal writes; the snapshot read must detect any unannounced document revision and recover with the current document/hash.

Retain the legacy endpoint behavior for callers without v2. Update exact CORS headers only if adding a request header; query-based opt-in needs no new custom header.

**Verify:** server delivery tests and typecheck → pass. Inject terminal completion and final edit between snapshot-read phases and prove the delivered snapshot/tail contains each committed result once. Commit another event while the writer awaits HTML enrichment/socket drain; assert ordering and no loss. Cover close-during-read, queue overflow, failed snapshot cleanup, a valid snapshot larger than 1 MiB, and both sides of every frame cap with stable oversize errors.

### Step 3: Add a reconnecting transport and pure session reducer

Replace one-shot usage with an owned subscription controller. Implement the parser, heartbeat/EOF detection, bounded retry policy, cancellation, and typed errors. Server error messages and malformed event data must not be cast into live state.

Create the session reducer and tests for snapshot/live merge, dedupe, gaps, explicit run identity, and terminal stats. Store cursor per project session; do not carry it across projects. Use the last valid snapshot when disconnected while making connection state visible through the existing error/status mechanisms.

**Verify:** client protocol/session tests and client typecheck → pass. Simulate fragmented frames, CRLF, heartbeats, EOF, rejected fetch, unmount during retry, reconnect with final state, duplicate events, and out-of-order/gapped events.

### Step 4: Integrate send acknowledgment and all subscribers

Refactor `use-landing-page` into composition over transport/session state. Remove `activeTurnIdRef` as an event-routing authority; use envelope turn IDs. Update prompt-panel's callback contract so complete drafts survive rejected or uncertain sends and only clear on confirmed acceptance. Keep layout/style changes out of scope.

Move project-list subscriptions to the same transport lifecycle with authoritative list_state replacement. Wire committed create/hasHtml/update/run-state/delete invalidations from the named repository/application paths. Preserve dirty invalidations during a refresh and handle the empty array explicitly. A second editor must observe and be able to stop the active server run, or see its explicit blocked state.

**Verify:** client session/hook/prompt-panel tests plus server API tests → pass for two editors, acceptance during preflight, send before hydration, rejected image attachment, lost acknowledgment, same-ID retry, completed reconnect, SSE acceptance followed by POST error, terminal followed by running acknowledgment, editing a draft before old acceptance, project switch with POST outstanding, empty list hydration, and remote creation/deletion during snapshot/reconnect.

### Step 5: Test the real boundary and document migration

Use 014 temporary runtime with a scripted fake agent and real loopback HTTP/SSE connections. Exercise two independent clients through acceptance, edits, disconnect, Stop, completion, and server reconstruction. Do not replace the transport with an always-open mock for these tests.

Update contracts/package indexes and client/server API DOX. Explicitly document full-snapshot reconnect semantics and the legacy compatibility path. Record remaining known limitations; do not silently retire legacy clients.

**Verify:** all full gates above → pass. If browser QA is available, use the agent-browser skill with a deterministic local fixture to verify reload during generation and a second editor; this must not call paid models or alter existing projects. Report if browser QA cannot run.

## Test plan

- `packages/contracts/src/*.test.ts`: executable schema and type alignment.
- `sse-client.test.ts`: parsing, frame limits, EOF, retry, heartbeat, cancellation.
- `project-session.test.ts`: authoritative/optimistic merge, duplicate/gap handling, turn routing, final stats.
- `http/project-events.test.ts`: snapshot-gap regression, journal commit order, buffer/backpressure, early-close cleanup, two clients and restart.
- Existing hook tests remain useful for React integration; add real-transport coverage rather than trusting only mocks.
- Prompt-panel acknowledgment test retains uploaded input on rejection and clears only after acceptance.

## Done criteria

- [x] Commands/events/snapshots are validated by shared executable schemas.
- [x] A second already-open editor observes the full new turn and final outcome.
- [x] Initial hydration cannot drop completion/final HTML emitted during snapshot construction.
- [x] Disconnect/EOF/restart converges to authoritative state without duplicate deltas or permanent running locks.
- [x] Rejected/uncertain sends preserve input and reuse idempotent identity.
- [x] Full HTML is not added to durable conversation logs.
- [x] Subscriber buffers/timers/readers have bounded cleanup; slow clients do not block generation.
- [x] Legacy project replay and legacy API mode remain supported.
- [x] Tests, DOX, package indexes, and plan status are complete.

## STOP conditions

- The 015 repository cannot provide a consistent committed watermark/snapshot.
- The 017 coordinator lacks acceptance identity or idempotent command handling.
- A proposed shared schema introduces a circular dependency between contracts and conversation.
- Correctness requires historical HTML revisions/incremental replay instead of the specified fresh-snapshot reconnect.
- A solution silently drops buffered events, assumes an unchecked payload is valid, or loses uploaded draft bytes.
- Unexplained baseline drift appears or a gate still fails after two reasonable fixes.

## Maintenance notes

Domain turn behavior stays in conversation; wire validation stays in contracts; connection/optimistic state stays in the client session; server delivery stays outside the coordinator. Adding an event requires schema, mapping, reducer/projection, and snapshot/reconnect tests. Version the protocol when semantics change. Thumbnail projections remain a separate follow-up; independently implemented project-creation idempotency is preserved.

## Audited file fingerprints

SHA-256 of audited working-tree files; review changes against prerequisite diffs.

| File | SHA-256 |
|---|---|
| `apps/client/src/lib/sse-client.ts` | `da1bf321fd4101e60d2c8e7ae6840030e3e85924f50cd53faeab872a0456607a` |
| `apps/client/src/lib/projects-api.ts` | `38fe6cd4946c26a5c3c510c1ab97f9a714a011272a827530e39974314254d882` |
| `apps/client/src/hooks/use-landing-page.ts` | `f8db11215ee2347c3aff1f0f2293ef3e5d09decfd3dff21dd7ff9b1c9d5a0145` |
| `packages/conversation/src/types.ts` | `65426c4701f304a2077988a62dd5b956562927c5fc4a3d7dbd77fea41264d0b4` |
| `apps/server/src/index.ts` | `92047535ae6e23d5719a2a8c904b4c76322a3f4e2caae7eaca56dab7458c0a67` |
