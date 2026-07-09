# Plan 018: Persist `visionModel` and `imageModel` in project metadata across reload

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat c305fd0b..HEAD -- apps/server/src/mastra/lib/project-store.ts apps/server/src/index.ts apps/server/src/mastra/route.ts`
> If any in-scope file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: correctness / ux
- **Planned at**: commit `c305fd0b`, 2026-07-09
- **Issue**: _(omit — not published via `--issues`)_

## Why this matters

The model dropdown has three independent selections — Text (agent brain),
Image (generation), Vision (OCR). The **client is already fully wired** for all
three to persist:

- `apps/client/src/lib/projects-api.ts` declares `imageModel?` / `visionModel?`
  on `ProjectMeta`, and `updateProjectModels(id, { text, vision, image })`
  POSTs all three on every dropdown change.
- `apps/client/src/hooks/use-landing-page.ts` restores them from the project
  via `resolveLandingModels({ image: project.imageModel, text: project.model, vision: project.visionModel })`.

But the **server never stores vision/image**: `ProjectMeta` has no such fields,
`handlePatchProject` reads only `body.textModel`, and `updateProjectModel`
takes a single model. The AGENTS docs call this out explicitly: "visionModel/
imageModel are sent forward-compat and applied per request, so they reset to
defaults on reload until the server stores them."

Net effect: a user picks a different Vision or Image model, it works for that
session, and on reload it silently snaps back to the default. This plan makes
the server store and return them so the client's existing reads work end-to-end.
It is a server-only change; no client edit is required.

## Current state

### `apps/server/src/mastra/lib/project-store.ts` — `ProjectMeta` (no vision/image fields)

```ts
export interface ProjectMeta {
  createdAt: string
  hasHtml: boolean
  id: string
  model: string
  title: string
  updatedAt: string
}
```

### `createProject` + `ProjectInput` (model only)

```ts
export interface ProjectInput {
  model?: string
  title?: string
}

export async function createProject(input: ProjectInput = {}): Promise<Project> {
  const id = randomUUID()
  const now = new Date().toISOString()
  const meta: ProjectMeta = {
    createdAt: now,
    hasHtml: false,
    id,
    model: input.model?.trim() ?? '',
    title: input.title?.trim() || 'Untitled',
    updatedAt: now,
  }
  // ... ensureProjectDir, writeMeta, writeHtmlDocument ...
}
```

### `updateProjectModel` (single model)

```ts
export async function updateProjectModel(
  id: string,
  model: string,
): Promise<null | ProjectMeta> {
  const meta = await readMeta(id)
  if (!meta) return null
  const normalized = model.trim()
  if (meta.model === normalized) return meta
  const next = { ...meta, model: normalized, updatedAt: new Date().toISOString() }
  await writeMeta(id, next)
  return next
}
```

> **Note**: plan 017 may change this function's internals (sync RMW). This plan
> is compatible with either form — what matters here is the **signature and the
> fields persisted**. If 017 landed, adapt to the sync version; if not, adapt to
> the async version. See "STOP conditions."

### `apps/server/src/index.ts` — `handlePatchProject` (text only)

```ts
async function handlePatchProject(id, request, response) {
  const body = await readJsonObject(request)

  if (typeof body.textModel !== 'string' || body.textModel.trim() === '') {
    sendJson(response, 400, { error: 'Expected { textModel: string }', ok: false })
    return
  }

  const project = await updateProjectModel(id, resolveModelId(body.textModel))
  if (!project) {
    sendJson(response, 404, { error: 'Project not found', ok: false })
    return
  }
  sendJson(response, 200, { ok: true, project })
}
```

The client's PATCH body (`projects-api.ts` `updateProjectModels`) already sends
`{ imageModel, textModel, visionModel }` as strings — the server just ignores
two of them today.

### `apps/server/src/mastra/route.ts` — the run-start caller

```ts
await updateProjectModel(projectId, textModel)
```

This persists the text brain model at run start (belt-and-suspenders; the
primary persistence path is the client's immediate PATCH on dropdown change).
It must be adapted to the new signature but should keep its current text-only
semantics (do not start persisting image/vision from the run path — the per-run
request may carry role-scoped overrides; keep run-start behavior unchanged).

### How the client already consumes the result

`getProject(id)` returns `{ ...meta, indexHtml, messages }`, so any new fields
on `ProjectMeta` flow to the client unchanged. `handlePatchProject` returns
`{ ok: true, project }` where `project` is the meta — the client's
`updateProjectModels` already types its return as `ProjectMeta` and reads it.

### Repo conventions to match

- `resolveModelId` (in `route.ts`, already imported by `index.ts`) strips an
  optional `openrouter/` prefix and falls back to the chat default when
  `undefined`. For the PATCH path we only call it on **present** string values,
  so the fallback branch is unreachable for image/vision — it just does the
  prefix-strip, which is correct for storing the id.
- Optional-if-present validation follows the exact pattern `handleAgent` already
  uses for `imageModel`/`visionModel` (must be a non-empty string when present,
  else 400). Mirror it.
- Server enforces 90% line coverage. Tests follow the existing
  `project-store.test.ts` and `index.test.ts` patterns.

## Commands you will need

| Purpose   | Command                                                       | Expected on success |
|-----------|---------------------------------------------------------------|---------------------|
| Install   | `pnpm install`                                                | exit 0              |
| Typecheck | `pnpm run typecheck`                                          | exit 0, no errors   |
| Lint      | `pnpm run lint`                                               | exit 0              |
| Format    | `pnpm run format:check`                                       | exit 0              |
| Tests     | `pnpm run test`                                               | all pass            |
| Focused   | `pnpm --filter @workspace/server test -- --run project-store` | all pass            |
| Focused   | `pnpm --filter @workspace/server test -- --run index`         | all pass            |

## Scope

**In scope** (the only files you should modify):

- `apps/server/src/mastra/lib/project-store.ts` — add `imageModel`/`visionModel` to `ProjectMeta` + `ProjectInput`; populate in `createProject`; extend `updateProjectModel` signature.
- `apps/server/src/mastra/route.ts` — adapt the single run-start call site to the new signature (text-only, unchanged semantics).
- `apps/server/src/index.ts` — `handlePatchProject`: validate + persist all three models.
- `apps/server/src/mastra/lib/project-store.test.ts` — `updateProjectModel` tests for the new fields.
- `apps/server/src/index.test.ts` — PATCH persists + returns vision/image.

**Out of scope** (do NOT touch):

- Any client file (`apps/client/**`, `packages/prompt-panel/**`). The client already sends and reads these fields; no client edit is needed or wanted.
- `getProject` / `listProjects` bodies — they spread/return `ProjectMeta`, so the new fields propagate automatically. Do not special-case them.
- The `/agent` run path's per-request `textModel`/`imageModel`/`visionModel` handling (`streamLandingAgent` `StreamOptions`). The run-start `updateProjectModel` call stays text-only.
- Cost accounting, SSE mapping.

## Git workflow

- Branch: `advisor/018-persist-vision-image-models`
- Conventional commits, e.g. `feat(project-store): persist visionModel/imageModel in project metadata across reload`. Match `git log` style.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the fields to `ProjectMeta` and seed them in `createProject`

In `apps/server/src/mastra/lib/project-store.ts`:

- Add `imageModel: string` and `visionModel: string` to `ProjectMeta` (required strings, matching the existing `model` convention — not optional). Default both to `''` everywhere they're constructed.
- Add optional `imageModel?: string` and `visionModel?: string` to `ProjectInput` (mirroring `model?: string`).
- In `createProject`, populate them from input, defaulting to `''`:

```ts
const meta: ProjectMeta = {
  createdAt: now,
  hasHtml: false,
  id,
  imageModel: input.imageModel?.trim() ?? '',
  model: input.model?.trim() ?? '',
  title: input.title?.trim() || 'Untitled',
  updatedAt: now,
  visionModel: input.visionModel?.trim() ?? '',
}
```

(Alphabetical key order to satisfy Oxfmt's sort, matching the file's existing style.)

**Verify**: `pnpm run typecheck` → this will currently FAIL in the places that construct `ProjectMeta` literals elsewhere (if any). Check the output; the only `ProjectMeta` literal constructors are `createProject` (just edited) and the read path (`readMeta`/`readMetaSync` parse from disk, which is fine — old on-disk files without the fields will simply have `undefined`, handled in Step 4's backward-compat note). If typecheck flags any other constructor, fix it to include the new fields defaulting to `''`. Re-run until `pnpm run typecheck` exits 0.

### Step 2: Extend `updateProjectModel` to persist all three roles

Change the signature to take a partial selection. Persist only the provided
fields; leave others untouched. Keep the function `async` (callers await it).

```ts
export interface ProjectModelSelection {
  imageModel?: string
  textModel?: string
  visionModel?: string
}

/**
 * Persist the per-role model selection for a project. Only provided fields are
 * changed; others are preserved. Returns the updated meta, or null if the
 * project does not exist.
 */
export async function updateProjectModel(
  id: string,
  selection: ProjectModelSelection,
): Promise<null | ProjectMeta> {
  const meta = readMetaSync(id)
  if (!meta) return null

  const textModel = selection.textModel?.trim()
  const imageModel = selection.imageModel?.trim()
  const visionModel = selection.visionModel?.trim()

  const next: ProjectMeta = {
    ...meta,
    ...(textModel !== undefined ? { model: textModel } : {}),
    ...(imageModel !== undefined ? { imageModel } : {}),
    ...(visionModel !== undefined ? { visionModel } : {}),
    ...(textModel !== undefined || imageModel !== undefined || visionModel !== undefined
      ? { updatedAt: new Date().toISOString() }
      : {}),
  }

  if (next === meta) return meta
  writeMetaSync(id, next)
  return next
}
```

> **If plan 017 has NOT landed**, use the async form instead: `const meta = await readMeta(id)` at the top and `await writeMeta(id, next)` at the bottom (keep the await-based RMW 017 replaces). **If plan 017 HAS landed**, use the synchronous `readMetaSync`/`writeMetaSync` form shown above (it is race-safe — see 017). Either way the signature and field logic are identical. Run the drift check to determine which form is present; the "STOP conditions" cover ambiguity.

Also handle the legacy no-op short-circuit: if none of the three fields differ from `meta`, return `meta` unchanged without writing (the old code did `if (meta.model === normalized) return meta`). The `next === meta` reference-equality check above does NOT catch value-equal-but-different-object cases; replace it with an explicit "did anything change?" guard if you prefer clarity — e.g. compute `const changed = (textModel !== undefined && meta.model !== textModel) || ...` and `if (!changed) return meta`.

**Verify**: `pnpm run typecheck` → exits 0 after Step 3 adapts the call sites (it may temporarily fail here because callers still pass the old signature; that's expected — proceed to Step 3).

### Step 3: Adapt the two call sites

**`apps/server/src/mastra/route.ts`** — the run-start call (text-only, unchanged semantics):

```ts
await updateProjectModel(projectId, { textModel })
```

(Was `await updateProjectModel(projectId, textModel)`. Behavior identical: only the text brain model is persisted at run start.)

**`apps/server/src/index.ts`** — `handlePatchProject`: require `textModel`, validate optional `imageModel`/`visionModel` if present, persist all three:

```ts
async function handlePatchProject(id, request, response) {
  const body = await readJsonObject(request)

  if (typeof body.textModel !== 'string' || body.textModel.trim() === '') {
    sendJson(response, 400, { error: 'Expected { textModel: string }', ok: false })
    return
  }

  for (const field of ['imageModel', 'visionModel'] as const) {
    const value = body[field]
    if (value !== undefined && (typeof value !== 'string' || value.trim() === '')) {
      sendJson(response, 400, { error: `Expected { ${field}?: string }`, ok: false })
      return
    }
  }

  const project = await updateProjectModel(id, {
    imageModel:
      typeof body.imageModel === 'string' ? resolveModelId(body.imageModel) : undefined,
    textModel: resolveModelId(body.textModel),
    visionModel:
      typeof body.visionModel === 'string' ? resolveModelId(body.visionModel) : undefined,
  })
  if (!project) {
    sendJson(response, 404, { error: 'Project not found', ok: false })
    return
  }
  sendJson(response, 200, { ok: true, project })
}
```

(`resolveModelId` is already imported in `index.ts`. We only invoke it on present string values, so its undefined→chat-default fallback never triggers for image/vision — safe.)

**Verify**: `pnpm run typecheck` → exits 0. `pnpm run lint` → exits 0.

### Step 4: Backward compatibility for existing on-disk projects

Old projects on disk have `project.json` without `imageModel`/`visionModel`.
`readMeta`/`readMetaSync` do an unchecked `JSON.parse(...) as ProjectMeta`, so
those fields will be `undefined` at runtime for legacy projects — which the
client's `resolveLandingModels` already tolerates (`input.image?.trim() ||
default`). So no migration is required for correctness.

However, to keep `ProjectMeta` well-formed (required strings), normalize on
read: in `readMeta` and `readMetaSync`, coerce missing fields to `''` after
parse:

```ts
function withDefaultModelFields(meta: ProjectMeta): ProjectMeta {
  return {
    ...meta,
    imageModel: meta.imageModel ?? '',
    visionModel: meta.visionModel ?? '',
  }
}
```

Apply it in both `readMeta` (before returning) and `readMetaSync` (before
returning). The next write (any `updateProjectModel` / `markHasHtmlSync` /
`setTitleIfUntitled`) will persist the normalized form, so legacy files
self-heal on first touch.

**Verify**: `pnpm --filter @workspace/server test -- --run project-store` → existing tests still pass (none assert the absence of these fields).

### Step 5: Tests

**`apps/server/src/mastra/lib/project-store.test.ts`** — add:

- **"updateProjectModel persists each role independently and preserves the others"**: create a project, then call `updateProjectModel(id, { visionModel: 'v/v1' })`, assert returned meta has `visionModel: 'v/v1'` and `imageModel: ''` and `model: ''`. Then call `updateProjectModel(id, { imageModel: 'i/i1', textModel: 't/t1' })`, assert all three are set correctly and the previously-set `visionModel` is preserved.
- **"updateProjectModel with no recognized fields is a no-op"**: call `updateProjectModel(id, {})`, assert the returned meta equals the pre-call meta and `updatedAt` did not change.
- (Optional) **"legacy project.json without imageModel/visionModel normalizes to ''"**: write a bare `project.json` lacking the fields into a temp project dir, call `getProject`, assert `imageModel === ''` and `visionModel === ''`.

**`apps/server/src/index.test.ts`** — add (or extend an existing PATCH test):

- **"PATCH persists vision and image models and they survive a reload"**: create a project, `PATCH /api/projects/:id` with `{ textModel, visionModel, imageModel }`, assert the response `project` carries all three; then `GET /api/projects/:id` and assert `project.visionModel`/`project.imageModel` match. Follow the existing PATCH test pattern in that file (it already PATCHes and asserts).

**Verify**:
- `pnpm --filter @workspace/server test -- --run project-store` → all pass, incl. new tests.
- `pnpm --filter @workspace/server test -- --run index` → all pass, incl. new PATCH test.
- `pnpm run test` → all pass (server 90% coverage gate holds).

## Test plan

- New tests (Step 5): per-role persistence + preservation; no-op on empty selection; legacy normalization; end-to-end PATCH→GET round-trip for vision/image.
- Structural patterns: mirror existing `project-store.test.ts` `updateProjectModel` test and the existing `index.test.ts` PATCH test.
- Existing tests that must stay green: every `project-store.test.ts` and `index.test.ts` test (the signature change is adapted at all call sites).
- Verification: `pnpm run test` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "imageModel\|visionModel" apps/server/src/mastra/lib/project-store.ts` shows the fields on `ProjectMeta`, `ProjectInput`, populated in `createProject`, and handled in `updateProjectModel` + the read normalizer.
- [ ] `apps/client/src` is **unmodified** (`git diff --stat apps/client` empty) — this is a server-only change.
- [ ] `pnpm run typecheck` exits 0.
- [ ] `pnpm run lint` exits 0.
- [ ] `pnpm run format:check` exits 0.
- [ ] `pnpm run test` exits 0; the new per-role persistence test and the PATCH→GET round-trip test exist and pass.
- [ ] No files outside the in-scope list are modified (`git status`).

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (e.g. `ProjectMeta` already has these fields, or `handlePatchProject` already validates image/vision — the feature may have landed independently).
- Plan 017's status is ambiguous and you cannot tell whether `updateProjectModel` is sync or async — report which form you found and use the matching variant from Step 2.
- `resolveModelId`'s fallback behavior has changed such that calling it on a present image/vision string no longer just strips the prefix (re-check `route.ts` `resolveModelId`).
- A step's verification fails twice after a reasonable fix attempt.
- You find the client does NOT actually send `imageModel`/`visionModel` on PATCH (re-check `apps/client/src/lib/projects-api.ts` `updateProjectModels`) — if the client contract has changed, stop and report rather than assuming.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- The `/agent` run-start path intentionally persists **only `textModel`** (unchanged from before). The primary persistence mechanism for all three roles is the client's immediate PATCH on dropdown change (`persistModels` → `updateProjectModels`). If you later want the run to also persist the per-request image/vision models, change the `route.ts` call to `updateProjectModel(projectId, { textModel, imageModel, visionModel })` — but consider that a run may carry role-scoped overrides the user did not mean to save.
- Legacy on-disk projects self-heal: their first `updateProjectModel`/`markHasHtmlSync`/`setTitleIfUntitled` write normalizes `imageModel`/`visionModel` to `''`. No migration script is needed.
- A reviewer should confirm: (1) the client round-trips correctly (pick vision/image → reload → still selected), (2) `getProject` and the list endpoint return the new fields without special-casing, (3) the no-op short-circuit doesn't needlessly bump `updatedAt`.
- The `apps/client/AGENTS.md` and `apps/server/AGENTS.md` both currently state vision/image "reset to defaults on reload." After this lands, update those DOX lines to say they are persisted in project metadata (DOX closeout — see root AGENTS "Update After Editing").
