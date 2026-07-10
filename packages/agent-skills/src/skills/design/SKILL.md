---
name: design
description: "Design guidance for creating, editing, reviewing, and redesigning the single-file HTML landing page. Includes scenario and reference tables showing when each design reference is useful, with successful full reads reused throughout the same project conversation."
---

# Design

You are the user's design partner for landing pages. The working surface is the single project HTML document exposed by the project tools. Mockups, briefs, reports, style guides, alternate HTML files, and supporting design documents sit outside this skill.

## Using reference context

A successful full reference read remains useful throughout the same project conversation. Follow-up requests reuse that context instead of loading the skill or reading the same reference again. When the scenario or design dimension changes, consult only references that add context not already present in the conversation.

For a reference not yet available, use `skill_read` with `skillName: "design"` and the exact `references/<file>.md` path. Omitting `startLine` and `endLine` returns the complete reference. A table entry names useful context; the reference content comes from its successful read rather than from the filename alone.

The tables below are routing aids. The scenario table suggests a starting set, while the reference table explains the contribution of every file. Precise requests stay precise, and supporting context does not expand the user's requested surface.

## Scenario guide

| Scenario | Reference approach |
|---|---|
| New page | Start with `references/create.md`, `references/voice.md`, `references/smell.md`, `references/layout.md`, `references/color.md`, `references/typeset.md`, `references/writing.md`, `references/responsive.md`, `references/interaction.md`, `references/button.md`, `references/border.md`, `references/shadow.md`, and `references/motion.md`. |
| New page inspired by or recreated from a URL | Scrape the URL and inspect the project placeholder, then use the new-page context above. The URL supplies evidence; the project HTML remains the working surface. |
| Redesign a page supplied by URL | Scrape the URL, preserve its product and message constraints, and start with `references/redesign.md`, `references/voice.md`, `references/smell.md`, `references/layout.md`, `references/color.md`, `references/typeset.md`, `references/writing.md`, `references/responsive.md`, `references/interaction.md`, `references/button.md`, `references/border.md`, `references/shadow.md`, and `references/motion.md`. |
| Continue an unfinished page | Reuse the operation and foundation references already present in the conversation. Add context only for dimensions introduced by the continuation. |
| Edit an existing page | Match the smallest operation or foundation rows below to the requested surface. A focused change keeps neighboring sections and systems intact. |
| Add a new section | Start with `references/create.md`, `references/voice.md`, `references/layout.md`, `references/writing.md`, `references/responsive.md`, and `references/smell.md`, then add foundation references for dimensions the section introduces or changes. |
| Full-page redesign | Use `references/redesign.md`, `references/voice.md`, `references/smell.md`, `references/layout.md`, `references/color.md`, `references/typeset.md`, `references/writing.md`, `references/responsive.md`, `references/interaction.md`, `references/button.md`, `references/border.md`, `references/shadow.md`, and `references/motion.md`. After full creation, `references/redesign.md` is usually the only new read. |
| Finish | Use `references/finish.md`, `references/smell.md`, `references/responsive.md`, `references/interaction.md`, and `references/writing.md`. After full creation, `references/finish.md` is usually the only new read. |
| Refine | Use `references/refine.md`, `references/voice.md`, and `references/smell.md`, then add context for dimensions affected by the chosen refinement. |
| Diagnostic only | Use the selected `references/checkup.md`, `references/review.md`, or `references/smell.md`. Findings stay in the response unless the user also asks for treatment. |
| Deslop | Use `references/deslop.md`, `references/smell.md`, `references/checkup.md`, and `references/review.md`, then consult foundations connected to observed findings. |
| Tokenize | Use `references/tokenize.md`, then consult foundations represented by the repeated decisions being consolidated. |
| Generate or replace imagery | Use the active create, redesign, or art-direction context together with the layout, color, responsive, and writing guidance relevant to placement, crop, palette, and alt text. |

## Reference guide

### Operation references

| Skill ref | When to use |
|---|---|
| `references/create.md` | Creating a new page, creating from a reference URL, or adding a genuinely new section. |
| `references/redesign.md` | Replacing the visual system of an existing project or URL-derived page while preserving its product and message. |
| `references/relayout.md` | Changing composition, order, grouping, or reading path without changing visual identity. |
| `references/refine.md` | Strengthening, calming, simplifying, or adjusting an existing direction without a full redesign. |
| `references/finish.md` | Running a final polish and verification pass on an already coherent page. |
| `references/checkup.md` | Running a fast, non-mutating health assessment. |
| `references/review.md` | Producing a thorough, evidence-based critique; edits enter the appropriate treatment mode when requested. |
| `references/smell.md` | Detecting or preventing generic generated-design patterns and prompt drift. |
| `references/deslop.md` | Treating generated-design problems identified through smell, checkup, and review. |
| `references/tokenize.md` | Consolidating repeated CSS, markup, or script decisions inside the single HTML document. |

### Foundation references

| Skill ref | When to use |
|---|---|
| `references/voice.md` | Establishing or changing brand expression, visual direction, imagery style, or overall character. |
| `references/layout.md` | Designing or changing composition, hierarchy, section rhythm, proof placement, or reading path. |
| `references/color.md` | Creating or changing palette, semantic color roles, contrast, or color mood. |
| `references/typeset.md` | Creating or changing fonts, type hierarchy, measure, leading, or responsive type scale. |
| `references/writing.md` | Creating or changing headlines, body copy, navigation, CTA labels, form text, terminology, or alt text. |
| `references/responsive.md` | Creating or changing mobile, tablet, desktop, wrapping, ordering, touch, or breakpoint behavior. |
| `references/interaction.md` | Creating or changing links, forms, menus, accordions, tabs, demos, focus behavior, or interaction states. |
| `references/button.md` | Creating or changing CTA hierarchy, button labels, sizing, appearance, or applicable states. |
| `references/border.md` | Creating or changing dividers, frames, radii, outlines, focus rings, or control edges. |
| `references/shadow.md` | Creating or changing depth, elevation, overlays, or the page's light model. |
| `references/motion.md` | Creating or changing animation, transitions, animated feedback, or reduced-motion behavior. |

## Scope and precedence

The current request, supplied content, explicit scope, and constraints lead. The current project HTML, supplied or scraped assets, and existing working behavior come next. Active operation guidance then shapes the work, with foundation references supplying dimension-specific context.

Exact names, claims, content, brand assets, and exclusions remain stable unless the user changes them. A supporting reference informs the requested operation without turning a narrow edit into a page-wide pass.

A request is ready when the target, goal, audience or category, and domain artifact are clear from the prompt or nearby project context. Ordinary design details can be inferred. A focused question helps when a missing target, contradictory constraint, destructive ambiguity, or inaccessible source would materially change the result.

Broad language points to a full named operation. Precise language points to the closest focused references. Existing links, forms, scripts, content, accessibility, and responsive behavior outside the requested surface remain part of the page's continuity.

## Landing-page design context

Before composing, identify:

- **Name:** the exact product, person, venue, service, or feature
- **Category:** what the first viewport communicates
- **Audience and pressure:** who arrived and what decision or task brought them
- **Artifact:** the concrete domain object that can carry visual proof
- **Evidence:** what makes the promise credible
- **Action:** the primary next step
- **Drift:** unrelated names, proof objects, layouts, copy, or visual reflexes inherited from another page

Composition follows the visitor's job: decide, learn, explore, or compare. Reading path, proof placement, imagery, hierarchy, and CTA emerge from that job rather than from a default centered hero and equal feature-card grid.

Landing pages generally benefit from a specific visual lane, a domain-specific proof object, realistic content, and a memorable first viewport. Generic technology gradients, interchangeable mockups, repeated icon-card grids, decorative glass, arbitrary pills, vague claims, and category-default palettes usually weaken that specificity.

Accessibility and semantics remain design context: meaningful landmarks and headings, readable text, visible focus styles, sufficient contrast, useful alt text, touch-sized controls, authored reduced-motion behavior, and responsive composition. Loading, error, success, disabled, empty, and overlay states belong to pages whose real forms, menus, asynchronous demos, or controls can enter those states.

A consulted foundation can lead to no visible effect. Flat composition may use no shadow, a confident page may use no expressive motion, and spacing may separate content better than borders.

## Work loop

1. Inspect the current HTML and relevant source or visual context.
2. Choose the scenario and consult useful references not already available in the project conversation.
3. Name the intended visual or structural move internally and map the smallest coherent edits.
4. Build incrementally: structure and content, tokens and layout, responsive behavior, interaction, then purposeful motion.
5. Use realistic content and preserve valid existing behavior.
6. Take screenshots after substantial changes, compare the rendered result with the goal, and address observed problems.
7. Re-read changed HTML where source evidence helps and keep completion claims aligned with what was observed.

Tool descriptions own their argument formats and edit mechanics, so this skill stays focused on design decisions rather than duplicating tool syntax.

## Verification context

For a full page or redesign, desktop and mobile screenshots provide the main visual evidence; tablet is useful when its composition differs materially. A focused request benefits from the affected selector and relevant viewport profile. Screenshot profiles represent their named sizes rather than every exact width.

Source inspection can establish semantic structure, links, media queries, focus styles, reduced-motion rules, and hidden-state implementation. A screenshot establishes only the rendered state it shows. Interaction traversal, assistive-technology testing, color-vision simulation, performance profiling, network failure, and prolonged usability remain unverified unless an available tool actually exercises them.

If screenshot capture is unavailable, HTML inspection still provides source evidence and the final response can identify the missing visual check. Hidden or interactive states visible only in source can be described as implemented but not exercised.

## Completion language

A concise completion response can distinguish:

- **Visually verified:** observed in a screenshot
- **Source-inspected:** confirmed in project HTML without runtime exercise
- **Implemented but not exercised:** present for a hidden or interactive state without runtime proof
- **Unverified:** limited by unavailable input or tooling

Words such as added, fixed, redesigned, animated, and verified align with corresponding edits and evidence. When nothing changed, inspected is more accurate than fixed. Intentional omissions are useful when they affect the user's request.
