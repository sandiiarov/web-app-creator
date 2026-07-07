# Plan 002: Serve persisted screenshots via a project route

> **Executor instructions**: Follow step by step; run each verification. On a "STOP conditions" event, stop and report — do not improvise. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 87e1666b..HEAD -- apps/server/src/index.ts apps/server/src/mastra/lib/project-store.ts`. On a mismatch with "Current state", STOP.

## Status
- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `87e1666b`, 2026-07-07

## Why this matters
`writeProjectScreenshotSync` (`project-store.ts`) persists captured screenshots to `.data/projects/<id>/screenshots/<NNN>-<requestId>.<ext>` and returns the URL `/api/projects/<id>/screenshots/<file>`. That URL is recorded in `client-messages.jsonl` (the inbound `screenshot_response` entry's `screenshotFile`). But `routeProjects` only matches `/images/`, not `/screenshots/`, so every screenshot URL is a dead 404. The screenshots are debugging artifacts (inspectable by reading the files directly), but the logged URL should resolve so logs are click-through-able and so any future UI that renders them works.

## Current state
- `apps/server/src/mastra/lib/project-store.ts`:
  - `writeProjectScreenshotSync(id, requestId, dataUrl, mediaType)` → `{ext, path: '/api/projects/${id}/screenshots/${fileName}'}` (returns the URL but nothing serves it).
  - `readProjectImage(id, file)` (the pattern to copy) reads `images/<file>` with the `isSafeImageName` guard.
  - `isSafeImageName(name)`: `/^(img-\d+|img-\d+\.[a-z0-9]+|[a-z0-9_-]+\.[a-z0-9]+)$/i` AND no `..` AND no `/`. The screenshot filename `<NNN>-<uuid>.<ext>` matches the `[a-z0-9_-]+\.[a-z0-9]+` branch, so this guard is safe to reuse.
  - `SCREENSHOTS_DIR = 'screenshots'`, `IMAGES_DIR = 'images'` constants exist.
- `apps/server/src/index.ts`:
  - `routeProjects(request, response, pathname)` (line ~398) dispatches project routes.
  - `PROJECT_IMAGE_RE = /^\/api\/projects\/([a-f0-9-]+)\/images\/([^/]+)$/i` (line 254) → calls `readProjectImage` then `sendProjectFile`.
  - The image branch (around line 415) reads the file and writes it to the response with the media type.
- Convention: file-serving endpoints live in `index.ts`; storage helpers in `project-store.ts`. Media type derived from extension via `mediaTypeForName`.

## Commands you will need
| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm --filter @workspace/server typecheck` | exit 0 |
| Server tests | `pnpm --filter @workspace/server test -- --run` | all pass |
| Lint | `pnpm --filter @workspace/server lint` | exit 0 |

## Scope
**In scope**:
- `apps/server/src/mastra/lib/project-store.ts` — add `readProjectScreenshot`.
- `apps/server/src/index.ts` — add the `/screenshots/` route + import.
- `apps/server/src/mastra/lib/project-store.test.ts` — add a readback test.

**Out of scope**:
- `writeProjectScreenshotSync` return value (the URL path is correct; only serving is missing).
- Client changes (no client renders screenshots yet).

## Git workflow
- Branch: `advisor/002-serve-screenshots`
- Commit: `feat(server): serve persisted screenshots via /api/projects/:id/screenshots/:file` (matches `git log` conventional style).

## Steps

### Step 1: Add `readProjectScreenshot` to `project-store.ts`
Mirror `readProjectImage` exactly but read from `SCREENSHOTS_DIR`:
```ts
/** Read a persisted screenshot. Returns bytes + content-type, or null. */
export async function readProjectScreenshot(
  id: string,
  file: string,
): Promise<null | { buffer: Buffer; mediaType: string }> {
  if (!isSafeImageName(file)) return null
  try {
    const buffer = await readFile(join(projectDir(id), SCREENSHOTS_DIR, file))
    return { buffer, mediaType: mediaTypeForName(file) }
  } catch {
    return null
  }
}
```
Place it next to `readProjectImage` (perfectionist `sort-modules` will require alphabetical order — run `lint:fix`).

**Verify**: `pnpm --filter @workspace/server typecheck` → exit 0.

### Step 2: Add the route in `index.ts`
- Import `readProjectScreenshot` alongside `readProjectImage`.
- Add the regex (next to `PROJECT_IMAGE_RE`):
  ```ts
  const PROJECT_SCREENSHOT_RE = /^\/api\/projects\/([a-f0-9-]+)\/screenshots\/([^/]+)$/i
  ```
  (perfectionist `sort-modules` — keep the `*_RE` consts ordered; run `lint:fix`).
- In `routeProjects`, add a branch mirroring the image branch (it currently matches `PROJECT_IMAGE_RE` → reads → responds). For screenshots, match `PROJECT_SCREENSHOT_RE`, call `readProjectScreenshot(match[1]!, match[2]!)`, and on null send 404 via `sendNotFound`, else write the buffer with the media type — copy the exact response-writing lines from the image branch.

**Verify**: `grep -nE "PROJECT_SCREENSHOT_RE|readProjectScreenshot" apps/server/src/index.ts` shows both. `pnpm --filter @workspace/server typecheck` → exit 0.

### Step 3: Add a readback test
In `project-store.test.ts`, mirror the existing `'reads persisted project images by safe names and media type'` test: create a project, write a screenshot file into its `screenshots/` dir via `writeProjectScreenshotSync`, then assert `readProjectScreenshot` returns the bytes + media type, and that `../x.png` returns null. Add `readProjectScreenshot` to the import list (alphabetical).

**Verify**: `pnpm --filter @workspace/server test -- --run project-store` → all pass incl. the new test.

### Step 4: Manual route check
Start the dev server (`pnpm --filter @workspace/server dev`), create a project, trigger one screenshot (drive the agent to use the `screenshot` tool, or POST a screenshot response), then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/projects/<id>/screenshots/<file>` → expect `200` (was `404` before).

**Verify**: HTTP 200 + `content-type` matches the extension.

## Test plan
- New test in `project-store.test.ts`: `readProjectScreenshot` returns bytes+mediaType for a real file; returns null for `../escape.png` and a missing file.
- Pattern to follow: the existing `readProjectImage` test in the same file.

## Done criteria
- [ ] `pnpm --filter @workspace/server typecheck` exits 0.
- [ ] `pnpm --filter @workspace/server test -- --run` all pass, incl. 1 new test.
- [ ] `pnpm --filter @workspace/server lint` exits 0.
- [ ] `curl` on a real screenshot file returns 200 (manual).
- [ ] Only the 3 in-scope files are modified.

## STOP conditions
- The image branch in `routeProjects` doesn't look like "match → readProjectImage → write buffer" (drift) — STOP.
- `isSafeImageName` rejects the `<NNN>-<uuid>.<ext>` screenshot names (verify with a quick test before step 2) — if it does, STOP and extend the regex rather than weakening the guard.

## Maintenance notes
- If screenshot filenames ever change format, re-verify `isSafeImageName` still accepts them and rejects traversal.
- Reviewer: confirm the route reuses the SAME path-traversal guard as images (no bespoke, weaker check).
