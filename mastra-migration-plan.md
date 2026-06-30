# Mastra Migration Plan

Migrate the landing-page agent from the Vercel AI SDK `ToolLoopAgent` to **Mastra**, following the structure the `create mastra` CLI scaffolds.

## Goals & Constraints

- **Agent loop + structure**: Mastra `Agent` (`@mastra/core`), project laid out like `create mastra` output (`src/mastra/{index.ts, agents/, tools/, lib/}`).
- **Single endpoint**: `POST /agent` is the only route. Server is already stripped to this one endpoint (see Phase 1 results).
- **Design knowledge via Mastra Skills**: the design skill ships as an inline `createSkill({ instructions, references })` attached to the agent — **not** a 53K-token system prompt. The 26 reference files become the skill's `references` map, loaded on demand via the auto-added `skill_read`/`skill_search` tools.
- **LLM traffic**: Baseten only, via the **raw OpenAI-compatible API** (`https://inference.baseten.co/v1`). No `@ai-sdk/baseten`, no Mastra model router. Mastra's built-in client (from `OpenAICompatibleConfig`) POSTs Baseten directly.
- **Observability**: enabled. `@mastra/observability` with `MastraPlatformExporter` (hosted) + `MastraStorageExporter` (local). Auth via `MASTRA_PLATFORM_ACCESS_TOKEN` (+ `MASTRA_PROJECT_ID`); self-disables if absent.
- **Input**: `{ prompt: string, model?: string }` — nothing else.
- **Workspace**: a single in-memory `/index.html` string. Tools only touch that string.
- **Tools** (3): `read` (`offset`, `limit`, `intent`), `edit` (`oldText`, `newText`, `intent`), `grep` (`pattern`, `context`, `intent`). Logic stolen from pi `edit-diff.ts` / `grep.ts`.
- **Output**: custom SSE stream on `POST /agent` — `thinking`, `text`, `tool_call` (with `intent` + `state`), `html` (full file after each successful edit), `stats`, `error`, `done`.
- **Client**: drop `useChat`; small hand-written SSE parser. Conversation renders: user → thinking → `[tool][status] intent` → text → `[tool][status] intent (html swap)` → … → final text → `[stats]`.

## Wire format (SSE)

| event | payload | when |
|---|---|---|
| `thinking` | `{ delta }` | each `reasoning-delta` chunk |
| `text` | `{ delta }` | each `text-delta` chunk |
| `tool_call` | `{ id, tool, intent, state }`, `state ∈ start\|input\|running\|done\|error` | tool-call lifecycle |
| `html` | `{ html }` | after a **successful `edit`** tool-result (full `/index.html`) |
| `stats` | `{ usage, cost, durationMs, model }` | on `finish` |
| `error` | `{ message }` | on error / aborted |
| `done` | `{}` | stream end |

---

## Phase 0 — Research

**Task:** Resolve every architectural unknown before writing code: Mastra+Baseten model wiring, the observability env vars, the CLI project layout, the stream chunk taxonomy, and the pi tool logic to steal.

- [x] Scrape Mastra docs: agents overview, using-tools, models, AI-SDK integration, observability overview + platform exporter.
- [x] Confirm Mastra `Agent.model` accepts a model **object** and that `MastraModelConfig` union includes `OpenAICompatibleConfig` (→ no provider package needed).
- [x] Learn Baseten raw wire format from `@ai-sdk/baseten` source (URL, auth, error shape) — without depending on it.
- [x] Spike: Mastra `Agent` + `OpenAICompatibleConfig` + one tool against real Baseten; capture chunk types + usage.
- [x] Resolve observability auth: read `@mastra/observability` source for env var names + precedence + self-disable behavior.
- [x] Confirm `MASTRA_API_TOKEN` is not read by Mastra; user renamed to `MASTRA_PLATFORM_ACCESS_TOKEN`.
- [x] Scaffold `create mastra` reference project (`.scratch/mastra-ref`) to capture canonical structure + deps + scripts.
- [x] Fetch pi `edit-diff.ts` + `grep.ts` source; identify the routines to port.

**Results:**
- ✅ **Mastra accepts a raw-config model object**: `MastraModelConfig` = `... | OpenAICompatibleConfig | MastraLanguageModel` (from `llm/model/shared.types.d.ts`); `Agent.model?: DynamicArgument<MastraModelConfig>`. So `model: { id, url, apiKey }` → Mastra's built-in OpenAI-compatible client calls Baseten raw. **No `@ai-sdk/baseten`, no router.**
- ✅ **Baseten raw wire**: `POST https://inference.baseten.co/v1/chat/completions`, `Authorization: Bearer <BASETEN_API_KEY>`, OpenAI-compatible SSE + tool calls, errors `{ error: string }`. (Learned from `@ai-sdk/baseten` source; not importing it.)
- ✅ **Spike passed**: Mastra `Agent({ model: { id: 'baseten/zai-org/GLM-5.2', url, apiKey }, tools: { echoTool } })`, `agent.stream(...).fullStream` emitted `start → step-start → tool-call-input-streaming-start → tool-call-delta(×5) → tool-call-input-streaming-end → tool-call → tool-result → step-finish → text-start → text-delta(×13) → text-end → step-finish → finish`; `finishReason: 'stop'`; tool invoked with `{ value, intent }` and echoed result.
- ✅ **Usage**: `await stream.usage` = `{ inputTokens, outputTokens, totalTokens, reasoningTokens, cachedInputTokens, raw }`. Baseten returns `cachedInputTokens`.
- ✅ **Observability auth resolution** (from `@mastra/observability/dist/index.js:6487`):
  `config.accessToken || process.env.MASTRA_PLATFORM_ACCESS_TOKEN || process.env.MASTRA_CLOUD_ACCESS_TOKEN`.
  Needs `MASTRA_PROJECT_ID` for platform export. If no token → exporter self-disables at debug level (local storage still works). User renamed token → `MASTRA_PLATFORM_ACCESS_TOKEN` ✅.
- ✅ **`MASTRA_API_TOKEN` is read by nothing** in Mastra (docs + package source grep).
- ✅ **CLI layout** (`.scratch/mastra-ref`): `src/mastra/{index.ts, agents/, tools/, workflows/, scorers/}`; `index.ts` = `new Mastra({ agents, storage, logger, observability })`; deps `@mastra/core`, `@mastra/observability`, `@mastra/libsql`, `@mastra/duckdb`, `@mastra/loggers`, `zod`; dev `mastra`; scripts `mastra dev/build/start`.
- ✅ **pi edit logic to port**: `normalizeToLF`, `stripBom`, `normalizeForFuzzyMatch`, `fuzzyFindText` (exact → fuzzy), uniqueness (`countOccurrences`), overlap + no-change guards, `applyReplacementsPreservingUnchangedLines`. All operate on a string → trivial to adapt to in-memory.
- ✅ **pi grep logic to port**: line-based regex/literal match, `context` lines, `limit` matches, long-line truncation — adapt to the single in-memory string.

**Gotchas:**
- ⚠️ `finish` chunk's `usage` payload was **`undefined`** — must use the `await stream.usage` promise.
- ⚠️ **`toolName` in chunks = the object key** in `tools: { read }`, not the tool's `id`. Name keys `read`/`edit`/`grep` to match the UI.
- ⚠️ Bare-import resolution in ad-hoc scripts is from the file's dir, not cwd — symlink `node_modules` when spiking.
- ⚠️ `zod` was not a direct dep of `apps/server`; added `zod@^4.4.3`.
- ⚠️ Cold first call can exceed 60s; set a generous request timeout in the real route.
- ⚠️ Baseten model is `specificationVersion "v3"`, but using `OpenAICompatibleConfig` sidesteps the v2/v3 concern entirely (Mastra wraps it).

---

## Phase 1 — Server strip + Mastra project structure + observability

**Task:** Gut the server to a single `POST /agent` endpoint, then mirror the `create mastra` layout into `apps/server/src/mastra/`; wire `Mastra` with storage + logger + observability; add the raw-Baseten model factory.

- [x] **Strip server to one endpoint.** Deleted: `landing-page-{agent,route,memory-engine,system-prompt}.ts`, `agent-controller*`, `agent-request*`, `sbx-orchestrator*`, `sandbox-chat-registry*`, `preview-tools*`, `model-gateway*`, `test-helpers.ts`. Removed `/health`, `/landing-agent`, `/internal/model-gateway`, `/preview/*` routes.
- [x] **Slim `config-env.ts`** → `{ baseten: {apiKey, defaultModel, url}, host, port, clientOrigin, mastra: {platformAccessToken, projectId} }`. Dropped sandbox/gateway/firecrawl/app config.
- [x] **Rewrite `index.ts`** → single `POST /agent` route (validates `{ prompt, model? }`, returns 501 until Mastra wired). CORS preflight kept.
- [x] **Rewrite `.env`** → Baseten + Mastra observability vars only.
- [x] typecheck ✓, lint ✓, test ✓ (7/7), boot + route smoke (404s for removed routes, 501 for `/agent`, 204 preflight).
- [x] Add deps to `apps/server`: `@mastra/core`, `@mastra/duckdb`, `@mastra/libsql`, `@mastra/loggers`, `@mastra/observability` (catalog entries added to `pnpm-workspace.yaml`); dev `mastra` (CLI). `pnpm install` → +184 packages.
- [x] `apps/server/src/mastra/index.ts` — `new Mastra({ storage: MastraCompositeStore(LibSQL default + DuckDB observability), logger: PinoLogger, observability: Observability({ exporters: [MastraStorageExporter, MastraPlatformExporter], SensitiveDataFilter }) })`. No agents yet (Phase 2).
- [x] `apps/server/src/mastra/lib/baseten-model.ts` — `basetenModel(modelId?)` → `OpenAICompatibleConfig { id: \`baseten/${id}\`, apiKey, url }`.
- [x] Wire `MASTRA_PLATFORM_ACCESS_TOKEN` + `MASTRA_PROJECT_ID` (placeholders in `.env`).
- [x] Smoke test: import `mastra`, confirm it boots with and without token; storage + observability wired.

**Results:**
- ✅ Server is a clean single-endpoint shell. `POST /agent` validates `{ prompt: string, model?: string }` and returns `501 { error, model, ok:false }` until the Mastra agent lands (Phase 2). All other routes → `404`; `OPTIONS` → `204`. Source is down to 5 files: `index.ts`, `config.ts`, `config-env.ts` (+test), `http-body.ts`.
- ✅ **Deps pruned**: removed `@ai-sdk/baseten`, `@ai-sdk/openai-compatible`, `ai` (Vercel AI SDK), `firecrawl` + the 4 `sandbox:*` docker scripts. `pnpm install` dropped **22 packages**. Server deps are now `@mastra/core`, `@mastra/duckdb`, `@mastra/libsql`, `@mastra/loggers`, `@mastra/observability`, `zod` (+ dev `mastra` CLI).
- ✅ **Deleted `apps/server/sandbox/`** (Dockerfile + runner + skills) — dead sbx infrastructure, no references.
- ✅ **Mastra instance boots** (`src/mastra/index.ts`): composite store `id: landing-page-agent` (LibSQL default + DuckDB observability domain), real `Observability` entrypoint (not a no-op), both storage backends init. Verified with token absent **and** present — neither breaks construction.
- ✅ `BASETEN_API_KEY` (len 41) comes from the shell; `--env-file-if-exists=.env` does not override existing process env.
- ✅ Final checks pass: typecheck, lint, test (7/7), build all clean; `dist/mastra/index.js` compiles.

**Gotchas:**
- ⚠️ `--env-file-if-exists=.env` does **not** override shell-exported vars — keep real secrets out of the file.
- ⚠️ `perfectionist/sort-modules` (functions) and `perfectionist/sort-objects` (object keys) both enforce alphabetical order — run `pnpm lint:fix` after structural rewrites.
- ⚠️ `catalogMode: strict` requires a `pnpm-workspace.yaml` catalog entry for **every** dep; added entries for all 5 new `@mastra/*` packages + `mastra` CLI.
- ⚠️ The CLI scaffold uses `await new DuckDBStore().getStore('observability')` (top-level await), but `DuckDBStore` exposes a **synchronous `.observability` accessor** — used that instead to avoid async boot.
- ⚠️ `MastraCompositeStore` exposes `id` but **not** `.default`/`.observability` as readable props — can't introspect sub-stores that way; trust construction.
- ⚠️ DuckDB eagerly creates `mastra.duckdb` (~2M) on construction; LibSQL is lazy (`mastra.db` on first write). Both gitignored under `# Mastra local stores`.

---

## Phase 2 — HTML store + 3 tools + design Skill + landing agent

**Task:** Build the single-file `/index.html` workspace, the 3 pi-derived tools, the inline **design Skill** (`createSkill`), and the landing-page `Agent`. Verify via a script.

- [x] `apps/server/src/mastra/lib/html-store.ts` — single-string store with placeholder seed.
- [x] `apps/server/src/mastra/lib/edit-diff.ts` — ported pi routines (LF normalize, BOM strip, fuzzy match, uniqueness, overlap, no-change) as pure string functions.
- [x] `apps/server/src/mastra/lib/grep-search.ts` — in-memory line-based regex/literal search with context + truncation.
- [x] `apps/server/src/mastra/tools/read.ts` — `{ offset?, limit?, intent }` → numbered lines.
- [x] `apps/server/src/mastra/tools/edit.ts` — `{ oldText, newText, intent }` → apply to store; returns `{ ok, bytes, changedLines, html }`.
- [x] `apps/server/src/mastra/tools/grep.ts` — `{ pattern, context?, literal?, ignoreCase?, limit?, intent }`.
- [x] `apps/server/src/mastra/skills/design-skill.ts` — `createSkill({ instructions, references })` with all 25 design reference files inlined from `~/.pi/agent/skills/design`. Agent auto-gets `skill`/`skill_read`/`skill_search`.
- [x] `apps/server/src/mastra/agents/landing-page-agent.ts` — `createLandingPageAgent(store, modelId)` factory; per-request Agent with `mastra` ref for observability.
- [x] Verified via end-to-end server test: agent reads skill, calls read/edit/grep, mutates store, emits HTML.

**Results:**
- ✅ All 3 tools work as Mastra `createTool` factories closing over a per-request `HtmlStore`. Tools named `read`/`edit`/`grep` (object keys = chunk `toolName`).
- ✅ Design skill loads 25 references from disk at module init (~200KB). Agent reads them on-demand via `skill_read` — instructions stay ~6.5K tokens (below the 50K all-in-prompt approach).
- ✅ Agent factory creates a fresh `Agent` per request with the shared `mastra` instance passed for observability/storage wiring.
- ✅ pi fuzzy-match logic ported faithfully: exact → fuzzy-normalized match, uniqueness check, overlap detection, no-op guard. Works on strings (no fs).

**Gotchas:**
- ⚠️ `noUncheckedIndexedAccess` is on — every array access needs `!` or `?? fallback`. Ported pi code needed ~12 non-null assertions.
- ⚠️ Mastra logs a warning: "Instructions have ~6542 estimated tokens (recommended: <5000)" — acceptable; the skill body includes the pi SKILL.md as reference.
- ⚠️ The agent factory must pass `mastra` to the `Agent` constructor for per-request agents to get observability (can't register a singleton since the store is per-request).

---

## Phase 3 — SSE protocol + wire `/agent`

**Task:** Replace the `POST /agent` 501 stub with the real handler streaming the custom SSE protocol by mapping Mastra `fullStream` chunks.

- [x] `apps/server/src/mastra/lib/sse.ts` — `sendSse(res, event, payload)` + `startSse(res)`.
- [x] `apps/server/src/mastra/lib/cost.ts` — Baseten pricing table + provider-cost extraction fallback.
- [x] `apps/server/src/mastra/route.ts` — `streamLandingAgent()` maps chunks: `reasoning-delta`→`thinking`, `text-delta`→`text`, tool lifecycle→`tool_call` (intent tracked from `tool-call` chunk), `tool-result` of `edit`+ok→`html`, `finish`→`stats`, `error`→`error`, finally→`done`.
- [x] Wired into `index.ts` `handleAgent` (replaced 501 stub).
- [x] Abort: `request.on('close')` → AbortController → `error { message:'stopped' }` + `done`.
- [x] `modelSettings: { maxOutputTokens: 16_384 }` to prevent `finishReason: 'length'`.
- [x] curl/fetch test: 5 HTML swaps, `finishReason: 'stop'`, cost $0.12, 431K tokens.

**Results:**
- ✅ Full custom SSE protocol streams correctly: thinking, text, tool_call (start→running→done states with intent), html (full file after each edit), stats (usage + cost + duration), error, done.
- ✅ Cost estimation works: provider cost extraction from `usage.raw` first, then pricing-table fallback (GLM-5.2: $0.60/M in, $2.20/M out; Kimi: $0.60/M in, $2.50/M out).
- ✅ Intent tracking: stored from the `tool-call` chunk (args.intent), echoed on `tool-result` done/error states (tool-result args can be absent).

**Gotchas:**
- ⚠️ **`maxOutputTokens` is critical**: without it, the model defaults to a low output limit and hits `finishReason: 'length'` mid-edit (the full-page HTML as `newText` is large). Setting `modelSettings: { maxOutputTokens: 16_384 }` in the stream call fixed it.
- ⚠️ `finish` chunk's `payload.output.usage` may be present, but `await stream.usage` is the reliable accessor (confirmed from Phase 0 spike).
- ⚠️ `perfectionist/sort-switch-case` requires cases alphabetically ordered (error before reasoning-delta before text-delta before tool-call...).

---

## Phase 4 — Client SSE parser + conversation model

**Task:** Replace `useChat` with a small `fetch` SSE parser building the conversation shape.

- [x] `apps/client/src/lib/sse-client.ts` — `streamSSE(url, body, { onEvent, signal })`: POST, parse `text/event-stream`, yield `{ event, data }`.
- [x] `apps/client/src/lib/landing-agent.ts` (rewritten) — new types: `TurnPart` (thinking/text/tool_call/stats), `LandingTurn`, SSE event types, formatting utilities.
- [x] `apps/client/src/hooks/use-landing-page.ts` (rewritten): `turns`, `html`, `isStreaming`, `model`, `send(prompt)`, `stop()`. Fire-and-forget send; thinking/text deltas accumulated; tool_call parts updated by id; html events update preview.
- [x] Dropped `useChat`, `@ai-sdk/react`, `ai` SDK from client deps.

**Results:**
- ✅ Custom SSE parser correctly accumulates deltas (consecutive thinking/text deltas merged into single parts), tracks tool_call lifecycle by id, and swaps HTML on `html` events.
- ✅ `send` is fire-and-forget (clears prompt immediately); `stop` aborts via AbortController.
- ✅ Client deps pruned: removed `@ai-sdk/react`, `ai` (+ catalog entries).

**Gotchas:**
- ⚠️ The old hook used `onResult` callback for HTML; new hook exposes `html` state directly + optional `onHtml` callback.
- ⚠️ `onSend` type changed from `(prompt) => Promise<boolean>` to `(prompt) => void` — prompt-panel handler simplified.

---

## Phase 5 — Client UI

**Task:** Render the conversation per spec; swap preview HTML without flicker.

- [x] `turn-message.tsx` — renders parts linearly: user prompt → thinking (muted italic) → tool_call rows → text bubble (ghost) → stats. Error bubble on failure.
- [x] `turn-steps.tsx` — renders `ToolCallPart[]` with tool labels (Reading/Editing/Searching/Loading skill) + state icons (spinner→check/error).
- [x] `turn-metadata.tsx` — collapsible stats: model, cost, tokens, duration, finish reason, token breakdown (in/out/cached/reasoning).
- [x] `panel-status.ts` — adapted: `generating` while streaming, `done` when parts exist, `error` on turn error.
- [x] `prompt-panel.tsx` — `onSend` type changed to `void`, handler simplified.
- [x] `App.tsx` — uses `landing.html` directly; `hasLanding` checks turns length.

**Results:**
- ✅ Full conversation renders correctly: thinking block, tool call rows with intents, assistant text, expandable stats.
- ✅ Preview swaps HTML via almostnode HMR (no flicker).
- ✅ Send→Stop swap while streaming; Stop aborts via AbortController.
- ✅ Empty state, model menu, panel collapse all preserved.

**Gotchas:**
- ⚠️ Parts render linearly (not grouped) — consecutive tool_calls appear as separate rows, which is fine visually.

---

## Phase 6 — Cleanup + verification

**Task:** Remove dead code; verify end-to-end.

- [x] Pruned orphaned deps: `@ai-sdk/react`, `ai` from client; catalog entries cleaned.
- [x] Added missing shadcn scroll utilities (`scroll-fade-b`, `scrollbar-thin`, `scrollbar-gutter-stable`) to `packages/ui/globals.css`.
- [x] `pnpm -r typecheck` ✓ (all packages), `pnpm -r lint` ✓ (warnings only), `pnpm -r build` ✓.
- [x] Server test (Mastra route): real prompt → real HTML, cost > 0, stats present.
- [x] Browser e2e: prompt → thinking renders → tool calls → text → HTML preview swap → stats (104k tokens, $0.036, 35s) → DONE.

**Results:**
- ✅ **Full migration complete.** Server is a single `POST /agent` endpoint backed by Mastra Agent + raw Baseten API + custom SSE protocol. Client is a custom SSE parser rendering the conversation model.
- ✅ Browser-verified: agent built a timer-app landing page ("Stint") with working timer, warm palette, no rounded corners, design-skill-driven output.
- ✅ Observability: `MastraStorageExporter` (local DuckDB) works; `MastraPlatformExporter` (hosted) gracefully pauses on auth failure when `MASTRA_PROJECT_ID` is absent.
- ✅ Final checks: typecheck ✓, lint ✓, test (7/7 server) ✓, build ✓ across all packages.

**Gotchas:**
- ⚠️ **Tool calls need the `type` discriminator set client-side.** The server sends `tool_call` SSE events *without* a `type` field; the client's `PartView` switches on `part.type === 'tool_call'`, so without `{ ...payload, type: 'tool_call' }` the parts silently hit `default → null` and never render. Fixed in `use-landing-page.ts`.
- ⚠️ **Consecutive tool calls should be grouped.** Rendering each `tool_call` part as its own bordered box creates visual noise. `turn-message.tsx` now clusters consecutive tool_call parts into one `TurnSteps` block.
- ⚠️ `MASTRA_PLATFORM_ACCESS_TOKEN` from `mastra auth tokens create` (`sk_...`) is the **wrong token type** for observability — it's a generic API token, rejected with 401 by the observability endpoint. The observability-scoped token only comes from `mastra init --observability`, which refuses to re-run on an existing project.
- ⚠️ **`MastraPlatformExporter` auth failure poisons the batch.** When the platform exporter gets a 401, its cooldown takes down the flush including the local `MastraStorageExporter`'s spans (they're dropped). For local dev, use `MastraStorageExporter` only (removed `MastraPlatformExporter`).
- ⚠️ `mastra dev` writes DBs to `src/mastra/public/` (its cwd), and runs Studio+API on **:3001** (its default, since it bundles our config). Our custom `index.ts` also listens on :3001 — guard `server.listen()` behind an `isMainModule` check so it only starts when run directly (`node src/index.ts`), not when imported by `mastra dev`.
- ⚠️ `--env-file-if-exists=.env` does **not** override shell-exported vars — keep real secrets out of the file. But `mastra dev -e .env` needs the real `BASETEN_API_KEY` *value* in `.env` (it doesn't inherit the shell).
- ⚠️ Circular import hazard: `mastra/index.ts` ↔ `agents/landing-page-agent.ts`. Broke it by having the agent factory accept `mastra` as a param (route passes it), and exporting a plain config object for the singleton registration.
- ⚠️ The agent must be **registered on the `Mastra` instance** (`agents: { landingPageAgent }`) for Studio to list it and attribute traces — a per-request agent isn't visible to Studio. Added a shared singleton agent + store alongside the per-request factory.
