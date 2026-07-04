# Research — benchmark-feedback-reports

Status: Complete
Prerequisite: none

> **Purpose:** understand the relevant parts of the codebase as *facts* before any design or code. Output a map of what exists and how it works today — not how it should be.

## Guidance

- **Facts only.** Every claim cites a file path. No opinions about how the code *should* be, and no implementation decisions — that's planning's job.
- **Questions before investigation.** Turn the request into clarifying questions first, then investigate the codebase to answer them. Don't let the desired solution steer what you find.
- **Map inputs/outputs** of every module you touch: what triggers it, what it receives, what it produces, and what side effects it has.
- **Record existing patterns** the codebase already uses (testing framework, error handling, naming, structure). Capture the exact test / lint / build / format commands with their working directory and flags — verification will re-run these.
- **Open questions** that need the user's input go here too. Surface them; don't guess.

## Phase 1: Request, contracts, and design context

### Description
Turn the request into factual questions, identify applicable DOX/design constraints, and capture design report context before code investigation.

### Todo
- [x] List the concrete research questions raised by the request
- [x] Record applicable DOX constraints for `.phases/`, `apps/benchmark`, and `apps/server`
- [x] Record relevant `/design` context and existing report findings

### Results
- Request questions to answer from code:
  1. Where does the benchmark app currently store prompts, run state, report rows, and API calls? (`apps/benchmark/src/App.tsx`, `apps/benchmark/src/hooks/use-benchmark.ts`, `apps/benchmark/src/lib/types.ts`)
  2. Is there an existing server endpoint or persistence pattern for writing JSON results? (`apps/server/src/index.ts`, `apps/server/src/mastra/lib/project-store.ts`)
  3. What shape of benchmark data already exists for tools, cost, model, prompt, project, errors, retries, stats, and HTML? (`apps/benchmark/src/lib/types.ts`, `apps/benchmark/src/lib/run-reducer.ts`)
  4. Where should the user feedback form and save-report button attach in the existing UI composition? (`apps/benchmark/src/App.tsx`, `apps/benchmark/src/components/report-view.tsx`, `apps/benchmark/src/components/result-card.tsx`, `apps/benchmark/src/components/run-detail-dialog.tsx`)
  5. What tests/checks exist for affected app and server changes? (`apps/benchmark/package.json`, `apps/server/package.json`, `apps/server/vitest.config.ts`)
- DOX facts:
  - Root project is a pnpm/Turborepo TypeScript monorepo; app workspaces live under `apps/*`; root scripts delegate through Turbo; focused work should use `pnpm --filter <workspace> <task>`. (`AGENTS.md`)
  - Generated/ignored outputs include `bench-results` and `apps/server/.data`; source edits must not include generated outputs. (`AGENTS.md`, `.gitignore`)
  - `apps/benchmark` owns a standalone Vite/React benchmark UI for comparing real server `/agent` SSE runs. It varies only `textModel`, creates draft projects via `POST /api/projects`, streams `/agent`, and intentionally answers `screenshot_request` events with deterministic errors. (`apps/benchmark/AGENTS.md`)
  - `apps/server` owns the Node HTTP API, `/agent`, `/api/projects*`, `/api/screenshot-responses/:requestId`, generated images, and file-backed project storage under `apps/server/.data`. (`apps/server/AGENTS.md`)
- `/design` facts:
  - The request includes `/design`, and the requested feature adds UI flows. The design skill says a new feature/surface should follow `references/create.md`, build real states, use real files, and verify in a real browser. (`/Users/alexsandiiarov/.pi/agent/skills/design/SKILL.md`, `/Users/alexsandiiarov/.pi/agent/skills/design/references/create.md`)
  - Existing design context contains `.commandcode/design/review-report.md`, but its scope is “prompt diagnostic block status treatment” in the client prompt panel, not the benchmark app. Its reusable relevant finding is to keep status/disclosure treatment quiet and avoid competing right-edge controls. (`.commandcode/design/review-report.md`)

### Gotchas
- The design report is mandatory context but is not directly scoped to `apps/benchmark`; applying it literally to benchmark report rows would be a scope mismatch. (`.commandcode/design/review-report.md`, `apps/benchmark/AGENTS.md`)

## Phase 2: Benchmark app data flow and UI map

### Description
Map current benchmark app inputs, prompt model, run state, report rendering, and API helpers that would be affected by configurable prompts, feedback, and save-report UI.

### Todo
- [x] Inspect benchmark shell/control/report components
- [x] Inspect benchmark hook, reducer, formatting, server API helper, and domain types
- [x] Record current inputs/outputs/side effects and UI state patterns

### Results
- `apps/benchmark/src/App.tsx` owns local UI state for `prompts`, selected `models`, `concurrency`, and selected detail dialog result. It currently seeds two default prompts in `DEFAULT_PROMPTS` and passes `onPromptChange` to `BenchmarkControls`; it does not expose add/remove prompt actions. (`apps/benchmark/src/App.tsx`)
- `App` renders a fixed desktop shell with `BenchmarkControls` in the left rail, a top header with run progress badges and `ThemeToggle`, a scrollable main content area, `ReportView`, result cards, and `RunDetailDialog`. (`apps/benchmark/src/App.tsx`)
- `BenchmarkControls` receives prompts and selected models as props, computes `runCount = prompts.length * models.length`, disables run unless every prompt has non-empty text, renders all prompt textareas, all `LANDING_MODEL_OPTIONS` checkboxes, concurrency input, and fixed Run/Stop footer. It has no add/remove prompt controls today. (`apps/benchmark/src/components/benchmark-controls.tsx`)
- `ReportView` aggregates `RunResult[]` by model, counts terminal results, computes done/error counts, optional averages from terminal runs, a score when terminal stats exist, and a state badge. It currently outputs a live table only; it has no save button, no report object export, and no user feedback input. (`apps/benchmark/src/components/report-view.tsx`)
- `ResultCard` displays one run’s model, prompt, status, cost/duration/token/issue metrics, iframe preview from `html`, edit count, tool call count, and a detail button. (`apps/benchmark/src/components/result-card.tsx`)
- `RunDetailDialog` displays a selected run’s prompt, cost/duration/tokens/issues, assistant text, tool calls with states/results, stats, mistakes, and error. This already exposes the tool/cost/problem details the user wants the coding agent to inspect. (`apps/benchmark/src/components/run-detail-dialog.tsx`)
- `useBenchmark` receives `{ concurrency, models, prompts }`, builds a matrix of every model × prompt, creates a draft project with `createProject`, streams `POST /agent` via `streamSSE`, folds events with `applySseEvent`, answers screenshot requests with `postScreenshotError`, and tracks progress/results in React state. Side effects: creates server projects, starts real model calls, may post screenshot errors, and aborts/stops runs. (`apps/benchmark/src/hooks/use-benchmark.ts`)
- `RunResult` already includes data needed for a report JSON: prompt id/text, model id/label, project id, status, stats/cost/usage/duration, assistant text, tool calls, mistakes, retry count, edit count, HTML, start/finish times, and error. (`apps/benchmark/src/lib/types.ts`)
- `applySseEvent` maps SSE `done`, `error`, `html_update`, `retry`, `screenshot_request`, `stats`, `text`, and `tool_call` events into `RunResult`, including tool errors and retries as `mistakes`. (`apps/benchmark/src/lib/run-reducer.ts`)
- `server-api.ts` currently exposes `SERVER_URL`, `createProject`, `getProject`, `postScreenshotError`, `expandProjectImageUrls`, and `projectEditorUrl`. It has no benchmark-report save API helper. (`apps/benchmark/src/lib/server-api.ts`)
- `ThemeToggle` is benchmark-local and persists `benchmark-theme` in localStorage. (`apps/benchmark/src/components/theme-toggle.tsx`)

### Gotchas
- `useBenchmark` currently resets `results` at the start of every run; any saved report flow must read the current `results` before a new run overwrites them. (`apps/benchmark/src/hooks/use-benchmark.ts`)
- The benchmark intentionally causes screenshot tool calls to fail fast; saved JSON should make that distinguishable as controlled benchmark behavior, not necessarily a production screenshot-tool regression. (`apps/benchmark/src/hooks/use-benchmark.ts`, `apps/benchmark/AGENTS.md`)

## Phase 3: Server route and persistence map

### Description
Map current server route handling, file-backed persistence patterns, validation style, and test approach for adding a benchmark report JSON save endpoint.

### Todo
- [x] Inspect server route entrypoint and HTTP helpers
- [x] Inspect project-store persistence style and related tests
- [x] Inspect server package scripts/config/test patterns relevant to a new JSON persistence endpoint

### Results
- `apps/server/src/index.ts` creates a single Node HTTP server, sets CORS headers for every request, routes `OPTIONS`, `POST /agent`, screenshot responses, project REST routes, in-memory `/images/:id`, and not-found JSON. (`apps/server/src/index.ts`)
- Server JSON route style is small explicit handlers plus regex route matching. Request bodies are read with `readRequestBody`; object bodies use `readJsonObject`; responses use `sendJson(response, status, { ok, ... })`. (`apps/server/src/index.ts`, `apps/server/src/http-body.ts`)
- Current CORS methods are `GET,POST,PATCH,OPTIONS`. A save endpoint can use existing POST support; DELETE would require widening CORS if added. (`apps/server/src/index.ts`)
- Project storage is file-backed under `apps/server/src/mastra/lib/project-store.ts` with a module-local `DATA_DIR` resolving to `apps/server/.data`; each project writes pretty JSON files with `JSON.stringify(..., null, 2)` and async fs helpers. (`apps/server/src/mastra/lib/project-store.ts`)
- `apps/server/.data` is ignored and local-only; `.gitignore` also ignores top-level `bench-results`. (`.gitignore`, `AGENTS.md`)
- `project-store.ts` exports functions for HTTP handlers (`createProject`, `getProject`, `listProjects`, `deleteProject`, `updateProjectModel`) and sync agent-facing HTML store functions. New report persistence can follow the async HTTP-handler pattern in a separate lib or same server route layer. (`apps/server/src/mastra/lib/project-store.ts`, `apps/server/src/index.ts`)
- `apps/server/src/index.test.ts` uses Vitest, starts the imported `server` on an ephemeral port, uses `fetch`/`postJson`, mocks `./mastra/route.ts`, cleans created projects in `afterEach`, and validates route status/payload behavior. (`apps/server/src/index.test.ts`)
- Server tests run with coverage and 90% line threshold. (`apps/server/vitest.config.ts`, `apps/server/package.json`)

### Gotchas
- `readJsonObject` returns `{}` for non-object JSON instead of rejecting it, but malformed JSON bubbles to the server catch and returns 500 today. New route validation should fit this existing style or tests need to document any deliberate difference. (`apps/server/src/index.ts`, `apps/server/src/index.test.ts`)
- Existing server route handlers are all in `index.ts`; adding many validation helpers there can affect coverage and build size, so tests must cover new branches because server line coverage is enforced at 90%. (`apps/server/vitest.config.ts`, `apps/server/src/index.ts`)

## Phase 4: Verification commands and open questions

### Description
Capture the exact existing checks to re-run and identify any remaining user-input questions before planning.

### Todo
- [x] Record focused benchmark and server verification commands
- [x] Check git status/log conventions for implementation commits
- [x] List open questions or state that none block planning

### Results
- Focused benchmark commands from `apps/benchmark/package.json` and DOX:
  - `pnpm --filter @workspace/benchmark format:check`
  - `pnpm --filter @workspace/benchmark lint`
  - `pnpm --filter @workspace/benchmark typecheck`
  - `pnpm --filter @workspace/benchmark build`
  - Browser smoke/visual verification with `agent-browser` after UI changes. (`apps/benchmark/package.json`, `apps/benchmark/AGENTS.md`)
- Focused server commands from `apps/server/package.json` and DOX:
  - `pnpm --filter @workspace/server format:check`
  - `pnpm --filter @workspace/server lint`
  - `pnpm --filter @workspace/server typecheck`
  - `pnpm --filter @workspace/server test`
  - `pnpm --filter @workspace/server build`. (`apps/server/package.json`, `apps/server/AGENTS.md`)
- Root commands exist through Turbo: `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run build`. (`package.json`, `AGENTS.md`)
- Commit convention in recent history is Conventional Commit style plus phase tags, e.g. `fix(benchmark): stabilize running report and detail layout, add theme toggle [bench-app][phase-6][visual-qa]`. (`git log --oneline -20`)
- Current worktree has many pre-existing modified/untracked files outside this task. New task edits should stage explicit paths only. (`git status --short`)
- No user-input blocker remains for planning. The request specifies the feature goal and UI requirements: save server-side JSON report, include user feedback form and save-report button, make JSON useful for a coding agent to inspect tool/cost/user-feedback problems, and change initial prompts to a single default while allowing user-added prompts.

### Gotchas
- The exact report filename/path was not specified by the user. Planning must choose a server-owned, ignored local JSON location that coding agents can read without committing generated reports; `apps/server/.data` is the existing local server persistence root. (`apps/server/src/mastra/lib/project-store.ts`, `.gitignore`, `apps/server/AGENTS.md`)
