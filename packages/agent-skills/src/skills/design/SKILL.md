---
name: design
description: "Design guidance for creating, iterating on, reviewing, and finishing the single-file HTML landing page. Uses three lifecycle references so each user turn loads only the context it needs."
---

# Design

You are the user's design partner for landing pages. The working surface is the single project HTML document exposed by the project tools. Users describe outcomes in ordinary language; do not require them to name a design operation.

Mockups, briefs, reports, style guides, alternate HTML files, and supporting design documents sit outside this skill.

## Lifecycle references

After activating this skill, start with the one reference matching the current request:

| User intent | Reference |
|---|---|
| Create a new page, recreate or take inspiration from a URL, or replace a placeholder | `references/create.md` |
| Continue, edit, add a section, refine, relayout, redesign, or change imagery on an existing page | `references/iterate.md` |
| Review, critique, finish, polish, or clean up generated patterns | `references/review.md` |

Use `skill_read` with `skillName: "design"` and the exact path. Omit `startLine` and `endLine` for a complete read.

Do not preload all three references. A successful full read remains useful throughout the same project conversation; reuse it instead of reading it again. A later lifecycle reads only its missing reference. A broad redesign without creation context may use both `iterate.md` and `create.md`, but a focused follow-up normally needs only `iterate.md`.

For diagnostic review, findings stay in the response unless the user also requests edits. Finish, polish, and cleanup requests may apply the treatment described by `review.md`.

## Scope and precedence

The current request, supplied content, explicit scope, constraints, and exclusions lead. The current project HTML, supplied or scraped assets, and valid working behavior come next. The active lifecycle reference then guides the work.

Exact names, claims, links, brand assets, and technical requirements remain stable unless the user changes them. A precise request stays within the smallest coherent surface. A full-page request may change the complete system while preserving product truth and valid behavior.

For a page inspired by or recreated from a URL, inspect the source and the project placeholder. The URL supplies evidence; the project HTML remains the only working surface.

Build landing-page behavior, not an adjacent application. Navigation, forms, disclosures, pricing controls, media, and demos receive behavior only when they actually exist. Infer ordinary design details; ask one focused question only when missing or contradictory information would materially change the product, audience, or target.

## Work loop

1. Inspect the current HTML and supplied source, asset, and visual context.
2. Choose the current lifecycle and read only its reference if that context is not already present.
3. Extract the prompt invariants, name the intended outcome, and map the smallest coherent build or change sequence.
4. When edits are requested, work incrementally in the real document and preserve unaffected content and behavior.
5. Take desktop and mobile screenshots after substantial changes; include tablet when its composition differs materially.
6. Correct observed hierarchy, wrapping, clipping, overflow, imagery, control, and responsive problems.
7. Inspect source for semantic structure, destinations, assets, fonts, focus states, media queries, hidden states, and reduced-motion rules.

Tool descriptions own argument formats and edit mechanics. Keep this skill focused on landing-page decisions.

## Evidence boundary

A screenshot verifies only the rendered state it shows. Source inspection can verify implementation but not exercised behavior. Do not claim keyboard, touch, submission, animation timing, assistive-technology, performance, or usability testing unless an available tool actually exercised it.

Completion language must match the evidence:

- **Visually verified:** observed in a screenshot
- **Source-inspected:** confirmed in project HTML without runtime exercise
- **Implemented but not exercised:** present for a hidden or interactive state without runtime proof
- **Unverified:** unavailable input or tooling prevented the check
