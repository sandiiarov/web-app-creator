# E2E QA Report — 5-Project User-Journey Campaign

**Date**: 2026-07-09 · **Agent**: GLM-5.2 (z-ai/glm-5.2) · **Harness**: agent-browser → React client (:5173) → Node/Mastra server (:3001) · **Commit**: `a43ca336`

> **Correction (2026-07-09)**: the first version of this report understated costs ~6.8× and misattributed two findings. Root cause: the metrics parser took the *last* per-stream `stats` event as the project total, but the cost/usage accumulators reset per stream (`streamLandingAgent`), so project totals = **sum across streams**. The parser is fixed (`parse-metrics.mjs`); numbers below are correct. Two findings withdrawn: `generate_image` cost **is** captured ($0.04/image), and screenshot OCR **did** work (vision.calls > 0 for all projects).

## Methodology

Five diverse landing-page projects, each driven as a real user through agent-browser: **create → build (T1) → modify (T2) → fix (T3) → add image (T4)**. Per-turn completion detected via the Composer's Send-button swap. Server append-only JSONL logs parsed for cost/tokens/tool-call metrics (summed across per-stream `stats` events). Final HTML exported via `GET /api/projects/:id/html`.

## Per-project results (corrected)

| # | Project | Streams | Wall | Cost | Tokens (in/out, %cached) | Img gen | Vision calls | Final HTML | finish |
|---|---------|---------|------|------|--------------------------|---------|--------------|-----------|--------|
| 1 | SaaS — Taskflow | 3 | 7.6min | $0.113 | 495k/9k (72%) | 0 | 4 | 20.9KB | stop |
| 2 | Restaurant — Olive & Ember | 3 | 26.2min | $0.295 | 1126k/31k (59%) | 1 | 6 | 16.3KB | **length** (T3) |
| 3 | Portfolio — Maya Chen | 4 | 18.2min | $0.420 | 1325k/16k (78%) | 4 | 8 | 29.7KB | stop |
| 4 | Conference — DevWorld 2026 | 1 | 12.4min | $0.192 | 342k/9k (76%) | 3 | 3 | 26.4KB | stop |
| 5 | Product — Lumen | 4 | 17.0min | $0.336 | 1262k/14k (74%) | 1 | 8 | 29.0KB | stop |

**Aggregate**: 5 projects · 15 streams · 81 min wall · **$1.36 total** · 4.6M tokens (70% cached) · 122KB HTML · **0 tool errors, 0 SSE errors**.

**Cost-effectiveness**: avg **$0.09/turn**, avg **5.4 min/turn**. Cost drivers: LLM tokens (large accumulating context), image generation ($0.04/image), vision OCR (~$0.017/call). Cache hit 59–78% (climbs across turns).

## Problems found

### P1 — Agent over-produces on fix turns, hitting the output-token cap (HIGH)
Project 2's T3 ("fix hero contrast + center button") ran **17.6 min, cost $0.136**, and ended with `finishReason=length` — it hit the output-token cap at **19,504 output + 7,753 reasoning tokens** (input was 532k, 62% cached). The agent over-produced (verbose reasoning + repeated edits) instead of making a minimal fix. This is the highest-cost failure mode observed: one fix turn cost more than entire clean projects. → **plan 014** (minimal-change instruction).

### P2 — Context accumulates across turns; input tokens dominate cost (MED)
P2 T3 carried **532k input tokens** (prior turns + tool results + full HTML). Even at 62% cache, input cost dominates. P3/P5 reached 1.3M input tokens by T4. There is no context compaction between turns — each turn re-sends the full history. Opportunity: summarize/compact prior tool results, or cap replayed history. (Not yet planned — needs design.)

### P3 — Turn-1 cold-start is 2–4× slower than later turns (MED)
T1 (initial build) durations: P2 281s, P3 610s, P4 759s, P5 537s — vs 100–250s for later turns. T1 cold-loads the design skill + all references (`skill_read` ×4–9) + scaffolds from scratch. Cache is cold (51% → 78% by T4). Opportunity: pre-warm skill references, or skip re-reading references on modification turns. (Not yet planned.)

### P4 — `generate_image` is a real, visible cost driver (INFO — already tracked)
9 images generated across the campaign (P3: 4, P4: 3, P2/P5: 1 each) at **$0.04/image = $0.36 total** (26% of all cost). Cost **is** correctly captured in `costBreakdown.image` (`image.count` + `image.cost`). The agent leans on generated imagery for "add an image" requests. → **plan 015** checks whether the UI surfaces this to the user.

### P5 — Screenshot OCR fetch has no timeout/retry (latent — LOW)
OCR **worked** in this campaign (vision.calls: 4–8 per project, 0 silent failures). But the `fetch` in `image-ocr.ts` has no `AbortController` and no retry — a slow/hung Z.AI vision response would hang the agent stream indefinitely. Latent robustness gap, not an observed failure. → **plan 013** (preventive hardening).

### P6 — Test-harness polling races under concurrency (HARNESS, not product)
3-way parallel runs caused P4's T2–T4 to be skipped (the "Send reappears" end-signal false-triggers during React re-renders). P4 captured only T1. This caps reliable parallel-QA throughput to ~1–2 concurrent projects. Not a product bug.

## What worked well

- **Edit engine reliability**: 44 edits, 0 errors, 0 malformed HTML — hashline snapshot-verified diff + balance guard held up.
- **Cost accounting is accurate** (after the parser fix): `generate_image` ($0.04/image), vision OCR, and LLM costs are all correctly attributed in `costBreakdown`.
- **OCR pipeline works**: 29 vision calls across the campaign, 0 silent failures.
- **Incremental build flow**: scaffold→tokens→fill produces 16–30KB pages reliably.

## Tool performance summary

| Tool | Starts | Dones | Errors | Notes |
|------|--------|-------|--------|-------|
| skill (design) | 5 | 5 | 0 | Once per project |
| skill_read | 24 | 24 | 0 | Heavy on T1 (cold) |
| read | 51 | 51 | 0 | Most-used; re-reads before edits |
| edit | 50 | 44 | 0 | 6 started-not-done (interrupted/length-capped streams) |
| find | 7 | 7 | 0 | Anchor lookups |
| screenshot | 30 | 25 | 0 | 29 vision OCR calls succeeded |
| generate_image | 9 | 9 | 0 | $0.04/image; 26% of total cost |

## Data artifacts

Per-project under `screenshots/e2e-5run/<n>-<name>/`: `metrics.json` (corrected, summed-across-streams), `project-id.txt`. PNGs + inlined-image HTML are local-only (gitignored — regenerable).
