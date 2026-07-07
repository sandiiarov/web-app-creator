import { createSkill } from '@mastra/core/skills'

const DESIGN_REFERENCES = {
  'border.md': `# Border
Borders clarify structure, state, focus, and containment. Use thin rules for separation, stronger treatments for focus/selected/error states, and a consistent radius language. In this product, sharp architectural edges are the default: set radius to 0 unless the user's prompt explicitly asks for softness. A border earns its place when removing it would make grouping or state less clear.`,
  'button.md': `# Button
Buttons make decisions visible. Each action needs a clear verb, accessible name, visible focus, usable hit area, and distinct rest/hover/active/disabled/loading treatment when those states apply. One primary action should lead a decision surface. Secondary actions support without competing. Labels such as "Compare plans", "Book a demo", or "Generate preview" beat vague labels when the outcome can be named.`,
  'color.md': `# Color
Choose color from the requested product, audience, proof, brand evidence, imagery, and emotional arc. Define semantic roles in CSS variables: canvas, surface, text, muted text, border, primary action, focus, selection, success, warning, error, and disabled. Check contrast and grayscale hierarchy. Avoid generic blue-purple tech gradients, AI-rainbow palettes, and category-default colors unless the brief gives a real reason.`,
  'create.md': `# Create
Build the generated landing page inside the existing project HTML document. Replace the placeholder with semantic HTML, responsive CSS, accessible landmarks, real copy, a clear first viewport, and a proof object specific to the user's domain. Start from structure, then spacing, then surface, then responsive behavior, then meaningful interaction and motion.`,
  'finish.md': `# Finish
Finish means the page is ready to view without apology. Tighten rough spacing, remove placeholders, fix weak CTAs, align tokens, verify image alt text, check mobile layout, preserve focus states, and make the page title and metadata fit the current project. Completion claims should match visible changes in the project HTML.`,
  'interaction.md': `# Interaction
Interaction covers hover, focus, active, loading, empty, error, success, disabled, selected, and overflow states where the page includes them. Focus must be visible. Touch targets must be usable. Keyboard order should follow visual order. Motion and state changes should explain what happened rather than decorate the page.`,
  'layout.md': `# Layout
Layout directs attention. Name the visitor's dominant job first: monitor, operate, compare, configure, learn, decide, or explore. Then place content so the first read, second read, proof, and action are obvious. Use spacing, alignment, section rhythm, and visual mass to create a path. Cards are for genuinely discrete objects, not the default answer to every section.`,
  'motion.md': `# Motion
Motion communicates state, direction, causality, and attention. Default to calm static presentation; add movement only where it makes the interface clearer or the brand moment stronger. Prefer transform and opacity, short durations, consistent easing, and reduced-motion alternatives. Press feedback around 150ms and subtle state transitions are usually enough.`,
  'redesign.md': `# Redesign
Redesign changes the visual world while preserving the user's goal. Shift composition, type, color, component language, edges, depth, state treatment, and responsive behavior together. The new direction should be visible before color alone is noticed. Choose a lane that fits the brief: editorial, technical, tactile, strict grid, type-led, expressive, dense utility, or another specific direction.`,
  'refine.md': `# Refine
Refinement changes character, clarity, resilience, or delight without losing the current page's purpose. Pick the move that fits: push a flat page, settle a loud page, strip clutter, proof edge cases, activate first value, add texture at meaningful moments, or increase technical ambition where it matters. The rendered page should feel meaningfully improved, not merely adjusted.`,
  'relayout.md': `# Relayout
Relayout changes the structure while keeping identity mostly intact. Make at least one visible structural move: new focal point, changed hero relationship, reordered sequence, transformed grid, new action placement, or mobile order that changes the path. Spacing tweaks support relayout but cannot be the whole change.`,
  'responsive.md': `# Responsive
Responsive design preserves the story and task across viewports, input modes, zoom, and preferences. Start with the narrowest useful canvas, then add structure as space earns it. Watch for horizontal overflow, crushed labels, unreachable actions, tiny targets, runaway line length, and hover-only affordances. Mobile can reorder content so the decision path remains clear.`,
  'shadow.md': `# Shadow
Shadow explains elevation. Use it for raised surfaces, popovers, overlays, dragged/active elements, or focused hierarchy. Keep the light source consistent. On dark sections, surface value and border often communicate elevation better than heavy shadow. If a shadow only fills visual emptiness, fix layout, spacing, type, or color instead.`,
  'surface.md': `# Surface
Product-like sections serve repeated use. Prioritize stable controls, clear labels, real data shapes, state vocabulary, density that matches the work, keyboard path, loading/error/empty handling, and predictable interaction. Familiarity can be a feature. Surprise should serve trust or comprehension.`,
  'tokenize.md': `# Tokenize
Use tokens when repeated choices share a meaning. Define reusable CSS variables for color roles, spacing rhythm, type scale, borders, shadows, and motion timings when they reduce arbitrary decisions. Keep one-off values near the section-specific markup when they express a specific art direction.`,
  'typeset.md': `# Typeset
Typography gives the page voice and hierarchy. Choose fonts from the brand lane and reading context, not category reflex. One well-tuned family can beat two weak pairings. Use clear display/body/label roles, readable measure, useful line-height, responsive heading scale, tabular numbers for aligned data, and deliberate weight contrast.`,
  'voice.md': `# Voice
Brand surfaces must prove the current name, category, user, job, artifact, and evidence quickly. The proof object should come from the product world: a record, route, invoice, room, canvas, map, transformation, comparison, workflow, or other concrete domain object. Copy should be specific enough that it would not work unchanged for an unrelated product.`,
  'writing.md': `# Writing
Words are part of the interface. Use concrete nouns and verbs. Button labels name actions. Empty states explain what belongs there and how to start. Loading text names the work. Error text explains recovery. Keep terminology consistent. Prefer short, direct sentences over marketing filler.`,
} satisfies Record<string, string>

export const BROWSER_SAFE_REFERENCE_FILES = Object.keys(DESIGN_REFERENCES)
export { DESIGN_REFERENCES }

export const designSkill = createSkill({
  description:
    'Design guidance for a browser-rendered landing page whose only editable surface is the project HTML document: layout, color, typography, motion, interaction, responsive behavior, voice, and refinement.',
  instructions: [
    '# Browser landing-page design',
    '',
    'The work surface is the project-scoped HTML document rendered in the browser preview. Every design decision becomes markup, CSS, or inline script inside that document.',
    '',
    '## Turn shape',
    '1. Extract the prompt invariants: exact name, category, audience, user pressure, job, domain artifact, proof, constraints, and visual drift to avoid.',
    '2. For a new placeholder draft, create the first page with one whole-document edit: `edit({ edits: [{ action: "Create initial page", code: "<!doctype html>..." }] })` (omit from/to). For follow-up changes, read the current project HTML with `read` or `find` before edits. Use `skill_read` for the compact reference that matches the design problem.',
    '3. Apply related changes with one batched `edit` call when practical. Every `edit` call must include a non-empty `edits` array. Set `from`/`to` to target a region (order-insensitive), give `code` to replace it or omit `code` to delete it, or set `insert: "before"/"after"` to add code relative to `from`. Keep regions small and avoid stale anchors.',
    '4. Re-check the changed region and continue until the browser page is more specific, accessible, responsive, and visually intentional.',
    '',
    '## Default design bar',
    '- The first viewport communicates the current product name, category, audience, proof, and next action.',
    '- Layout follows the visitor job: monitor, operate, compare, configure, learn, decide, or explore.',
    '- Color uses semantic roles and accessible contrast.',
    '- Typography has deliberate hierarchy, readable measure, and a voice that fits the brief.',
    '- Interactions have visible focus and clear state feedback where controls exist.',
    '- Responsive behavior preserves the story from narrow phone to desktop.',
    '- Motion is purposeful, restrained, and paired with reduced-motion handling when used.',
    '- Corners stay sharp by default with `border-radius: 0`.',
    '',
    '## Generated-design tells to replace with specific choices',
    '- Generic blue-purple gradients, glass panels, aurora blobs, and glow effects.',
    '- Centered hero plus equal feature cards when the content needs another structure.',
    '- Emoji or rounded-square icon toppers used as decoration.',
    '- Fake logo strips, vague metrics, placeholder dashboards, and proof objects that could fit any product.',
    '- Default typography with timid scale and no brand or product reason.',
    '- Copy built from vague claims such as powerful, seamless, transform, unlock, or leverage.',
    '',
    '## Completion check',
    'Before finishing, inspect the relevant project HTML region. Confirm the page has real copy, accessible contrast, visible focus, responsive structure, consistent tokens, sharp corners, purposeful motion, and a proof object tied to the current prompt.',
  ].join('\n'),
  name: 'design',
  references: DESIGN_REFERENCES,
})
