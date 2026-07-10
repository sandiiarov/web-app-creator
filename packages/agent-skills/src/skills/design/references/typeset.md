# Typeset

Typography makes the page understandable, readable, and recognizable. Use typeset as a full mode when the type system is the request; when loaded as support, change only typography affected by the active mode.

## Start with content and voice

Choose type from the page's language, audience, subject, and physical or cultural lane. A museum caption, field manual, event poster, product catalog, receipt, or technical instrument each suggests different proportions and texture.

For brand surfaces, the family should carry a project-specific reason. For product demonstrations and dense controls, a well-tuned system or utility family can be the clearest choice.

Verify every named font is loaded or available. A CSS family value that silently falls back is not an implemented type choice.

## Build a useful hierarchy

Use as many levels as the content needs and no more. Distinguish them through a coordinated mix of:

- Size
- Weight
- Width or family
- Line height
- Letter spacing
- Color
- Position and surrounding space

Each adjacent level should be visibly different. Avoid a timid scale where headline, subhead, and body compete, and avoid dramatic display type that overwhelms the proof or CTA.

## Control measure and rhythm

Body copy needs comfortable line length and leading. Short labels can be tighter; explanatory paragraphs need more air. Display text may be wide or compressed when the art direction earns it, but wrapping must remain intentional on mobile.

Tune:

- Headline wrapping and balance
- Paragraph measure
- Caption and metadata contrast
- Button and navigation labels
- Price, metric, or comparison alignment when present
- Form labels, hints, errors, and success text when present

Use tabular numerals for values that must align. Use all caps sparingly and add tracking only when the family and role support it.

## Pair with restraint

One expressive family with a useful weight range can carry the whole page. Add a second family only when it creates a real contrast in structure or voice. A third family needs a distinct, visible job; otherwise it is noise.

Do not pair two nearly identical geometric sans families or use decorative display faces for body copy. Preserve supplied brand typography unless change is explicitly in scope.

## Responsive type

Use fluid display sizing when it improves the landing composition, with sensible minimum and maximum values. Body text must remain comfortably readable. Check long words, localization expansion, narrow screens, and zoom-friendly units.

Avoid shrinking text merely to preserve a desktop arrangement. Change the layout or wrap instead.

## Performance and fallback

Load only required weights and styles. Use robust fallback stacks and font-display behavior that avoids invisible text and severe layout shift. Do not import several families for one decorative line.

## Verification

Use screenshots to judge hierarchy, wraps, measure, density, and voice at relevant profiles. Inspect source for actual font loading, fallback stacks, fluid sizing, and repeated type tokens. Do not claim a font is present without confirming its source or availability.

## Done when

- The primary message reads before decoration
- Body text is comfortable on mobile and desktop
- Headings wrap intentionally with realistic content
- Type hierarchy uses consistent reusable roles
- Every family has a distinct job and actually loads
- The page would retain character if color were removed
