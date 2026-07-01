# Research — remove-almostnode

Status: Complete
Prerequisite: none

> **Purpose:** understand the relevant parts of the codebase as *facts* before any design or code. Output a map of what exists and how it works today — not how it should be.

## Guidance

- **Facts only.** Every claim cites a file path. No opinions about how the code *should* be, and no implementation decisions — that's planning's job.
- **Questions before investigation.** Turn the request into clarifying questions first, then investigate the codebase to answer them. Don't let the desired solution steer what you find.
- **Map inputs/outputs** of every module you touch: what triggers it, what it receives, what it produces, and what side effects it has.
- **Record existing patterns** the codebase already uses (testing framework, error handling, naming, structure). Capture the exact test / lint / build / format commands with their working directory and flags — verification will re-run these.
- **Open questions** that need the user's input go here too. Surface them; don't guess.

## Phase 1: Map current preview runtime and almostnode usage

### Description
Locate all client preview modules and every almostnode import/reference. Record the current iframe inputs, outputs, and side effects.

### Todo
- [x] Find almostnode references in source, configs, docs, and package manifests.
- [x] Read the preview components/hooks/libs that currently render and update the editor preview.
- [x] Map current project-card iframe preview behavior separately from the editor preview.

### Results
- Editor preview composition: `apps/client/src/App.tsx` renders `LandingPreview` with `landing.html`; `apps/client/src/hooks/use-landing-page.ts` loads project `indexHtml` on mount and refreshes it after successful `edit` tool calls, so the preview input is the latest server-owned single-file HTML.
- Current editor preview rendering: `apps/client/src/components/landing-preview.tsx` calls `useLandingPreviewServer({ html, onError })`; if `html.trim()` is empty it renders `LandingEmptyState`, otherwise it renders a full-screen iframe with `src={previewUrl || 'about:blank'}`, `onLoad={handlePreviewLoad}`, `referrerPolicy="no-referrer"`, and sandbox `allow-forms allow-modals allow-popups allow-same-origin allow-scripts`.
- Current editor preview side effects: `apps/client/src/hooks/use-landing-preview-server.ts` creates an almostnode `VirtualFS`, writes `/index.html`, starts an almostnode `ViteDevServer` on port `5174`, initializes/registers a service-worker bridge via `getServerBridge()`, sets HMR target on iframe load, writes updated HTML into the VFS, calls `handleFileChange('/index.html')`, and logs HMR/server/VFS events.
- Current bridge-only helper: `apps/client/src/lib/preview-bridge.ts` imports almostnode `stream`, `getServerBridge`, and `ViteDevServer`; it adapts a `ViteDevServer` to the bridge `registerServer` contract and normalizes string request bodies to `stream.Buffer`.
- Source almostnode references found in `apps/client/src/hooks/use-landing-preview-server.ts`, `apps/client/src/lib/preview-bridge.ts`, comments in `apps/client/src/lib/projects-api.ts`, and client DOX `apps/client/AGENTS.md`.
- Project-card previews already use direct iframes: `apps/client/src/components/projects-page.tsx` fetches the full project with `getProject(project.id)`, expands image URLs with `expandProjectImageUrls`, then renders `previewHtml` via `<iframe sandbox="" srcDoc={previewHtml}>`; this path has no almostnode/VFS/HMR bridge.

### Gotchas
- The existing editor preview depends on same-origin-ish almostnode/Vite behavior for HMR, but project-card previews prove the app already has a plain `srcDoc` iframe path for saved HTML snapshots.

## Phase 2: Map dependency, public asset, DOX, and verification impact

### Description
Identify what removing almostnode affects outside preview rendering: dependencies, lock/catalog entries, service worker assets, docs/contracts, tests, and existing verification commands.

### Todo
- [x] Inspect client/root package manifests, workspace catalog, lockfile, and public assets for almostnode-related entries.
- [x] Inspect existing tests and verification commands relevant to the preview path.
- [x] Record DOX text that will need updates if the preview becomes a plain iframe.

### Results
- Client dependency manifest: `apps/client/package.json` has runtime dependency `"almostnode": "catalog:"`; `"bippy": "catalog:"` is also listed but no `apps/client/src` source import was found. Root `package.json` uses `pnpm@11.1.3` and root scripts delegate through Turbo.
- Workspace catalog/lockfile: `pnpm-workspace.yaml` has catalog entry `almostnode: ^0.2.14`; `pnpm-lock.yaml` has catalog, importer, package, and snapshot entries for `almostnode@0.2.14`. `@typescript/native-preview` is unrelated to almostnode removal because it is used across root/apps/packages as the tsgo TypeScript implementation.
- Public asset/config impact: `apps/client/public/__sw__.js` is an almostnode virtual-server service worker; `apps/client/oxlint.config.ts` and `apps/client/oxfmt.config.ts` ignore `public/__sw__.js`, so deleting the service worker should remove those ignore entries too.
- Source file impact: `apps/client/src/hooks/use-landing-preview-server.ts` and `apps/client/src/lib/preview-bridge.ts` are only for almostnode editor preview plumbing; `apps/client/src/components/landing-preview.tsx` is the editor preview component consuming that hook.
- Existing tests: `apps/client/src` currently has no `*.test.ts`/`*.spec.ts` files. Relevant package verification commands from `apps/client/package.json` are `pnpm --filter @workspace/client typecheck`, `pnpm --filter @workspace/client lint`, `pnpm --filter @workspace/client test`, and `pnpm --filter @workspace/client build`; previous work established the client test script exits 1 when there are no test files.
- DOX/docs text needing update if preview becomes a plain iframe: root `AGENTS.md` child index says client has an almostnode preview; `apps/AGENTS.md` says client owns almostnode preview runtime; `apps/client/AGENTS.md` purpose/ownership/contracts mention almostnode `VirtualFS`, `ViteDevServer`, preview bridge helpers, `public/__sw__.js`, virtual preview origin, and writing `/index.html` into browser `VirtualFS`; `README.md` describes almostnode preview/service-worker behavior; `mastra-migration-plan.md` and `plans/*` contain historical almostnode references.

### Gotchas
- Removing almostnode changes the preview iframe origin from an almostnode virtual server URL to the parent page's `srcDoc` document origin; `expandProjectImageUrls()` still matters because stored project image URLs are root-relative server API paths.
- `pnpm-workspace.yaml` has `cleanupUnusedCatalogs: true`, so the almostnode catalog entry should disappear when no importer uses it, but lockfile cleanup must still be verified with pnpm.
- Plans under `plans/` are historical architecture notes; they may not all need rewriting, but active DOX and README should not keep presenting almostnode as current behavior.
