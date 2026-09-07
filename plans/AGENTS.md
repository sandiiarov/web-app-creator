# Architecture Plans DOX

## Purpose

- Own architecture implementation plans, their execution order, review evidence, and status.

## Ownership

- `README.md`: current backlog, dependency order, historical plan status, and deferred decisions.
- Numbered plans: self-contained scope, current-state evidence, migration contracts, verification gates, and completion criteria.
- Reports and evidence files: validation records associated with a numbered plan.

## Local Contracts

- Plans describe proposed behavior until implementation passes its gates; do not present TODO plans as current app contracts.
- Continue numbering monotonically. Reconcile or supersede existing plans instead of creating duplicate work.
- Each active plan records the audited commit and working-tree drift assumptions. Preserve unrelated user changes.
- Status: TODO, IN PROGRESS, DONE, BLOCKED with a reason, or REJECTED with a reason. DONE requires implementation and recorded verification.
- Keep secrets and private environment values out of plans/evidence. Reference only credential types or relevant paths when necessary.

## Work Guidance

- The selected architecture backlog is 014–018: runtime isolation, durable storage, provider execution, run lifecycle, and recoverable event contracts.
- Preserve one local server and current product behavior while establishing those boundaries. Follow prerequisite contracts and refresh a plan when unexplained source drift invalidates it.
- Keep historical reports intact; label stale conclusions rather than treating old completion records as proof of current behavior.
- Implementation updates the owning source AGENTS chain as well as plan status.

## Verification

- Check every local link and dependency target, unique plan numbering, and agreement between dependencies and execution order.
- Review each plan for explicit scope, executable gates, failure behavior, legacy compatibility, and independent executability.
- Documentation-only planning does not run the application test suite. Executors run the gates in their selected plans.

## Child DOX Index

- None.
