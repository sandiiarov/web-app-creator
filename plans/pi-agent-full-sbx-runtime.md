# Plan: run the full Pi agent inside Docker Sandboxes

> Superseded: the in-sandbox Pi runner was replaced with a Vercel AI SDK `ToolLoopAgent` runner while preserving the Docker Sandbox orchestration and host-only OpenRouter gateway.

## Decision

Run the whole Pi Agent SDK runtime inside a Docker Sandbox (`sbx`) instead of running Pi in the host Node server with guarded host-side filesystem operations.

The host server becomes an orchestrator only:

- receives chat requests from the browser
- starts or reuses an `sbx` sandbox for the chat
- sends the preview snapshot into the sandbox
- executes an in-sandbox Pi runner
- reads the runner response
- returns changed files to the browser

All agent reasoning, model calls, file operations, dependency installs, format/lint/typecheck/build commands, and bash commands happen inside the Docker Sandbox microVM.

## Installed prerequisite

`sbx` was installed with Homebrew:

```bash
brew install docker/tap/sbx
```

Current local status:

```txt
Client Version: v0.31.2
Server Version: v0.31.2
Signed in locally as alex4s
```

Local setup requires Docker Sandbox daemon/login:

```bash
sbx daemon start
sbx login
```

## Target architecture

```txt
Browser almostnode VirtualFS
  └─ sends prompt + chatId + full snapshot

Host Node server
  ├─ parses JSON shape only
  ├─ resolves chatId -> sandboxName or creates sandbox
  ├─ copies snapshot payload into sandbox
  ├─ runs in-sandbox Pi runner with sbx exec
  ├─ copies response JSON out of sandbox
  └─ returns changed files/deleted paths/message

Docker Sandbox microVM
  ├─ contains the Pi Agent SDK runner
  ├─ contains global dev tools and configs
  ├─ contains chat workspace files
  ├─ runs npm/pnpm install for app deps when needed
  ├─ runs Pi SDK inside the sandbox through the host model gateway
  ├─ runs file tools and bash locally inside the sandbox
  └─ writes response JSON for host server
```

## Request parsing policy

For now, request handling should only verify JSON/data types enough to avoid server crashes:

- request body is JSON object
- `prompt` is a string
- `files` is an array
- each file has string `path` and string `content`
- `chatId` is optional string
- selected element/context can remain opaque JSON

Do not reject paths because they are outside the preview editable project. The sandbox boundary is the security boundary. Any path normalization needed for writing files should happen inside the sandbox workspace, not as host security logic.

The host server should never materialize arbitrary request file paths directly on the host filesystem. It should copy a single fixed-name payload file into the sandbox or stream JSON over stdin.

## Chat/sandbox lifecycle

Add chat-aware sandbox management.

Request:

```ts
type AgentRequest = {
  chatId?: string
  files: Array<{ content: string; path: string }>
  prompt: string
  selectedElement?: unknown
  selectedJsx?: string
  version: 1
}
```

Response:

```ts
type AgentResponse = {
  chatId: string
  changedFiles: Array<{ content: string; path: string }>
  deletedPaths: string[]
  diagnostics: string[]
  message: string
  ok: true
}
```

Server behavior:

1. If `chatId` is missing or unknown, create a new sandbox and return the new `chatId`.
2. If `chatId` is known, reuse the sandbox.
3. Keep a host-side in-memory map initially:

```ts
type ChatSandbox = {
  chatId: string
  sandboxName: string
  createdAt: number
  lastUsedAt: number
  status: 'creating' | 'ready' | 'running' | 'failed'
}
```

4. Add TTL cleanup for idle sandboxes.
5. Later persist the mapping if needed.

For the first implementation, the runner can still process one request at a time, but the sandbox/workspace should be reusable by chat ID.

## Sandbox image/template

Create a Docker Sandbox template image, for example:

```txt
apps/server/sandbox/Dockerfile
apps/server/sandbox/config/oxlint.config.ts
apps/server/sandbox/config/oxfmt.config.ts
apps/server/sandbox/config/tsconfig.preview.json
apps/server/sandbox/runner/
```

Base image:

```dockerfile
FROM docker/sandbox-templates:shell
```

Install globally in the template, not in the preview app `package.json`:

- Node runtime already supplied by the base image if available; otherwise install/pin it.
- pnpm package manager.
- `@earendil-works/pi-coding-agent`.
- `@earendil-works/pi-ai`.
- `@typescript/native-preview` / `tsgo`.
- `typescript` if needed for transforms/language services.
- `oxlint`.
- `oxfmt`.
- `vite`.
- React/Vite helpers if the runner needs them.

Keep global configs in the sandbox image:

```txt
/opt/web-app-creator/config/oxlint.config.ts
/opt/web-app-creator/config/oxfmt.config.ts
/opt/web-app-creator/config/tsconfig.preview.json
```

The preview `package.json` should not include these development tools. The sandbox development stack owns them globally.

## Internal model gateway and custom Pi provider

Because the full Pi agent runs inside the sandbox, direct model requests would normally require credentials inside the sandbox. Instead, keep `OPENROUTER_API_KEY` only in the host server and expose a host-local model gateway that is reachable only from sandboxes.

Host server responsibilities:

- Do not provide a custom agent system prompt; the in-sandbox runner must use Pi's default system prompt.
- Start an internal OpenAI-compatible gateway on `127.0.0.1` and a dedicated port, or mount it as a private route on the existing server with strict token auth.
- Accept OpenAI Chat Completions-compatible requests from the sandbox.
- Inject `Authorization: Bearer ${OPENROUTER_API_KEY}` server-side.
- Forward streaming SSE responses from OpenRouter unchanged.
- Never expose `OPENROUTER_API_KEY` to the sandbox, request payload, logs, or process env passed to `sbx`.

Sandbox responsibilities:

- Use a Pi custom provider that points at the host gateway.
- Use a per-chat random gateway token, not the OpenRouter key.
- Reach the host gateway through `host.docker.internal:<port>`.

Provider extension shape:

```ts
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

export default function (pi: ExtensionAPI) {
  const baseUrl = requiredEnv('WEB_APP_CREATOR_MODEL_GATEWAY_BASE_URL')
  const modelId = requiredEnv('WEB_APP_CREATOR_MODEL_ID')

  pi.registerProvider('web-app-creator', {
    api: 'openai-completions',
    apiKey: 'WEB_APP_CREATOR_MODEL_GATEWAY_TOKEN',
    authHeader: true,
    baseUrl,
    models: [
      {
        contextWindow: 1_000_000,
        cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
        id: modelId,
        input: ['text'],
        maxTokens: 16_384,
        name: modelId,
        reasoning: true,
      },
    ],
    name: 'Web App Creator Gateway',
  })
}

function requiredEnv(name: string) {
  const value = process.env[name]

  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}
```

The sandbox receives only:

```txt
WEB_APP_CREATOR_MODEL_GATEWAY_BASE_URL=http://host.docker.internal:<port>/v1
WEB_APP_CREATOR_MODEL_GATEWAY_TOKEN=<random per-chat token>
WEB_APP_CREATOR_MODEL_ID=<configured OpenRouter model id>
```

All sandbox provider environment values are required. No default model IDs, names, URLs, tokens, ports, or provider settings.

Network policy should allow the sandbox to reach the host gateway and package registries, but not OpenRouter directly:

```bash
sbx policy allow network -g localhost:<port>
sbx policy allow network -g registry.npmjs.org:443
```

A kit can later encode these network rules, but the credential itself should remain in the host server rather than Docker Sandbox secret storage.

## In-sandbox workspace layout

Inside each sandbox:

```txt
/workspace/
  package.json
  index.html
  src/**
  .web-app-creator/
    request.json
    response.json
    session-state/
    logs/
```

The host writes/copies only fixed files such as `request.json`; the in-sandbox runner materializes the user snapshot into `/workspace`.

## In-sandbox runner responsibilities

The runner lives inside the sandbox image and runs with `node`:

```bash
sbx exec <sandbox> node /opt/web-app-creator/runner/run-agent.mjs /workspace/.web-app-creator/request.json /workspace/.web-app-creator/response.json
```

Runner steps:

1. Read `request.json`.
2. Write all snapshot files into `/workspace`.
3. Install app dependencies when needed:
   - initially run every request for simplicity
   - later cache by hash of `package.json`/lockfile
4. Start/create Pi SDK session using chat-local state and Pi's default system prompt.
5. Expose normal Pi tools inside sandbox:
   - `read`
   - `write`
   - `edit`
   - `ls`
   - `find`
   - `grep`
   - `bash`
6. Let the agent edit files and run validation commands inside the sandbox.
7. Agent should use global tools/configs:

```bash
oxfmt -c /opt/web-app-creator/config/oxfmt.config.ts --check /workspace
oxlint -c /opt/web-app-creator/config/oxlint.config.ts /workspace
tsgo --noEmit -p /opt/web-app-creator/config/tsconfig.preview.json
vite build --config /workspace/vite.config.ts
```

8. Diff `/workspace` after the run against the incoming snapshot.
9. Write response JSON.

## TypeScript policy

TypeScript files are allowed end-to-end.

- Browser/client preview can receive `.ts` and `.tsx` files.
- Sandbox workspace can contain `.ts` and `.tsx` files.
- No type stripping step is needed.
- The sandbox development stack validates TypeScript with global `tsgo` and global config.

This replaces the older idea of returning untyped JavaScript.

## Dependency policy

Two dependency layers:

1. Sandbox global development tools:
   - preinstalled in the Docker Sandbox template
   - not listed in preview `package.json`
2. Preview app runtime dependencies:
   - listed in the snapshot `package.json`
   - installed inside the sandbox workspace
   - may be cached per sandbox/chat

## Host server modules to replace/remove

Replace the current host-side Pi/file-tool path:

- remove host-side Pi SDK execution from `pi-agent-runner.ts`
- remove host-side custom file tool execution from `preview-agent-tools.ts`
- remove host-side bash tool wrapper as the active agent path

Add new host-side orchestration modules:

- `sandbox-chat-registry.ts`
- `sbx-orchestrator.ts`
- `agent-payload.ts`
- `agent-response.ts`

The host server should no longer import Pi SDK packages for normal request execution. Pi SDK dependencies should move into the sandbox image/runtime package if possible.

## Implementation phases

Each phase must end by updating this plan with a result note before starting the next phase.

### Phase 1 — cleanup

Tasks:

- Remove or disable the current host-side Pi execution path.
- Remove or disable current host-side custom file/bash operations from the active request path.
- Keep `POST /agent` as the public endpoint.
- Keep the previous implementation available only as git history, not as a runtime fallback.

Save results to this plan:

- Result: completed cleanup of obsolete host-side Pi runner, host-side custom preview tools, host-side bash sandbox wrapper, preview path guard, and preview workspace modules/tests from the active tree. The public endpoint remains `POST /agent`. No runtime fallback to host-side Pi execution is planned.

### Phase 2 — request contract and chat sandbox registry

Tasks:

- Loosen request parsing to JSON/type checks only.
- Do not reject paths based on preview project allowlists.
- Add `chatId` request/response support.
- Add in-memory chat-to-sandbox registry.
- Add idle cleanup policy hooks, even if the first TTL is simple.

Save results to this plan:

- Result: implemented type-only request parsing in `apps/server/src/agent-request.ts`, added `chatId` to success responses, and added `apps/server/src/sandbox-chat-registry.ts` with in-memory chat/sandbox records, per-chat gateway tokens, status updates, lookup by gateway token, and idle-removal hooks.

### Phase 3 — internal model gateway and custom Pi provider

Tasks:

- Add host-side OpenAI-compatible gateway endpoint for sandbox-only model access.
- Gateway validates a per-chat token and injects `OPENROUTER_API_KEY` server-side.
- Gateway forwards streaming requests/responses to OpenRouter.
- Add sandbox Pi provider extension `web-app-creator`.
- Require explicit `WEB_APP_CREATOR_MODEL_GATEWAY_BASE_URL`, `WEB_APP_CREATOR_MODEL_GATEWAY_TOKEN`, and `WEB_APP_CREATOR_MODEL_ID`; no defaults.

Save results to this plan:

- Result: implemented the host OpenAI-compatible model gateway in `apps/server/src/model-gateway.ts`, wired the private gateway route through `apps/server/src/index.ts`, added explicit required env parsing for OpenRouter/model gateway settings in `apps/server/src/config-env.ts`, and added `apps/server/sandbox/extensions/web-app-creator-provider.mjs` with required `WEB_APP_CREATOR_MODEL_GATEWAY_BASE_URL`, `WEB_APP_CREATOR_MODEL_GATEWAY_TOKEN`, and `WEB_APP_CREATOR_MODEL_ID` values and no defaults. The host no longer loads or sends a custom system prompt, so the sandbox runner uses Pi's default prompt. Server format, lint, typecheck, and tests passed.

### Phase 4 — sandbox template and global dev stack

Tasks:

- Add `apps/server/sandbox/Dockerfile`.
- Add global `oxlint`, `oxfmt`, and `tsgo` configs.
- Add runner package/script into the template.
- Install global dev tools in the sandbox image, not in preview `package.json`.
- Add scripts/docs to build and load the Docker Sandbox template:

```bash
docker build -t web-app-creator-sandbox:dev apps/server/sandbox
docker image save web-app-creator-sandbox:dev -o web-app-creator-sandbox.tar
sbx template load web-app-creator-sandbox.tar
```

Save results to this plan:

- Result: added the sandbox template under `apps/server/sandbox/` with `Dockerfile`, `.dockerignore`, runner runtime `package.json`, global `oxlint`, `oxfmt`, and `tsgo`/preview TypeScript configs, plus README instructions. Added `apps/server` scripts `sandbox:build`, `sandbox:save`, `sandbox:load`, and `sandbox:template` for building, saving, and loading `web-app-creator-sandbox:dev`. The template installs Pi runtime dependencies and global `pnpm`, `tsgo`, `typescript`, `oxlint`, `oxfmt`, and `vite` without adding them to preview `package.json` files. Added a git ignore entry for generated sandbox tar archives. Server format, lint, typecheck, tests, and build passed; template build/load was not executed because local Docker Sandbox daemon/login remains unavailable.

### Phase 5 — host orchestration with sbx

Tasks:

- Create sandbox on new chat:

```bash
sbx create --quiet --name <name> --template web-app-creator-sandbox:dev shell <workspace>
```

- Copy or stream request payload into sandbox via a fixed path.
- Execute runner with `sbx exec`.
- Read response JSON from sandbox.
- Reuse sandbox for subsequent requests with the same `chatId`.
- Add timeout and cleanup handling.

Save results to this plan:

- Result: updated `apps/server/src/sbx-orchestrator.ts` to create sandboxes with explicit resources/templates, copy a fixed host `request.json` into `/workspace/.web-app-creator/request.json` with `sbx cp`, execute the runner in `/workspace` with required model-gateway env vars, copy fixed `response.json` back out, and return runner-written error responses when available. Updated the sandbox template to create `/workspace` owned by the agent user. Added idle cleanup execution in `apps/server/src/agent-controller.ts` so expired chat sandboxes are disposed with `sbx rm --force` and their host temp workspaces removed. Added mocked orchestration tests for sandbox creation, fixed-path request/response copy, runner failure response handling, and idle cleanup. Server format, lint, typecheck, tests, and build passed; live `sbx` E2E remains blocked until daemon/login are available.

### Phase 6 — in-sandbox Pi runner

Tasks:

- Implement runner that uses Pi SDK inside sandbox.
- Use Pi's default system prompt; do not pass or load a custom server markdown system prompt.
- Use the custom `web-app-creator` provider through the host model gateway.
- Persist chat/session state under `/workspace/.web-app-creator/session-state`.
- Run validation tools globally from `/opt/web-app-creator/config`.
- Return changed files/deleted paths.

Save results to this plan:

- Result: completed `apps/server/sandbox/runner/run-agent.mjs` as the in-sandbox Pi SDK runner. It materializes the preview snapshot under `/workspace`, preserves chat session state in `/workspace/.web-app-creator/session-state`, registers the custom `web-app-creator` provider with required gateway env vars, creates the Pi session without a custom resource loader so Pi uses its default system prompt, exposes Pi's normal coding tools including bash, installs preview runtime dependencies inside the sandbox, runs global validation commands through `/opt/web-app-creator/config`, ignores generated `dist` output when diffing, and returns changed files/deleted paths/diagnostics. Updated `apps/server/sandbox/README.md` with the runner validation commands. Server format, lint, typecheck, tests, build, and Node syntax checks for the sandbox runner/provider passed; live `sbx` E2E remains blocked until daemon/login are available.

### Phase 7 — validation and dependency cleanup

Tasks:

- Remove obsolete host Pi SDK dependencies if no longer imported by the server.
- Add tests for host orchestration with mocked `sbx`.
- Add an integration test that requires local `sbx` and is skipped unless explicitly enabled.
- Run full repo validation.
- Run Fallow and clean to zero static issues.

Save results to this plan:

- Result: removed obsolete host-side Pi SDK dependencies from `apps/server/package.json`, removed the unused Pi catalog entries from `pnpm-workspace.yaml`, and refreshed `pnpm-lock.yaml` so the host workspace no longer installs Pi packages. Added `apps/server/src/sbx-orchestrator.integration.test.ts`, skipped by default and enabled only with `WEB_APP_CREATOR_ENABLE_SBX_INTEGRATION=1` plus explicit `WEB_APP_CREATOR_TEST_SBX_*` env vars. Existing mocked `sbx` orchestration tests cover creation, fixed request/response copy, runner failure responses, and idle cleanup. Added shared server test/helpers and HTTP body utilities to remove duplication, updated Fallow entries for sandbox runtime files, and kept the sandbox Pi runtime dependency ignored in Fallow because it is installed by the sandbox Dockerfile rather than the host workspace. Refactored client and sandbox-runner hotspots to clear Fallow health/duplication findings. Full validation passed: `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run build`, `node --check apps/server/sandbox/runner/run-agent.mjs`, `node --check apps/server/sandbox/extensions/web-app-creator-provider.mjs`, and `pnpm exec fallow --format json --quiet` with `total_issues 0`, `dupes 0`, and `health 0`. Live `sbx` integration remains skipped because local daemon/login/template availability is environment-dependent.

## Live `sbx` E2E and harness update

- Result: local `sbx` daemon/login now works with client/server `v0.31.2`, signed in as `alex4s`. The sandbox template `web-app-creator-sandbox:dev` was built, saved, and loaded successfully. Network policy is deny-by-default with explicit allows for the host model gateway (`host.docker.internal:3001` and `localhost:3001`) and npm registry access.
- Result: the sandbox runner now registers a Pi `agent_end` hook through `DefaultResourceLoader` so the normal Pi harness runs after each agent turn. The hook runs `lint`, `typecheck`, `format:check`, and `build`; when they pass it runs `format` and `lint:fix`, then re-runs checks. If checks fail, the runner prompts the agent to fix the harness output for up to three follow-up attempts.
- Result: preview package policy now rejects sandbox-global dev/type packages in preview `package.json`. The runner symlinks globally installed React type declarations into `/workspace/node_modules/@types` so `tsgo` resolves React types without adding `@types/react` or `@types/react-dom` to preview dev dependencies.
- Result: host orchestration now launches the runner inside the sandbox and polls the fixed response file. This avoids treating an `sbx exec` stream hang as request failure after the runner has already written `/workspace/.web-app-creator/response.json`.
- Result: real `/agent` API E2E passed with `ok: true`, `changedFiles: ["/src/App.tsx"]`, no diagnostics, no forbidden preview package additions, and updated content containing `E2E Sandbox OK`.
- Result: browser UI E2E passed with `agent-browser`: opened the client, submitted an edit prompt, and verified the iframe preview heading updated to `Browser E2E OK`.
- Result: `/agent` is now SSE-only. The server streams `status` events for host orchestration and sandbox runner phases, then emits a final `result` event and `done`. The browser parses the SSE stream through `fetch()` and displays the latest status phrase while applying the final file changes. Idle sandbox cleanup now expires Docker sandbox resources after the configured TTL without deleting the chat session/workspace record, so the same `chatId` can reopen a sandbox later.
- Result: SSE API E2E passed with 14 status events, final `ok: true`, `changedFiles: ["/src/App.tsx"]`, no diagnostics, and updated content containing `SSE Sandbox OK`. Browser SSE E2E passed with `agent-browser` by submitting a prompt and verifying the iframe heading updated to `Browser SSE OK`.
- Result: added host-side fixed preview tool endpoints for fast static checks without running arbitrary user config: `POST /preview/format`, `POST /preview/lint`, and `POST /preview/typecheck`. Typecheck uses `tsgo --noEmit -p tsconfig.preview.json` against a temp workspace with trusted generated configs and preview path allowlisting.
- Result: final validation passed: `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run build`, `node --check apps/server/sandbox/runner/run-agent.mjs`, `node --check apps/server/sandbox/extensions/web-app-creator-provider.mjs`, and `pnpm exec fallow --format json --quiet` with `total_issues 0`, duplicate groups `0`, health findings `0`, and stale suppressions `0`.

## AI SDK replacement update

- Result: replaced the in-sandbox Pi SDK runner with a Vercel AI SDK `ToolLoopAgent` runner. The host orchestration, SSE endpoint, Docker Sandbox lifecycle, and host-only OpenRouter model gateway stay in place. The sandbox runtime now installs `ai` and `@ai-sdk/openai-compatible`, exposes explicit file/search/check tools, persists lightweight chat turns under `/workspace/.web-app-creator/ai-agent-history.json`, runs the same fixed validation harness with up to three fix attempts, and no longer copies the Pi provider extension into the template. Validation passed with repo format/lint/typecheck/test/build, server checks, Fallow zero issues/dupes/health/stale suppressions, sandbox Docker build, and in-image AI SDK import/syntax checks.

## Open questions before implementation

1. Should each browser tab get one chat/sandbox, or should chat IDs survive page refresh in local storage?
2. Should idle sandboxes be deleted after 15 minutes, 1 hour, or only manually?
3. Should dependency install run every request initially, or only when `package.json` changes?
4. Should the first template use `docker/sandbox-templates:shell` or `shell-docker`?
5. Should we enforce any network policy beyond OpenRouter + npm registry at this stage?
