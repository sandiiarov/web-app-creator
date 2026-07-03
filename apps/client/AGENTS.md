# Client App DOX

## Purpose

- Vite + React app that lets a user manage landing-page projects, prompt a landing-page agent, and preview each generated single-file HTML.
- `/` lists saved projects; `/projects/new` creates a draft and redirects to `/projects/:id`; `/projects/:id` is the editor: a sandboxed `srcDoc` iframe preview plus a draggable prompt/conversation panel.

## Ownership

- `src/main.tsx`: `BrowserRouter` + route table (`/`, `/projects/new`, `/projects/:id`) and `ThemeProvider` root.
- `src/App.tsx`: `EditorPage` (preview + prompt panel composition), param-driven and keyed by project id.
- `src/components/projects-page.tsx`: project list + new-project redirect.
- `src/components/`: app-specific UI; `components/prompt/` owns conversation and composer components.
- `src/hooks/`: streaming hooks.
- `src/lib/`: custom SSE client, landing-agent event types, image URL expansion, browser screenshot capture, and the project REST API client.
- `components.json`: shadcn project config that targets shared UI code in `packages/ui`.

## Local Contracts

- The server API is custom SSE `POST /agent` at `VITE_SERVER_URL` or `http://localhost:3001`; prompts may include image attachments as JSON data URLs, and streamed events include `retry` and `screenshot_request` in addition to text/tool/stats/error/done events. `retry` events render a visible countdown/backoff notice in the active prompt panel turn. Keep `src/lib/landing-agent.ts` event types aligned with `apps/server/src/mastra/route.ts`.
- The server owns the project's `index.html` file — it is the single source of truth. There is **no `html` SSE event** and **no client PUT**: after each successful `edit` tool completes, the UI calls `GET /api/projects/:id` and pulls the updated HTML (see `use-landing-page.ts` `refreshHtml` on `edit` done). On editor mount it also pulls the current HTML once.
- Projects are read via `src/lib/projects-api.ts` against `/api/projects*`. Full project reads include persisted `messages`; `use-landing-page.ts` restores them into the prompt panel as non-streaming turns on editor mount. The projects list stays metadata-first, but cards may fetch full projects to render sandboxed `srcDoc` iframe previews. Stored HTML uses root-relative project image URLs (`/api/projects/:id/images/<file>`); `expandProjectImageUrls` expands them to absolute before rendering editor or card preview iframes.
- The editor preview renders the current project HTML directly with a sandboxed `srcDoc` iframe that permits forms, modals, popups, same-origin storage, and scripts; the client dynamically injects `<base href="about:srcdoc">` into the preview `srcDoc` only so generated `#section` links resolve inside the iframe without changing persisted project HTML. The content and message history are pulled from the server (they are not generated or persisted in the browser). For `screenshot_request`, the client pulls the latest project HTML from the server, renders it in a temporary same-origin/no-script offscreen iframe, captures it with `@zumer/snapdom`, and posts the correlated response to `/api/screenshot-responses/:requestId`. Do not reintroduce a full workspace snapshot, client-side message save path, or browser AI SDK tool loop without updating plans and DOX.
- The prompt panel composer owns model selection via a separate dropdown and persists model changes immediately via `PATCH /api/projects/:id { model }`; individual saved message turns still show the model used for that turn. Cost formatting must show exact zero as `$0`; reserve `<$0.01` for positive costs below one cent.
- The prompt panel command menu owns All Projects navigation plus layout/theme commands; the Command/Control Option A shortcut still navigates to `/`. The panel persists only position/layout plus minimized/maximized state in browser localStorage under `landing.promptPanel.position.v1`.
- Prompt message markdown renders with Streamdown; code fences must use `@streamdown/code` syntax highlighting with Catppuccin Latte/Mocha configured on the code plugin (Streamdown reads `plugins.code.getThemes()` before the `shikiTheme` prop) and panel-scoped Streamdown styling so headings, tables, lists, inline code, and code blocks match the square/sharp UI language. Keep highlighted code line wrappers block-level when line numbers are off so multiline fences do not collapse into one visual line. Code-block chrome must stay square/no-radius and hide copy/download controls.
- Use `@workspace/ui/...` for reusable UI package imports and `#components`, `#hooks`, `#lib` for app-local aliases.
- Do not put secrets in client code; only `VITE_*` variables are client-readable.
- Preserve the sharp/square visual language unless the design direction is explicitly changed.

## Work Guidance

- Follow shadcn/Tailwind rules: semantic tokens, `cn()` for conditional classes, `gap-*` over `space-*`, `size-*` for square dimensions, and existing UI components before custom markup.
- Keep streaming state changes in hooks and keep prompt UI components mostly presentational.
- Update the client event model and server SSE mapping together. Failed tool calls and failed turns must render with destructive/red styling and any still-running tool rows must be terminalized when a run errors, completes, or is stopped. Agent-run errors stay inside the turn; reserve the global error banner for app/preview/load failures.

## Verification

- `pnpm --filter @workspace/client typecheck`
- `pnpm --filter @workspace/client lint`
- `pnpm --filter @workspace/client test`
- `pnpm --filter @workspace/client build`

## Child DOX Index

- None.
