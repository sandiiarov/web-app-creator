# AI tool implementation plan

## Goal

Migrate from one-shot full-file JSON editing to an AI SDK tool-loop where filesystem/package tools execute in the browser against the live almostnode instance.

Do **not** copy the whole `VirtualFS` to the Node server. The server should spend CPU only on AI generation and tool-call streaming. The browser owns the preview state, `VirtualFS`, `ViteDevServer`, `ServerBridge`, HMR, and package resolution.

## Correct architecture

1. User submits an edit request from the client.
2. Client sends only chat messages plus small context to the server:
   - user prompt
   - selected element/source context from bippy
   - optional compact workspace hints, such as known editable paths
   - **not** a full workspace snapshot
3. Server uses OpenRouter + AI SDK `ToolLoopAgent`/UI message streaming.
4. Server defines tool schemas but **does not provide `execute` handlers** for almostnode tools.
5. Tool calls stream to the browser as AI SDK UI message tool parts.
6. Client `useChat` handles tool calls with `onToolCall` and executes them directly against the live almostnode `VirtualFS`/dev-server.
7. Client calls `addToolOutput` with bounded results.
8. `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` sends tool results back to the server so the model can continue.
9. Final assistant response is text/status only; file changes have already been applied in the browser through client tools and HMR.

This preserves the almostnode security/cost model: no server filesystem access, no server package installation, no server-side execution of generated app code, and no whole-project uploads.

## AI SDK notes verified from local docs

- Client-side tools are supported by `useChat` through `onToolCall`.
- Client tool results must be submitted with `addToolOutput`.
- Do not `await addToolOutput` inside `onToolCall` when using automatic submission.
- Use `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` for multi-step client-tool loops.
- Check `toolCall.dynamic` first for TypeScript narrowing.
- For an agent route in a custom Node `http` server, use `ToolLoopAgent` with `pipeAgentUIStreamToResponse({ response, agent, uiMessages })`.

## Server responsibilities

- Read server-side markdown system prompt from `apps/server/src/prompts/system-prompt.md`.
- Create OpenRouter model from explicit env config.
- Define agent/tool schemas with `inputSchema` only for client-executed tools.
- Stream UI messages from `POST /agent`.
- Validate only protocol-level request shape and selected context size.
- Never read/write host project files for generated app changes.
- Never install npm packages on the Node server for generated apps.

## Client responsibilities

- Own the almostnode objects and tool implementations.
- Keep references to:
  - `VirtualFS`
  - `ViteDevServer`
  - optional `ServerBridge`
  - editable path registry
- Execute tools in `onToolCall`.
- Return bounded outputs and clear errors through `addToolOutput`.
- Apply writes/edits immediately to VFS so HMR updates the iframe.
- Restrict all tool file access to `/src/*`; do not read or write `/package.json`, `/index.html`, or other VFS roots.

## Tool specs

Tool names, argument names, and descriptions should mirror pi coding-agent tools wherever the behavior overlaps. The implementation boundary is different: tool calls execute in the browser against almostnode, not in the agent server process.

### read

Pi-compatible args:

- `path: string` — Path to the file to read (relative or absolute).
- `offset?: number` — Line number to start reading from (1-indexed).
- `limit?: number` — Maximum number of lines to read.

Pi-compatible description:

> Read the contents of a file. Supports text files and images (jpg, png, gif, webp). Images are sent as attachments. For text files, output is truncated to 2000 lines or 50KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete.

Client behavior:
- Normalize relative paths into the browser VFS root.
- Validate path is under `/src/`.
- Read from live `VirtualFS`.
- Return bounded text output through `addToolOutput`; return `output-error` for invalid paths or read errors.

E2E: ask the agent to read `/src/App.tsx` and summarize what component it exports.

### write

Pi-compatible args:

- `path: string` — Path to the file to write.
- `content: string` — Content to write to the file.

Pi-compatible description:

> Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Automatically creates parent directories.

Client behavior:
- Normalize relative paths into the browser VFS root.
- Validate path is under `/src/`.
- Write directly to live `VirtualFS`.
- Return bounded text output through `addToolOutput`; return `output-error` for invalid paths or write errors.

E2E: ask the agent to create `/src/components/Hero.tsx` and import/use it from `/src/App.tsx`.

### edit

Pi-compatible args:

- `path: string` — Path to the file to edit (relative or absolute).
- `edits: Array<{ oldText: string; newText: string }>` — One or more targeted replacements. Each edit is matched against the original file, not incrementally.
- `edits[].oldText: string` — Exact text for one targeted replacement. It must be unique in the original file and must not overlap with any other edits[].oldText in the same call.
- `edits[].newText: string` — Replacement text for this targeted edit.

Pi-compatible description:

> Edit a single file using exact text replacement. Every edits[].oldText must match a unique, non-overlapping region of the original file. If two changes affect the same block or nearby lines, merge them into one edit instead of emitting overlapping edits. Do not include large unchanged regions just to connect distant changes.

Client behavior:
- Normalize relative paths into the browser VFS root.
- Validate path is under `/src/`.
- Read current live file content from `VirtualFS`.
- Apply all edits against the original file content, not incrementally.
- Require each `oldText` to be non-empty, unique, and non-overlapping.
- Preserve BOM and original line endings like pi-agent.
- Write replacement back to `VirtualFS`.
- Return `Successfully replaced ${edits.length} block(s) in ${path}.`; return `output-error` for invalid paths or edit errors.

E2E: select heading, ask for a focused text/color change, verify iframe HMR updates.

### find

Input: `{ pattern: string, include?: string, caseSensitive?: boolean }`

Client behavior:
- Search live `VirtualFS` text files under allowed roots.
- Use regex with defensive error handling.
- Return bounded `{ ok, matches: [{ path, line, text }], truncated?, error? }`.

E2E: ask the agent to find `preview-card` and update the matching CSS rule.

### ls

Input: `{ path?: string, pattern?: string }`

Client behavior:
- List paths from live `VirtualFS` under allowed roots.
- Filter with a small glob-like matcher.
- Return bounded `{ ok, entries, truncated?, error? }`.

E2E: ask the agent to list files, discover `/src/style.css`, then modify it.

### npm-install

Deferred while tool access is restricted to `/src/*`. Installing packages would require reading/writing `/package.json`, so this tool should not be exposed unless dependency manifests are explicitly allowed later.

## Implementation phases

1. Replace `/api/edit` JSON response flow with the `/agent` UI-message streaming route while preserving OpenRouter-only config.
2. Add server tool schemas with no execute handlers and a system prompt that tells the model these tools run in the browser.
3. Add client `useChat` transport and `read` tool execution against live `VirtualFS`; E2E.
4. Add `write`; E2E new component file/full-file overwrite.
5. Add `edit`; E2E selected-element edit.
6. Add `find`; E2E CSS search/edit.
7. Add `ls`; E2E discovery workflow.
8. Keep `npm-install` disabled unless dependency manifests are explicitly allowed later.
9. Add bounded tool-output UI/logging for debugging.
10. Run full validation: format, lint, typecheck, build, Fallow.

## AI SDK DevTools

Optional local-only debugging:
- Install `@ai-sdk/devtools` only if needed.
- Wrap the OpenRouter model with `wrapLanguageModel` + `devToolsMiddleware()` in development.
- Inspect `.devtools/generations.json` or run `npx @ai-sdk/devtools`.
- Do not make DevTools required for production.
