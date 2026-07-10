# Checkup

Use checkup for fast, evidence-grounded landing-page triage. It answers whether the page is healthy enough to continue, needs focused repair, or has a critical problem that blocks trust or use.

> **Manifest mutation lock:** Reading this operation file never opens the lock by itself. Reuse successful full reads already present in the project conversation, then complete every still-unread root-manifest path and receive its result before calling `edit` or `generate_image`.

Checkup is diagnostic. When the user asks only for a checkup, inspect and explain; do not edit. When the user also asks for fixes, carry the observed findings into the treatment mode selected by the root skill.

## Evidence boundary

Inspect the rendered page when screenshot capture is available and inspect the corresponding HTML. Do not infer a working interaction, responsive state, or accessibility property from appearance alone.

Mark anything unavailable as unverified. A smaller honest check is better than an invented healthy status.

## Six vitals

Score each vital as **Healthy** (10), **Watch** (5), or **Critical** (0), for a total out of 60.

### Intentionality

Does the page look authored for this exact name, category, audience, and offer? The first viewport should establish a specific visual lane rather than a reusable template.

### Readability

Can visitors understand the claim, proof, and next action without effort? Check hierarchy, type size, line length, contrast, and dense or vague copy.

### Conversion path

Is the primary action obvious, credible, and supported by enough proof? Check navigation, CTA language, trust material, form friction, and escape paths that actually exist.

### Responsiveness

Does the story survive the available mobile, tablet, and desktop profiles? Look for overflow, crushed text, broken media, poor ordering, tiny targets, and lonely ultrawide composition.

### Performance feel

Does the rendered page show obvious layout shift, oversized imagery, slow media, or janky visual effects? Record only what is visible or source-inspected; do not claim profiling.

### Accessibility

Inspect semantic structure, heading order, alt text, focus styling, contrast, touch targets, reduced-motion rules, and the keyboard semantics implied by native elements. Do not claim assistive-technology testing that did not occur.

## Prompt fidelity gate

Before scoring style, verify:

- The supplied name is exact
- The category is clear in the first viewport
- The proof object belongs to the domain
- Claims answer the audience's pressure
- The primary action matches the offer
- No unrelated content or visual premise leaked from another page

A page that could fit any company after a logo swap cannot score Healthy for intentionality.

## Output

State the total as `N/60`, list each vital with its status and observed evidence, then give the few highest-impact prescriptions in priority order. Use `unverified` where evidence is unavailable.

## Done when

- Every status is tied to rendered or source evidence
- Critical issues are obvious and prioritized
- The user knows whether to continue, repair, or reconsider direction
- No mutation is claimed unless fixes were explicitly requested and applied
