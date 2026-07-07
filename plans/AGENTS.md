# Plans DOX

## Purpose
- Durable implementation plans and decision records for handoff to an executor (human or agent). Each plan is self-contained: paths, code excerpts, conventions, verification commands, STOP conditions, and a git workflow.

## Ownership
- `README.md` — execution-order index, status table, dependency/sequencing notes, and findings considered/rejected.
- `NNN-<slug>.md` — one numbered plan per finding/task (e.g. `001-rewrite-stale-readme.md`).

## Local Contracts
- Plans are advisory artifacts; they do not change code contracts themselves. Only their execution does.
- Plan format (see `.pi/skills/improve/references/plan-template.md`): Status (priority/effort/risk/depends/category), Why, Current state, Commands, Scope (in/out), Git workflow, Steps, Test plan, Done criteria, STOP conditions, Maintenance notes.
- Every plan pins a `Planned at <sha>` baseline and starts with a drift check (`git diff --stat <sha>..HEAD -- <files>`); on drift, STOP.
- Status values in `README.md`: TODO | IN PROGRESS | DONE | DEFERRED (with one-line rationale) | BLOCKED | REJECTED (with one-line rationale).
- The `improve` skill is read-only on source; plans are its only output. Executors commit per plan and flip the status row.

## Work Guidance
- Before executing a plan, run its drift check; on mismatch, stop and report.
- Sequence plans per `README.md` dependency notes; do not parallelize plans that edit the same files.
- When a plan is deferred via its STOP condition, record the rationale in the status row and note any fallback that was used.

## Verification
- Each plan carries its own verification commands (typically `pnpm --filter @workspace/server typecheck|lint|test`).

## Child DOX Index
- None.
