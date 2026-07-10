# Motion

Motion guides attention, explains origin and state, and contributes to brand character. Use motion as a full mode when animation is the request; when loaded as support, animate only elements touched by the active mode. Reading this file does not require adding motion.

## Give movement a sentence

Every animation should communicate at least one thing:

- This arrived or became available
- This came from that trigger
- This state changed
- This action was received
- This content is processing
- This item is selected or expanded
- This proof deserves attention now

If the sentence is only “this looks more premium,” remove or rethink the animation.

## Build a small motion vocabulary

Define a limited set of durations and easing roles:

- Fast tactile response for press and focus feedback
- Short transitions for menus, disclosures, and small state changes
- Moderate transitions for larger spatial changes
- Slower expressive timing only for an earned brand entrance or narrative moment

Exits usually complete faster than entrances. Keep sequences short enough that content remains available rather than performing before visitors can use it.

## Choose material responsibly

Transform and opacity are the primary tools because they are predictable and performant. Bounded blur, clipping, masks, filters, shadow changes, or variable type can support a specific art direction when the affected area is limited and the result is visually verified.

Avoid animating layout properties when transform, opacity, or a discrete state can express the same change. Do not hide slow work behind decorative motion.

## Entrances and scroll

One composed first-viewport reveal or a few meaningful section transitions can establish pacing. Do not apply the same fade-up to every heading and card. Stagger only when order helps comprehension; use deliberate fixed timing rather than random delay.

Scroll-linked effects must preserve control, reading, and performance. Never hijack scrolling. Keep sticky, parallax, and scrubbed movement subordinate to content and provide a no-spatial-motion alternative.

## Interaction feedback

Buttons and controls may use brief press, hover, focus, open, selection, pending, success, or error motion only for states they can enter. Hover motion needs a focus or touch-equivalent cue where meaning is involved.

Continuous motion near reading content is distracting. Loading indicators may loop while a real wait exists; decorative loops should stop or be removed.

## Reduced motion

Implement `prefers-reduced-motion` whenever motion exists. Replace large translation, scale, parallax, and scrubbed sequences with instant state changes or restrained fades while preserving focus, progress, and confirmation.

Do not add a settings control solely to satisfy reduced-motion support. A product-level motion preference belongs only when requested or already part of the interface.

## Verification

Use screenshots to confirm resting composition and source inspection to verify keyframes, triggers, transitions, and reduced-motion overrides. A screenshot cannot prove timing or interaction. Describe motion as source-inspected unless the available runtime evidence actually shows it.

Check that animated properties are bounded and that hidden initial states cannot leave content invisible if scripts fail.

## Refuse

- Motion on every element
- Generic fade-up cascades
- Bounce or elastic easing as an automatic personality
- Unused keyframes or unreachable states
- Scroll hijacking
- Infinite decoration near text
- Motion that delays the primary action
- Spatial motion without reduced-motion behavior
- Claiming measured smoothness without profiling

## Done when

- Every animation has a clear communication role
- Timing and easing form a small consistent vocabulary
- Content remains available without waiting for theater
- Reduced motion preserves meaning
- Interactive motion belongs to real controls and states
- Completion claims distinguish implementation from observed runtime behavior
