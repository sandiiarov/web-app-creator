# Bench Harness DOX

## Purpose

- Real-LLM benchmark for the anchored `read`/`find`/`edit` tools. Runs a fixed suite of deterministic HTML-edit tasks across OpenRouter models so we can compare which models best drive the anchor/hash protocol.

## Ownership

- `run.ts`: CLI entry point — parses flags, runs the model × task matrix, prints a ranked summary table, and writes `bench-results/<timestamp>.json`.
- `agent-loop.ts`: minimal OpenAI-compatible tool-calling loop that drives the REAL `createReadTool`/`createFindTool`/`createEditTool` (bound to a real `HtmlStore`) against `/chat/completions`. Scores each task.
- `tool-schemas.ts`: OpenAI function schemas mirroring the real `read`/`find`/`edit` input schemas.
- `tasks.ts`: 16 seed → prompt → check tasks covering replace/delete/insert\_\*/whole-document replace, find-then-edit, regex find, batched edits, attribute edits, and nested edits.
- `models.ts`: model candidate list (OpenRouter only); only candidates with `OPENROUTER_API_KEY` present run.

## Local Contracts

- This is a dev-only tool, not production code:
  - Included in `pnpm --filter @workspace/server typecheck` and `format:check`.
  - Excluded from `build` (`tsconfig.build.json`), coverage (`vitest.config.ts`), and `lint` (server `oxlint.config.ts` `ignorePatterns`) so the model/task lists stay easy to edit.
- The loop sends the candidate `model` string verbatim in the request body and uses the provider `baseUrl` + bearer `apiKey` directly — no Mastra router/gateway, so it works for OpenRouter model ids that contain slashes (e.g. `openai/gpt-4o-mini`).
- Tasks verify the final rendered `HtmlStore` HTML with predicates (must-include / must-exclude / counts), not exact-byte equality, so they stay robust to reformatting.
- Results JSON and any failure HTML previews are written under `bench-results/` (gitignored); never commit results.

## Work Guidance

- Run: `pnpm --filter @workspace/server bench -- [flags]` (flags: `--model`, `--task`, `--limit`, `--steps`, `--tokens`, `--concurrency`, `--list`, `--no-json`).
- To compare a new model, add a `ModelCandidate` in `models.ts` and ensure its `apiKeyEnv` is set. Use `--model <label>` to run a subset.
- Each run costs real tokens; prefer `--limit`/`--task`/`--model` filters over the full matrix.

## Verification

- `pnpm --filter @workspace/server typecheck` (covers bench)
- `pnpm --filter @workspace/server format:check` (covers bench)
- Smoke check (no API calls): `pnpm --filter @workspace/server bench -- --list`

## Child DOX Index

- None.
