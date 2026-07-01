# Implementation — remove-almostnode

Status: In Progress
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
- [ ] Remove almostnode dependency, lockfile, service worker, config ignores, and source comments.

### Results
_(fill at end of the sub-phase — what was implemented, commands run, checks passed)_

### Gotchas
_(fill at end of the sub-phase, if any)_

## Phase 3: Active documentation cleanup

### Description
Update active DOX and README so current contracts describe direct iframe preview, not almostnode.

### Todo
- [ ] Update active docs for direct iframe preview.

### Results
_(fill at end of the sub-phase — what was implemented, commands run, checks passed)_

### Gotchas
_(fill at end of the sub-phase, if any)_
