# Research — projects-list

Status: Complete
Prerequisite: none

> **Purpose:** understand the relevant parts of the codebase as *facts* before any design or code. Output a map of what exists and how it works today — not how it should be.

## Guidance

- **Facts only.** Every claim cites a file path. No opinions about how the code *should* be,, and no implementation decisions — that's planning's job.
- **Questions before investigation.** Turn the request into clarifying questions first, then investigate the codebase to answer them. Don't let the desired solution steer what you find.
- **Map inputs/outputs** of every module you touch: what triggers it, what it receives, what it produces, and what side effects it has.
- **Record existing patterns** the codebase already uses (testing framework, error handling, naming, structure). Capture the exact test / lint / build / format commands with their working directory and flags — verification will re-run these.
- **Open questions** that need the user's input go here too. Surface them; don't guess.

## Phase 1: Map the request to the current architecture

### Description
Understand how a landing page is generated, where HTML + images live today, how the client renders the preview, and how routing/storage would slot in. Questions: (a) Where is generated HTML stored? (b) Where do generated images live and how are they referenced? (c) How is the client structured for routing? (d) What persistence options exist today?

### Todo
- [x] Map generated-HTML lifecycle (agent → HtmlStore → SSE `html` → client state → preview VFS)
- [x] Map generated-image lifecycle (generate_image tool → in-memory image-store → `/images/:id` route → absolute URL in HTML)
- [x] Map client app composition, routing, and preview rendering
- [x] Map server HTTP routing and where new project endpoints would live
- [x] Confirm persistence options / gitignore constraints
- [x] Capture exact verify commands

### Results

**Generated HTML lifecycle (process-memory, per request):**
- `apps/server/src/mastra/route.ts::streamLandingAgent` creates a fresh `createHtmlStore()` per request (`createHtmlStore` from `apps/server/src/mastra/lib/html-store.ts`). The agent edits the in-memory `/index.html` string only; it never touches repo files (`apps/server/src/mastra/AGENTS.md` Local Contracts).
- `route.ts` emits `html` SSE events (full file) after every successful `edit` tool result; final `stats` + `done` end the stream.
- Client `apps/client/src/hooks/use-landing-page.ts` holds `html` in `useState('')`, appends each `html` event via `setHtml(nextHtml)`, and stores conversation `turns[]` in `useState`.
- `apps/client/src/hooks/use-landing-preview-server.ts` starts one almostnode `ViteDevServer` on virtual port 5174 over a browser `VirtualFS`; it writes the latest `html` to `/index.html` in that VFS and triggers HMR. No persistence — state is lost on reload.

**Generated-image lifecycle (process-memory, ephemeral):**
- `apps/server/src/mastra/tools/generate-image.ts` calls Seedream 4.5 via OpenRouter, stores returned bytes with `saveImage(buffer, mediaType)` (`apps/server/src/mastra/lib/image-store.ts`), and returns `${baseUrl}/images/${id}.${extension}` where `baseUrl = http://${request.headers.host}` (i.e. `http://localhost:3001`).
- `image-store.ts` is module-level `Map<string, StoredImage>`; images survive across requests in a running server but are cleared on restart (DOX: "The image store is process-memory only; persistence or external storage would be a contract change.").
- `apps/server/src/index.ts` serves `GET /images/:id(?:.ext)` from that store with `cache-control: public, max-age=86400, immutable`.
- Scraped images (from `scrape` tool) are referenced by their **external** source URLs directly in the HTML; only `generate_image` output is locally hosted.

**Client composition + routing:**
- `apps/client/src/main.tsx` renders `<App/>` in `#root`; no router today.
- `apps/client/src/App.tsx` is a single screen: `<LandingPreview html=…/>` (full-viewport iframe) + `<PromptPanel/>` (draggable) + a hint.
- `apps/client/index.html` is a Vite SPA shell; Vite dev default `appType:'spa'` provides history fallback so `/projects/:id` will serve index.html.
- No `react-router` dependency today (`apps/client/package.json` deps: almostnode, bippy, lucide-react, react, react-dom, react-hotkeys-hook, streamdown).
- Server URL constant lives in `apps/client/src/lib/landing-agent.ts`: `SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'`, `LANDING_AGENT_API = ${SERVER_URL}/agent`.

**Server HTTP routing:**
- `apps/server/src/index.ts` is a raw `node:http` server with `routeRequest`: `OPTIONS`, `POST /agent`, `GET /images/:id`. All other → `sendNotFound`. CORS headers set on every response via `config.clientOrigin`. The server only binds when run directly (`isMainModule` guard).
- New project REST endpoints would extend `routeRequest` here. No express/fastify — handlers are hand-written functions using `sendJson`, `readJson`, `readRequestBody`.

**Persistence options / gitignore:**
- No DB dependency today. `.gitignore` ignores `*.local`, env, node_modules, dist, mastra DBs. File storage under an ignored dir (e.g. `apps/server/.data/`) is viable and matches the user's "file storage is even better" preference.
- Catalog/versioning: shared deps go in root `pnpm-workspace.yaml` catalog (e.g. a new `react-router-dom` entry) with `catalogMode: strict`.

**Verify commands (exact):**
- Client: `pnpm --filter @workspace/client typecheck` / `lint` / `test` / `build`.
- Server: `pnpm --filter @workspace/server typecheck` / `lint` / `test` / `build`.
- Repo-wide (subset relevant here): `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`.
- Git convention: Conventional Commits (`git log --oneline` shows `feat:`, `feat(server):`, `chore:`). No `.gitmessage`.
- Dev runtime: client Vite on `:5173`, server on `:3001`, preview iframe virtual on `:5174`.

### Gotchas
- The preview iframe runs on a **virtual origin** (almostnode, port 5174). Root-relative image URLs (`/foo`) resolve against that virtual origin, NOT `localhost:3001`, so the agent uses **absolute** `http://localhost:3001/images/...` URLs today. Any persisted-project image URLs that must load inside the preview iframe must be absolute (or expanded by the client at load time).
- `route.ts` constructs `baseUrl` from `request.headers.host`; in dev that's `localhost:3001`.
- DOX explicitly calls image-store persistence a "contract change" — extending it is fine but the mastra AGENTS.md note must be updated.
- Vite SPA history fallback serves index.html for unknown routes in dev; the built `dist` preview would need fallback too, but dev is the primary target.

## Phase 2: Resolve open questions

### Description
Decide the product semantics that the request leaves open before planning can be sliced.

### Todo
- [x] Decide persistence scope (what gets saved per project)
- [x] Decide project identity + routes
- [x] Decide when a project is created vs. updated

### Results

- **Saved per project:** final generated `index.html` (string), the `generate_image`-produced images (bytes + extension), and metadata (`id`, `title`, `model`, `createdAt`, `updatedAt`). Title derived from the first user prompt (truncated) or "Untitled". Chat history (`turns`) is **not** persisted in v1 (user explicitly scoped "save: HTML, images"); metadata JSON is shaped so turns can be added later.
- **Routes:** `/` = project list; `/projects/new` = fresh editor with no id yet; `/projects/:id` = existing project.
- **Create vs. update:** `/projects/new` holds an ephemeral editor; on first persisted save the client `POST /api/projects` creates a record and the URL is replaced with `/projects/:id`. Subsequent autosaves are `PUT /api/projects/:id`. Leaving `/projects/new` without generating anything persists nothing (no empty projects).
- **Image URL stability for the preview:** persisted HTML stores image URLs as **root-relative** `/api/projects/:id/images/<file>`; the client expands those to absolute using `SERVER_URL` when loading into the VFS so they resolve in the virtual-origin iframe. This decouples stored HTML from host.

### Gotchas
- Confirm with user before building if any of the above is wrong; otherwise plan proceeds on these decisions.
