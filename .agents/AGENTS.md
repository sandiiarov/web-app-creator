# .agents DOX

## Purpose

- Owns project-local agent skill source files used by this repository.
- `.pi/skills/*` symlinks point into `.agents/skills/*`; treat `.agents` as the editable source of those skills.

## Ownership

- `skills/fallow/`: Fallow analysis skill and references.
- `skills/improve/`: Improve advisor skill — read-only codebase surveys producing implementation plans for other agents.
- `skills/mastra/`: Mastra framework skill, references, and helper scripts.
- `skills/shadcn/`: shadcn/ui skill, rules, assets, and registry docs.
- `skills/turborepo/`: Turborepo skill and references.

## Local Contracts

- Skill docs are operational prompts; edits change future agent behavior.
- Keep every `SKILL.md`, relative reference path, script path, and linked file consistent.
- Do not store service secrets, generated app output, or run logs here.

## Work Guidance

- Update `skills-lock.json` at the repository root when the installed skill set or symlink layout changes.
- Prefer verified, reusable rules over one-off task notes.

## Verification

- No automated check exists for local skill source edits.

## Child DOX Index

- None.
