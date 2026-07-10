# Shadow

Shadow communicates depth, overlap, and attention. Use shadow as a full mode when depth is the request; when loaded as support, apply it only to layers touched by the active mode. A valid decision may be to remove shadows entirely.

## Choose a depth model

Decide whether the page is:

- **Flat:** spacing, color, and borders carry hierarchy
- **Framed:** subtle edge plus restrained depth
- **Layered:** surfaces rise according to role
- **Atmospheric:** light and shadow contribute to brand imagery or a hero moment

Use one model consistently. Shadow should not compensate for unresolved layout.

## Tie elevation to role

Common landing-page uses include:

- Navigation floating above content
- Menus or temporary surfaces
- A featured proof object
- Forms or conversion panels that need separation
- Image frames and tactile brand elements
- Hover lift on genuinely interactive objects

Do not invent modals, dragged items, or stacked cards merely to demonstrate elevation.

## Keep one light source

Shadows should share direction and visual logic. Larger or higher surfaces can use broader, softer shadows; small controls need restrained depth. Colored shadow is an art-direction decision, not a default accent technique.

## Dark surfaces

On dark backgrounds, surface lightness and borders often communicate depth better than black blur. Use shadow only when it remains visible without mud or glow.

## Interaction and motion

Depth changes should correspond to a real state such as hover, focus, open, or selected. Pair a small shadow change with restrained transform when useful. Avoid large animated blur and scroll-driven shadow theater.

## Performance

Large blurred shadows, stacked layers, filters, and full-viewport glows can be expensive. Keep ambitious effects bounded to small areas and inspect the rendered result for obvious jank; do not claim profiling without a profiler.

## Refuse

- Heavy elevation on every repeated section
- Several unrelated shadow recipes
- Shadow as decoration for empty cards
- Strong border and strong shadow competing
- Invisible dark-theme shadows with huge blur
- Hover lift on noninteractive content

## Verification

Use screenshots to judge layer order, light consistency, muddiness, and whether depth supports attention. Inspect source for reused shadow tokens and reduced-motion handling when depth animates.

## Done when

- Depth order is obvious where layers exist
- Shadow strength matches object role and size
- Flat surfaces remain flat when elevation adds no meaning
- Dark surfaces use value and edge before muddy blur
- Interactive depth corresponds to a real state
