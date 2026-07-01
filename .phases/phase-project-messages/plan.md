# Plan — project-messages

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

## Phase 1: Persist project message history in file-backed project storage

### Description
Files touched: `apps/server/src/mastra/lib/project-store.ts`, likely `apps/server/src/mastra/lib/project-store.test.ts` or an existing test location if suitable.

Approach: extend the existing file-backed project folder with `messages.json` because the user explicitly allowed a local DB or JSON file and the codebase already persists project HTML/images/metadata as files. Define a server-side message/turn type matching the client-rendered `LandingTurn` JSON shape, initialize new projects with `messages: []`, read missing `messages.json` as an empty array for backward compatibility, write a `messages.json` file on project creation, and include `messages` in full `getProject` responses. Keep `listProjects()` metadata-only so project lists do not load full chat history.

Acceptance criteria: new project creation writes empty messages; `getProject(id)` returns messages; old project folders without `messages.json` load as `messages: []`; message append/update helper writes stable JSON; focused tests cover missing-file fallback and append/read behavior.

### Todo
- [x] Specify storage schema/types/helpers for `messages.json`.
- [x] Specify focused project-store tests for message defaults and persistence.

### Results
- Planned `messages.json` inside each existing project folder, alongside `project.json`, `index.html`, and `images/`.
- Planned a server-side persisted turn shape that mirrors the JSON-renderable client `LandingTurn` enough for direct rendering after reload.
- Planned backward-compatible `getProject` behavior: missing `messages.json` returns `messages: []`.
- Planned focused project-store coverage for new-project defaults and append/read persistence.

### Gotchas
- Project list responses should stay metadata-only to avoid loading full chat history for `/`.

## Phase 2: Record each completed agent turn on the server

### Description
Files touched: `apps/server/src/mastra/route.ts`, `apps/server/src/mastra/AGENTS.md` if the local contract changes.

Approach: while `streamLandingAgent` maps Mastra chunks to SSE events, maintain a run-local persisted turn object containing the prompt, resolved model, rendered parts, tool states/results, stats, HTML swap count, and error. Reuse the same summarized data already sent to the client so persisted turns render like live turns. In `finally`, mark the turn non-streaming, terminalize any still-running tool calls, append it to the project `messages.json`, and then send `done`/end the response as today. Do not persist a turn for the early project-not-found path.

Acceptance criteria: after an agent run completes, stops, or guard-fails, the project has a saved turn with user prompt and assistant/tool/error parts; repeated reloads preserve all prior turns in append order; stream behavior and edit HTML refresh SSE remain unchanged.

### Todo
- [x] Specify server-side turn recorder in `streamLandingAgent`.
- [x] Specify Mastra DOX update for project message persistence.

### Results
- Planned run-local recording in `apps/server/src/mastra/route.ts` using the same summarized text/tool/stats payloads already emitted over SSE.
- Planned final append in `finally` so completed, stopped, and guard-failed turns are saved for the next project open.
- Planned terminalization of any still-running persisted tool calls before saving.

### Gotchas
- The project-not-found path starts/ends SSE early and should not append messages.

## Phase 3: Load persisted messages into the editor UI

### Description
Files touched: `apps/client/src/lib/projects-api.ts`, `apps/client/src/hooks/use-landing-page.ts`, `apps/client/AGENTS.md` if the local contract changes.

Approach: extend the client `Project` type to include `messages`, with message shape reusing `LandingTurn`. On editor mount/switch, set turns from `project.messages` after normalizing every restored turn to `isStreaming: false`, valid `htmlSwaps`, and terminal tool states. Keep live-send behavior unchanged: the client still creates the in-flight turn locally and the server persists the authoritative copy for future reloads. Since agent-run errors are already rendered in-turn, do not reintroduce global banners.

Acceptance criteria: opening `/projects/:id` with saved messages renders previous prompt/assistant/tool/stats messages; a project with no messages still shows the empty state; sending a new prompt appends a live turn without requiring a client save call.

### Todo
- [x] Specify client project type and restored-turn loading from `getProject`.
- [x] Specify client DOX update for message-history loading contract.

### Results
- Planned `Project.messages` on the client using the existing `LandingTurn` shape.
- Planned mount-time restoration in `useLandingPage` after `getProject`, normalizing restored turns to non-streaming terminal state.
- Planned no client save path: live turns remain local during streaming, server-persisted turns become visible after reload/reopen.

### Gotchas
- Restored messages will suppress the editor empty hint because `hasLanding` is derived from `landing.turns.length`.

## Phase 4: Verify focused behavior and prepare closeout

### Description
Files touched: `.phases/phase-project-messages/verification.md` later; no code files planned here unless verification uncovers issues.

Approach: run focused server/client typecheck, lint, tests, and build checks. Prefer focused tests around project-store persistence plus existing type/lint/build. If verification finds a real failure, use the allowed backward move to append an implementation sub-phase.

Acceptance criteria: project-message implementation passes focused tests and type/lint/build checks; known unrelated warnings/debt are documented; DOX pass completed.

### Todo
- [x] Record verification commands to run in `verification.md`.
- [x] Close the planning stage once implementation todos are concrete.

### Results
- Planned verification commands: focused server typecheck/lint/test/build, focused client typecheck/lint/build, and project-store tests.
- Implementation can now be split into commit-sized todos matching the first three planned slices.

### Gotchas
- Full repo format/lint may still include unrelated shadcn/UI drift noted in prior context; verification should avoid overstating global cleanliness.
