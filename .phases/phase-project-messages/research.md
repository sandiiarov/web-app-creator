# Research — project-messages

Status: Complete
Prerequisite: none

> **Purpose:** understand the relevant parts of the codebase as *facts* before any design or code. Output a map of what exists and how it works today — not how it should be.

## Guidance

- **Facts only.** Every claim cites a file path. No opinions about how the code *should* be, and no implementation decisions — that's planning's job.
- **Questions before investigation.** Turn the request into clarifying questions first, then investigate the codebase to answer them. Don't let the desired solution steer what you find.
- **Map inputs/outputs** of every module you touch: what triggers it, what it receives, what it produces, and what side effects it has.
- **Record existing patterns** the codebase already uses (testing framework, error handling, naming, structure). Capture the exact test / lint / build / format commands with their working directory and flags — verification will re-run these.
- **Open questions** that need the user's input go here too. Surface them; don't guess.

## Phase 1: Map persisted project storage and REST shape

### Description
Answer: where project data lives today, what project endpoints return, and how project metadata/HTML are represented on disk and in TypeScript.

### Todo
- [x] Inspect server project store implementation and exported types.
- [x] Inspect server REST handlers for project create/read/list/delete.
- [x] Record current storage files, inputs, outputs, and side effects.

### Results
- Server project storage is file-backed under `apps/server/.data/projects/<id>/`; current durable files are `project.json`, `index.html`, and `images/<file>` according to the file header and constants in `apps/server/src/mastra/lib/project-store.ts`.
- Exported project types are `ProjectMeta` (`createdAt`, `hasHtml`, `id`, `model`, `title`, `updatedAt`), `ProjectInput` (`model?`, `title?`), and `Project` (`ProjectMeta` plus `indexHtml`) in `apps/server/src/mastra/lib/project-store.ts`.
- `createProject(input)` creates a UUID, writes `project.json`, writes placeholder `index.html`, sets `hasHtml: false`, and returns the full project in `apps/server/src/mastra/lib/project-store.ts`.
- `createProjectHtmlStore(projectId)` reads the current `index.html`, exposes sync `get/reset/set`, and on `set` writes normalized HTML, persists referenced generated images, marks `hasHtml`, and updates `updatedAt` in `apps/server/src/mastra/lib/project-store.ts`.
- Project REST endpoints are routed in `apps/server/src/index.ts`: `POST /api/projects` calls `createProject`; `GET /api/projects` calls `listProjects` and filters `hasHtml`; `GET /api/projects/:id` calls `getProject`; `DELETE /api/projects/:id` calls `deleteProject`; `GET /api/projects/:id/images/:file` calls `readProjectImage`.
- `routeProjects` only allows `GET`, `POST`, and `DELETE` project operations; CORS currently allows `GET,POST,OPTIONS` in `setCorsHeaders` in `apps/server/src/index.ts`.

### Gotchas
- There are no existing project-store tests under `apps/server/src` matching “Project”; `grep` found no project test matches.
- `GET /api/projects` filters `hasHtml` both in `listProjects()` and `handleListProjects()` (`apps/server/src/mastra/lib/project-store.ts`, `apps/server/src/index.ts`).

## Phase 2: Map client project loading and conversation state

### Description
Answer: where the editor fetches projects, where chat turns/messages live, and what event data must be saved/restored.

### Todo
- [x] Inspect client project API types/helpers.
- [x] Inspect `use-landing-page` streaming state and turn/message shape.
- [x] Inspect prompt-panel rendering inputs for restored messages.

### Results
- Client project types mirror the server project shape: `ProjectMeta` (`createdAt`, `hasHtml`, `id`, `model`, `title`, `updatedAt`) and `Project` (`ProjectMeta` plus `indexHtml`) live in `apps/client/src/lib/projects-api.ts`.
- Client project helpers currently support `createProject`, `deleteProject`, `getProject`, `listProjects`, and `expandProjectImageUrls`; there is no message-specific API helper in `apps/client/src/lib/projects-api.ts`.
- `EditorPage` calls `useLandingPage({ projectId, onError })`, renders global load/preview errors via `ErrorBanner`, sends `landing.turns` into `PromptPanel`, and shows an empty hint when `landing.turns.length === 0` in `apps/client/src/App.tsx`.
- On project mount/switch, `useLandingPage` clears local `turns` with `setTurns([])`, fetches `getProject(projectId)`, sets expanded HTML, and sets the model if `project.model` is present in `apps/client/src/hooks/use-landing-page.ts`.
- `useLandingPage.send(prompt)` creates a new `LandingTurn` with `id`, `prompt`, `model`, `parts: []`, `htmlSwaps: 0`, `isStreaming: true`, then appends SSE-derived `thinking`, `text`, `tool_call`, and `stats` parts in `apps/client/src/hooks/use-landing-page.ts`.
- `useLandingPage` terminalizes running tool calls on stream `done`, `error`, rejected stream promise, and `stop()`; successful `edit` tool calls increment `htmlSwaps` and trigger `refreshHtml()` in `apps/client/src/hooks/use-landing-page.ts`.
- `PromptPanel` receives `turns` as a prop and passes them to `PanelBody`; `PanelBody` shows `ChatEmptyState` only when `turns.length === 0` and otherwise maps each turn to `TurnMessage` in `apps/client/src/components/prompt/prompt-panel.tsx` and `apps/client/src/components/prompt/panel-body.tsx`.
- `TurnMessage` renders the user prompt, grouped `tool_call` parts via `TurnSteps`, `text` and `thinking` parts via `StreamdownContent`, `stats` via `TurnMetadata`, and `turn.error` as a destructive bubble in `apps/client/src/components/prompt/turn-message.tsx`.

### Gotchas
- Conversation state is currently entirely client memory; reloading a project always clears `turns` before loading project HTML (`apps/client/src/hooks/use-landing-page.ts`).
- Restoring messages will affect the `hasLanding` empty hint because `EditorPage` bases it on `landing.turns.length` (`apps/client/src/App.tsx`).

## Phase 3: Map SSE event shape and verification patterns

### Description
Answer: what server SSE events emit today, how client event types are modeled, and which focused checks/tests should verify message persistence.

### Todo
- [x] Inspect server Mastra route event emissions.
- [x] Inspect landing-agent event type definitions.
- [x] Record relevant existing test/build/lint commands and commit convention.

### Results
- `streamLandingAgent` validates the project, sets the title, creates a project HTML store, starts SSE, maps Mastra chunks to custom events, sends `done` in `finally`, and ends the response in `apps/server/src/mastra/route.ts`.
- Server SSE event names currently emitted are `thinking`, `text`, `tool_call`, `stats`, `error`, and `done` in `apps/server/src/mastra/route.ts`.
- `tool_call` event payloads include `id`, `tool`, `state`, `providerId`, `intent`, optional `detail`, and optional `result`; `tool-error` and `tool-result` are both mapped into terminal `tool_call` states in `apps/server/src/mastra/route.ts`.
- Server route keeps run-local cost and edit-failure state; there is no project message persistence in `apps/server/src/mastra/route.ts`.
- Client event and conversation types are in `apps/client/src/lib/landing-agent.ts`: `LandingTurn` contains `id`, `prompt`, `model`, `parts`, `htmlSwaps`, `isStreaming`, and optional `error`; `TurnPart` is `StatsPart | TextPart | ThinkingPart | ToolCallPart`.
- Server package verification scripts are `pnpm --filter @workspace/server typecheck`, `pnpm --filter @workspace/server lint`, `pnpm --filter @workspace/server test`, and `pnpm --filter @workspace/server build` from `apps/server/package.json`.
- Client package verification scripts are `pnpm --filter @workspace/client typecheck`, `pnpm --filter @workspace/client lint`, `pnpm --filter @workspace/client test`, and `pnpm --filter @workspace/client build` from `apps/client/package.json`.
- Root scripts delegate through Turborepo (`pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, `pnpm run build`) in `package.json`.
- Recent commits follow conventional/descriptive subjects plus task tags such as `feat(client): ... [projects-list][phase-3]` and `fix: ... [landing-agent][edit]` from `git log --oneline -20`.

### Gotchas
- Client build currently emits known almostnode/Vite externalization and eval warnings; previous context identified these as existing warnings, not necessarily failures.
- The server CORS allow-methods header omits `DELETE` even though project delete works as a route; browser simple DELETE behavior was not investigated in this research stage.
