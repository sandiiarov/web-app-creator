# Landing page iteration

Use this guide for follow-up changes to an existing landing page: focused edits, refinement, relayout, or redesign. The user's language selects the smallest operation that satisfies the request; they do not need to name an operation.

## Start from continuity

Inspect the current project HTML and relevant screenshots before changing it. Identify:

- The exact product, audience, offer, proof, and primary action
- The established visual premise, reading path, and strongest working decisions
- The requested surface and the visible problem or desired outcome
- Valid links, forms, scripts, assets, semantics, responsive behavior, and accessibility that must survive
- Names, claims, content, exclusions, and brand constraints that must not drift

If the consolidated creation reference is already present in the conversation, reuse it rather than reading it again. A broad redesign in a conversation without creation context may also need `references/create.md`; a focused follow-up normally does not.

Do not rewrite product scope to make a visual change easier. Sections and systems outside the requested surface stay intact unless the requested outcome requires a coherent page-wide change.

## Choose the smallest operation

### Focused edit

Use for a precise request such as changing one headline, CTA, image, control, spacing relationship, responsive failure, or section detail. Preserve neighboring content and systems. Resolve local consequences caused by the edit, but do not turn them into an unrelated page-wide pass.

### Refine

Use when the page direction is substantially right but its character, clarity, or resilience needs adjustment. Choose one coherent move from observed evidence:

- **Push:** strengthen hierarchy, proof, composition, imagery, or type and color commitment
- **Settle:** reduce competing focal points, saturation, motion, depth, and repeated emphasis
- **Strip:** remove filler, redundant actions, weak containers, repeated claims, and effects that obscure the path
- **Proof:** make the composition survive realistic copy, narrow and wide screens, missing media, or real control states
- **Activate:** clarify the first viewport, proof sequence, action, useful defaults, or contextual explanation
- **Texture:** add one or two specific material, type, image, or motion moments where emotion already belongs

Do not combine opposing moves unless distinct areas demonstrably need them. “Stronger” does not automatically mean more gradients, glass, noise, or animation; “quieter” does not mean gray or generic.

### Relayout

Use when content and visual identity are substantially right but the arrangement, grouping, order, or reading path is wrong. Preserve the established color, typography, surface, and content systems unless the user includes them in scope.

A relayout needs a visible structural change, such as:

- A new focal point or first-viewport composition
- A different relationship between claim and proof
- Reordered sections or groups
- Changed navigation or CTA placement
- A transformed grid, split, editorial flow, comparison, or layered composition
- Responsive ordering that improves how the story is understood

Diagnose where the eye lands, where it should land, the visitor's job, the strongest claim and proof, repeated visual weight, and desktop order that fails on mobile. Spacing and width may support the solution but should not be the whole structural pass.

### Redesign

Use when the same landing-page product and message should inhabit a genuinely different visual world. Preserve the exact offer, audience, claims, conversion goal, credible proof, supplied assets, valid behavior, accessibility, and performance expectations unless the user changes them.

First diagnose the old premise: composition, reading path, type voice, color mood, imagery, edges, depth, motion, what works, and what makes the page generic or wrong for the brief. Then name a new physical or cultural direction and what it is not.

The new direction should coherently determine:

- Composition and section rhythm
- First-viewport proof and imagery
- Type family, scale, and density
- Color roles and contrast
- Buttons, frames, radius, and depth
- Responsive recomposition
- Interaction and motion personality

Different does not mean louder. Change the premise rather than swapping a palette, enlarging the hero, or adding obvious effects. Establish the new tokens and page shell, then carry the language through every affected section and real control state without leaving isolated remnants of the old system.

## Common iteration rules

Keep claim, proof, trust, and action in a deliberate sequence. Place trust before high-risk asks and repeat CTAs only at genuine decision points. Let imagery do a named job rather than compete with the message.

Mobile can recompose while preserving the same story. Maintain meaningful source and focus order, visible focus, touch access, hover-independent behavior, readable measures, useful crops, and reduced-motion handling.

Apply presentation and state changes only to controls that actually exist. A landing-page edit does not justify inventing application behavior, fake form states, or decorative interactivity.

Use specific, supplied, or realistic content. Preserve terminology and claims; do not invent evidence. Any generated or replaced imagery must fit the established premise, placement, crop, palette, and alt-text role.

## Work and verification loop

1. Inspect the current source and rendered evidence.
2. Name the observed problem, requested outcome, and smallest fitting operation.
3. Map the coherent affected surface and preserve explicit invariants.
4. Edit incrementally, including responsive and real control states touched by the change.
5. Inspect the affected desktop and mobile views; use tablet when composition changes there.
6. Inspect source for semantics, destinations, source and focus order, media rules, hidden states, and reduced motion.
7. Correct regressions before reporting completion.

A screenshot establishes only the rendered state shown. Source inspection can establish implementation but not exercised interaction. Describe keyboard, touch, submission, animation, assistive-technology, and performance behavior as unverified unless an available tool actually exercised it.

## Done when

- The selected operation directly answers the user's stated outcome
- The requested surface changed visibly and coherently
- Unaffected product content, behavior, and brand decisions remain intact
- Claim, proof, and action are clearer or more resilient
- Mobile and desktop preserve the same landing-page story
- No old-system fragment or local regression undermines the change
- Every completion claim matches rendered or source evidence
