# Landing page creation

Use this guide to create a complete landing page in the project's existing single HTML document. It consolidates the page strategy, art direction, layout, copy, responsive, interaction, accessibility, motion, and verification guidance needed for creation.

## Start from evidence

Inspect the current project HTML before composing. A new project may already contain a placeholder document; build into that document incrementally rather than creating an alternate file or replacing everything in one oversized edit.

If the page is inspired by or recreated from a URL, inspect both the source and the project placeholder. Treat the source as evidence for content, assets, and visual relationships, not as permission to invent claims or ignore the project's working surface.

Extract these invariants:

- **Name and category:** the exact product, person, venue, service, or feature
- **Audience and pressure:** who arrived and what decision or task brought them
- **Offer and action:** the promise and the primary next step
- **Artifact and evidence:** the concrete object, workflow, result, environment, or comparison that makes the promise credible
- **Content and assets:** required copy, links, imagery, brand assets, and supplied facts
- **Constraints and exclusions:** technical limits, requested omissions, and facts that must not change
- **Drift to refuse:** unrelated names, layouts, proof objects, copy, or visual reflexes inherited from another page

Ask one focused question only when missing or contradictory information would materially change the product, audience, or target. Infer ordinary design details.

## Define the premise

Write one internal sentence for the page's visual world and one for the visitor's path. Use a specific physical or cultural lane—such as a field guide, gallery label, workshop ledger, club poster, bottle mark, technical instrument, theater program, or coastal catalog—rather than generic adjectives. Name what the page is not so the direction does not drift toward an industry default.

Choose the visitor's dominant job:

- **Decide:** claim, proof, risk reduction, and one dominant action
- **Learn:** readable progression, examples, and increasing depth
- **Explore:** meaningful paths or collections with preserved orientation
- **Compare:** stable criteria and clearly aligned differences

Choose a proof object visitors can inspect: a real workflow, record, transformation, comparison, environment, product view, result, place, material, or physical subject. Let it shape the composition instead of floating as a decorative panel beside the headline.

The first viewport should establish the exact name and category, a specific promise, the proof object, the primary action, and one memorable visual or verbal cue. Restraint can be distinctive; timid neutrality is not a direction.

## Build the page

### 1. Story, semantics, and copy

Establish meaningful landmarks and a purposeful section order. A page may need arrival, proof, explanation, objection handling, trust, and action, but add only sections required by the visitor's path.

Use supplied or realistic content. Preserve exact names and claims. Never invent metrics, customers, testimonials, awards, guarantees, or working behavior. Remove placeholder text and dead destinations.

Keep proof close to the claim it supports, trust before a high-risk ask, and repeated actions only at genuine decision points. Headlines, body copy, navigation, captions, CTA labels, form text, and alt text should share one voice. Prefer concrete nouns and verbs; name actions by result or destination rather than using “Submit,” “Click here,” or vague “Learn more.”

### 2. Layout and hierarchy

Identify the first, second, and third reads before styling details. Choose a composition lane because it supports the visitor's job and proof:

- Symmetric for singular, formal, or calm moments
- Asymmetric for directed energy with a deliberate counterweight
- Strict grid for rigor, comparison, or dense proof
- Editorial flow for narrative pacing and cultural voice
- Image-led field for physical or atmospheric proof
- Type-led field for strong language and typographic identity
- Modular composition for distinct proof objects with real hierarchy

Give each section one dominant focal point. Use size, contrast, density, isolation, imagery, and position according to priority rather than centering every element.

Use spacing as grammar: tight within one thought, wider between related groups, and largest between ideas. Cards are for discrete, comparable, or interactive objects—not ordinary prose. Prefer alignment, measure, dividers, and negative space before adding wrappers.

### 3. Visual system

Define only CSS custom properties the page uses: color, type, spacing, edges, depth, and motion. Set the page shell, content measure, grid, and responsive order before decoration.

- **Color:** derive the palette from supplied identity, imagery, environment, material, or artifact. Assign semantic roles for canvas, alternate surfaces, text, borders, actions, focus, and real form states. Keep meaning legible without hue alone and verify contrast on actual surfaces.
- **Typography:** choose families for the page's subject and cultural lane, verify that every font and required weight actually loads, and use as few families as possible. Establish visibly distinct hierarchy, readable body measure and leading, intentional headline wraps, useful fallbacks, and responsive sizing.
- **Imagery:** give every image a job—message, proof, explanation, atmosphere, or detail. Use suitable supplied or scraped assets. Generate imagery only when it strengthens the premise and available assets cannot. One decisive image is stronger than filler.
- **Surfaces:** choose one leading physical model: flat, framed, layered, or atmospheric. Borders, radius, and shadows must clarify structure, interaction, or art direction. Keep one coherent edge and depth vocabulary; flat composition is complete without elevation.

The hero, proof, type, color, imagery, surfaces, words, and motion should feel derived from the same premise.

### 4. Real controls and behavior

Implement only landing-page behavior that actually exists. Navigation, anchors, CTAs, lead forms, disclosures, pricing controls, media controls, and demos do not justify invented application scope.

Use native elements and appropriate semantics. Make actions recognizable before interaction. Real controls need visible focus, hover where supported, active treatment, adequate touch area, and accessible names. Hover is enhancement, never the only cue.

For real forms, keep labels visible, explain errors and recovery without blame, preserve values, and provide pending, success, or failure copy only for states the form can enter. Do not present decorative fields as functional.

### 5. Responsive composition and access

Recompose the same story for mobile, tablet, desktop, and wide screens instead of squeezing or merely stacking the desktop shape. Preserve category, claim, proof, trust, and primary action while changing order, crop, navigation, density, or comparison strategy when needed.

Choose CSS breakpoints from content pressure. Keep source and focus order meaningful. Check headline wrapping, body measure, touch targets, navigation without hover, image crop, overflow, fixed elements, forms, awkward tablet columns, and runaway wide-screen line lengths. Do not remove core content because space is tight.

Accessibility remains part of the design: landmarks and heading order, sufficient contrast, visible unclipped focus, useful alt text, relative and zoom-tolerant units, touch-sized controls, and authored reduced-motion behavior.

### 6. Purposeful motion

Add motion only when it guides attention, reveals origin or state, explains feedback, or reinforces the premise. A page may intentionally use no expressive motion.

Use a small vocabulary of durations and easing. Prefer transform and opacity, keep sequences brief, avoid scroll hijacking and continuous decoration near reading content, and do not hide slow work behind theater. If motion exists, implement `prefers-reduced-motion` so meaning and state remain available. Hidden initial states must not leave content invisible when scripts fail.

## Refuse generated defaults

Do not substitute familiar effects for a brief-specific decision:

- Blue-purple technology gradients or other palettes predicted by industry alone
- A centered headline, pills, CTA, generic mockup, and equal feature-card grid
- Decorative icon toppers, accent rails, glass, glow, or nested cards without a structural job
- Unsupported statistic monuments, vague claims, or proof that is only decoration
- Default fonts, interchangeable software panels, and category stock imagery
- Gradient text, glossy CTA gradients, excessive pills, unrelated radius recipes, or shadows on static content
- Repeated fade-up entrances, bounce, parallax, or hover lift with no communication role

Specificity is the goal, not novelty for its own sake. If a choice could move unchanged to an unrelated company, reconnect it to the prompt's name, audience, artifact, evidence, action, or visual lane.

## Work and verification loop

1. Inspect the current HTML and supplied or scraped visual context.
2. Extract invariants, define the premise, and map the smallest coherent build sequence.
3. Build incrementally: structure and content, tokens and layout, responsive behavior, real interaction, then purposeful motion.
4. Take screenshots after substantial changes and correct what the rendered page exposes.
5. Inspect source where it provides evidence that screenshots cannot.

For a complete page, inspect desktop and mobile screenshots; inspect tablet when its composition differs materially. Check first-viewport commitment, hierarchy, proof prominence, section rhythm, wrapping, clipping, image crops, action prominence, and cross-section cohesion.

Inspect source for semantic landmarks, heading and focus order, destinations, image sources and alt text, actual font loading, reused tokens, media queries, overflow, focus states, hover fallbacks, form or disclosure states, and reduced-motion rules.

A screenshot proves only the rendered state shown. Source inspection can establish implementation but not exercised behavior. Do not claim keyboard, touch, submission, animation timing, accessibility technology, color-vision simulation, performance, or usability testing unless an available tool actually exercised it.

## Done when

- The complete page lives in the real project HTML and contains no placeholder or invented evidence
- Name, category, promise, proof, and action are specific and clear in the first viewport
- Story, composition, type, color, imagery, surfaces, words, and motion share one premise
- Sections form a coherent decision, learning, exploration, or comparison path
- Mobile and desktop preserve the same story without clipping or unintended overflow
- Real controls have semantic, focus, touch, and state treatment without invented product scope
- Generic design reflexes have been replaced by prompt-specific decisions
- Relevant screenshots and source checks support every completion claim
