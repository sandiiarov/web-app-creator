# Plan 009: Sync the README edit-engine description with the hashline + agent-map reality

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report — do not improvise. When done, update
> the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 4e199c45..HEAD -- README.md`
> If `README.md` changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `4e199c45`, 2026-07-07

## Why this matters

`README.md` is the product's own contract doc and the first thing a contributor
reads. Its description of the agent's tools is frozen at the **old anchor-range
edit engine**: `read`/`find` are described as "compact `anchor|text` lines" and
`edit` as "anchor-based HTML edits". The server was migrated to the
**snapshot-verified hashline** engine (vendored under
`apps/server/src/mastra/lib/hashline/`), and the `screenshot` tool now also
returns a **Set-of-Marks `elementMap`** with numbered badges on interactive
elements. A reader of the current README forms the wrong mental model of the
core edit path and never learns the screenshot element map exists.

This is distinct from the already-DONE plan 001 ("Rewrite the stale README to
match the OpenRouter/Mastra server"), which fixed the *server-stack* framing.
This plan fixes the *tool-engine* drift that landed after 001.

## Current state

- `README.md` — the product README; line 43 is the stale paragraph (full file
  was recon-read at `4e199c45`).
- `apps/server/src/mastra/AGENTS.md` — already current (documents hashline +
  elementMap); do **not** touch it. It is the source of truth for the wording
  below if you want to cross-check.

The exact stale text at `README.md:43` today:

```markdown
**The agent** is a Mastra agent backed by OpenRouter. It builds the page with these tools: `scrape` (Firecrawl a reference URL + OCR its images), `read`/`find` (inspect the current HTML as compact `anchor|text` lines), `edit` (anchor-based HTML edits), `screenshot` (ask the browser to render and visually QA the page), and `generate_image` (OpenRouter image model). A `design` skill is injected as system-prompt guidance.
```

The facts the corrected description must reflect (verified during the
hashline + snapdom-agent-map work; inlined so the executor needs no session
context):

- `read` — paginated, **line-numbered** view of the current HTML; each read
  returns a snapshot `tag` the model echoes back when editing.
- `find` — regex/literal search over those HTML **lines**, returning matches
  with surrounding line context.
- `edit` — applies a **snapshot-verified line diff**; rejects stale/fabricated
  snapshot tags (`MismatchError`) and guards HTML tag balance before committing.
  This replaces the old inclusive `from–to` anchor-range edit.
- `screenshot` — asks the browser to render the page, **annotates interactive
  elements with numbered red badges**, OCRs the capture, and returns visual-QA
  notes **plus a Set-of-Marks `elementMap`** (one line per element:
  `index role "name" @x,y w×h [state]`) so the agent can reference elements by
  badge index.
- `scrape` / `generate_image` — unchanged.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Grep checks (no build needed) | `grep -nE "anchor-based\|anchor\\|text" README.md` | no matches in the tool-list context |
| Render sanity | `pnpm --filter @workspace/client build` | exit 0 (README is bundled into the client? only if so — otherwise skip; see Step 2) |

## Scope

**In scope** (the only file you should modify):
- `README.md` — the "The agent" paragraph at line 43.

**Out of scope** (do NOT touch, even though they look related):
- `apps/server/src/mastra/AGENTS.md` and the rest of the DOX chain — already
  current; they are the source of truth, not the stale surface.
- The "Per-project data" paragraph and the HTTP route list — accurate as-is.
- Any source code — this is a docs-only plan.

## Git workflow

- Branch: `advisor/009-sync-readme-edit-engine` (or the repo's convention if one is evident).
- Commit message style — match the repo, e.g.:
  `docs(readme): sync edit-engine + screenshot elementMap description [plan-009]`
  (see `git log --oneline` for the `docs(...)` / `feat(...)` + bracket-tag style.)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Replace the tool-list sentence in the "The agent" paragraph

In `README.md`, replace the single sentence that lists the tools so that
`read`/`find`/`edit`/`screenshot` match the facts above. Keep `scrape` and
`generate_image` as-is. Keep the "A `design` skill is injected as system-prompt
guidance." sentence as-is.

Suggested replacement sentence (use this or tighter equivalent — the facts must
hold, the prose is yours to tighten):

> It builds the page with these tools: `scrape` (Firecrawl a reference URL + OCR its images), `read`/`find` (inspect the current HTML as line-numbered, snapshot-tagged views), `edit` (apply a snapshot-verified line diff; stale tags and unbalanced HTML are rejected), `screenshot` (ask the browser to render the page, annotate interactive elements with numbered badges, and return visual-QA notes plus a Set-of-Marks element map), and `generate_image` (OpenRouter image model).

**Verify**: `grep -nE "anchor-based HTML edits" README.md` → no matches.

### Step 2: Confirm the README is not compiled into a build artifact

Check whether any build step ingests `README.md` (e.g. a Vite plugin or a
`?raw` import). If it does, run that build as the render check; if not, the
grep checks in Done criteria are sufficient and no build is needed.

**Verify**: `grep -rnE "README\.md|readme" apps/client/vite.config.* packages/vite-config/src 2>/dev/null` → either no matches (skip build) or matches you then exercise with the relevant `pnpm --filter ... build`.

## Test plan

- No automated tests — this is prose. Verification is grep-based (below).
- Optionally: open `README.md` rendered (GitHub preview or `glow`/`mdcat`) and
  confirm the paragraph reads cleanly and the tool names still match the
  server's actual tool exports in `apps/server/src/mastra/tools/`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -cE "anchor-based HTML edits" README.md` → `0`
- [ ] `grep -cE "anchor\\|text" README.md` → `0`
- [ ] `grep -cE "Set-of-Marks|element map|snapshot-verified|line-numbered" README.md` → `≥1`
- [ ] `git status --short` shows only `README.md` modified (no other files)
- [ ] `plans/README.md` status row for 009 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `README.md:43` does not match the excerpt in "Current state" (the file has
  drifted since this plan was written).
- You find a second stale tool-engine reference elsewhere in `README.md` (report
  it so the plan can be widened deliberately rather than edited ad hoc).
- The README turns out to be build-ingested and the build fails for reasons
  unrelated to your edit.

## Maintenance notes

- Re-check this paragraph whenever the agent's tool set changes. The source of
  truth for tool behavior is `apps/server/src/mastra/AGENTS.md` (+ the
  per-tool `apps/server/src/mastra/tools/*.ts` `description` strings) —
  reconcile the README against those, not memory.
- A reviewer should scrutinize only that the corrected wording matches the
  actual tool behavior (no over-claiming, e.g. don't say "pixel-perfect" ).
