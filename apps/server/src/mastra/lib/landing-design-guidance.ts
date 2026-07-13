/**
 * Landing-page design guidance, attached to the session's FIRST user message
 * only (not the system prompt, not later messages). `buildAgentMessages`
 * (`route.ts`) prepends it to the first `user` message it emits, so it is
 * reconstructed on every turn's replay and stays in context for the whole
 * session without re-injection and without being stored in the UI-facing
 * `turn.prompt`. The system prompt stays a lean identity/role reminder.
 *
 * Adapted in full from `bastrb/premium-landing-page-prompts` (the modular
 * 4-block system: Context / Design System / Sections / Animations). bastrb is a
 * fill-in-the-blanks user template; here it is reframed as imperative agent
 * guidance — the agent infers the bracketed values (accent, words, copy) from
 * the user brief and `scrape` results.
 */
export const LANDING_PAGE_DESIGN_GUIDANCE = `Landing-page design system (apply to every page in this project).

Commit to ONE aesthetic preset below and apply it consistently. Never default to a generic blue-purple SaaS gradient, a centered headline + pill + 3 equal feature cards, or decorative icon toppers — those read as AI-generic. Derive the accent color from scraped brand assets, imagery, and product category (scrape.branding.colors, scrape.imageOcr.text).

# Build with our tools
- The page is the single project HTML document — edit it via read/find/edit (hashline DSL). Never create an alternate file or replace the whole document in one edit.
- Build incrementally: scaffold the shell, add design tokens, then fill ONE section at a time with edit. A full finished page in one edit truncates against the output cap.
- Imagery: use scrape.images for faithful source-site assets (portraits, logos, product shots); use generate_image for net-new art (hero art, abstract brand visuals). Embed the returned URL directly in <img src="...">. NEVER use placeholder URLs, external image CDNs, or pasted image bytes.
- Verify after substantial edits with screenshot — mobile + desktop, and tablet when its composition differs materially.

# Preset A — Dark Premium (Linear / Vercel style)
Best for SaaS, dev tools, AI, fintech.
- Light background: #fffdf7 (warm cream — NOT pure white)
- Dark background: #0a0a0a
- Primary accent: derive from brand/category
- Accent dim: rgba(R,G,B,0.1)
- Text: #0a0a0a on light / #ffffff on dark; secondary #444 / rgba(255,255,255,0.5); muted #999
- Borders: rgba(0,0,0,0.06) on light / rgba(255,255,255,0.08) on dark
- Headings: "Space Grotesk" 700, letter-spacing -0.03em, line-height 1.1
- Accent words in titles: "DM Serif Display" italic
- Body: "Inter" 400/500/600, line-height 1.65
- h1: clamp(3rem,7vw,5.5rem); h2: clamp(2.2rem,4.5vw,3.8rem); h3: clamp(1.2rem,2vw,1.5rem)
- Radius: 20px cards, 12px small, 999px pills
- Shadows: 0 20px 60px rgba(0,0,0,0.06), appear on hover only
- Borders: 1px ultra-subtle, turn accent on hover
- Transitions: cubic-bezier(.22,1,.36,1) 0.35s
- Alternate dark and light sections (mandatory) for rhythm and depth

# Preset B — Light & Warm (Stripe / Ramp style)
Best for B2B SaaS, agencies, fintech, marketing tools.
- --bg #faf9f6 (warm cream); --bg2 #f2f0eb; --surface #ffffff (cards); --dark #0a0a0a (dark sections)
- --text #1a1a1a; --muted #6b7280; --accent derive; --accent-light rgba(R,G,B,0.08); --radius 14px
- Headings: "Syne" 800, negative letter-spacing, line-height 1.1
- Body: "Inter" 400-600, line-height 1.7; all titles use clamp()
- Cards: white, 1px solid rgba(0,0,0,0.06), radius 16px; hover = accent border + shadow + translateY(-4px)
- Buttons: radius 999px (pill), subtle gradient, colored shadow; transitions 0.3s cubic-bezier(.22,1,.36,1)

# Preset C — Bold & Minimal (Mercury / Arc style)
Best for consumer apps, creative tools, portfolios.
- Background #ffffff; surface #f8f8f8; accent derive; text #000000; muted #666666; border #e0e0e0
- Single font: "Space Grotesk" 500-700; body system-ui (-apple-system)
- High contrast: h1 massive clamp(3.5rem,8vw,7rem), body 16px
- Radius 8px small / 12px cards / 999px pills; NO shadows, sharp borders only; transitions 0.2s ease
- Monochrome base, accent as the only pop of color

# Golden rules (all presets)
- Never pure #ffffff background — always a warm cream (#fffdf7 / #faf9f6)
- Never pure #000000 body text — use #1a1a1a or #0a0a0a
- At most 2 Google Fonts; verify every weight actually loads
- Use clamp() for every title size
- Use cubic-bezier(.22,1,.36,1) easing throughout
- Alternate dark/light sections; 6–8 sections max (more dilutes impact)

# Structure (pick 6–8 sections; proven order)
Nav (fixed) → Hero → Marquee → Problem → Method → Results → Offer/Pricing → FAQ → Final CTA → Footer.

## Fixed Nav (always include)
- Text logo left (heading font, bold, with an accent-colored dot)
- Navigation links center (hidden on mobile → hamburger)
- Pill CTA button right (accent background)
- On scroll: semi-transparent background + backdrop-filter blur(20px) + subtle shadow; transparent → glassmorphism

## Hero (always include; dark background, min-height 100vh)
- Pill tag at top: uppercase text + small pulsing dot in accent color
- Giant H1 with a rolling-text animation on one keyword (3 words cycling vertically in a loop), chosen to fit the product
- Subtitle in muted gray, max-width 500px
- 2 CTA buttons: primary (accent, filled) + secondary (white outline)
- 2–3 blurred background glows (radial gradients in accent + secondary color)
- Fade gradient to next section at the bottom

## Marquee (scrolling banner)
- Horizontal band, infinite scroll via CSS translateX, 30–40s linear infinite, duplicated 2x for seamless loop
- Content: client names OR stats OR keywords separated by accent dots
- 40–60% opacity, uppercase, letter-spacing 1px; pause on hover

## Problem (light background) — Bento grid OR 2-column split
Bento: 1 large card (60%) + 2 small stacked (40%); large = animated counter + title + paragraph; small = SVG icon in rounded accent square + title + text; hover = accent border + shadow + 3D tilt.
Split: left = title + description + 3 features (icon + title + text); right = illustration in dark rounded rectangle with glassmorphism badge bottom-left and floating animated card top-right.

## Method (dark background) — Timeline OR numbered cards
Timeline: 3–4 steps connected by a line; background line semi-transparent, accent fill animates on scroll; numbered circles 60px + title + description; last = active (accent); mobile → vertically stacked cards.
Numbered cards: 3 side-by-side; large accent number + title + description; hover = accent border + translateY(-4px) + shadow.

## Results / Social proof (light background)
- Screenshots/mockups with 3D perspective (use generate_image or scrape.images — never placeholders): 1 main centered + 2 side in absolute with different rotations; infinite float (oscillating translateY); parallax on mousemove (desktop only).
- OR testimonial grid (cards with stars + quote + author).
- 3–4 animated counters below.

## Offer / Pricing (light background, split)
- Left: arguments; right: price card on dark background with radial accent glow behind.
- Giant price; pill badge (e.g. "No commitment"); feature list with checks (rounded accent squares + check icon); full-width CTA button.

## FAQ (dark background, split)
- Sticky title left, accordion right; + icon rotates to × on click; max-height animation for smooth open/close; only one item open at a time.

## Final CTA (always include; light background)
- Centered, maximum simplicity; blurred accent glow in background; H2 + subtitle + primary accent button.

## Footer
- Subtle top border; copyright left + contact link right.

# Animations (vanilla JS only; MUST respect prefers-reduced-motion)

## Mandatory
Scroll reveal (.rv): opacity 0→1 + translateY(40px)→0, 0.8s cubic-bezier(.22,1,.36,1); IntersectionObserver adds .show at threshold 0.1; stagger via data-d="1" (0.1s), data-d="2" (0.2s), data-d="3" (0.3s). Disable under prefers-reduced-motion: reduce.
CSS: .rv{opacity:0;transform:translateY(40px);transition:opacity .8s cubic-bezier(.22,1,.36,1),transform .8s cubic-bezier(.22,1,.36,1)} .rv.show{opacity:1;transform:translateY(0)} [data-d="1"]{transition-delay:.1s} [data-d="2"]{transition-delay:.2s}
JS: const observer=new IntersectionObserver((entries)=>{entries.forEach((e)=>{if(e.isIntersecting)e.target.classList.add("show")})},{threshold:0.1}); document.querySelectorAll(".rv").forEach((el)=>observer.observe(el));
Reduced motion: @media (prefers-reduced-motion: reduce){.rv{opacity:1;transform:none;transition:none}}

## Recommended
- Rolling text hero: overflow-hidden container, height 1.1em; 3 words stacked vertically; keyframe translateY across 3 positions, 6s infinite (visible word changes every 2s).
- Animated counters: data-count="N" on elements; IntersectionObserver triggers; increments over 2s with cubic easing (1 - Math.pow(1 - progress, 3)); format with toLocaleString().
- Glassmorphism nav on scroll (backdrop-filter blur).

## Optional (impressive — use only when they serve the page)
- 3D card tilt (data-tilt): on mousemove compute relative position; transform perspective(1000px) rotateX/rotateY ±6–8deg; smooth reset on mouseleave; disabled on touch (matchMedia hover:none).
- Custom cursor: desktop only (matchMedia hover:hover); 20px circle following mouse with lerp 0.12 + 5px center dot; mix-blend-mode: difference; scales to 50px on hover over links/buttons/cards.
- Animated background glows: 2–3 absolute divs, border-radius 50%, radial gradients (accent + secondary), filter blur(80px), opacity 0.3; slow translate + scale 8–12s infinite alternate.

# Responsive
- 1024px: grids → 1 column, timeline → vertical, nav → hamburger.
- 768px: CTA full-width, tilt off, padding 20px.
- 480px: smaller type, minimum padding.
Use clamp() and content-driven breakpoints; recompose the story for mobile rather than just stacking. Verify with the screenshot tool after substantial edits (mobile + desktop; tablet when its composition differs).

# Technical
- CSS in <style>, JS in <script> at the bottom of body; vanilla JS only, zero dependencies.
- Google Fonts via <link> (verify every weight loads).
- Inline SVG for all icons.
- Lazy loading on images.
- prefers-reduced-motion respected.
- scroll-behavior: smooth.
- -webkit-font-smoothing: antialiased.
- ::selection styled with the accent color.`
