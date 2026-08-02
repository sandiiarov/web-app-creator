# Plan 013 verification report — direct-mode image delivery e2e

Executed 2026-08-02 against the live stack (OpenRouter + Cloudflare Browser
Run), server running the current code (commit `f1634054` + working tree).
Total OpenRouter spend across runs: ~$0.33 (within the $1 run cap).

## Verdict

**Direct mode is production-safe for `google/gemini-3.6-flash` (and the
OCR fallback for `z-ai/glm-5.2` remains intact).** One environmental
incident surfaced (stale dev server without the provider patch) — worth
remembering when verifying patched behavior; it is not a code defect.

## Step 1 — direct-mode screenshot run (gemini-3.6-flash)

Project `dea746ee-4551-4739-aa23-e603f6928175` (turn 2 forced the
screenshot; turn 1 in this project skipped the tool — model variance,
noted, no coverage lost since turn 2 covered it).

| # | Assertion | Result | Evidence |
|---|-----------|--------|----------|
| 1a | screenshot `tool_call` reaches `done` | PASS | `client-messages.jsonl`: `screenshot done "Captured mobile, tablet, desktop"` |
| 1b | no `data:image` in client log | PASS | 0 occurrences of `data:image` in `client-messages.jsonl` |
| 1c | no base64 in `agent-messages.jsonl` | PASS | 0 × `data:image`; 12 × `[omitted inline image bytes]` placeholders in the persisted screenshot tool result |
| 1d | no vision-messages.json entries | PASS | file does not exist for the project (direct mode skips OCR) |
| 1e | model demonstrably SAW the screenshots | PASS | post-screenshot text names exact page specifics: `"rich espresso brown primary text (#23160F), warm cream background (#FBF9F5), and an inviting roasted orange accent (#D96B27)"`, the fonts (`Space Grotesk` / `Plus Jakarta Sans`), the hero copy it wrote, and per-viewport layout (1440px 2-col grid, 768px, 390px stacked) — none of which exists in the tool's text output |
| 1f | zero vision cost accrued | PASS | final stats `costBreakdown.vision = {"calls":0,"cost":0,"images":0}` |

**Incident (environmental):** the first attempt (project
`e4572edd-...`) returned the assistant text `,type:media}]}` — the model
received the OLD JSON-stringified tool-result serialization. Cause: the
dev server had been started BEFORE the `@mastra/core` pnpm patch was
regenerated (`node --watch` does not restart on `node_modules` changes).
After restarting the server with the patch loaded, the same prompt
produced the full visual QA above. **Operational note: restart dev
servers after re-running `pnpm install` / re-creating patches.**

## Step 2 — direct-mode attachment run (gemini-3.6-flash)

Project `3084fc50-9380-474a-90ec-ebb86dddc482`, attached a 64×64 solid
`#D96B27` PNG swatch.

| # | Assertion | Result | Evidence |
|---|-----------|--------|----------|
| 2a | `analyze_image` reports direct attach | PASS | tool_call terminal payload `result: "Attached 1 image to the model"` |
| 2b | model answered from pixels | PASS | `"The attached swatch is burnt orange (hex code #D86A2B)."` — actual `#D96B27`; within vision-encoding tolerance (a text-only path could not know the color) |
| 2c | no `dataUrl` in client log | PASS | inbound prompt entry has `attachmentCount: 1`; 0 × `data:image` in `client-messages.jsonl` |

## Step 3 — OCR fallback run (z-ai/glm-5.2:nitro, text-only)

Project `91f43d01-9bc3-48f5-847a-75ec9348469c`.

| # | Assertion | Result | Evidence |
|---|-----------|--------|----------|
| 3a | OCR fallback taken | PASS | screenshot tool_call `done "Captured mobile, tablet, desktop\nOCR 3 images"` |
| 3b | vision cost accrued | PASS | final stats `costBreakdown.vision = {"calls":1,"cost":0.003011,"images":3}` |
| 3c | agent log base64-free | PASS | 0 × `data:image` in `agent-messages.jsonl` |

Correction to the plan's assertion 3a: `vision-messages.json` is NOT
written for screenshot-tool OCR — per DOX it logs attachment
(`ocrImageInputs`) and scrape (`ocrImages`) vision calls only. The
screenshot tool's OCR is accounted via the tool result (3b). The plan's
expectation was overbroad; the code behaves as documented.

## Step 4 — UI spot-check (agent-browser)

Project page for `dea746ee-...` at `http://localhost:5173`:

- Conversation panel renders the model's full visual-QA text; model
  picker shows the synced Gemini pair (text + vision) with role tooltips;
  spend popover shows `$0.30`.
- The screenshot tool_call block (expanded) renders the three persisted
  viewport previews (`/api/projects/:id/screenshots/00N-*.jpg`, verified
  200/image/jpeg); images are lazy-loaded on scroll — a quick DOM probe
  showed `naturalWidth: 211` once in view. Evidence: `plans/013-ui-evidence.png`.
- Preview iframe renders the built Beanjoy page with the generated hero
  image served from `/images/img-1.jpg`.

## Follow-ups (not defects)

- Plan 012's client-side modality sync (already planned) will keep the
  picker's capability set honest as more models go vision-capable.
- If a NEW vision-capable model is enabled later, re-run Step 1 with that
  model id — upstream tool-message image support is per-provider (only
  Gemini verified here).
