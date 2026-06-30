# .scratch DOX

## Purpose

- Holds disposable experiments, reference scaffolds, and one-off local notes that are not production source.

## Ownership

- `mastra-ref/`: reference Mastra scaffold used during migration research.
- `pi-edit-diff.ts`, `pi-grep.ts`: copied/reference routines used to inform in-memory tool ports.

## Local Contracts

- Do not import runtime code from `.scratch` into apps or packages.
- Do not place secrets here.
- If a scratch artifact becomes durable, move the decision to `plans/` or the implementation to the owning app/package.

## Work Guidance

- Keep scratch contents small enough to understand; remove obsolete generated dependencies when no longer useful.

## Verification

- No automated check exists for scratch artifacts.

## Child DOX Index

- None.
