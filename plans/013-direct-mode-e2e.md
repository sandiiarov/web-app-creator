# Plan 013: End-to-end verification of direct-mode image delivery

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 09236e63 -- apps/server/src/mastra/route.ts apps/server/src/mastra/tools/screenshot.ts apps/server/src/mastra/lib/model-capabilities.ts patches/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (verification-only; no source edits — a script + a manual checklist)
- **Depends on**: none
- **Category**: tests / direction
- **Planned at**: commit `09236e63`, 2026-08-02

## Why this matters

Direct mode (images go straight to the chat model instead of a vision-OCR
sidecar) was rebuilt recently: capability detection
(`lib/model-capabilities.ts`), screenshot `toModelOutput` returning
multimodal content, a `pnpm patch` to the OpenRouter adapters serializing
tool-result media as `image_url` parts, and attachments as `image` parts on
the user message. Unit + wire tests pass, but nothing proves a REAL run:
that OpenRouter accepts the serialized tool message for a specific upstream
provider, that a vision-capable chat model actually answers visual QA from
the screenshots, and that logs stay base64-free in production shape. A
one-time scripted e2e closes that gap and becomes the repeatable smoke test
for future provider/patch upgrades.

## Current state (what to verify — the whole chain)

1. `supportsImageInput(textModel)` returns true for a vision-capable model
   (e.g. `google/gemini-3.6-flash`, `x-ai/grok-4.5`,
   `anthropic/claude-sonnet-5`), false for `z-ai/glm-5.2:nitro`.
2. Direct mode ON: `screenshot` tool returns captures WITH `dataUrl`s and
   `imageOcr.imagesAnalyzed = 0`; Mastra's `toModelOutput` maps the result
   to `{type:'content', value:[text, media...]}`; the patched adapter
   (`patches/@mastra__core@1.47.0.patch`, `getToolResultContent` in
   `dist/chunk-GHDHOLZS.js` + `chunk-YYUDVZJC.cjs`) serializes media parts
   as chat-completions `image_url` parts on the wire.
3. Direct mode ON, attachments: the current user message carries
   `{type:'image', image: dataUrl}` parts; `analyze_image` tool_call
   reports `Attached N image(s) to the model`; no `vision-messages.json`
   entries for the turn.
4. Fallback mode (text-only model): unchanged OCR path — `imageOcr.text`
   populated, `vision-messages.json` has the call.
5. Log hygiene: `agent-messages.jsonl` contains
   `[omitted inline image bytes]` placeholders, never `data:image/`;
   `client-messages.jsonl` likewise.
6. Stats: direct mode accrues no `vision` cost; fallback mode accrues it.

Environment prerequisites (verify BEFORE starting; missing any = STOP):

- `apps/server/.env` with `OPENROUTER_API_KEY` (real key — the run hits
  the live OpenRouter API; a failed screenshot capture needs
  `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` too, since capture uses
  Cloudflare Browser Run).
- OpenRouter account has credits (the run spends real money — a few cents;
  `config.agentMaxCostUsd` defaults to $1 cap).
- `pnpm install` already run; ports 3001 (server) + 5173 (client) free,
  OR use the already-running dev servers if present
  (`lsof -i :3001 -sTCP:LISTEN`).

### Repo conventions to match

- e2e tooling: the `agent-browser` skill
  (`~/.pi/agent/skills/agent-browser/SKILL.md`) drives the browser — read
  it before UI steps. Prior e2e work in this repo used it (per DOX:
  "Verified by agent-browser e2e").
- Scratch scripts go under the Pi session scripts dir
  (`~/.pi/agent/sessions/[session-folder]/[session-id]-scripts/`), NOT
  `/tmp` and NOT the repo (per the operator's global AGENTS.md). Nothing
  in this plan adds files to the repo except the report.
- Server data lives in `apps/server/.data/projects/<id>/` — all log
  assertions read files from there.

## Commands you will need

| Purpose        | Command                                             | Expected on success |
|----------------|-----------------------------------------------------|---------------------|
| Server up      | `pnpm --filter @workspace/server dev`               | `Server listening at http://127.0.0.1:3001` |
| Client up      | `pnpm --filter @workspace/client dev`               | Vite ready on :5173 |
| Create project | `curl -s -X POST http://127.0.0.1:3001/api/projects -H 'content-type: application/json' -d '{}'` | JSON `{ ok: true, project: { id: ... } }` |
| Start run      | `curl -s -X POST http://127.0.0.1:3001/agent -H 'content-type: application/json' -d '<body>'` | `{ ok: true, status: 'running', turnId: ... }` |
| Read logs      | `cat apps/server/.data/projects/<id>/client-messages.jsonl` | JSONL events |

## Scope

**In scope** (the only files you should create/modify):
- A scratch verification script in the Pi session scripts dir (see
  conventions) — bash or node, your choice.
- `plans/013-report.md` (create) — the findings report: per assertion,
  PASS/FAIL + evidence excerpts (redacted of any secrets).

**Out of scope** (do NOT touch):
- Any source file. This plan VERIFIES; it does not fix. Failures go in
  the report as findings, each with evidence, and become new plans.
- `apps/server/.data/**` — read-only inspection; do not edit log files.
- The `patches/` file — do not "fix" the patch here.

## Git workflow

- No branch needed (no source changes). `plans/013-report.md` is the only
  repo artifact; commit as
  `docs(plans): direct-mode e2e verification report` if the operator wants
  it committed, otherwise leave uncommitted.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Preflight

- Confirm env keys exist (`grep -c OPENROUTER_API_KEY apps/server/.env`
  → 1; Cloudflare vars likewise) — NEVER print the values.
- Start server + client (or reuse running ones).
- Sanity: `curl -s http://127.0.0.1:3001/api/models?ids=x-ai/grok-4.5`
  → 200 JSON with an `inputModalities`-less entry today (plan 012 not
  required for this e2e) — the point is the server + OpenRouter are
  reachable.

### Step 1: Direct-mode run (vision-capable model)

1. Create a project (curl above; note `PROJECT_ID`).
2. POST `/agent` with body:
   ```json
   {
     "projectId": "<PROJECT_ID>",
     "prompt": "Build a minimal one-section landing page for a coffee subscription called Beanjoy. Then use the screenshot tool on body to verify the layout looks right.",
     "textModel": "google/gemini-3.6-flash:nitro"
   }
   ```
3. Poll `GET /api/projects/<id>` every 5s until `runState.status` is
   `idle`/`error` (or subscribe via the events endpoint with a GET SSE
   curl). Timeout: 6 minutes.
4. Assert (all go in the report):
   a. `client-messages.jsonl` has a `tool_call` with `"tool":"screenshot"`
      and terminal `"state":"done"` (not `error`).
   b. The same event's payload does NOT contain `data:image` (display path
      carries safe URLs only).
   c. `agent-messages.jsonl` contains NO `data:image` string; where a
      screenshot tool result is persisted, the capture `dataUrl` reads
      `[omitted inline image bytes]`.
   d. `vision-messages.json` has NO entry with `"source":"attachment"` for
      this turn, and no screenshot OCR entry (direct mode skips OCR).
   e. The assistant's post-screenshot text (in `client-messages.jsonl`
      `text` events) references something VISIBLY true about the page it
      built (e.g. the hero color it chose, Beanjoy name) — evidence the
      model actually SAW the screenshot, not just acknowledged a tool
      result. Quote the line in the report.
   f. Final `stats` event: `costBreakdown.vision` is
      `{ calls: 0, cost: 0, images: 0 }`.

### Step 2: Direct-mode attachment run

1. New project. Craft a tiny PNG (any 64×64 solid-color PNG base64; a
   one-liner with `node -e` + zlib, or base64 of a 1-pixel PNG scaled —
  exact pixels don't matter, it must decode as `image/png`).
2. POST `/agent` with `attachments: [{ id, kind: 'image', mediaType:
   'image/png', name: 'swatch.png', size: <decoded bytes>, dataUrl }]`
   and prompt "What color is the attached swatch? Answer in one word."
   (same textModel).
3. Assert:
   a. `analyze_image` tool_call terminal payload `result` =
      `Attached 1 image to the model`.
   b. The assistant's answer names the swatch's actual color (proves the
      image reached the model — a text-only path could not know).
   c. `client-messages.jsonl` inbound prompt entry has
      `attachmentCount: 1` and no `dataUrl` anywhere in the file.

### Step 3: Fallback-mode run (text-only model)

1. New project. Same build+screenshot prompt as Step 1, but
   `"textModel": "z-ai/glm-5.2:nitro"`.
2. Assert:
   a. The screenshot `tool_call` reaches `done` AND
      `vision-messages.json` HAS an entry for the turn (OCR fallback
      taken).
   b. Final `stats`: `costBreakdown.vision.calls >= 1`.
   c. `agent-messages.jsonl` still base64-free.

### Step 4: UI spot-check (agent-browser)

1. Open the client (`http://localhost:5173`), open the Step-1 project.
2. With the agent-browser skill: screenshot the conversation — the
   screenshot tool_call row shows the three persisted viewport preview
   images (mobile/tablet/desktop), not broken-image icons.
3. Attach an image to a new prompt (or confirm attachment UI state if
   interactive attach is impractical via automation) — the prompt row
   shows the attachment chip.
4. Save the browser screenshot(s) into the report directory as evidence.

### Step 5: Write `plans/013-report.md`

Per Step, per assertion: PASS/FAIL + one-line evidence (event excerpt,
log line, file path). End with a verdict block:

- "Direct mode is production-safe for <models tested>" OR
- Findings list: each failure with evidence + suggested follow-up plan.

## Test plan

This plan IS the test plan. No unit tests added. If everything passes,
consider promoting Steps 1+3 into a scripted smoke (optional follow-up,
NOT this plan — it needs CI secrets for OpenRouter/Cloudflare).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `plans/013-report.md` exists with verdicts for assertions 1a–f,
      2a–c, 3a–c, and the Step-4 UI check
- [ ] Every PASS verdict quotes its evidence (event/log excerpt)
- [ ] No source files modified (`git status --short` shows only
      `plans/013-report.md` + this plan)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Env keys are missing or OpenRouter returns 401/402. Report which; do
  NOT substitute another provider or print key material.
- The run errors with "OpenRouter stream ended with incomplete tool-call
  arguments" or a 400 about message shape from the upstream provider —
  that is a patch/serialization finding, the highest-value outcome of
  this e2e. Capture the exact error + the model used and STOP (the fix
  is its own plan).
- Screenshot capture fails for infrastructure reasons (Cloudflare
  browser acquisition) on ALL models — the e2e can't proceed; report
  the capture error verbatim.
- The model never calls the screenshot tool after 2 prompt attempts.
  Record the behavior; assert what you can from the attachment step
  instead, and note the coverage gap.

## Maintenance notes

- Re-run this e2e after ANY of: `@mastra/core` upgrade + patch
  re-creation, changing the default vision/text models, touching
  `toModelOutput` or the provider patch hunks.
- Cost per full run: expect < $0.10 across all three model runs (watch
  the final stats events; the $1 run cap protects you).
- If direct mode passes for gemini-3.6-flash but you enable a NEW
  vision-capable model later (e.g. a fresh Claude), rerun Step 1 with
  that model id — upstream tool-message image support is per-provider.
- Reviewer: this plan produces evidence, not code. Reject any source
  diff accompanying it.
