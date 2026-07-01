# Implementation — remove-almostnode

Status: Complete
Prerequisite: plan.md `Status: Complete`

> **Purpose:** execute the plan one slice at a time. Small increments, commit each todo, run checks after each sub-phase.

## Guidance

- **One sub-phase = one slice from the plan.** Work them in order. Don't jump ahead.
- **Implement the smallest amount** that satisfies the slice. No speculative abstractions, no polish on unrelated code.
- **Run the checks** discovered in research after each sub-phase, not just at the end.
- **Stay in scope.** If a sub-phase reveals more work than planned, record it and return to planning — don't silently expand the slice.

## Commit rule — one commit per todo item

When a todo is genuinely done (file saved, test passing), commit it on its own:

```
<repo-convention-subject> [phase-name][phase-N][todo-item-slug]
```

- `<repo-convention-subject>` — follow the repo's existing convention. Inspect `git log --oneline -20` and any `.gitmessage` / Conventional Commits config; fall back to a plain descriptive imperative subject if none is detectable.
- `[phase-name]` — the task slug (this folder's `remove-almostnode`).
- `[phase-N]` — the sub-phase number matching the `## Phase N` heading.
- `[todo-item-slug]` — short kebab-case slug of that specific todo item.

Example: `feat(auth): add login form fields [auth-refactor][phase-1][create-login-form]`

Commit **after** the todo is genuinely done, not as a marker for unfinished work.

## Phase 1: Direct editor iframe preview

### Description
Replace almostnode-backed editor preview with direct `srcDoc` iframe rendering and remove the preview hook/bridge source files.

### Todo
- [x] Simplify editor preview to direct `srcDoc` iframe rendering.

### Results
- `apps/client/src/components/landing-preview.tsx` now renders the editor preview iframe directly with `srcDoc={html}` and no almostnode hook.
- Deleted almostnode-only `apps/client/src/hooks/use-landing-preview-server.ts` and `apps/client/src/lib/preview-bridge.ts`.
- Checks passed: `pnpm --filter @workspace/client typecheck`; focused `pnpm --filter @workspace/client exec oxlint src/components/landing-preview.tsx src/App.tsx`; `pnpm --filter @workspace/client build`.

### Gotchas
- Build output no longer includes the previous almostnode externalization/direct-eval warnings; only the existing large chunk warning remains.

## Phase 2: Dependency and asset cleanup

### Description
Remove almostnode package/public/config/source-comment traces now that no source imports the runtime.

### Todo
- [x] Remove almostnode dependency, lockfile, service worker, config ignores, and source comments.

### Results
- Removed `almostnode` from `apps/client/package.json`, removed the unused catalog entry from `pnpm-workspace.yaml`, and regenerated `pnpm-lock.yaml` with `pnpm install --lockfile-only`.
- Deleted `apps/client/public/__sw__.js` and removed `public/__sw__.js` ignore entries from `apps/client/oxlint.config.ts` and `apps/client/oxfmt.config.ts`.
- Updated `apps/client/src/lib/projects-api.ts` image-url comment to describe sandboxed `srcDoc` preview iframes.
- Confirmed no `almostnode` matches remain in `apps/client/src`, `apps/client/package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, or client oxlint/oxfmt configs.
- Checks passed: `pnpm --filter @workspace/client typecheck`; focused `pnpm --filter @workspace/client exec oxlint package.json oxlint.config.ts oxfmt.config.ts src/lib/projects-api.ts src/components/landing-preview.tsx`; `pnpm --filter @workspace/client build`.

### Gotchas
- Running filtered client commands after lockfile cleanup updated ignored `node_modules` contents (`Packages: +10 -93`), but only manifest/lock/source/config files are tracked.

## Phase 3: Active documentation cleanup

### Description
Update active DOX and README so current contracts describe direct iframe preview, not almostnode.

### Todo
- [x] Update active docs for direct iframe preview.

### Results
- Updated root `AGENTS.md`, `apps/AGENTS.md`, `apps/client/AGENTS.md`, and `README.md` to describe direct sandboxed `srcDoc` iframe previews instead of almostnode `VirtualFS`/`ViteDevServer` runtime.
- Confirmed no current-behavior almostnode/VirtualFS/ViteDevServer/service-worker references remain in those active docs.
- Checks passed: `pnpm --filter @workspace/client typecheck`; focused `pnpm --filter @workspace/client exec oxlint src/components/landing-preview.tsx src/lib/projects-api.ts`; `pnpm --filter @workspace/client build`.

### Gotchas
- Historical plans and prior phase records still contain almostnode references as historical context; active DOX/README no longer do.

## Phase 4: Remove stale service-worker reference from Fallow config

### Description
Verification found `.fallowrc.jsonc` still ignoring the deleted `apps/client/public/__sw__.js` service-worker path. Remove that stale active-config reference and re-check tracked non-historical almostnode references.

### Todo
- [x] Remove the deleted service-worker path from Fallow config.

### Results
- Removed stale `apps/client/public/__sw__.js` ignore pattern from `.fallowrc.jsonc`.
- `git grep -n -E 'almostnode|VirtualFS|ViteDevServer|__sw__|preview bridge' -- ':!plans/**' ':!.phases/**' ':!mastra-migration-plan.md'` returned no tracked active references.
- `pnpm run fallow:health` parsed and ran with the updated config, then exited 1 due existing health thresholds (`48 above threshold · 532 analyzed · maintainability 92.9`), not because of the removed service-worker path.

### Gotchas
- Fallow health is useful as a config smoke check here, but this repo currently fails its thresholds; do not treat that as a remove-almostnode regression.
