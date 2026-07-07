# Plan 005: Log scrape-tool OCR calls to vision-messages.json

> **Executor instructions**: Follow step by step; run each verification. On a "STOP conditions" event, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 87e1666b..HEAD -- apps/server/src/mastra/tools/landing-tools.ts apps/server/src/mastra/tools/scrape.ts apps/server/src/mastra/agents/landing-page-agent.ts apps/server/src/mastra/route.ts`. On a mismatch with "Current state", STOP.

## Status
- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `87e1666b`, 2026-07-07

## Why this matters
`vision-messages.json` records every OCR/vision call for debugging — but only for prompt-attachment OCR (wired in `analyzePromptAttachments`). The `scrape` tool also runs OCR on every scraped image (`ocrImages` at `tools/scrape.ts:151`) and that call is not logged, so the vision log is incomplete whenever the agent scrapes a reference URL. Completing it requires `projectId` + `turnId` inside the scrape tool, which today only has `visionModel`. The change threads those two values through the existing tool-context plumbing; it adds one `appendVisionMessage` call and changes no behavior.

## Current state
- `apps/server/src/mastra/tools/landing-tools.ts`:
  - `interface LandingToolContext` (line 22): `{ store: HtmlStore; imageModel?: string; requestScreenshot?: RequestBrowserScreenshot; baseUrl?: string; visionModel?: string }` (read the file to confirm exact fields).
  - The scrape tool is registered as `({ visionModel }) => createScrapeTool(visionModel)` in the `LANDING_TOOL_DEFINITIONS` array.
- `apps/server/src/mastra/tools/scrape.ts`: `createScrapeTool(visionModel)`; its `execute` calls `const imageOcr = await ocrImages(images, undefined, visionModel)` (line ~151) and returns `{..., imageOcr}`.
- `apps/server/src/mastra/agents/landing-page-agent.ts`: `createLandingPageAgent(store, mastra, baseUrl, textModel, requestScreenshot, options)` (line 41) builds the agent and (via the tool registry) constructs the `LandingToolContext`. Read it to find where the context is assembled.
- `apps/server/src/mastra/route.ts`: calls `createLandingPageAgent(store, mastra, baseUrl, textModel, requestScreenshot, {imageModel, visionModel})` with `projectId` and `recordedTurn.id` in scope.
- `appendVisionMessage(id, entry)` (project-store) takes `Omit<VisionMessageEntry,'seq'>` with fields `{turnId, source, model, imagesAnalyzed, ok, reason?, text, usage, costUsd, ts}` and injects `seq`. The attachment site (`analyzePromptAttachments` in route.ts) is the reference implementation — read it and match its entry shape, using `source: 'scrape'`.

## Commands you will need
| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm --filter @workspace/server typecheck` | exit 0 |
| Tests | `pnpm --filter @workspace/server test -- --run` | all pass |
| Lint | `pnpm --filter @workspace/server lint` | exit 0 |

## Scope
**In scope**:
- `apps/server/src/mastra/tools/landing-tools.ts` — add `projectId`/`turnId` to `LandingToolContext`; pass to `createScrapeTool`.
- `apps/server/src/mastra/tools/scrape.ts` — accept `projectId`/`turnId`; call `appendVisionMessage` after `ocrImages`.
- `apps/server/src/mastra/agents/landing-page-agent.ts` — thread `projectId`/`turnId` into the tool context.
- `apps/server/src/mastra/route.ts` — pass `projectId` + `recordedTurn.id` into `createLandingPageAgent`.

**Out of scope**:
- Other tools (read/edit/find/screenshot/generate_image) — unchanged.
- The scrape OCR result returned to the model (unchanged — logging only).

## Git workflow
- Branch: `advisor/005-scrape-vision-log`
- Commit: `feat(server): log scrape-tool OCR calls to vision-messages.json`.

## Steps

### Step 1: Extend the tool context
In `landing-tools.ts`, add `projectId?: string` and `turnId?: string` to `LandingToolContext` (optional so other tool factories ignore them). Change the scrape definition to `({ projectId, turnId, visionModel }) => createScrapeTool({ projectId, turnId, visionModel })`.

### Step 2: Update `createScrapeTool`
Change its signature from `createScrapeTool(visionModel)` to `createScrapeTool({ projectId, turnId, visionModel })`. After the existing `ocrImages` call, if `projectId` and `turnId` are present, call `appendVisionMessage(projectId, { turnId, source: 'scrape', model: visionModel, imagesAnalyzed: imageOcr.imagesAnalyzed, ok: imageOcr.ok, reason: imageOcr.reason, text: imageOcr.text, usage: imageOcr.usage, costUsd: visionCost(imageOcr.usage ?? {}, imageOcr.cost), ts: new Date().toISOString() })` — fire-and-forget (`void ...`), exactly as the attachment site does. Import `appendVisionMessage` and `visionCost` (the attachment site shows both imports). Keep the `return {...}` unchanged.

**Verify**: `pnpm --filter @workspace/server typecheck` → exit 0.

### Step 3: Thread the values from route.ts
In `route.ts`, extend the `createLandingPageAgent(...)` call's options (or add positional args matching its signature) to carry `projectId` and `recordedTurn.id`; in `landing-page-agent.ts`, receive them and set them on the `LandingToolContext` that feeds the tool registry. Read `landing-page-agent.ts` first to match its exact assembly pattern.

**Verify**: `grep -n "projectId\|turnId" apps/server/src/mastra/agents/landing-page-agent.ts apps/server/src/mastra/tools/landing-tools.ts` shows the threading. `pnpm --filter @workspace/server typecheck` → exit 0.

### Step 4: Test
Add a `route.test.ts` (or `tools/` test) that runs a scrape with a stubbed `ocrImages`/Firecrawl and asserts `readVisionMessages(project.id)` contains one `source: 'scrape'` entry with the right model/imagesAnalyzed. If a scrape integration test is too heavy, at minimum assert the wiring: stub `ocrImages` to return a known result and assert `appendVisionMessage` was called with `source:'scrape'` (vi.spyOn).

**Verify**: `pnpm --filter @workspace/server test -- --run` → all pass.

## Test plan
- New test: scrape tool appends a `source:'scrape'` vision entry (stub Firecrawl + ocrImages; assert the entry).
- Pattern: the attachment-OCR test in `route.test.ts` and the existing scrape test if one exists.

## Done criteria
- [ ] `pnpm --filter @workspace/server typecheck` exits 0.
- [ ] `pnpm --filter @workspace/server test -- --run` all pass.
- [ ] `pnpm --filter @workspace/server lint` exits 0.
- [ ] A run that uses `scrape` produces a `vision-messages.json` entry with `source: "scrape"` (manual or tested).
- [ ] Only the 4 in-scope files modified.

## STOP conditions
- `LandingToolContext` or `createLandingPageAgent` doesn't match "Current state" (drift) — STOP.
- Threading requires changing the scrape tool's public Mastra tool schema (it must not — logging is internal) — STOP.
- `ocrImages`/`ocrImageInputs` result shape differs from the attachment site's (so the entry fields don't apply) — STOP and align to the actual shape.

## Maintenance notes
- After this, every `ocrImageInputs`/`ocrImages` call site logs. Future OCR call sites should call `appendVisionMessage` too.
- Reviewer: confirm the scrape tool-result to the model is byte-identical (only a logging side-effect was added).
