# Plan 016: Bound provider work, propagate cancellation, and retain known spend

> **Executor instructions:** Follow the steps and gates. Use deterministic injected transports; do not call paid providers. Update this plan's status in `plans/README.md` only after failure/abort/accounting tests pass.
>
> **Drift check:** Run `git diff --stat d2ae1e6c..HEAD -- apps/server`, `git diff HEAD -- apps/server`, and `git status --short`. Accept documented factory/storage changes from 014–015; refresh this plan for unexplained behavior changes.

## Status

- **Priority:** P1
- **Effort:** L; transport, tool propagation, and accounting lifecycle
- **Risk:** MED
- **Depends on:** `plans/014-isolate-server-runtime.md`, `plans/015-durable-project-storage.md`
- **Category:** bug, architecture
- **Planned at:** commit `d2ae1e6c` plus audited working tree, 2026-09-05
- **Status:** DONE

## Why this matters

The shared timeout ends when response headers arrive, so body downloads can hang or grow without limit. Scrape/image-generation paths do not receive the run signal. Screenshot accounting reports charges only after every viewport succeeds. These gaps make Stop unreliable and can understate spend.

## Historical audited state

`apps/server/src/mastra/lib/bounded-fetch.ts:62` awaits `fetch`; at line 78 it runs:

```ts
clearTimeout(timer)
if (response.status >= 500 && attempt < maxAttempts) {
  await retryDelay(baseDelayMs, attempt, externalSignal)
  continue
}
return { ok: true, response }
```

Bodies are consumed afterward, for example `tools/generate-image.ts:85` calls `response.json()`. A read-only fake-response probe during the audit used a 20 ms deadline and delivered the body after 130 ms; it still succeeded.

`tools/landing-tools.ts:68` constructs scrape from `{ projectId, turnId, visionModel }`, and line 100 constructs image generation from `{ baseUrl, imageModel }`; both omit the available `signal`.

`lib/project-screenshot.ts:217` uses `Promise.all` for viewports, and line 240 reports accumulated credits only after all captures and retries succeed:

```ts
if (creditsTotal > 0) dependencies.onFirecrawlCredits?.(creditsTotal)
```

The screenshot download at line 400 happens before available Firecrawl credit metadata is returned. Failures there discard known charges.

## Historical execution baseline after 015

Plans 014 and 015 are applied and independently verified. The post-015 uncached repository suite passes 430 tests with one live smoke skipped; exact server typecheck, lint, format check, and build pass. The execution snapshot must include the full current Git-visible working tree, including staged skill-package deletions, runtime factories, durable storage, draft creation/identity, and unrelated UI edits; record a fresh baseline016 manifest before source changes.

The pre-implementation call-site review confirmed: `boundedFetch` clears its timeout after headers, then OCR/images/screenshots/catalogs read unbounded bodies; scrape still uses the SDK without a run signal; screenshot credits accrue only after the complete batch; finalization awaits unbounded Mastra metadata promises. The 015 image-persistence and event-publication changes are required prerequisites, not drift to undo. Fingerprints below are refreshed to the current post-015 source.

All tests run with `RUN_FIRECRAWL_SMOKE=0 pnpm_config_verify_deps_before_run=false`. Disposable worktree node_modules symlinks may point to original dependencies read-only; never install through those links. Use `pnpm run test --force --env-mode=loose` for full independent regression to bypass Turbo cache and forward the smoke guard. No operator data mutation, paid provider call, dependency upgrade, or source restoration is authorized by this plan. Final Git delivery follows the explicit user authorization below.

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
| Provider boundary tests | `pnpm --filter @workspace/server exec vitest run src/providers/transport.test.ts src/providers/operation-scope.test.ts --coverage=false` | All pass without network |
| Tool/cost regressions | `pnpm --filter @workspace/server exec vitest run src/mastra/tools/external-tools.test.ts src/mastra/tools/screenshot.test.ts src/mastra/lib/image-ocr.test.ts src/mastra/lib/project-screenshot.test.ts src/mastra/lib/cost.test.ts --coverage=false` | All pass |
| Server gates | `pnpm --filter @workspace/server <task>` for `typecheck`, `lint`, `format:check`, `test`, `build` | Each exits 0 |
| Full tests | `pnpm run test` | All non-live tests pass |

## Scope

**In scope:** create `apps/server/src/providers/{transport,operation-scope}.ts`, matching tests, and `providers/AGENTS.md`; migrate `mastra/lib/bounded-fetch.ts` and callers in `model-catalog.ts`, `mastra/lib/{model-capabilities,image-ocr,project-screenshot,run-stats,run-stream-loop,run-finalize}.ts`, `mastra/route.ts`, `mastra/tools/{landing-tools,scrape,generate-image,screenshot}.ts`; project/asset write-boundary methods from 015 solely to enforce operation leases; runtime/provider wiring and their tests, including `mastra/agents/landing-page-agent.ts` and `mastra/create-mastra-runtime.ts` to pass operation ownership; `index.ts` and `mastra/lib/run-bus.ts` solely if required for the temporary failed-drain admission/deletion fence and its tests; provider config parsing/example only for named limits; server/Mastra/root DOX indexes and README provider contract; this plan/index.

**Out of scope:** changing provider/model selection, replacing Firecrawl or the screenshot publisher, renderer/script policy changes, Mastra patch/version upgrades, pricing estimates, image identity design already owned by 015, run/event protocol redesign, UI.

Lease integration may also touch `mastra/tools/edit.ts` and `mastra/lib/anchor-edit/html-store-filesystem.ts`, with focused tests, solely to register edit ownership and check its lease at the document mutation boundary. Keep anchor parsing, edit semantics, balancing, and generated document format unchanged.

## Target contract

Create a run-owned operation scope that contains `signal`, deadline, operation IDs, a provider-reported usage sink, and `drain(): Promise<DrainResult>`. Tool work registers before starting and releases in `finally`. A successful drain confirms local work and known accounting settled; it does not promise remote cancellation/refunds for requests a provider already accepted.

Use named, injectable defaults: each non-streaming operation has a 120-second total deadline including attempts/backoff; cancellation permits a 5-second drain grace period; final Mastra `usage`/`finishReason` reads have a 10-second metadata deadline. Normal generation can span many operations; these are not a 120-second cap on a whole agent run. Define DrainResult as `{ok:true}` or `{ok:false,reason:'drain_failed',pendingOperationIds}`, rather than an indefinitely pending promise.

Closing the scope rejects new root registrations. Already registered parents may register a child only before close and within the parent's remaining deadline; register that child before issuing its request. After cancellation/deadline, new children are rejected. All asset/document writes pass an operation lease check immediately before mutation. On grace expiry revoke those write leases and return drain_failed; retain known usage and attach rejection handlers to late promises. Do not pretend the remote work finished. Plan 017 keeps the project unavailable and its ownership fenced while local work is unresolved, and cannot complete deletion or a successful terminal outcome.

Integration requirement from 014–015: preserve the runtime-owned repository/bus/model caches and commit-before-broadcast emission queue, including its outer error drain. Generated images already persist before tool success, so enforce the lease at that persistence boundary rather than restoring the removed late tool-result persistence path. Preserve keyed creation, brief/title identity, and postcommit title notifications. A failed operation drain must prevent both a replacement run and deletion before 017 exists; exercise this through the current HTTP/runtime interface. Projectless Studio tools also need a bounded owned operation per invocation. Do not create a second lifecycle journal or redesign the public event protocol in this step.

The transport owns **both headers and body consumption**, exposing typed JSON/text/bytes operations rather than a naked Response with a discarded deadline.

- Enforce timeout through body consumption, check the linked run signal, cancel readers/discarded retry responses, and remove timers/listeners in `finally`.
- Enforce bytes while reading, not just via Content-Length. Initial named limits: model catalogs and ordinary JSON 16 MiB; image-generation JSON 48 MiB encoded; image/screenshot bytes 32 MiB; bounded error text 64 KiB. Keep limits configurable at the call site and test base64 expansion headroom. If documented valid output exceeds these limits, adjust that named limit with evidence and tests.
- Distinguish cancelled, timed-out, too-large, invalid-body, HTTP failure, and ambiguous paid-operation outcome.
- Retry policy belongs to the adapter. Safe reads may retry transient failures with abortable backoff. Do not blindly retry paid POSTs after an ambiguous network failure; use a provider-supported idempotency mechanism only after verifying its current documentation. Otherwise report an unknown outcome and start no automatic duplicate paid operation.
- Record usage as soon as provider metadata is parsed, before image download/persistence or downstream tool success. Use stable operation/attempt/report identity to avoid duplicate accrual. Keep OpenRouter USD provider-reported only; Firecrawl credits use configured credit pricing.

## Steps

### Step 1: Add bounded body consumption and operation ownership

Implement `providers/transport.ts` using injected fetch. Keep the abort timer active through the parser callback/reader and enforce byte limits incrementally. Cover JSON, text, and binary bodies; cap error bodies too. Use a test clock or tiny controlled ReadableStreams; no real hanging hosts.

Implement `operation-scope.ts` with linked cancellation, explicit open/closing/failed/closed states, write leases, and a tracked Set of in-flight promises. Registration must happen before asynchronous work begins; every settled path deregisters. `drain` includes registered child work and returns the bounded typed outcome above. A promise that ignores abort remains tracked/fenced after drain failure; it must not mutate project state late.

**Verify:** provider boundary tests and server typecheck → pass, including immediate headers + stalled body, oversized stream without Content-Length, abort during backoff, discarded response cleanup, child registration during close, and a never-settling operation that produces drain_failed within the injected grace period. Assert late mutation is rejected and already reported usage remains readable.

### Step 2: Migrate all outbound call sites and make retry policy explicit

Use `rg -n 'boundedFetch|fetch\(|\.scrape\(' apps/server/src -g '*.ts' -g '!*.test.ts'` to inventory callers. Route existing non-streaming provider/CDN work through the new transport. Main Mastra LLM streaming remains on its installed adapter with its existing run signal; do not buffer the LLM stream as JSON.

Pass the operation scope into scrape, OCR, image generation, screenshot publication/capture/download, and capability lookup. Check cancellation between scrape and OCR and before allocating/persisting generated assets. For the Firecrawl SDK, verify supported AbortSignal injection in installed types/docs; if absent, implement the same narrowly scoped scrape request through the injected bounded HTTP adapter, preserving request options and response semantics. Do not use Promise.race as pretend network cancellation.

For paid POST retry behavior, record the verified policy in adapter comments/tests. Retain safe GET retry behavior. Do not upgrade the SDK to obtain a convenient API.

Installed API preflight (2026-09-06): `firecrawl@4.28.3` exposes no AbortSignal in its `ScrapeOptions`, client options, or request options (`apps/server/node_modules/firecrawl/dist/index.d.ts`). Its `src/v2/methods/scrape.ts` issues `POST /v2/scrape` with `{ url: url.trim(), ...options }`, requires HTTP 200 and `success`, and returns `data`. Preserve the current formats/options and response-envelope handling when replacing this one SDK call. The SDK also supports a `FIRECRAWL_API_URL` fallback; account for existing endpoint configuration deliberately. An internal generic idempotency-header helper is not evidence that scrape retries are safe. Default paid POSTs to no automatic retry unless endpoint-specific support is independently verified.

**Verify:** provider boundary and tool/cost regressions plus server typecheck → pass. Tests cancel during request, response-body read, retry delay, and between scrape/OCR; no subsequent paid call starts.

### Step 3: Separate spend from successful result delivery

Report Firecrawl credits immediately after parsing a successful scrape response. Report OpenRouter cost metadata even when later image extraction/persistence fails. The run usage sink deduplicates repeated reports and remains open until all local operations settle.

Replace screenshot batch accounting-after-Promise.all with explicit sibling ownership: on failure abort remaining local work, await all settlements, retain every known usage report, then return/throw. Do the same for the optional mobile retry. A tool result must not add the same cost again after the early usage sink already recorded it.

Update `run-stats.ts`, `run-stream-loop.ts`, attachment analysis, and finalization together: the usage sink is authoritative for these provider operations; terminal snapshots follow successful `drain`. Bound final Mastra metadata promises too; a timeout produces an explicit incomplete-accounting diagnostic and preserves known provider reports rather than hanging or inventing totals. Existing main-LLM raw-chunk accounting remains separately authoritative and must not be counted twice. Return drain/metadata failures to the lifecycle caller; before 017 lands, the injected runtime rejects new starts on that project and reports the failure instead of releasing unresolved ownership as a successful completion.

**Verify:** tool/cost tests → pass for two paid viewport successes + one failure, screenshot download failure, persistence failure, failed mobile retry, repeated metadata, abort with a late settled response, and a cost cap triggered by a partial batch. Assert exact provider-reported totals.

### Step 4: Preserve contracts and finish cleanup

Remove obsolete body-reading paths/dead helper exports only after all callers migrate. Document transport limits, retry semantics, operation draining, and unknown remote outcomes. Keep current direct-image/OCR modes and current public screenshot publishing behavior.

**Verify:** all server gates and full tests → pass; no paid/live smoke invoked; all remaining direct fetches are explicitly owned exceptions with tests.

## Test plan

Use 014 injected fixtures and test transport streams. Add provider boundary tests above; extend existing image/OCR/screenshot tests to assert signal propagation and accounting independently from output success. Use `cost.test.ts` patterns for numeric totals, not token-based estimates. Tool cancellation tests must prove a later stage was never called.

## Done criteria

- [x] Response deadlines cover body consumption; size caps apply incrementally.
- [x] Stop propagates through all local provider stages and backoffs.
- [x] `drain` returns success only after owned local work settles; failure returns within its grace bound and fences late writes.
- [x] Known charges survive partial failures and are counted once.
- [x] Ambiguous paid POST failures cannot silently create duplicate requests.
- [x] Existing provider model/multimodal behavior and all gates pass.
- [x] DOX and plan index updated; no out-of-scope edits.

## STOP conditions

- A provider's documented API cannot preserve the existing tool behavior through a cancellable boundary.
- Retry safety would require inventing an idempotency feature or assuming a timed-out paid call was never accepted.
- Accurate known-cost accounting cannot distinguish duplicate versus additional provider reports.
- Main LLM streaming would need replacement or a Mastra dependency upgrade.
- Unexpected prerequisite drift or a verification failure remains after two reasonable fixes.

## Maintenance notes

Provider cancellation means stopping local work; remote operations may continue. Preserve usage reporting independently of artifact success. Plan 017 relies on this operation scope to drain before terminalizing or deleting a project. Body limits and POST retry policies must be reconsidered whenever a provider endpoint/output format changes.

## Audited file fingerprints

SHA-256 of the post-015 execution baseline. Review changed hashes against prerequisite diffs; do not overwrite current code to match them.

| File | SHA-256 |
|---|---|
| `apps/server/src/mastra/lib/bounded-fetch.ts` | `a717a898f9669d7f128ea337a5e2317b91fa3dc453ba4b312167f7907486ec35` |
| `apps/server/src/mastra/tools/landing-tools.ts` | `9e25dc09532763523a96c984af547b8e5ebcdab1ba69fe3dae491255b6395b95` |
| `apps/server/src/mastra/lib/project-screenshot.ts` | `d5baa44753cae11a7a077618f7c674843d942948e2faebe3e49bb046ad47cce8` |
| `apps/server/src/mastra/tools/generate-image.ts` | `87337ec0c134f60ac6af9ef4b4526662216e3861005a1a62ec99d0d7ce1eabd8` |
| `apps/server/src/mastra/tools/scrape.ts` | `29c9e8978bddf17f7653eb259cac9cf0a9b238bb1cf4761fb1dd5f3ca66869cd` |

## Completion

Approved and applied on 2026-09-06. Independent uncached repository tests passed 462 non-live tests with one live smoke skipped both in the isolated worktree and after application to the original workspace. Exact server typecheck, lint, format check, and build passed independently. All 40 result paths were verified against the reviewed manifest. See [016 report](016-report.md) for evidence and limits.
