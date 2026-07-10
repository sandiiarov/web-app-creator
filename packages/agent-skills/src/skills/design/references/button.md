# Button

Buttons make decisions visible. Use button as a full mode when the control system is the request; when loaded as support, change only buttons touched by the active mode. Merely reading this file never triggers a page-wide button rebuild.

## Establish hierarchy

A decision area should have one unmistakable primary action.

- **Primary:** the main conversion or commit
- **Secondary:** a valid alternative that does not compete
- **Tertiary or link:** navigation, escape, or low-emphasis support
- **Danger:** a real destructive action, rare on landing pages

A page can repeat the same primary destination at meaningful decision points. It should not present several unrelated actions as equally primary.

## Name the result

Use a concrete verb and object or destination: book a tour, start a trial, view the collection, compare plans, download the guide. Avoid Submit, Click here, vague Learn more, and Yes/No when the action can be named.

Keep labels short enough to scan but specific enough to set expectation. Do not fabricate urgency.

## Shape and size

Size follows prominence and context. Primary landing CTAs can be generous; navigation and inline actions can be quieter. Keep touch targets usable even when the visible icon is small.

Radius belongs to the page's physical language. Pills are valid when the brand or control type earns them, not as the automatic CTA shape. Keep icon style, padding, label alignment, and height consistent among related controls.

## Implement applicable states

Every button needs resting, focus-visible, hover where supported, and active/pressed treatment. Add disabled, pending, success, or failure only when behavior can enter those states.

- Focus must remain visible and unclipped.
- Hover should not be the only action cue.
- Press feedback should be brief and restrained.
- Pending state should preserve footprint and prevent duplicate submission when applicable.
- Disabled controls should not look actionable; explain why when context does not.
- Icon-only controls need accessible names and sufficient hit areas.

Do not add decorative spinners or fake success to a static link.

## Placement

Place the primary action where the visitor has enough context to decide. Keep secondary actions nearby but quieter. On mobile, stacking or full width may improve reach and label fit.

In navigation, avoid turning every link into a pill. In repeated pricing or comparison surfaces, preserve one consistent selection and action model.

## Destructive actions

Prefer undo for recoverable actions. Irreversible actions need a clear consequence and safe escape. Red is not a marketing accent and danger should never become the default conversion style.

## Verification

Use screenshots to judge hierarchy, size, label fit, and visible states. Inspect source for semantics, accessible names, focus, hover, active, disabled, pending, and reduced-motion rules. Do not claim activation or submission without an interaction tool.

## Done when

- The primary action is obvious without making every action loud
- Labels state what happens
- Touch targets and focus treatment are usable
- Only applicable states are implemented
- Repeated controls share one hierarchy and physical language
- Supporting edits remain within the active mode's scope
