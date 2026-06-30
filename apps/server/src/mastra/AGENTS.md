# Mastra Agent DOX

## Purpose

- Owns the Mastra implementation of the landing-page agent and its custom server-side streaming protocol.

## Ownership

- `agents/`: landing-page agent factory and singleton registration config.
- `tools/`: Mastra tool factories and the landing tool registry.
- `skills/`: inlined design skill bridge to Pi design references.
- `lib/`: Baseten model config, cost accounting, edit/grep/html/image/SSE helpers, and file-backed project storage (`project-store.ts`).
- `route.ts`: maps Mastra `fullStream` chunks to the client-facing SSE protocol.
- `index.ts`: Mastra instance, storage, logger, and observability setup.

## Local Contracts

- The agent edits one in-memory file, `/index.html`, through `HtmlStore`; tools must not mutate repository files.
- Persistence is handled by `lib/project-store.ts`: it stores the final `index.html` and copies locally-generated images (looked up from the in-memory `image-store`) into `.data/projects/<id>/`. Generated image URLs in saved HTML are normalized to root-relative `/api/projects/:id/images/<file>`; the client expands them to absolute when loading into the preview (the preview iframe runs on a virtual almostnode origin). The in-memory `image-store` remains the source during a live run; `project-store` only snapshots it on save.
- Every user-visible tool call must include an `intent`; the client renders it in the conversation UI.
- `tools/landing-tools.ts` is the source of truth for enabled tools, tool count/list, and tool guidance.
- Additions or removals of tools must update SSE mapping, cost accounting, client event types, and this DOX when behavior changes.
- `edit` must preserve exact/unique replacement semantics and return full HTML on success so `route.ts` can emit `html` events.
- `basetenModel()` uses Mastra `OpenAICompatibleConfig` with ids shaped as `baseten/${modelId}`; do not switch providers or routers without re-verifying Mastra docs.
- `design-skill.ts` may read Pi design skill references from disk, but missing references must not break server boot.
- The image store is process-memory only during a run; `project-store.ts` is the persistence layer that copies image bytes into `.data/projects/<id>/images/` on save.

## Work Guidance

- For Mastra changes, read installed package docs/types first; Mastra APIs change quickly.
- Keep per-request `Agent` + `HtmlStore` isolation for production requests; the singleton registration exists for Mastra Studio visibility.
- Prefer `zod` schemas at tool boundaries and small pure helpers in `lib/`.

## Verification

- `pnpm --filter @workspace/server typecheck`
- `pnpm --filter @workspace/server lint`
- `pnpm --filter @workspace/server test`
- `pnpm --filter @workspace/server build`

## Child DOX Index

- None.
