# Plan 014: Isolate server runtime dependencies and verification data

> **Executor instructions:** Complete the steps in order, run their gates, and update only this plan's status in `plans/README.md` after all done criteria pass. Do not run the existing broad server suite until step 3 makes every fixture isolated.
>
> **Drift check:** Run `git diff --stat d2ae1e6c..HEAD -- apps/server packages/conversation`, `git diff HEAD -- apps/server packages/conversation`, and `git status --short`. Compare the excerpts and fingerprints below with current code. Prerequisite-independent user changes must be preserved.

## Status

- **Priority:** P1
- **Effort:** L; factory extraction plus migration of existing tests
- **Risk:** MED
- **Depends on:** None
- **Category:** tests, architecture
- **Planned at:** commit `d2ae1e6c` plus audited working tree, 2026-09-05
- **Status:** DONE — implemented and independently verified; [execution report](014-report.md)

## Why this matters

The server constructs stores, run registries, memory, and provider dependencies at module scope. Tests use the same project directory as the development app; recovery tests scan every project there. An isolated runtime is the prerequisite for safely testing crashes, deletion, and reconnect behavior.

## Audited state before implementation

- `apps/server/src/index.ts` constructs and exports a singleton HTTP server; direct execution triggers recovery and listening.
- `apps/server/src/mastra/lib/project-store.ts:64` derives storage from the module location:

```ts
const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(MODULE_DIR, '..', '..', '..', '.data')
const PROJECTS_DIR = join(DATA_DIR, 'projects')
```

- `apps/server/src/mastra/lib/project-store.test.ts:46` repeats that path. Its recovery tests call `reconcileInterruptedRuns()`, which scans all projects.
- `apps/server/src/mastra/index.ts` constructs LibSQL at `file:./mastra.db`, DuckDB at `mastra.duckdb`, and a shared Mastra instance. `agents/landing-page-agent.ts` constructs `landingMemory` at import time.
- `route.ts:645` calls `supportsImageInput` before the mocked agent runs; tests that mock only the agent can still use the network.
- `run-bus.ts` owns module-level Maps/Sets for runs and subscribers.
- Test style exemplar: `project-store.test.ts` uses named imports from Vitest and explicit `afterEach` cleanup. Retain that style, replacing its shared-root fixture ownership.

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
| Factory gates | `pnpm --filter @workspace/server exec vitest run src/runtime.test.ts --coverage=false` | New isolation tests pass, no provider calls |
| Typecheck | `pnpm --filter @workspace/server typecheck` | Exit 0 |
| Server suite, only after step 3 | `pnpm --filter @workspace/server test` | All non-live tests pass |
| Full regression | `pnpm run test` | All non-live tests pass |
| Static checks | `pnpm --filter @workspace/server lint` and `pnpm --filter @workspace/server format:check` | Exit 0 |
| Build | `pnpm --filter @workspace/server build` | Exit 0 |

## Scope

**In scope:**

- Create `apps/server/src/runtime.ts`, `runtime.test.ts`, `testing/runtime-fixture.ts`, `testing/deny-network.ts`, `testing/test-safety.test.ts`, and `testing/AGENTS.md`.
- Refactor construction and dependency plumbing in `apps/server/src/index.ts`, `mastra/index.ts`, `mastra/agents/landing-page-agent.ts`, `mastra/route.ts`, `mastra/lib/{project-store,image-store,run-bus,run-finalize,run-stream-loop,model-capabilities,image-ocr,project-screenshot}.ts`, `model-catalog.ts`, and `mastra/tools/{landing-tools,scrape,generate-image,screenshot}.ts`.
- Update existing `apps/server/src/**/*.test.ts` fixtures that import these modules; server `vitest.config.ts` may add a network-denial setup file under `src/testing/`.
- Update server/Mastra AGENTS, relevant root index entries, README setup/architecture only for implemented construction changes, and this plan/index.

**Reviewed implementation additions:** `src/production-runtime.ts`,
`src/mastra/create-mastra-runtime.ts` and its test separate production SDK
construction and ordered resource cleanup; `src/mastra/lib/project-filesystem.ts`
enforces repository root ownership; `src/mastra/workspace.ts` and its test make
the skills workspace instance-owned; `src/mastra/lib/run-stats.ts` receives the
runner's configured costs; `src/testing/startup.test.ts` checks the actual main
entrypoint in a temporary app. These are construction, isolation, and verification
changes within this plan's target contract.

**Out of scope:** changing wire events, persistence formats, run lifecycle semantics, HTML editing algorithms, provider retry/accounting behavior, client/UI source, actual application data or DB files, package upgrades. Dependency injection is the change; later plans own behavior.

## Target contract

Introduce `createServerRuntime(options)` with an explicit absolute `dataDir`, explicit memory/observability store configuration, and injected provider ports. It returns instance-owned repositories, assets, bus, agent runner, and `dispose(): Promise<void>`.

- `createProjectRepository({ dataDir, logger })`, `createImageStore()`, and `createRunBus()` own all mutable maps, caches, write chains, and counters per instance. No mutable global test override or environment variable used as a test switch.
- The agent runner receives repository/bus, capability lookup, agent factory, capture, and provider dependencies. Use narrow interfaces matching existing call sites; avoid a dependency-injection container.
- `createApiServer(runtime)` builds an HTTP server without opening a port. A direct-entry bootstrap constructs the production runtime, awaits recovery, and listens.
- Production bootstrap preserves current project and database locations exactly. Compute paths once in that bootstrap and pass them explicitly. Importing factories must not open databases, create directories, subscribe exporters, or perform network requests.
- Mastra Studio still has a discoverable production export in `mastra/index.ts`; tests import the side-effect-free factory path. Keep per-run Agent/HtmlStore isolation and the skills-only workspace.
- A runtime exposes an awaited completion/disposal handle for test cleanup. Plan 017 may replace its internal implementation, but tests must never poll for a fixed number of iterations and then assume work finished.

## Steps

### Step 1: Inventory mutable owners and extract storage/bus factories

Inventory source/test imports with `rg -n 'project-store|image-store|run-bus|landingMemory|mastra/index' apps/server/src`. Move module-local mutable state inside instance factories; pass instances through callers. Keep the existing storage format and response shapes. Construct two runtimes simultaneously in different temporary roots; do not implement a process-global setter.

Create `runtime.test.ts` initially using only the new side-effect-free factories. In a temporary parent directory, place a sentinel project in a sibling root and run recovery against the test root; assert sibling bytes and status are unchanged.

**Verify:** factory gate and server typecheck above → exit 0; two runtimes cannot see each other's projects, caches, active runs, or subscribers.

### Step 2: Move production construction to the composition boundary

Separate HTTP handler construction from `listen`. Pass runtime dependencies into handlers and the agent factory, including memory and provider capability lookup. Preserve existing direct-entry protection and production paths. Create a typed fake agent/provider fixture that fails on any unexpected invocation. Mastra/LibSQL initialization must be explicit and awaitable; use installed docs/types to implement closing resources.

Do not create real production defaults as a hidden fallback when tests omit a dependency: make required runtime inputs a compile-time requirement.

**Verify:** factory gate and server typecheck → exit 0; import-only and dispose tests assert no network, database creation, directory creation, or surviving subscriptions.

### Step 3: Migrate all server fixtures before broad verification

Use `mkdtemp` under the OS temp directory for each test/fixture. Inject its data root, temporary DB URLs, fake providers, and instance bus. Replace the hardcoded `PROJECTS_DIR` in storage tests and any source-relative file assumptions in route/HTTP/screenshot tests. Every teardown awaits run completion/disposal and file writes before deleting its own temp root.

Install `testing/deny-network.ts` as a Vitest setup file before test module imports, with explicit allowances only for each fixture's loopback HTTP server. Set `RUN_FIRECRAWL_SMOKE=0` explicitly when invoking all ordinary verification commands; an inherited opt-in must not activate the paid smoke. In `testing/test-safety.test.ts`, assert factory imports cause no writes, fixture storage/DB destinations resolve beneath their owned temporary root, and the injected filesystem adapter rejects mutation outside that root. Add an error handler to test `listen` promises, abort SSE readers in `finally`, and bound test waits so failures report directly.

**Verify:** `RUN_FIRECRAWL_SMOKE=0 pnpm --filter @workspace/server exec vitest run src/testing/test-safety.test.ts src/runtime.test.ts --coverage=false` → all guards pass. Also run `rg -n '\.data|mastra\.db|mastra\.duckdb|reconcileInterruptedRuns' apps/server/src -g '*.test.ts' -g '*fixture*'` and review every destination. Only then run the server suite with the explicit smoke flag disabled → all non-live tests pass without configured API credentials.

### Step 4: Verify memory integration and document ownership

Add a temporary real Mastra/LibSQL integration fixture with a deterministic fake model: two turns in the same project retain memory; reconstructing runtime against that temporary DB retains the thread; deleting that fixture's thread does not touch another project. Check observations/compaction with the installed supported test API; do not call a paid model. Close DB/exporter resources explicitly.

Update server DOX to own production runtime construction and the `testing/` child contract. Remove comments claiming test isolation through module resets alone.

**Verify:** server test/typecheck/lint/format/build and full repo tests → pass. If known unrelated format drift prevents a root check, record it separately; do not silently reformat unrelated user work.

## Test plan

New `runtime.test.ts`: two concurrent isolated roots; sibling recovery canary; no import side effects; pending-run disposal; independent buses; network denial; temporary memory reconstruction and deletion. Existing route, storage, catalog, screenshot, and HTTP tests must use the fixture and await actual completion.

Do not test prose, AGENTS wording, or prompt strings.

## Done criteria

- [x] New isolation/import/disposal tests pass.
- [x] Broad tests run only after fixtures are isolated, with no reads/writes to production projects or databases.
- [x] All commands above pass; worktree dependency setup details are recorded in the execution report.
- [x] Production defaults, routes, tools, storage formats, and Mastra patch/pin are preserved.
- [x] Only scoped files changed relative to the initial working tree.
- [x] DOX and plan status reflect the implemented outcome.

## STOP conditions

- A factory import still needs to initialize a production database, exporter, or provider implicitly.
- An installed Mastra API cannot support isolated memory/storage without a version upgrade.
- A test cannot be made independent of live credentials or actual project data.
- A required fix changes wire/persistence behavior assigned to a later plan, or two reasonable attempts leave a gate failing.
- Unexplained source drift conflicts with this plan; preserve the user's edits and report the mismatch.

## Maintenance notes

Future services must receive runtime-owned dependencies; do not reintroduce module singletons as a shortcut. This plan deliberately leaves existing run/storage semantics intact, even where later plans fix them. Review test teardown and production-path preservation especially carefully.

## Audited file fingerprints

SHA-256 of the working-tree files read for this plan. A changed hash calls for review, not restoration of old code. Changes explained by completed prerequisites are expected; unexplained behavioral changes require plan refresh.

| File | SHA-256 |
|---|---|
| `apps/server/src/index.ts` | `832d80e879320bd9d9050b5825ac38dade865edd522531415e4cb159f1a24fa1` |
| `apps/server/src/mastra/index.ts` | `b0f6a625e90f5eeacc6b75e2dcabe69a43afe741fb73d12db3f610fa86972496` |
| `apps/server/src/mastra/agents/landing-page-agent.ts` | `ca2dd68ca1a63d3523e5fc8c93cba2058924c3e4566cdcffba6249e9598e5aa9` |
| `apps/server/src/mastra/lib/project-store.ts` | `17f047e27ad7ce68ed6c7dd2ccf25a5750560c096b1add104b523429f544774b` |
| `apps/server/src/mastra/lib/project-store.test.ts` | `76ed3bfa3cf7449d56fdf90cf312bfb4b7ceae7a59f83cf9deb552b87b174c90` |
