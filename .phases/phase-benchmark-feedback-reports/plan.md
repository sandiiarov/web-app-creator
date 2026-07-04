# Plan — benchmark-feedback-reports

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

## Phase 1: Server-side benchmark report JSON persistence

### Description
Files touched: `apps/server/src/index.ts`, new `apps/server/src/mastra/lib/benchmark-report-store.ts`, server tests. Add a `POST /api/benchmark-reports` route that accepts a benchmark report JSON object, wraps it with server metadata, writes pretty JSON to `apps/server/.data/benchmark-reports/<id>.json`, and returns `{ ok, report: { id, savedAt, path, bytes } }`. Reuse Node `randomUUID`, async fs helpers, `readJsonObject`, and `sendJson` style from existing server routes. Acceptance: focused server tests prove valid reports save to disk, malformed/non-report bodies reject with 400, and the returned path points to readable JSON for a coding agent.

### Todo
- [x] Resolve persistence location and route shape from research facts
- [x] Define validation and response acceptance criteria
- [x] Identify tests needed for route and store coverage

### Results
- Persistence location resolved to `apps/server/.data/benchmark-reports` because `apps/server/.data` is the existing ignored server persistence root. (`apps/server/src/mastra/lib/project-store.ts`, `.gitignore`, `apps/server/AGENTS.md`)
- Route shape resolved to `POST /api/benchmark-reports` so existing CORS methods already cover it. (`apps/server/src/index.ts`)
- Tests must cover a successful save and a validation failure because server coverage enforces 90% line coverage. (`apps/server/vitest.config.ts`)

### Gotchas
- Do not add generated report JSON files to git; only the source code and tests are part of implementation.

## Phase 2: Benchmark report schema, client API helper, feedback form, and save action

### Description
Files touched: `apps/benchmark/src/lib/types.ts`, new `apps/benchmark/src/lib/report.ts`, `apps/benchmark/src/lib/server-api.ts`, `apps/benchmark/src/App.tsx`, and a benchmark-only component such as `components/report-save-panel.tsx`. Build a coding-agent-oriented report object from current prompts, selected models, concurrency, aggregate metrics, run results, tool calls, costs, mistakes, and user feedback. Add an inline feedback form and `Save report` button in the main benchmark content, not a modal. On successful save, generate an agent handoff prompt that references the saved JSON path and copy it to the clipboard. Acceptance: after runs exist, a user can enter feedback, click Save report, see loading/success/error states, receive the server JSON path/id, and get a copied prompt such as “Check the benchmark report at <path>, identify problems with tools/cost/user feedback/output, and make adjustments”; save is disabled while a benchmark is running or when no results exist.

### Todo
- [x] Define report JSON fields useful to a coding agent
- [x] Define feedback fields and save states
- [x] Define copied agent prompt behavior
- [x] Define UI placement and behavior using `/design surface` and `/design interaction` guidance

### Results
- Report JSON should include `reportVersion`, `generatedAt`, `app`, `serverUrl`, `runConfig`, `summary`, `aggregates`, `runs`, and `userFeedback`. `runs` should preserve tool/cost/problem data from `RunResult` and may include HTML because generated output is part of benchmark evidence. (`apps/benchmark/src/lib/types.ts`, `apps/benchmark/src/lib/run-reducer.ts`)
- Feedback fields should be structured enough for a coding agent: overall rating, notes, suspected problem areas (tools, cost, prompts, visual output, reliability, model choice), and next action/requested adjustment text.
- Save success should produce a clipboard-ready prompt for the next coding-agent pass. The prompt should name the saved report path and ask the agent to inspect the report, identify problems across tools, cost, user feedback, output quality, and model behavior, then make adjustments.
- UI placement: add a working-surface panel near the live report so saving follows review. Use inline success/error feedback, visible labels, native form controls, and one primary `Save report` action. (`/Users/alexsandiiarov/.pi/agent/skills/design/references/surface.md`, `/Users/alexsandiiarov/.pi/agent/skills/design/references/interaction.md`)

### Gotchas
- The save button must not start a benchmark run. Keep it separate from the fixed Run/Stop footer and disabled during active runs to avoid conflicting operations.

## Phase 3: Single initial prompt with unlimited add/remove prompt controls

### Description
Files touched: `apps/benchmark/src/App.tsx`, `apps/benchmark/src/components/benchmark-controls.tsx`, and any small prompt utility if useful. Replace the two default prompts with one initial prompt. Add `Add prompt` and `Remove` controls so users can create as many prompts as needed, while preserving at least one prompt row. Acceptance: initial page shows one prompt, Add creates another editable prompt, extra prompts can be removed, the last prompt cannot be removed, run count updates, and run remains disabled if any prompt is blank.

### Todo
- [x] Define prompt state changes
- [x] Define prompt control behavior and disabled states
- [x] Define acceptance checks for run-count and validation behavior

### Results
- Prompt IDs can be generated client-side using a monotonic counter or timestamp because prompts are local benchmark inputs. (`apps/benchmark/src/App.tsx`)
- Add/remove controls belong in the existing `Prompts` section header/rows inside `BenchmarkControls`, preserving the fixed footer for Run/Stop only. (`apps/benchmark/src/components/benchmark-controls.tsx`)
- The app must keep at least one prompt so the user always has an editable starting state.

### Gotchas
- “As much prompts as he wants” means do not hard-code an artificial prompt limit in UI state.

## Phase 4: DOX, verification, and visual QA closeout

### Description
Files touched: `apps/benchmark/AGENTS.md`, `apps/server/AGENTS.md`, and phase files. Update local contracts to document saved benchmark reports, dynamic prompts, feedback, and generated JSON location. Run focused benchmark/server checks and headed browser verification without starting live model calls unless already authorized. Acceptance: DOX matches behavior, format/lint/type/build/test pass for affected workspaces, no runtime console/errors on benchmark load, prompt add/remove and save-report UI are visually verified, and generated JSON artifacts remain ignored.

### Todo
- [x] Define DOX updates required by behavior changes
- [x] Define focused verification commands
- [x] Define browser/design verification scope

### Results
- `apps/benchmark/AGENTS.md` must document dynamic prompt management, feedback form, save-report action, and saved report JSON contract.
- `apps/server/AGENTS.md` must document `POST /api/benchmark-reports` and `.data/benchmark-reports` as local generated artifacts.
- Focused checks: benchmark `format:check`, `lint`, `typecheck`, `build`; server `format:check`, `lint`, `typecheck`, `test`, `build`; browser smoke via `agent-browser` for the new UI states.

### Gotchas
- Do not click `Run benchmark` during visual QA unless the user explicitly approves real OpenRouter spend; prompt add/remove and save error/disabled states can be verified safely without live runs.
