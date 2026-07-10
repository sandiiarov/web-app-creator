# Tokenize

Use tokenize to consolidate repeated design decisions inside the single project HTML document. Tokenize reduces drift; it does not create an external component library, stylesheet, design-system document, or speculative abstraction.

> **Current-turn mutation lock:** Reading this operation file never opens the lock by itself. If the request will mutate, complete every unread path in the root manifest and receive all results before calling `edit` or `generate_image`.

## Find proven repetition

Extract only patterns that repeat with the same intent:

- CSS values with one semantic role
- Repeated type, spacing, color, radius, border, shadow, or motion decisions
- Selectors or utility classes representing the same visual pattern
- Repeated markup structures that can share a class or data attribute
- Repeated inline-script behavior that can use one small helper
- States of the same control that have drifted apart

Matching numbers are not enough. Two identical values serving different meanings may need separate tokens. One isolated value can remain local.

## Use the document's native tools

### CSS custom properties

Create semantic properties such as `--color-action`, `--space-section`, `--radius-control`, or `--duration-feedback`. Primitive scales are useful only when semantic consumers remain clear.

### Shared selectors and classes

Move repeated declarations into the smallest selector that expresses a real relationship. Avoid giant generic classes, long override chains, and selectors so broad that unrelated sections become coupled.

### Repeated markup

Within one HTML file, reuse class and data-attribute conventions rather than inventing a component build system. Preserve semantic elements, accessible names, and source order.

### Inline behavior

When repeated script behavior exists, extract a small named function with a narrow input. Preserve current triggers, state, focus behavior, and error handling. Do not introduce a framework or module boundary for one page.

## Migrate safely

1. Inventory repeated uses and confirm shared intent.
2. Name the token or pattern by role rather than current value.
3. Add the shared definition.
4. Migrate real consumers in small groups.
5. Remove duplicate declarations only after the migrated page renders correctly.
6. Verify responsive, focus, hover, active, reduced-motion, and hidden-state behavior touched by the consolidation.

Do not change the visual direction merely to make extraction easier. Tokenize should usually preserve the rendered result while making future edits safer.

## Refuse

- Tokens or classes with no consumers
- A universal component abstraction for one occurrence
- Tokenizing every number
- Value names such as `blue-500` where consumers need semantic meaning
- External CSS, JavaScript, component, or documentation files
- Accessibility regressions hidden by visual parity
- Large rewrites unrelated to repeated decisions

## Done when

- Real repeated decisions share one implementation
- Names explain purpose rather than current appearance
- No unused abstraction was introduced
- Duplicate code is removed only after migration
- The rendered page and relevant responsive states remain stable
- All changes remain inside the project HTML
