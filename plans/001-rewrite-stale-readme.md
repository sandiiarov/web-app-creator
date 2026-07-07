# Plan 001: Rewrite the stale README to match the OpenRouter/Mastra server

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 87e1666b..HEAD -- README.md apps/server/src/index.ts apps/server/package.json`. If any changed, compare "Current state" against live code before proceeding; on a mismatch, treat as a STOP condition.

## Status
- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `87e1666b`, 2026-07-07

## Why this matters
`README.md` describes an architecture that no longer exists: a Docker-sandbox/Baseten runner with `/landing-agent`, `/preview/{format,lint,typecheck}` endpoints and `BASETEN_API_KEY`/`SANDBOX_*` env vars. The actual server is an OpenRouter + Mastra landing-page agent exposing `POST /agent` (SSE), `POST /api/screenshot-responses/:id`, and a project REST API (`/api/projects`). Anyone onboarding (human or agent) is misled about endpoints, env vars, and how the client gets HTML. The workspace-layout and shadcn sections are still accurate; only the Server/preview/env sections need rewriting against the real code.

## Current state
- `README.md` — the stale doc. The "Workspace layout", "Client preview" (first paragraph), "Commands", and "shadcn/ui" sections are current. The "Server" section (endpoints, env vars, sandbox) and the bullet about `/preview/*` are wrong.
- `apps/server/src/index.ts` — the real router. Routes (lines 224–244):
  - `POST /agent` → `handleAgent` (the SSE landing-page agent)
  - `POST /api/screenshot-responses/:id` → `handleScreenshotResponse`
  - `/api/projects*` → `routeProjects` (GET list, POST create, GET/PATCH/DELETE item, GET image)
  - `GET /images/:id` → `serveImage`
- `apps/server/package.json` deps: `@mastra/core`, `@mastra/duckdb`, `@mastra/libsql`, `@mastra/loggers`, `@mastra/observability`, `firecrawl`, `zod`. No Baseten, no Docker sandbox SDK.
- Env vars the server actually reads (verify with): `grep -rEo "process\.env\.[A-Z_]+|config\.[a-zA-Z]+" apps/server/src | sort -u` and `cat apps/server/src/config.ts`. Known: `OPENROUTER_API_KEY`, `PORT`, `HOST`, `CLIENT_ORIGIN`, `FIRECRAWL_API_KEY` (optional), plus model defaults. Confirm the exact list from `config.ts` before writing.
- Repo convention: docs are plain Markdown, concise, operational (see the root `AGENTS.md` style and `apps/server/AGENTS.md`). Match that tone — bullets, exact names, no marketing.

## Commands you will need
| Purpose | Command | Expected on success |
|---|---|---|
| List real env vars | `cat apps/server/src/config.ts` | read-only |
| List real routes | `grep -nE "pathname === |_RE =|routeProjects|handleAgent" apps/server/src/index.ts` | matches Current state |
| Markdown lint (none configured) | — | n/a |

## Scope
**In scope**:
- `README.md` (rewrite the "Server" section + the `/preview/*` bullet; keep Workspace layout, Client preview, Commands, shadcn/ui).

**Out of scope**:
- `apps/server/src/*` — do not change code; the README must describe the code as-is.
- `AGENTS.md` files (they are current).

## Git workflow
- Branch: `advisor/001-rewrite-readme`
- Commit message style (from `git log`): `docs(server): <imperative>` — e.g. `docs(server): rewrite README to match OpenRouter/Mastra server`. One commit.

## Steps

### Step 1: Confirm the real endpoints and env vars
Run the grep/cat in "Current state". Write down the exact route list and the exact env var names + which are required vs optional (from `config.ts` — required vars usually throw if missing; optional have `?? default`).

**Verify**: the route list matches `index.ts:224–244`; the env list matches `config.ts`.

### Step 2: Rewrite the "Server" section
Replace the "Server" section's endpoint list and env paragraph. The endpoint list must be exactly:
- `GET /health`
- `POST /agent` — SSE stream (status/tool/html_update/stats events + final `done`)
- `POST /api/screenshot-responses/:requestId` — client POSTs a captured screenshot back
- Project REST API under `/api/projects`: `GET` (list), `POST` (create), `GET|PATCH|DELETE /:id`, `GET /:id/images/:file`

Replace the env-var paragraph with the real vars from `config.ts`, marking required vs optional (`OPENROUTER_API_KEY` required; `FIRECRAWL_API_KEY` optional for higher scrape rate limits; `PORT`/`HOST`/`CLIENT_ORIGIN` with their defaults; `VITE_SERVER_URL` for the client if the server isn't on `http://localhost:3001`).

### Step 3: Remove the `/preview/*` bullet and sandbox/Baseten text
Delete any sentence mentioning `/preview/format`, `/preview/lint`, `/preview/typecheck`, `BASETEN_API_KEY`, `SANDBOX_*`, `sbx`, or the Docker sandbox. Do not replace them with anything — those features don't exist.

### Step 4: Update the "Client preview" paragraph if it references refetch-after-edit
The client now morphs `html_update` SSE events (not a full refetch after each edit). If the README says "the client refetches the project HTML after each edit", correct it to: the client morphs the preview from `html_update` events; it reads the full HTML via `GET /api/projects/:id` on load. (Confirm against `apps/client/src/hooks/use-landing-page.ts`.)

**Verify**: `grep -nE "refetch|html_update" apps/client/src/hooks/use-landing-page.ts` to confirm the morph behavior before writing it.

## Test plan
- No automated tests for README. Verify by re-reading and by cross-checking every endpoint/env var against `index.ts` and `config.ts`.

## Done criteria
- [ ] Every endpoint listed in `README.md` exists in `apps/server/src/index.ts` (grep each path).
- [ ] No occurrence of `BASETEN`, `SANDBOX_`, `/preview/`, `/landing-agent`, or `sbx` remains in `README.md` (`grep -nEi "baseten|sandbox|/preview/|/landing-agent|sbx" README.md` → no matches).
- [ ] Every env var named in `README.md` exists in `apps/server/src/config.ts`.
- [ ] No files outside `README.md` are modified.

## STOP conditions
- The routes in `index.ts` don't match the "Current state" list (drift) — report and stop.
- `config.ts` reveals required env vars that throw on missing (the README must mark them required, not optional) — if you can't tell which are required, stop and report.

## Maintenance notes
- Future endpoint additions must update this README's Server section and `apps/server/AGENTS.md` together.
- Reviewer: spot-check 3 endpoints and 3 env vars against the source — the rest follow the same pattern.
