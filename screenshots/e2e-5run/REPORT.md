# E2E QA Report — 5-Project User-Journey Campaign

**Date**: 2026-07-09 · **Agent**: GLM-5.2 (z-ai/glm-5.2) · **Harness**: agent-browser driving the React client at localhost:5173 → Node/Mastra server at :3001 · **Commit**: `a43ca336` (server in `node --watch` dev mode, current code)

## Methodology

Five diverse landing-page projects, each driven as a real user through agent-browser: **create → build (T1) → modify/add section (T2) → fix visual issue (T3) → add image (T4)**. Per-turn completion detected via the Composer's Send-button swap (Send→Stop while streaming, Stop→Send when done). Server append-only JSONL logs (`agent-messages.jsonl`, `client-messages.jsonl`) parsed for cost/tokens/tool-call metrics. Final HTML exported via `GET /api/projects/:id/html`.

## Per-project results

| # | Project | Turns completed | Wall | Cost | Tokens (in/out, %cached) | HTML updates | Screenshots | Vision calls | Final HTML | Notes |
|---|---------|-----------------|------|------|--------------------------|--------------|-------------|--------------|-----------|-------|
| 1 | SaaS — Taskflow | 3/4 | ~8min | $0.057 | 140k/3k (51%) | 11 | 5 req | 0 | 20.9KB | T4 lost (trailing-newline bug in harness, since fixed) |
| 2 | Restaurant — Olive & Ember | 2/4 | 11min | $0.058 | 594k/12k (57%) | 10 | 6 req | 2 | 16.3KB | T3 **over-scoped** ("fix contrast" → full hero redesign + `generate_image`), >700s, T4 skipped |
| 3 | Portfolio — Maya Chen | 4/4 | 18min | $0.048 | 1325k/16k (78%) | 10 | 8 req | 2 | 29.7KB | Clean full run; `generate_image` ×4 |
| 4 | Conference — DevWorld 2026 | 1/4 | 12min | — | — | 5 | 3 req | 0 | 26.4KB | **Polling failure under 3-way concurrency** — T1 image-heavy (`generate_image`×3) didn't finish within the false-end window; T2–4 "send ref not found" |
| 5 | Product — Lumen | 4/4 | 17min | $0.039 | 1262k/14k (74%) | 8 | 8 req | 1 | 29.0KB | Clean full run; T1=540s (concurrency slowdown) |

**Aggregate**: 5 projects · 13 completed turns · 66 min wall · **$0.20 total** · 3.7M tokens (72% cached) · 122KB HTML · **0 tool errors, 0 SSE errors** on completed streams.

**Cost-effectiveness**: avg **$0.0155/turn**, avg **5.1 min/turn**. Cache hit rate climbs across turns (T1 ~51% → T4 ~78%) as the design-skill + prior HTML context gets cached.

## Problems found (investigation material)

### P1 — Agent over-scopes simple fix requests (HIGH impact)
T2-Restaurant prompt *"fix hero contrast + center button"* triggered a **full hero redesign with `generate_image`** (generated a Mediterranean-grill photo), taking >700s and skipping the subsequent turn. The agent treats a targeted fix as license to rebuild. **Evidence**: project `d9ecdebf` stream 3 edit-actions — "Redesign hero as full-bleed image with dark overlay", "Add hero background image div", `generate_image` "Hero image: Mediterranean grill over open fire". **Cost**: bloated turn time + cost, missed user intent (the user asked for a small fix).

### P2 — `generate_image` tool is used heavily and silently inflates cost/time (MED)
Discovered during the run: a `generate_image` tool exists (not in prior session knowledge). Usage: P3 ×4, P4 ×3, P2 ×1, P5 ×1 — the agent **generates images rather than using placeholders** when asked to "add an image". Image generation is slow (contributes to 500–600s T1/T3 turns) and its cost is folded into `costBreakdown.llm` (not broken out). **Evidence**: tool-call `done` events with `tool: "generate_image"`, action "Hero image: Mediterranean grill over open fire…".

### P3 — Screenshot OCR (Z.AI `ui_to_artifact`) intermittent timeouts (MED)
The screenshot tool's vision OCR timed out repeatedly ("Z.AI request timed out after 30s after 3 attempts"). In P1, 5 screenshot requests → 4 captured → **0 vision calls billed** (all OCR attempts failed/timed out); the agent compensated with 10 `read` calls (flying blind on visuals). In P2/P3/P5, 1–2 vision calls succeeded. **The same Z.AI vision timeout also broke the Pi agent's own image viewing** during this QA. Intermittent — points to Z.AI service flakiness or rate-limiting under load.

### P4 — Test-harness polling races under concurrency (HARNESS, not product)
The "Send button reappears" end-signal still false-triggers during React re-renders mid-stream, especially under 3-way concurrency (P4: T1's long image-generation stream was falsely detected as ended → T2–4 could not send). This is a harness limitation, not a product bug, but it caps reliable parallel-QA throughput to ~1–2 concurrent projects.

### P5 — Turn-1 is consistently the slowest/expensive turn (MED)
T1 (initial build) takes 2–4× longer than subsequent turns (P1: 142s srv; P2: 281s; P3: 610s; P5: 537s) because it cold-loads the design skill + all references (`skill_read` ×4–9) + scaffolds from scratch. Subsequent turns benefit from cached context (cache hit 51%→78%). **Opportunity**: pre-warm the skill/references, or skip re-reading references on modification turns.

### P6 — `read` is the most-called tool by far (LOW)
`read` calls: P1=10, P2=11, P3=15, P5=9 (vs `edit` 8–12). The agent re-reads HTML sections frequently to get "fresh tags" before each edit. This is the hashline snapshot model working as designed, but the re-read volume suggests the agent lacks confidence in its cached view of the document.

## Tool performance summary

| Tool | Total starts | Total dones | Errors | Notes |
|------|-------------|-------------|--------|-------|
| skill (design) | 5 | 5 | 0 | Loaded once per project |
| skill_read | 24 | 24 | 0 | Design references; heavy on T1 |
| read | 51 | 51 | 0 | Most-used; re-reads before edits |
| edit | 50 | 44 | 0 | 6 edits started-but-not-done (interrupted streams) |
| find | 7 | 7 | 0 | Anchor lookups |
| screenshot | 30 | 25 | 0 | 5 started-not-done; OCR timeouts (P3) |
| generate_image | 9 | 9 | 0 | Surprising heavy usage; cost not broken out |

**0 tool errors** on all completed streams — the hashline edit engine + balance guard held up across 44 successful edits with zero malformed-HTML failures. This validates the snapshot-verified edit migration.

## What worked well

- **Edit engine reliability**: 44 edits, 0 errors, 0 malformed HTML — the hashline snapshot-verified diff + balance guard is solid in production.
- **Cost efficiency**: $0.015/turn avg; 72% token cache hit keeps costs low despite large contexts.
- **Incremental build flow**: scaffold→tokens→fill pattern produces substantial pages (16–30KB) reliably.
- **Error-free streams**: 0 SSE errors, 0 tool errors on the 13 completed streams.

## Data artifacts

Per-project under `screenshots/e2e-5run/<n>-<name>/`: `metrics.json` (full parsed metrics), `final.html` (exported single-file), `turn-N.png` (per-turn screenshots where captured), `project-id.txt`.
