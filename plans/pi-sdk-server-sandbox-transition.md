# Pi SDK server-sandbox transition plan

## Goal

Replace the current browser-side agent/tool loop with a simpler architecture:

- The browser keeps only the almostnode/Vite preview runtime.
- On each user request, the browser sends the full preview file set plus UI context to the server.
- All coding-agent reasoning and tool execution happens on the server through the Pi agent SDK.
- The server runs file/bash tools against an isolated sandbox workspace, not the app repository or host filesystem.
- The server returns changed files; the browser only writes those files back into the live almostnode `VirtualFS`.

## Non-goals

- No browser-side AI SDK `useChat` tool loop.
- No browser-executed `read`, `write`, `edit`, `ls`, `grep`, or `find` agent tools.
- No Vercel AI SDK, `@ai-sdk/react`, AI Elements, or `@openrouter/ai-sdk-provider` in the final agent path.
- No server mutation of this repository while editing generated preview apps.
- No mounting this repository into the sandbox.

## Target architecture

```text
Browser
  almostnode VirtualFS + ViteDevServer + iframe preview
  bippy selection inspector
  |
  | POST /agent
  | { userPrompt, selectedElement, selectedJsx?, files[] }
  v
Server controller process
  validate request
  create temp workspace from files[]
  start Docker sandbox with temp workspace mounted at /workspace
  run Pi SDK session in server process
    model/API key stays in server process
    file tools are path-guarded to temp workspace
    bash tool executes inside Docker sandbox
  collect changed files from temp workspace
  cleanup sandbox/temp dir
  |
  | { message, changedFiles[], deletedPaths[] }
  v
Browser
  write returned files into VirtualFS
  almostnode/Vite HMR updates iframe
```

Important security choice: keep the Pi SDK/model calls in the server controller process and put only tool execution in Docker. This avoids passing `OPENROUTER_API_KEY` into the container where generated commands could read or exfiltrate it.

## Request/response contract

### `POST /agent` request

```ts
type AgentRequest = {
  version: 1
  prompt: string
  selectedElement: SelectedElement | null
  selectedJsx?: string
  files: Array<{
    path: string // POSIX absolute VFS path, e.g. /src/App.tsx
    content: string
    encoding: 'utf8'
  }>
  preview: {
    entrypoint: '/src/main.tsx'
    rootFiles: string[]
  }
}
```

Initial file scope:

- Include `/package.json`, `/index.html`, and all `/src/**` text files.
- Reject paths outside that preview workspace shape.
- Reject `..`, duplicate paths, huge individual files, and huge total payloads.
- Keep binary/image support out of phase 1 unless the preview template needs it.

### `POST /agent` response

Start with a non-streaming JSON response for robustness:

```ts
type AgentResponse =
  | {
      ok: true
      message: string
      changedFiles: Array<{ path: string; content: string; encoding: 'utf8' }>
      deletedPaths: string[]
      diagnostics: string[]
    }
  | { ok: false; error: string; diagnostics?: string[] }
```

Later, add NDJSON/SSE progress events if needed. Do not start with streaming unless the simple request/response path is stable.

## Sandbox design

### Preferred implementation

Create a `SandboxDriver` abstraction in the server:

```ts
type SandboxDriver = {
  start(workspacePath: string): Promise<SandboxHandle>
}

type SandboxHandle = {
  exec(command: string, options: SandboxExecOptions): Promise<SandboxExecResult>
  dispose(): Promise<void>
}
```

Implement `DockerSandboxDriver` first. Current direction is Docker Sandboxes (`sbx`) with the `shell` agent so bash runs in a microVM while the Pi SDK/model loop remains in the server process.

### Docker rules

Run one Docker Sandbox per request/job:

- Agent: `shell` through `sbx create`.
- Workspace: mount only the request temp workspace.
- Workdir: the request temp workspace path as mounted by Docker Sandboxes.
- No project repo mount.
- No model/API secrets in sandbox env or `sbx` child process env.
- Drop privileges:
  - `--cap-drop=ALL`
  - `--security-opt=no-new-privileges`
  - default seccomp profile
- Resource limits:
  - memory limit
  - CPU limit
  - pids limit
  - wall-clock timeout
  - output truncation
- Filesystem:
  - read-only root if compatible
  - writable `/workspace`
  - tmpfs `/tmp`
- Network:
  - allow initially for package downloads only if needed
  - later tighten with egress policy or a no-network mode

Fail closed if Docker is unavailable. A local unsandboxed temp-dir driver may exist only behind an explicit dev-only env such as `ALLOW_UNSANDBOXED_AGENT=1`.

### Path safety

All file operations must go through a guard:

- Map VFS paths like `/src/App.tsx` to temp workspace paths.
- Resolve and realpath targets before reading/writing.
- Reject symlink escapes outside the temp workspace.
- Reject absolute host paths from the model.
- Reject writes to server source, `.env`, parent dirs, or any path outside the job workspace.

## Pi SDK integration plan

Use the SDK in full-control mode:

- `SessionManager.inMemory(workspacePath)`
- `SettingsManager.inMemory(...)`
- custom `ResourceLoader` with:
  - no discovered extensions
  - no discovered skills
  - no prompt templates
  - no context files from host `.pi`, `.agents`, or `AGENTS.md`
  - a project-specific server system prompt
- OpenRouter-only model selection:
  - keep `OPENROUTER_API_KEY`
  - keep `AI_MODEL`
  - use Pi `AuthStorage` runtime key for provider `openrouter`
  - find the configured OpenRouter model through Pi `ModelRegistry`

Use custom tool definitions, not default local built-ins:

- Disable default built-ins with `noTools: 'builtin'`.
- Register Pi built-in tool definitions with custom operations:
  - `read`, `write`, `edit`, `grep`, `find`, `ls`: guarded temp-workspace file operations.
  - `bash`: Docker-backed `BashOperations.exec`.
- Keep the active tool allowlist explicit.

This keeps the Pi SDK orchestration and model streaming in-process while forcing all command execution into the sandbox.

## Phase 0 — Decision record and safety gates

Tasks:

1. Keep this plan as the migration decision record.
2. Confirm the final sandbox model before implementation:
   - preferred: server-side Pi SDK + Docker-backed tool operations
   - rejected for production: run the entire agent in Docker with model API key in container env
   - rejected for production: local temp dir only
3. Define request size limits:
   - max files
   - max file size
   - max total payload
   - max agent runtime
4. Define feature flag:
   - `AGENT_RUNTIME=pi-docker`
   - old AI SDK route disabled once phase 4 passes

Acceptance criteria:

- Plan exists in `plans/`.
- Security invariants are documented.
- No code path can silently fall back to unsandboxed host execution.

## Phase 1 — Simplify the browser client

Tasks:

1. Replace `use-agent-chat` with a simple request hook:
   - collect user prompt
   - collect selected bippy element context
   - read preview files from almostnode `VirtualFS`
   - `fetch(POST /agent)`
   - write returned files into `VirtualFS`
2. Add `serializePreviewProject(vfs)`:
   - returns `/package.json`, `/index.html`, `/src/**`
   - text files only
   - sorted stable output
3. Add `applyServerFileChanges(vfs, response)`:
   - write changed/new files
   - optionally delete paths later
4. Remove browser-side agent tool code from the active path:
   - no `onToolCall`
   - no `addToolOutput`
   - no client `read/write/edit/ls/grep/find` tools
5. Keep bippy inspector and selection context.

Acceptance criteria:

- Client can send a full preview snapshot to a mocked `/agent` route.
- Client can apply a mocked changed `/src/App.tsx` and HMR updates the iframe.
- No browser-side AI SDK tool handling remains in use.

## Phase 2 — Server API and snapshot materialization

Tasks:

1. Replace the current AI SDK `/agent` implementation with a plain request handler.
2. Validate `AgentRequest` without trusting client paths.
3. Create a per-request temp job directory:
   - `workspace/` for generated app files
   - `logs/` for server-only logs
   - `result.json` for final worker result if needed
4. Materialize the incoming VFS snapshot into `workspace/`.
5. Generate contextual files inside the workspace if useful:
   - `AGENT_CONTEXT.md` containing user prompt, selected element JSON, selected JSX/source excerpt
   - avoid writing secrets
6. Add a mock runner that edits one file and returns changed files, before Pi SDK integration.

Acceptance criteria:

- Invalid paths/payloads are rejected.
- Temp workspace contains only preview files and generated context.
- Response returns changed files only.
- Temp dirs are cleaned after success/failure.

## Phase 3 — Docker sandbox driver

Tasks:

1. Add `DockerSandboxDriver`.
2. Add a minimal sandbox image definition, for example `apps/server/sandbox/Dockerfile`.
3. Add startup health checks:
   - Docker CLI available
   - image built/pulled
   - can execute `node --version` in sandbox
4. Implement `BashOperations.exec` using Docker:
   - `docker exec` or one-shot `docker run` per command
   - stream stdout/stderr into Pi's output callback
   - enforce timeout and abort signal
   - truncate output
5. Add tests for command timeout, cancellation, non-zero exit, and output truncation.

Acceptance criteria:

- Sandbox command can list `/workspace`.
- Sandbox cannot see this repository unless it was included in the request snapshot.
- Sandbox env does not include model/API keys.
- Cleanup removes containers even after errors/timeouts.

## Phase 4 — Pi SDK agent runner

Tasks:

1. Install Pi SDK packages in `apps/server`:
   - `@earendil-works/pi-coding-agent`
   - `@earendil-works/pi-ai` if direct model lookup is needed
2. Remove server dependencies from the old agent path:
   - `ai`
   - `@openrouter/ai-sdk-provider`
3. Build a full-control Pi SDK session:
   - in-memory session
   - in-memory settings
   - empty extensions/skills/prompts/context discovery
   - custom server system prompt
4. Configure OpenRouter:
   - `OPENROUTER_API_KEY`
   - `AI_MODEL`
   - no `AI_PROVIDER`
   - no `AI_GATEWAY_API_KEY`
5. Register only sandbox-backed tools:
   - read/write/edit/grep/find/ls path-guarded to temp workspace
   - bash through Docker
6. Construct the user prompt from:
   - user request
   - selected element JSON
   - selected JSX/source excerpt
   - file list
   - constraints: edit the workspace files, keep app valid, summarize changed files
7. Run `session.prompt(...)` and wait for completion.
8. Collect changed files by comparing workspace before/after.
9. Return final assistant text plus file changes.

Acceptance criteria:

- Pi can edit `/src/App.tsx` in the temp workspace.
- Returned changed files update the browser preview.
- Pi tools cannot access files outside the temp workspace.
- The model API key never enters Docker env.

## Phase 5 — Dependency and code cleanup

Tasks:

1. Remove client dependencies:
   - `@ai-sdk/react`
   - `ai`
2. Remove server dependencies:
   - `ai`
   - `@openrouter/ai-sdk-provider`
3. Add Pi packages to the pnpm catalog with pinned versions.
4. Remove unused AI SDK files and prompt text:
   - old `ToolLoopAgent` route code
   - browser tool schemas
   - browser tool implementations/tests that are no longer part of the app
5. Remove AI-specific skills that were only for implementation help:
   - `.pi/skills/ai-sdk/`
   - `.pi/skills/ai-elements/` if present and unused
   - update `skills-lock.json`
6. Keep almostnode, bippy, React, and the preview template.
7. Update README and env docs.
8. Update Node engine if Pi SDK requires a newer minimum.

Acceptance criteria:

- `pnpm install` succeeds with `catalogMode: strict`.
- No Vercel AI SDK imports remain.
- Client bundle no longer includes AI SDK chat tooling.
- Server builds with Pi SDK.

## Phase 6 — Validation and E2E

Tasks:

1. Unit tests:
   - request validation
   - VFS snapshot serialization
   - response apply logic
   - path guard / symlink escape rejection
   - Docker sandbox command execution
   - changed-file diff collection
2. Integration tests:
   - mock Pi runner returns file changes
   - Docker sandbox can run `node`, `npm`, and simple shell commands
3. Browser E2E:
   - ask agent to change heading text
   - verify iframe updates
   - verify server response contains changed `/src/App.tsx`
4. Security E2E:
   - malicious prompt attempts to read `/etc/passwd`
   - malicious prompt attempts to read server `.env`
   - malicious prompt attempts `docker` access
   - all fail or only access sandbox-local files
5. Standard validation:
   - `pnpm run format:check`
   - `pnpm run lint`
   - `pnpm run typecheck`
   - `pnpm run test`
   - `pnpm run build`
   - Fallow check after cleanup

Acceptance criteria:

- End-to-end request modifies preview through server Pi SDK.
- Security tests show sandbox isolation.
- Full repo validation passes.

## Phase 7 — Hardening and follow-ups

Tasks:

1. Add job queue/concurrency limit so multiple requests do not exhaust Docker resources.
2. Add request cancellation from client to server and sandbox.
3. Add optional progress streaming after stable JSON mode:
   - queued
   - sandbox started
   - tool running
   - file changes ready
4. Add workspace cache only if needed:
   - never cache secrets
   - never share writable workspaces across users/jobs
5. Add package-install policy:
   - default `npm install --ignore-scripts`
   - no auth tokens
   - timeout and network limits
6. Add audit logging without file contents unless debugging is explicitly enabled.
7. Consider no-network sandbox mode for edits that do not need dependency installation.

Acceptance criteria:

- Resource exhaustion is bounded.
- Operations are cancellable.
- Logs are useful without leaking prompt/file contents by default.

## Migration order summary

1. Land the client/server snapshot contract with a mock runner.
2. Land Docker sandbox and path guards.
3. Land Pi SDK runner with sandbox-backed tools.
4. Remove AI SDK/browser tool code.
5. Run full validation and security E2E.

Do not remove the current working flow until the mock runner and Docker sandbox path are both validated.