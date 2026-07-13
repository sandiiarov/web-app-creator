/**
 * Landing-page design guidance, attached to the session's FIRST user message
 * only (not the system prompt, not later messages). `buildAgentMessages`
 * (`route.ts`) prepends it to the first `user` message it emits, so it is
 * reconstructed on every turn's replay and stays in context for the whole
 * session without re-injection and without being stored in the UI-facing
 * `turn.prompt`. The system prompt stays a lean identity/role reminder.
 *
 * Source: condensed from `bastrb/premium-landing-page-prompts`.
 */
export const LANDING_PAGE_DESIGN_GUIDANCE = [
  'Design system (apply to every page in this project):',
  '- Commit to ONE aesthetic lane. Never default to a generic blue-purple SaaS gradient, a centered headline + pill + 3 equal feature cards, or decorative icon toppers — those read as AI-generic.',
  '- Palette: never pure #ffffff backgrounds (use warm cream like #fffdf7 / #faf9f6) and never pure #000000 body text (use #0a0a0a / #1a1a1a). Derive the accent from scraped brand assets, imagery, and product category (`scrape.branding.colors`, `scrape.imageOcr.text`).',
  '- Type: at most 2 Google Fonts; use clamp() for every heading (h1 ≈ clamp(3rem,7vw,5.5rem)); tight headline leading (~1.1), relaxed body (~1.65). Pair a strong display face with a quiet body face (e.g. Space Grotesk + Inter, Syne + Inter).',
  '- Surfaces: 1px ultra-subtle borders that turn accent on hover; radius ~16–20px for cards and 999px for pills; shadows appear on hover only; transition with cubic-bezier(.22,1,.36,1) ~0.35s.',
  '- Rhythm: alternate dark and light sections for depth; 6–8 sections, not more (Nav → Hero → Marquee → Problem/Bento → Method/Timeline → Results/counters → Pricing → FAQ → final CTA → Footer).',
  '- Motion is vanilla JS only and must respect prefers-reduced-motion. Scroll-reveal fade-up + stagger (`.rv` + IntersectionObserver) is mandatory; add rolling hero text, animated counters, 3D card tilt, custom cursor, and blurred background glows only when they serve the page, never as decoration.',
  '- Always responsive: use clamp() and content-driven breakpoints; verify mobile and desktop with `screenshot` after substantial edits.',
].join('\n')
