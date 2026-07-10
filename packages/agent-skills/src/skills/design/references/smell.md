# Smell

Use smell to detect design choices that look unchosen, recycled, or generated. Smell is diagnostic. It names visible tells and the foundations that should treat them; it does not edit unless the user also requests fixes.

> **Current-turn mutation lock:** Reading this operation file never opens the lock by itself. If the request will mutate, complete every unread path in the root manifest and receive all results before calling `edit` or `generate_image`.

A smell must be observed on the current page. Personal taste, technical imperfection, or suspicion without visible evidence is not a finding.

## Ten tells

### Tech gradient

Blue-violet, indigo-cyan, or purple-teal gloss used as automatic technology identity rather than a choice tied to the product.

### Generic category hue

A palette that could be predicted from the industry alone: navy legal, teal health, green payments, dark terminal developer, warm orange food, or another first reflex.

### Equal feature tiles

Repeated icon, heading, and sentence cards with no priority, narrative role, or meaningful comparison.

### Accent rail

A colored side stripe used to simulate structure or importance without semantic purpose.

### Unearned glass

Blurred translucent panels added because the page has no coherent depth or surface model.

### Statistic monument

Oversized numbers presented without source, context, comparison, consequence, or connection to the claim.

### Icon topper

Decorative rounded-square icons above headings that neither explain nor operate anything.

### Motion reflex

Repeated bounce, fade-up cascades, parallax, or hover theater that does not guide attention or explain state.

### Default type

A familiar family used with no project-specific reason, hierarchy, tuned measure, or loaded-font verification.

### Center stack

Centered headline, subtitle, pills, CTA, mockup, and equal cards used because no content-driven composition was chosen.

## Prompt drift

Wrong names, recycled logo marks, inherited headline shapes, unrelated proof objects, and assets or copy from another brief are severe smells even when visually polished. Return to the current name, category, audience, artifact, evidence, and action.

## Domain-default test

Ask whether the visual direction could have been guessed before seeing the prompt. If so, identify the exact reflex and the missing product-specific decision. Unexpected is not automatically good; specificity is the goal.

## Severity and score

Score each tell `1` when absent and `0` when observed. Total the result out of 10:

- `10/10`: Clean
- `7–9/10`: Faint
- `5–6/10`: Present
- `3–4/10`: Strong
- `0–2/10`: Identity failure

A cluster matters more than one isolated detail. Record the visible evidence for every zero; do not lower the score for an unverified suspicion.

## Route treatment

- Composition tells → relayout or redesign
- Color tells → recolor
- Type tells → typeset
- Brand-lane or proof drift → voice or redesign
- Motion tells → motion
- Vague language → writing
- Multiple systems failing together → redesign or deslop

## Done when

- The score is stated as `N/10` with the correct clean direction
- Every detected tell maps to visible evidence
- Prompt drift is called out before cosmetic sameness
- The dominant reflex and appropriate treatment are clear
- No mutation is claimed unless fixes were explicitly requested and applied
