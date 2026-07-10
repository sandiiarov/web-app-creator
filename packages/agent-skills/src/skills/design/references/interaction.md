# Interaction

Interaction covers how the landing page responds to pointers, touch, keyboard, waiting, success, and failure. Use it as a full mode when behavior is the request; when loaded as support, implement only interactions touched by the active mode.

## Start with what actually exists

Landing-page interactions commonly include:

- Navigation and anchor links
- Primary and secondary CTAs
- Menus and mobile navigation
- Forms and validation
- Accordions, tabs, carousels, or disclosures
- Pricing toggles or comparison controls
- Embedded product demonstrations
- Media controls

Do not invent application states or controls to satisfy a checklist. For every real control, account for the states it can enter.

## Affordance and response

Visitors should know what is actionable before interacting. Use label, shape, position, cursor, underline, iconography, and contrast consistently.

Pointer hover can enhance but never carry required meaning. Active/pressed feedback should confirm contact without excessive movement. Disabled styling belongs only to controls that can genuinely become unavailable, with nearby context when the reason is not obvious.

## Focus and keyboard semantics

Use native interactive elements whenever possible. Keep focus visible, consistent, and unclipped. Source order should follow the visual and conceptual path.

Menus, dialogs, tabs, and disclosures require the keyboard semantics appropriate to their pattern. Escape and focus return matter for temporary surfaces. If available tools cannot exercise the path, verify implementation in source and describe it honestly.

## Touch

Targets need enough physical area and separation. Small visual icons can use larger hit areas. Do not rely on hover, precise dragging, or gesture-only control. Place repeated or primary actions where they remain reachable without obscuring content.

## Forms

Keep labels visible. Preserve entered values on validation failure. Put errors near the field and explain recovery. Match validation timing to the issue: required checks on submit, formatting after interaction, and remote checks after a short pause when they truly exist.

A form needs clear pending, success, and failure resolution only when submission behavior is implemented. Static decorative fields are misleading and should not be presented as working controls.

## Menus and overlays

Use interruption sparingly. Keep temporary surfaces inside the viewport, above clipping ancestors, and dismissible. Long content usually deserves an inline section or destination rather than a modal.

## Waiting and recovery

Give immediate acknowledgement when an operation actually waits. Preserve user work on failure. Offer retry only when retry can succeed. Prefer reversible actions over confirmation when the action is recoverable.

## Motion relationship

Motion can reveal origin, state, selection, progress, or completion. It must have a reduced-motion equivalent and remain subordinate to behavior. A hover animation without focus treatment is incomplete.

## Verification

Use screenshots to judge visible resting states and source inspection for hover, focus, active, pending, error, success, and reduced-motion implementation. Do not claim clicks, keyboard traversal, form submission, or recovery was exercised without an interaction tool.

## Done when

- Every real control has clear affordance and appropriate source-defined states
- Focus is visible and logical
- Touch targets and hover fallbacks are present
- Forms preserve input and explain recovery when forms exist
- Menus and disclosures use appropriate semantics
- Verification claims distinguish rendered evidence from source inspection
