# Screenshots DOX

## Purpose

- Visual verification artifacts and QA campaign data for the landing-page agent.

## Ownership

- `e2e-5run/`: the 5-project end-to-end QA campaign (2026-07-09, commit `a43ca336`, agent GLM-5.2). One subdirectory per project (`1-saas` … `5-product`) plus a top-level `REPORT.md`.

## Local Contracts

- `REPORT.md` is the investigation report — per-project cost/speed/tool metrics, aggregate totals, and the problems found. It is the durable, canonical summary.
- Each `<project>/metrics.json` is the parsed metrics for that project (cost, tokens, tool-call counts, per-stream breakdown), summed across per-stream `stats` events. `<project>/project-id.txt` holds the server project id.
- Per-turn PNGs (`turn-N.png`) and the exported `final.html` (base64-inlined images, multi-MB) are gitignored — regenerable from the project via `GET /api/projects/:id/html` and a browser capture; the parsed `metrics.json` + `REPORT.md` are the committed data.
- The parser (`parse-metrics.mjs`) and browser runner (`run-project.sh`) that produced these live outside the repo (Pi session scripts), not under `git ls-files`. `metrics.json` is the durable artifact; re-running requires re-creating the tooling.

## Work Guidance

- (none yet)

## Verification

- (none — this directory is data, not built/tested source)

## Child DOX Index

- None.
