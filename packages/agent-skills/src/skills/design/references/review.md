# Review

Use review for an evidence-grounded critique of the landing page as an experience. Review is diagnostic: when the user requests only a review, inspect and explain without editing. If fixes are also requested, carry prioritized findings into the appropriate treatment mode.

> **Current-turn mutation lock:** Reading this operation file never opens the lock by itself. If the request will mutate, complete every unread path in the root manifest and receive all results before calling `edit` or `generate_image`.

## Evidence boundary

Inspect the rendered surface when screenshot capture is available and inspect relevant HTML. Do not state an interaction, responsive state, accessibility behavior, or performance property as fact unless the available evidence supports it. Mark unavailable checks as unverified.

## Read the page as a visitor

Start with the first viewport before reading implementation details:

- What is this?
- Who is it for?
- What specific promise is made?
- What proof can be inspected?
- What should happen next?
- What visual or verbal detail is memorable?

Then follow the story through proof, explanation, objections, trust, and action. Note where attention, credibility, or momentum breaks.

## Five lenses

Score each lens out of 10, for a total out of 50.

### First impression

Does the page establish category and point of view quickly? Is the first viewport authored or interchangeable?

### Story and hierarchy

Does the reading path prioritize claim, proof, objection, and action? Are sections paced and weighted according to importance?

### Proof and credibility

Is the evidence concrete, domain-specific, and proportional to the promise? Are claims supported rather than decorated?

### Visual voice

Do type, color, imagery, layout, edges, and depth belong to one lane and this particular brief? Call out observed generated-design tells.

### Conversion and behavior

Are navigation, CTAs, links, forms, demos, responsive behavior, focus styling, and recovery clear where they exist? Do not penalize the page for application states it does not need.

## Prompt fidelity

Treat wrong names, recycled proof objects, unrelated assets, unsupported claims, and category-default design as primary failures. A polished page that ignores the prompt is not successful.

## Recommendations

Order findings by impact. For each major finding, state:

- The observed evidence
- Why it matters to the visitor or business goal
- The correct mode or foundation for treatment
- What visible outcome would resolve it

Use plain language. Avoid vague praise and long inventories of equal-weight issues.

## Done when

- The total is stated as `N/50`
- Every score has observed evidence or is marked unverified
- The page's strongest quality and primary failure are clear
- Recommendations are prioritized and map to concrete treatment
- No mutation is claimed unless fixes were explicitly requested and applied
