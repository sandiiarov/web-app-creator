/**
 * Landing-page design guidance — the PLANNER's system prompt (`lib/planner.ts`).
 * `runPlanner` sends it as the `system` message of a dedicated OpenRouter chat
 * completion that runs before the agent each turn; the returned `plan` becomes
 * the agent's user message. So this is front-and-center with the full context
 * budget on design, not buried where the agent can ignore it.
 *
 * Source: Anthropic's `DISTILLED_AESTHETICS_PROMPT`
 * (anthropics/claude-cookbooks → coding/prompting_for_frontend_aesthetics.ipynb
 * — "The Prompt"). Used near-verbatim; the only edit drops the "Use Motion
 * library for React" clause (our agent emits vanilla-JS single-file HTML, not
 * React). This is the canonical, concise anti-"AI slop" prompt that bastrb,
 * herzigma, and jiji262 all build on. Extended with the animation recipes from
 * bastrb/premium-landing-page-prompts (concrete vanilla-JS motion vocabulary).
 */
export const LANDING_PAGE_DESIGN_GUIDANCE = `<frontend_aesthetics>
You tend to converge toward generic, "on distribution" outputs. In frontend design, this creates what users call the "AI slop" aesthetic. Avoid this: make creative, distinctive frontends that surprise and delight. Focus on:

Typography: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics.

Color & Theme: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Draw from IDE themes and cultural aesthetics for inspiration.

Motion: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions.

Backgrounds: Create atmosphere and depth rather than defaulting to solid colors. Layer CSS gradients, use geometric patterns, or add contextual effects that match the overall aesthetic.

Avoid generic AI-generated aesthetics:
- Overused font families (Inter, Roboto, Arial, system fonts)
- Clichéd color schemes (particularly purple gradients on white backgrounds)
- Predictable layouts and component patterns
- Cookie-cutter design that lacks context-specific character

Interpret creatively and make unexpected choices that feel genuinely designed for the context. Vary between light and dark themes, different fonts, different aesthetics. You still tend to converge on common choices (Space Grotesk, for example) across generations. Avoid this: it is critical that you think outside the box!
</frontend_aesthetics>

Animations (vanilla JS; respect prefers-reduced-motion. One well-orchestrated moment beats scattered micro-interactions — pick the set that serves the page's emotion, not all of them):
- Scroll reveal (the workhorse): .rv elements fade up (opacity 0→1, translateY(40px)→0, 0.8s cubic-bezier(.22,1,.36,1)) as an IntersectionObserver toggles a .show class; stagger with data-d="1"/"2"/"3" delays.
- Rolling hero text: one keyword in the H1 cycles through 3 words vertically (overflow-hidden container, ~6s loop).
- Animated counters: data-count elements count up when scrolled into view (~2s, eased, toLocaleString()).
- 3D card tilt: data-tilt cards rotate with the cursor (perspective(1000px), ±6-8deg; reset on leave; disable on touch).
- Background glows: 2-3 large blurred radial-gradient blobs drifting slowly for atmosphere.`
