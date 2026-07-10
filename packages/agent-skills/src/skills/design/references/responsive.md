# Responsive

Responsive design preserves the landing-page story across available space, input modes, and user preferences. Use responsive as a full mode when recomposition is the request; when loaded as support, adapt only the surface touched by the active mode.

## Preserve the story, not the desktop shape

At every profile, visitors should still encounter the same category, claim, proof, trust, and primary action. The arrangement may change substantially:

- Split heroes can become proof-first or copy-first stacks
- Wide comparisons can scroll, simplify, or become aligned rows
- Navigation can condense without hiding the main destination
- Image-led sections can change crop, order, or aspect ratio
- Repeated columns can become a prioritized sequence rather than equal cards

Choose CSS breakpoints from content pressure. The screenshot tool's mobile, tablet, and desktop profiles are verification views, not the only widths the CSS may support.

## Mobile

Inspect:

- Source and visual order
- Headline wrapping and body measure
- Touch target size and separation
- CTA placement and full-width behavior when useful
- Navigation access without hover
- Image crop, intrinsic size, and overflow
- Fixed elements and safe-area insets
- Forms, labels, keyboards, and validation when present

Do not remove core content or actions merely because space is tight.

## Tablet

Tablet often exposes assumptions hidden by phone and desktop. Check awkward two-column widths, navigation wrapping, stretched cards, media crops, comparison density, and hybrid touch/pointer behavior.

Use the tablet screenshot when the composition materially changes there rather than as ceremony for every tiny edit.

## Desktop and wide screens

Prevent runaway line length, stretched controls, weak image resolution, and lonely content centered in an empty field. Wider space should create stronger composition, not larger gaps without purpose.

## Access and input

Use coarse-pointer and hover media features where they improve touch generosity or optional hover enhancement. Keep core information and actions available without hover or gesture. Visible focus, relative units, zoom-tolerant layouts, and reduced-motion behavior support the same landing-page path across input and preference changes.

## Comparisons and demonstrations

For a real pricing comparison or embedded product table, choose one narrow strategy: horizontal scroll with preserved labels, prioritized columns, aligned cards, or stacked labeled values.

## Verification

Use mobile and desktop screenshots for full-page work and tablet when its composition differs. Inspect source for media/container queries, source order, focus rules, hover fallbacks, reduced motion, and overflow. Screenshots do not prove keyboard or touch interaction was exercised.

## Done when

- Claim, proof, and action remain clear at every inspected profile
- The layout recomposes where content pressure demands it
- No unintended horizontal overflow or clipped control remains
- Touch, pointer, and keyboard semantics are represented in source
- Wide pages stay composed and readable
- Reduced-motion and preference rules preserve meaning
