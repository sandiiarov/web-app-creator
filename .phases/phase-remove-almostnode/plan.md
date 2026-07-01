# Plan — remove-almostnode

Status: Complete
Prerequisite: research.md `Status: Complete`

> **Purpose:** turn research into an executable design — ordered, vertical slices with file paths, approach, and acceptance criteria. No code yet.

## Guidance

- **Vertical slices, not horizontal layers.** Do not plan "all the database, then all the API, then all the UI." Each sub-phase should be a working, checkable slice end-to-end. A horizontal plan ships 1200 lines before the first check.
- **One sub-phase = one independently checkable unit**, small enough to verify in one pass.
- **Ordered by dependency.** Foundations before composition.
- **Each sub-phase states:** the files it will touch, the approach, and the acceptance criteria (how you'll know it's done).
- **Integrate vs. create.** Prefer integrating into existing code when the new behavior is a natural continuation; create a new module when the responsibility is distinct. Don't touch unrelated files.
- **Reuse, don't rewrite.** Note existing utilities, helpers, and patterns from research that this plan builds on.
- **Open questions from research must be resolved** here, or surfaced to the user before proceeding.

## Phase 1: Replace editor preview runtime with direct iframe rendering

### Description
Files touched: `apps/client/src/components/landing-preview.tsx`; delete `apps/client/src/hooks/use-landing-preview-server.ts`; delete `apps/client/src/lib/preview-bridge.ts`. Approach: remove almostnode hook/bridge usage and render the latest server-owned HTML directly through the editor iframe's `srcDoc`, mirroring the existing project-card preview pattern. Keep the empty-state behavior for empty HTML, preserve full-screen sizing and referrer policy, and sandbox the preview without `allow-same-origin` so generated scripts cannot share the parent origin. Acceptance criteria: editor preview no longer imports almostnode, `use-landing-preview-server.ts`/`preview-bridge.ts` are gone, and the iframe updates from the `html` prop.

### Todo
- [x] Simplify `LandingPreview` to render `srcDoc={html}` directly and remove almostnode hook dependencies.

### Results
- Planned a single editor-preview slice centered on `apps/client/src/components/landing-preview.tsx`, with deletion of `apps/client/src/hooks/use-landing-preview-server.ts` and `apps/client/src/lib/preview-bridge.ts` as dependent cleanup.
- Acceptance will be source-level removal of almostnode imports from editor preview code plus an iframe driven directly by the `html` prop.

### Gotchas
- The direct `srcDoc` iframe will reload on each HTML prop replacement instead of using Vite HMR. That matches the user's requested removal of almostnode and the app's current server-source-of-truth HTML model.

## Phase 2: Remove almostnode dependency and service-worker artifacts

### Description
Files touched: `apps/client/package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `apps/client/public/__sw__.js`, `apps/client/oxlint.config.ts`, `apps/client/oxfmt.config.ts`, and `apps/client/src/lib/projects-api.ts`. Approach: remove the runtime dependency and unused catalog/lock entries via pnpm, delete the almostnode service worker, remove formatter/linter ignore entries for that deleted file, and update the image-url comment so it describes `srcDoc` iframe loading rather than a virtual origin. Acceptance criteria: no `almostnode` package dependency remains, no almostnode service-worker asset remains, configs do not ignore a missing file, and source comments reflect direct iframe behavior.

### Todo
- [x] Remove dependency/package/public-asset/config traces of almostnode.

### Results
- Planned dependency cleanup in `apps/client/package.json`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml`; public asset/config cleanup in `apps/client/public/__sw__.js`, `apps/client/oxlint.config.ts`, and `apps/client/oxfmt.config.ts`; and comment cleanup in `apps/client/src/lib/projects-api.ts`.
- Acceptance will be no active package/public/config/source reference to almostnode.

### Gotchas
- `@typescript/native-preview` stays because it powers tsgo across the monorepo and is not an almostnode dependency in this project.

## Phase 3: Update active docs and contracts

### Description
Files touched: root `AGENTS.md`, `apps/AGENTS.md`, `apps/client/AGENTS.md`, and `README.md`. Approach: update active project documentation to state that the editor preview is a direct `srcDoc` iframe fed by server project HTML, not an almostnode `VirtualFS`/`ViteDevServer` runtime. Leave historical plans as historical unless verification finds they are presented as active contracts. Acceptance criteria: active DOX and README contain no current-behavior claim that the client uses almostnode.

### Todo
- [x] Update active DOX/README contracts for direct iframe preview.

### Results
- Planned active-contract updates in root `AGENTS.md`, `apps/AGENTS.md`, `apps/client/AGENTS.md`, and `README.md`.
- Acceptance will be updated current-behavior docs; historical `plans/*` and old phase records can remain as history unless they are indexed as active contracts.

### Gotchas
- DOX updates are required because this changes durable client responsibilities and removes the service-worker/preview-runtime boundary.
