# Research — bench-app

Status: Complete
Prerequisite: none

> **Purpose:** understand the relevant parts of the codebase as *facts* before any design or code. Output a map of what exists and how it works today — not how it should be.

## Guidance

- **Facts only.** Every claim cites a file path. No opinions about how the code *should* be, and no implementation decisions — that's planning's job.
- **Questions before investigation.** Turn the request into clarifying questions first, then investigate the codebase to answer them. Don't let the desired solution steer what you find.
- **Map inputs/outputs** of every module you touch: what triggers it, what it receives, what it produces, and what it side effects.
- **Record existing patterns** the codebase already uses (testing framework, error handling, naming, structure). Capture the exact test / lint / build / format commands with their working directory and flags — verification will re-run these.
- **Open questions** that need the user's input go here too. Surface them; don't guess.

## Phase 1: Clarify the request and locate the "purity" boundary

### Description
Turn the request ("separate benchmark app that uses our server, generates landing pages as cards in iframes, reports result/cost/mistakes; must NOT touch server or client") into questions and confirm where the new app may live without editing prod.

### Todo
- [x] Confirm the new app must live entirely under a new `apps/*` folder with zero edits to `apps/server`, `apps/client`, or shared packages
- [x] Confirm whether workspace registration requires editing shared config
- [x] Identify which server endpoints the app may consume (read-only contract)

### Results
- The user's two explicit constraints: (1) pure, separate benchmark app; (2) must not touch server or client prod code. The benchmark may only *consume* the server over HTTP, exactly as the client does (`apps/client/src/lib/landing-agent.ts`, `apps/client/src/lib/projects-api.ts`).
- Workspace auto-includes new apps: `pnpm-workspace.yaml` globs `apps/*` and `packages/*` (top of file), so `apps/benchmark` joins with no edit to the workspace file.
- `turbo.json` task names are generic (`build`, `dev`, `lint`, `typecheck`, `test`, `format`, `format:check`) and auto-discover any workspace package exposing those scripts — no turbo edit needed.
- Conclusion: benchmark app source can live under `apps/benchmark/` with no production server/client source edits. DOX registration in `apps/AGENTS.md` and lockfile updates are still required closeout artifacts.

### Gotchas
- The repo worktree is already dirty (server coverage work, `apps/server/src/bench/`, client edits, `.phases/*`). Commits in this task must use explicit paths scoped to `apps/benchmark/` only, never `git add -A`.

## Phase 2: Map the server HTTP/SSE contract the benchmark consumes

### Description
Document the exact request/response shapes the benchmark app will call, so the client is faithful and needs no server changes.

### Todo
- [x] Map project REST endpoints used by the client
- [x] Map `POST /agent` SSE event stream and payload
- [x] Identify CORS constraints for a separate-origin dev server
- [x] Identify the `screenshot_request` interaction and whether the benchmark must handle it

### Results
- Project REST (`apps/client/src/lib/projects-api.ts` → `apps/server/src/index.ts`):
  - `POST /api/projects { title?, model? }` → `{ ok, project }` where project = `{ id, title, model, createdAt, updatedAt, hasHtml, indexHtml, messages }`. Used to seed each benchmark run (`createProject`).
  - `GET /api/projects/:id` → full project incl. `indexHtml`. Not strictly needed mid-run because `html_update` carries HTML, but useful to resolve a final page if the stream is stopped.
- `POST /agent` (`apps/client/src/lib/sse-client.ts` → `apps/server/src/mastra/route.ts`):
  - Request body: `{ prompt: string, projectId: string, textModel?: string, imageModel?: string, visionModel?: string, attachments?: [] }` (attachments unused by benchmark).
  - Streams SSE events: `thinking`, `text`, `tool_call` (with `state` start/running/done/error, `intent`, `result`), `html_update` (`{ html, projectId, sequence, bytes, hash }`), `retry` (`{ attempt, maxAttempts, delayMs, issue, reason }`), `stats` (`{ cost, costBreakdown, durationMs, finishReason, model, usage }`), `error` (`{ message }`), `done` (`{}`). `screenshot_request` (`{ projectId, requestId, selector, viewportSize }`) also possible.
  - `stats` carries the full reportable data: `cost`, `costBreakdown { llm, scrape, image?, vision? }`, `durationMs`, `finishReason`, `usage { inputTokens, outputTokens, totalTokens, ... }`.
- Model routing state: production `/agent` is OpenRouter-only. The benchmark varies `textModel` because text/tool-calling quality is the benchmark target; image and vision models stay on server defaults unless the app adds those as axes later.
- CORS (`apps/server/src/index.ts:448-450`): `access-control-allow-origin` = `config.clientOrigin`, which defaults to `'*'` (`apps/server/src/config-env.ts`), so a separate-origin dev server can call GET/POST/PATCH. `access-control-allow-methods` is `GET,POST,PATCH,OPTIONS` — **DELETE is not allowed**, so the benchmark cannot clean up projects via REST; it will create fresh projects per run and leave them.
- `screenshot_request`: the server creates a process-local pending capture and waits up to the tool's timeout (default 25s, `apps/server/src/mastra/tools/screenshot.ts`). If unanswered, the `screenshot` tool returns a timeout error that pollutes the turn. The benchmark should answer each request promptly to avoid 25s hangs; for v1 it will POST an error response (`POST /api/screenshot-responses/:requestId { error }`) so the tool fails fast and deterministically (documented limitation, identical across models so it stays a controlled variable).

### Gotchas
- Because DELETE is CORS-blocked, benchmark projects accumulate on the server; the report must surface each run's `projectId` so the user can open/clean them via the client.
- `stats` may be absent if the run aborts before completion (e.g. an early terminal error), so the report must treat cost/duration/tokens as optional and fall back to client-measured duration.

## Phase 3: Map client patterns to reuse faithfully (without importing client code)

### Description
Identify the exact client patterns (iframe preview, SSE client, image-URL expansion, shared package imports, app config files) the benchmark should mirror, and confirm which shared packages it may depend on.

### Todo
- [x] Locate the POST-SSE client and confirm it must be copied (cross-app import forbidden by `apps/AGENTS.md`)
- [x] Locate the iframe preview approach and what to strip (no panel, no element picker)
- [x] Confirm shared package deps available: `@workspace/ui`, `@workspace/prompt-panel` (formatters + model options + types)
- [x] Capture the app-config file set (package.json, tsconfig, vite/oxlint/oxfmt/vitest configs) the client uses as a template

### Results
- Cross-app imports are forbidden: `apps/AGENTS.md` says "Shared cross-app code belongs in `packages/*`, not in another app's source tree." So the POST-SSE client (`apps/client/src/lib/sse-client.ts`, ~40 lines) must be copied into `apps/benchmark/src/lib/`.
- The client's iframe preview (`apps/client/src/components/landing-preview.tsx`) is a sandboxed `srcDoc` iframe (`sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"`) that morphs on `html_update`. The benchmark's card preview needs only the sandboxed `srcDoc` iframe — no morph, no element picker, no screenshot capture. The client injects `<base href="about:srcdoc">` via `preparePreviewMorphHtml`; for a simple card, rendering the final HTML as `srcDoc` (with image URLs expanded) is sufficient.
- Image URLs in stored HTML are root-relative (`/api/projects/:id/images/<file>`); `expandProjectImageUrls` (`apps/client/src/lib/projects-api.ts`) rewrites them to absolute `${SERVER_URL}...` for `srcDoc` iframes. The benchmark must replicate this small helper.
- Shared package deps the benchmark may use:
  - `@workspace/ui` — primitives: Button, Badge, Textarea, Input, Dialog, ScrollArea, Separator, Collapsible (no Card component exists in `packages/ui/src/components/`; cards are composed from `div` + `border border-border bg-card` classes, as `apps/client/src/components/projects-page.tsx` does).
  - `@workspace/prompt-panel` — `formatCost`, `formatDuration`, `formatTokenUsage`, `LANDING_MODEL_OPTIONS`, and types (`CostBreakdown`, `TokenUsage`, `ToolCallState`, `LandingTurn` parts) from `packages/prompt-panel/src/domain.ts`. These are pure helpers/types with no app/env coupling — safe to import.
- App config template (from `apps/client`): `package.json` (`@workspace/<name>`, type module, `#lib`/`#components` imports, scripts build/dev/lint/typecheck/format/test, deps on `@workspace/vite-config`, `@workspace/oxlint-config`, `@workspace/oxfmt-config`, `@workspace/typescript-config`, `@workspace/vitest-preset`, `react`/`react-dom`/`lucide-react` via catalog), `vite.config.ts` (`createReactViteConfig()`), `tsconfig.json` (extends `@workspace/typescript-config/react-app.json`), `oxlint.config.ts` (`createReactConfig()`), `oxfmt.config.ts`, `index.html`, `src/main.tsx`.
- Server URL pattern: `import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'` (`apps/client/src/lib/landing-agent.ts`).
- React lint config factory is `createReactConfig` (from `packages/oxlint-config/src/index.ts`), not `createNodeConfig`.

### Gotchas
- `@workspace/ui` has no `Card`; do not add one to the shared package (that would touch prod-adjacent shared code). Compose cards from primitives.
- Streamdown/markdown rendering is not needed for v1 report (mistakes are structured lists, not prose); avoid pulling `streamdown` + `@streamdown/code` + their CSS to keep the app lean. Assistant `text` deltas can be rendered as plain preformatted text.

## Phase 4: Capture exact verification commands and commit convention

### Description
Record the commands verification will re-run and the commit-message convention so implementation commits match the repo.

### Todo
- [x] Capture focused + root verification commands
- [x] Capture commit-message convention from git log

### Results
- Verification commands (from `apps/AGENTS.md`, run from repo root):
  - `pnpm --filter @workspace/benchmark typecheck`
  - `pnpm --filter @workspace/benchmark lint`
  - `pnpm --filter @workspace/benchmark format:check`
  - `pnpm --filter @workspace/benchmark build`
  - Workspace sanity (should be unaffected by a new app): `pnpm --filter @workspace/server typecheck`, `pnpm --filter @workspace/client typecheck` — to prove no prod edits leaked.
- Commit convention (`git log --oneline`): Conventional Commits with phase tags, exactly matching the phases skill format:
  `<type>(<scope>): <subject> [bench-app][phase-N][todo-slug]`
  e.g. `feat(benchmark): scaffold vite app [bench-app][phase-1][scaffold-app]`.
- The repo has no `.gitmessage` template; Conventional Commits scope is `benchmark`.

### Gotchas
- `pnpm install` is needed once after adding `apps/benchmark/package.json` so the workspace + lockfile resolve the new package and its workspace deps. Run it before typecheck/build.

### Open questions resolved
- Q: Different providers? A: Production `/agent` now routes through OpenRouter only. The benchmark compares OpenRouter text model ids from `@workspace/prompt-panel`.
