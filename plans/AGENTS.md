# Plans DOX

## Purpose

- Owns durable advisor findings, implementation handoffs, dependency ordering, and execution status.

## Ownership

- `README.md`: audit summary, prioritized execution order, dependencies, deferred findings, and status ledger.
- `NNN-*.md`: self-contained implementation plans written for executors with no prior session context.

## Local Contracts

- Plans may describe source changes but advisor work in this directory must not implement them.
- Every plan names its source commit, exact scope, verification commands, done criteria, and STOP conditions.
- Executors update only their status row in `README.md`; findings remain as durable records after completion.
- Never include secret values. Refer only to a credential type and source location when relevant.

## Work Guidance

- Keep numbering monotonic and preserve completed or rejected plans.
- Reconcile drift before execution when an in-scope file changed after a plan's `Planned at` commit.
- Use one implementation commit per plan unless the operator explicitly changes that workflow.

## Verification

- `git diff --check -- plans`
- Confirm every `TODO` row has a matching plan file and every plan dependency exists.

## Child DOX Index

- None.
