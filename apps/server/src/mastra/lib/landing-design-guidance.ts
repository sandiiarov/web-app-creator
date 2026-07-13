/**
 * Landing-page design guidance, attached to the session's FIRST user message
 * only (not the system prompt, not later messages). `buildAgentMessages`
 * (`route.ts`) prepends it to the first `user` message it emits, so it is
 * reconstructed on every turn's replay and stays in context for the whole
 * session without re-injection and without being stored in the UI-facing
 * `turn.prompt`. The system prompt stays a lean identity/role reminder.
 *
 * Synthesized from: our removed `design` skill (@workspace/agent-skills:
 * create/iterate/review references), `bastrb/premium-landing-page-prompts`
 * (section/animation spec), Anthropic's `DISTILLED_AESTHETICS_PROMPT`
 * (claude-cookbooks), `2389-research/landing-page-design` (Vibe Discovery),
 * `jiji262/claude-design-skill` (direction advisor + system declaration), and
 * the leaked Claude Design app system prompt (anti-slop tropes).
 *
 * Core intent: create beautiful, UNIQUE landing pages — discover a direction
 * per page (never a fixed preset), commit to an invented system, and hard-avoid
 * the "AI slop" defaults the model converges toward.
 */
export const LANDING_PAGE_DESIGN_GUIDANCE = `Landing-page design guidance — create beautiful, UNIQUE landing pages. No two pages should look alike.

Your default tendency is to converge on generic, "on-distribution" output — what users call "AI slop." Every rule below exists to break that default and make the page feel genuinely designed for THIS product, not interchangeable with any other company's page.

# Step 1 — Discover a unique direction BEFORE any template or preset

Do NOT start from a preset (Dark Premium / Light & Warm / Bold & Minimal) or a memorized layout. Derive a direction from the product itself, then invent the system from it.

1. Real-world reference: from the brief and scrape results, pick ONE concrete place/object/atmosphere this brand would be — a Tokyo convenience store at 2am, a brutalist parking garage, a 1970s recording studio, a coral reef, a ship's bridge, a field guide, a workshop ledger. This is the source of truth for color, texture, and layout logic — not a vibe word or an industry default.
2. One emotion in 3 seconds: pick the single feeling the first viewport must trigger (calm / energized / curious / trusted / delighted / impressed / rebellious / nostalgic / sophisticated / welcomed). Density and motion follow from this.
3. Invent the palette FROM the reference: extract 3–4 colors that actually exist in that place. Generate fresh hex codes — do NOT recall "your usual blue" or a memorized palette. Name it something evocative ("Midnight Bodega," not "blue and orange"). Never pure #ffffff (warm it) and never pure #000000 body text.
4. Invent typography: pick a display face and a body face that embody the reference + emotion. Browse Google Fonts with fresh eyes. Do NOT default to your comfort fonts (see anti-slop).
5. Name what this page must NEVER be mistaken for (e.g. "a crypto project," "a generic wellness app," "anything with a purple gradient") and actively avoid it.

State the direction in one sentence before building — e.g. "Field-guide naturalism: warm paper, ink, a single rust accent; calm, slow, precise — never a SaaS dashboard." The plan tool's request should carry this invented direction.

# Anti-AI-slop (hard rules — these read as generic unless the brief explicitly asks)

- Fonts: never default to Inter, Roboto, Arial, system fonts, or Space Grotesk-as-reflex. If you are reaching for one of these, stop and choose a face with character. You tend to converge on Space Grotesk across generations — refuse that reflex.
- Color: never a blue→purple gradient on white, never generic "SaaS indigo." Dominant color + one sharp accent beats a timid, evenly-distributed palette. Derive the accent from scraped brand assets (scrape.branding.colors, scrape.imageOcr.text), not from "the tech industry."
- Layout: never the default centered headline + pill badge + 3 equal feature cards. Never decorative icon toppers, never rounded-card-with-left-border-accent, never glass / glow / nested cards without a structural job.
- Content: never invent metrics, testimonials, awards, guarantees, or "data slop" (decorative stats/icons that aren't useful). Never emoji unless the brand uses them. Never draw imagery with SVG — use generate_image or scrape.images.
- Motion: never repeated fade-up entrances on everything, never bounce/parallax/hover-lift with no communication role.
- Variety: if a choice could move unchanged to an unrelated company, reconnect it to this product's name, audience, artifact, and the real-world reference above.

# Step 2 — Commit to a cohesive system (invented, not picked)

Vocalize and lock the full system before the first edit, all derived from the direction in Step 1:
- Color: CSS custom properties for canvas, surfaces, text, borders, accent, focus, and real form states. Keep meaning legible without hue alone; verify contrast on the actual surfaces.
- Type: at most 2 Google Fonts; verify every weight actually loads. Visible hierarchy, readable body measure and leading, intentional headline wraps, clamp() for responsive sizes.
- Surfaces/edges: ONE coherent physical model (flat / framed / layered / atmospheric). Borders, radius, shadow, and easing all derived from the reference — not a default recipe. Use cubic-bezier(.22,1,.36,1) where motion exists.
- Rhythm: alternate surfaces and density for depth; 6–8 sections max.

# Structure — a palette, not a fixed sequence

Choose only the sections the visitor's path needs. First name the visitor's dominant job: Decide (claim, proof, risk-reduction, one action) / Learn (progression, examples, depth) / Explore (paths, preserved orientation) / Compare (stable criteria, aligned differences). Then pick 6–8 from: fixed Nav (glassmorphism on scroll), Hero (one proof object + one primary action), Marquee, Problem (bento grid or 2-col split), Method (timeline or numbered cards), Results (proof + animated counters), Pricing, FAQ accordion, final CTA, Footer. Give each section ONE dominant focal point. Keep proof close to the claim it supports; put trust before a high-risk ask; repeat actions only at genuine decision points.

# Motion — vanilla JS only; MUST respect prefers-reduced-motion

One well-orchestrated moment beats scattered micro-interactions. Mandatory: scroll-reveal (.rv + IntersectionObserver, fade-up + translateY(40px)→0, 0.8s cubic-bezier(.22,1,.36,1), stagger via data-d="1"/"2"/"3"; disable under prefers-reduced-motion). Add rolling hero text, animated counters, 3D card tilt, custom cursor, or background glows ONLY when they serve the direction and emotion — never as decoration. Disable tilt and custom cursor on touch devices.

# Build with our tools

- The page is the single project HTML document — edit it via read/find/edit (hashline DSL). Never create an alternate file or replace the whole document in one edit.
- Build incrementally: scaffold the shell, add design tokens, then fill ONE section at a time with edit. A full finished page in one edit truncates against the output cap.
- Imagery: use scrape.images for faithful source-site assets (portraits, logos, product shots); use generate_image for net-new art (hero art, abstract brand visuals). Embed the returned URL directly in <img src="...">. NEVER use placeholder URLs, external image CDNs, or pasted image bytes.
- Verify after substantial edits with screenshot — mobile + desktop, and tablet when its composition differs materially.

# Technical

- CSS in <style>, JS in <script> at the bottom of body; vanilla JS only, zero dependencies.
- Google Fonts via <link> (verify every weight loads). Inline SVG for all icons. Lazy-load images.
- prefers-reduced-motion respected. scroll-behavior: smooth. -webkit-font-smoothing: antialiased. ::selection styled with the accent color.
- Use clamp() and content-driven breakpoints; recompose the story for mobile rather than only stacking.`
