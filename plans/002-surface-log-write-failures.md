# Plan 002: Surface `chainProjectWrite` log-write failures

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5daf56ef..HEAD -- apps/server/src/mastra/lib/project-store.ts apps/server/src/mastra/lib/project-store.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED (touches the central write-chain used by every log append — must not change the never-reject contract that callers depend on)
- **Depends on**: none
- **Category**: dx / correctness (silent failure visibility)
- **Planned at**: commit `5daf56ef`, 2026-07-19
- **Issue**: (only when published via `--issues`)

## Why this matters

`apps/server/src/mastra/lib/project-store.ts` serializes every append-only
log write (`appendClientMessage`, `appendAgentMessages`,
`appendVisionMessage`) through a per-project chain built by
`chainProjectWrite`. The chain is **never-throwing by design** — callers in
`route.ts` use `void appendX(...)` and rely on it not rejecting. But the
current implementation also **silently swallows every error**:

```ts
const next = prev.then(run, run).then(
  () => undefined,
  () => undefined,        // ← every write failure disappears here
)
```

If a write fails (disk full, EIO, ENOSPC, permission), nothing surfaces.
`flushProjectLogs(id)` resolves cleanly even if every write in the chain
failed. The DOX contract — "append-only logs are inspectable mid-run" —
is invisibly broken. Operators have no signal that the audit trail is
losing entries.

This plan routes each swallowed failure through an injectable logger sink
that defaults to `console.error`. The never-reject contract is preserved
(callers keep working unchanged); the operator gets a stderr line per
failure; tests can inject a capturing sink to assert the behavior.

## Current state

The chain lives in `apps/server/src/mastra/lib/project-store.ts` (around
lines 695-715, named `chainProjectWrite`). Verbatim:

```ts
/** Serialize a project's debug-log writes on one per-project chain. The chain
 *  is registered SYNCHRONOUSLY (before any await) so `flushProjectLogs` always
 *  sees the latest pending write — fire-and-forget callers from the stream
 *  loop can't race project cleanup. */
function chainProjectWrite(
  id: string,
  run: () => Promise<unknown>,
): Promise<void> {
  const prev = projectWriteChains.get(id) ?? Promise.resolve()
  const next = prev.then(run, run).then(
    () => undefined,
    () => undefined,
  )
  projectWriteChains.set(id, next)
  void next.finally(() => {
    if (projectWriteChains.get(id) === next) projectWriteChains.delete(id)
  })
  return next
}
```

`prev.then(run, run)` is intentional: if the previous write failed, the
next still runs (resilience — one bad append must not poison the chain).
The bug is the final `.then(() => undefined, () => undefined)` — the
rejection-handler returns `undefined` and discards the error with no
signal.

### Callers (do not change — verified at recon)

- `route.ts:275` — `void appendClientMessage(projectId, { dir: 'out', ... })`
- `route.ts:309` — `void appendClientMessage(projectId, { dir: 'in', ... })`
- `route.ts:509, 844` — `void appendAgentMessages(projectId, { ... })`
- `route.ts:989` — `void appendVisionMessage(projectId, { ... })`
- `tools/scrape.ts:163` — `void appendVisionMessage(projectId, { ... })`
- `route.ts:240` — `await flushProjectLogs(projectId)` (in the `finally`
  block; resolves regardless).

All callers must keep working unchanged.

### Repo conventions to match

- Default Oxlint config for the server does NOT include `no-console` (see
  `packages/oxlint-config/src/index.ts` — `baseRules` lists
  `no-restricted-imports`, `no-unused-vars`, perfectionist sort rules, and
  `typescript/no-explicit-any: warn`; no console restriction). So a
  `console.error` fallback is lint-clean.
- The server already imports the Mastra `PinoLogger` in
  `apps/server/src/mastra/index.ts`, but `lib/` stays Mastra-free by
  convention (no `@mastra/*` imports in `lib/*.ts`). Keep that boundary —
  the logger sink must be a plain callback, NOT a `@mastra/loggers`
  import.
- Exemplar pattern for an injectable default in the same package: none —
  but the `image-store.ts` module-scoped `Map` + exported accessors is the
  closest stylistic match (a module-scoped mutable + exported setter).

## Commands you will need

| Purpose    | Command                                              | Expected on success |
|------------|------------------------------------------------------|---------------------|
| Typecheck  | `pnpm --filter @workspace/server typecheck`          | exit 0, no errors   |
| Lint       | `pnpm --filter @workspace/server lint`               | exit 0              |
| Tests      | `pnpm --filter @workspace/server test`               | all pass; coverage ≥ 90% |
| Focused    | `pnpm --filter @workspace/server test -- --run project-store 2>&1 \| tail -15` | project-store tests pass |

## Scope

**In scope** (the only files you should modify):
- `apps/server/src/mastra/lib/project-store.ts` — add the logger sink,
  wire it into `chainProjectWrite`, export the setter.
- `apps/server/src/mastra/lib/project-store.test.ts` — add one test that
  asserts a failed write triggers the injected logger.

**Out of scope** (do NOT touch):
- `route.ts` and `tools/scrape.ts` call sites — they keep their
  `void appendX(...)` shape.
- `flushProjectLogs` — its signature and never-throwing behavior stay.
- The Mastra `PinoLogger` — `lib/` stays Mastra-free; the sink is a plain
  callback. (A follow-up plan could wire `setProjectWriteFailureLogger`
  into the PinoLogger from `index.ts`; do NOT do that here.)
- DOX files — no behavioral contract changes that need documenting.

## Git workflow

- Branch: `advisor/002-surface-log-write-failures`.
- Commit message style (match repo): e.g.
  `fix(server): log append-only write failures instead of swallowing them`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the logger sink above `chainProjectWrite`

In `apps/server/src/mastra/lib/project-store.ts`, just above the
`chainProjectWrite` definition, add a module-scoped sink and an exported
setter. Match the file's existing style (JSDoc on the export, alphabetical
placement is handled by `oxlint --fix` later).

```ts
export type ProjectWriteFailureLogger = (
  id: string,
  error: unknown,
) => void

let projectWriteFailureLogger: ProjectWriteFailureLogger = (
  id,
  error,
) => {
  // Default: stderr so operators see dropped log lines without coupling
  // this leaf module to the Mastra logger. The server entrypoint may
  // override via `setProjectWriteFailureLogger` to route through
  // PinoLogger instead.
  console.error(
    `[project-store] append-only log write failed (project=${id}):`,
    error,
  )
}

/** Override the per-project write-failure logger. Pass a no-op to silence,
 *  or a PinoLogger-backed sink to route failures through the server's
 *  observability stack. The sink MUST NOT throw — `chainProjectWrite` calls
 *  it from a promise-rejection handler where a throw becomes an unhandled
 *  rejection. */
export function setProjectWriteFailureLogger(
  sink: ProjectWriteFailureLogger,
): void {
  projectWriteFailureLogger = sink
}
```

**Verify**: `pnpm --filter @workspace/server typecheck` → exit 0 (no
callers yet, but the new symbols must parse cleanly).

### Step 2: Wire the sink into `chainProjectWrite`

Replace the swallow-on-reject line in `chainProjectWrite` with a call to
the sink. Keep `prev.then(run, run)` exactly as-is (resilience); only
change the final `.then`:

```ts
function chainProjectWrite(
  id: string,
  run: () => Promise<unknown>,
): Promise<void> {
  const prev = projectWriteChains.get(id) ?? Promise.resolve()
  const next = prev.then(run, run).then(
    () => undefined,
    (error: unknown) => {
      projectWriteFailureLogger(id, error)
      return undefined // never-reject contract preserved
    },
  )
  projectWriteChains.set(id, next)
  void next.finally(() => {
    if (projectWriteChains.get(id) === next) projectWriteChains.delete(id)
  })
  return next
}
```

Update the leading JSDoc to mention the new behavior — add one line below
the existing description:

> A rejected `run` (or a rejected previous chain link) is logged via the
> project write-failure logger (`setProjectWriteFailureLogger`, default
> `console.error`) and then swallowed — the chain never rejects, so
> fire-and-forget callers in `route.ts` keep working, but operators get a
> stderr line per failure instead of silent data loss.

**Verify**: `pnpm --filter @workspace/server typecheck` → exit 0.

### Step 3: Add a regression test in `project-store.test.ts`

In `apps/server/src/mastra/lib/project-store.test.ts`, add a new test
inside the existing `describe('append-only debug logs')` block (or a fresh
`describe` adjacent to it — match the file's existing structure). The test
must:

1. Override the sink with a capturing `vi.fn()` via
   `setProjectWriteFailureLogger`.
2. Create a project, then make its project dir non-writable
   (`chmod 0o555`) so the next `appendFile` fails with EACCES.
3. Call `appendClientMessage(project.id, { ... })` (which goes through
   `chainProjectWrite`).
4. `await flushProjectLogs(project.id)` to let the chain settle.
5. Assert the sink was called with `(project.id, <error>)`.
6. `chmod 0o755` in a `finally` so the test's `afterEach` cleanup can
   delete the project dir.

Use `node:fs/promises` `chmod` (already imported at the top of the test
file). The PROJECTS_DIR constant is already defined at the top of
`project-store.test.ts` — reuse it to build the dir path.

```ts
import { chmod } from 'node:fs/promises'    // add to existing import
// …
it('routes a failed append-log write through the write-failure logger', async () => {
  const sink = vi.fn()
  setProjectWriteFailureLogger(sink)

  const project = await createProject()
  createdProjectIds.push(project.id)
  const projectDir = join(PROJECTS_DIR, project.id)

  try {
    await chmod(projectDir, 0o555)
    await appendClientMessage(project.id, {
      dir: 'out',
      event: 'text',
      payload: { delta: 'hi' },
      ts: 't-fail',
    })
    await flushProjectLogs(project.id)
    expect(sink).toHaveBeenCalledTimes(1)
    expect(sink).toHaveBeenCalledWith(project.id, expect.anything())
  } finally {
    await chmod(projectDir, 0o755)
    setProjectWriteFailureLogger(defaultSink) // restore — see Step 3 note
  }
})
```

**IMPORTANT — sink reset between tests.** The module-scoped sink survives
across tests in the same Vitest worker. Add an `afterEach` (or extend the
existing top-level one) that resets the sink to its default behavior so
this test does not pollute the others. Capture the default at module
load: `const defaultSink = (id, e) => console.error(...)` is awkward to
grab; instead, expose a third export `resetProjectWriteFailureLogger()`
that restores the default, OR (simpler) capture a reference to the
default by calling `setProjectWriteFailureLogger` with a fresh
`console.error`-backed sink in `afterEach`. Pick whichever is cleaner —
the simpler "third export" approach is preferred:

In Step 1, also add:
```ts
export function resetProjectWriteFailureLogger(): void {
  projectWriteFailureLogger = defaultProjectWriteFailureLogger
}
```
where `defaultProjectWriteFailureLogger` is the original `console.error`
arrow function extracted to a named const so it can be re-installed.

Then the test's `afterEach` (or the file's existing `afterEach`) calls
`resetProjectWriteFailureLogger()`.

**Verify**: `pnpm --filter @workspace/server test -- --run project-store 2>&1 | tail -15`
→ the new test passes, no other test regressed.

### Step 4: Full verification

**Verify** (all must pass):
- `pnpm --filter @workspace/server typecheck` → exit 0.
- `pnpm --filter @workspace/server lint` → exit 0. (`perfectionist/sort-*`
  may want the new symbols in a specific order — run `pnpm --filter
  @workspace/server lint:fix` if needed; confirm only formatting moved.)
- `pnpm --filter @workspace/server test` → exit 0; baseline test count + 1
  new test; coverage ≥ 90%.

### Step 5: Confirm scope

**Verify**: `git diff --stat` lists ONLY
`apps/server/src/mastra/lib/project-store.ts` and
`apps/server/src/mastra/lib/project-store.test.ts`.

## Test plan

One new test (described in Step 3). It pins the contract:

- A failed `appendClientMessage` write must call the injected sink with
  `(projectId, error)`.
- `flushProjectLogs(projectId)` must still resolve (never-reject contract
  preserved).
- The sink MUST NOT throw (or it becomes an unhandled rejection); the
  default `console.error` satisfies this.

Pattern to follow for the structure: the existing
`'serializes concurrent client appends without interleaving lines'` test
(~line 674 of `project-store.test.ts`) — same `createProject` + append +
read pattern.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm --filter @workspace/server typecheck` exits 0
- [ ] `pnpm --filter @workspace/server lint` exits 0
- [ ] `pnpm --filter @workspace/server test` exits 0; test count is
      baseline + 1; coverage ≥ 90%
- [ ] `grep -nE 'setProjectWriteFailureLogger|resetProjectWriteFailureLogger|projectWriteFailureLogger' apps/server/src/mastra/lib/project-store.ts`
      shows all three symbols present
- [ ] `git status --short` lists ONLY the two in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check is non-empty AND the live `chainProjectWrite` body does
  not match the excerpt above (someone reworked the chain since
  planning). Re-confirm the never-reject contract is still in place
  before proceeding.
- `chmod 0o555` does not produce an EACCES on `appendFile` in the test
  environment (e.g. running as root in CI, where permissions are ignored).
  In that case, use a different failure trigger — e.g. delete the
  project's `client-messages.jsonl` parent dir mid-test, or rename the
  project dir; pick whichever reliably produces a rejection from
  `appendFile`. Report which one you used.
- `flushProjectLogs(projectId)` rejects in the new test. That would mean
  the never-reject contract broke — investigate before continuing.
- The default `console.error` sink triggers an Oxlint error (it should
  not — `no-console` is not in the rule set — but if a future config
  change adds it, switch the default to a no-op and document that the
  server entrypoint must wire a real sink).

## Maintenance notes

- After this lands, **a follow-up plan** (not this one) can wire
  `setProjectWriteFailureLogger` from `apps/server/src/mastra/index.ts`
  (or `apps/server/src/index.ts` startup) to route through the Mastra
  `PinoLogger`. That keeps `lib/` Mastra-free while giving the failures
  first-class observability. Do not bundle that wiring into this plan —
  it crosses a package boundary this plan deliberately respects.
- Anyone changing `chainProjectWrite` in the future MUST preserve the
  never-reject contract (`route.ts`'s `void appendX(...)` callers depend
  on it). The sink is the only sanctioned side-channel for failures.
- The `prev.then(run, run)` shape is intentional (one failed append must
  not poison the chain for the next). Do not "simplify" it to
  `prev.then(run)` — that would silently drop every write after a
  failure.
- Reviewer: the diff should add the sink + setter + resetter, change one
  `.then` line in `chainProjectWrite`, update its JSDoc, and add one
  test. Reject any change to caller signatures or to the
  `prev.then(run, run)` resilience pattern.
