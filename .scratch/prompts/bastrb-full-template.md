# 📝 Full Template — Copy & Paste

Complete ready-to-use prompt. Replace everything between `[BRACKETS]`.

---

```
Create a complete one-page landing page in a single HTML file (CSS in <style>,
JS in <script> at the bottom of body) for:

Name: [NAME]
Activity: [ONE-SENTENCE DESCRIPTION]
Target: [YOUR AUDIENCE]
Goal: [DESIRED ACTION]
Main CTA: [LINK — or # for now]

INSPIRATION: Take strong inspiration from the design of [INSPIRATION URL].
Reproduce this level of finish and animation quality.

## DESIGN SYSTEM

### Color Palette
- Light background: #fffdf7
- Dark background: #0a0a0a
- Accent: [YOUR COLOR — hex code]
- Accent dim: rgba([R],[G],[B], 0.1)
- Text: #0a0a0a / #ffffff
- Muted: #999
- Borders: rgba(0,0,0,0.06) light / rgba(255,255,255,0.08) dark

### Typography (Google Fonts)
- Headings: 'Space Grotesk' 700, letter-spacing -0.03em, line-height 1.1
- Accents: 'DM Serif Display' italic
- Body: 'Inter' 400/500/600, line-height 1.65
- h1: clamp(3rem, 7vw, 5.5rem)
- h2: clamp(2.2rem, 4.5vw, 3.8rem)

### Components
- Radius: 20px cards, 12px small, 999px pills
- Subtle shadows on hover only
- 1px ultra-subtle borders, accent on hover
- Easing: cubic-bezier(.22,1,.36,1), 0.35s

### Section Alternation
Dark → Light → Dark → Light → Dark → Light → Dark

## STRUCTURE

### Fixed Nav
- Bold text logo left (with accent dot)
- Center links (hidden mobile)
- Pill CTA button right
- Glassmorphism on scroll (backdrop-filter blur 20px)

### Hero (dark background, 100vh)
- Pill tag: animated dot + uppercase accent text
- White H1 with rolling text (3 words in vertical loop, serif italic accent)
  Words: [WORD1], [WORD2], [WORD3]
- Muted gray subtitle
- 2 CTAs: accent button + white outline button
- Blurred background glows (accent + secondary color)
- Fade gradient to next section

### Marquee
- Infinite scrolling banner: [ITEM1] • [ITEM2] • [STAT1] • [ITEM3] • [STAT2]
- 40% opacity, uppercase

### Problem Section — Bento Grid (light background)
- H2 with serif italic word
- Large card: counter [NUMBER] + [TITLE] + [TEXT]
- Card 2: icon + [TITLE] + [TEXT]
- Card 3: icon + [TITLE] + [TEXT]
- Hover: accent border + 3D tilt

### Method Section — Timeline (dark background)
- 3 steps:
  1. [STEP 1 TITLE] → [DESCRIPTION]
  2. [STEP 2 TITLE] → [DESCRIPTION]
  3. [STEP 3 TITLE] → [DESCRIPTION]
- Line fills on scroll
- Mobile: stacked cards

### Results Section (light background)
- Stats with animated counters:
  → [NUMBER1] [LABEL1]
  → [NUMBER2] [LABEL2]
  → [NUMBER3] [LABEL3]
  → [NUMBER4] [LABEL4]

### Offer Section (light background)
- Split: text left + price card right
- Price: [PRICE]€/mo (or "Free Beta Access")
- Features:
  → [FEATURE 1]
  → [FEATURE 2]
  → [FEATURE 3]
  → [FEATURE 4]
  → [FEATURE 5]
- Badge "[NO COMMITMENT / GUARANTEE / ETC]"

### FAQ (dark background)
- Split: sticky title left + accordion right
1. [Q1] → [A1]
2. [Q2] → [A2]
3. [Q3] → [A3]
4. [Q4] → [A4]
5. [Q5] → [A5]

### Final CTA (light background)
- H2: "[FINAL HEADLINE]"
- Subtitle + accent button
- Accent glow in background

### Footer
- Copyright [NAME] © 2025 + contact link

## ANIMATIONS

### Mandatory
- Scroll reveal (.rv): fade up + translateY 40px, stagger delays, IntersectionObserver
- Rolling text hero: 3 words in vertical loop, 6s
- Glassmorphism nav on scroll
- Smooth scroll

### Recommended
- Animated counters on scroll (data-count, 2s, easing)
- 3D Tilt on cards (mousemove, ±6deg, disabled mobile)
- Animated glows (translate + scale, 10s infinite)

### Optional
- Custom cursor (20px circle, lerp, mix-blend-mode difference, desktop only)
- Mousemove parallax on illustrations
- Marquee pause on hover

## RESPONSIVE
- 1024px: grids → 1 col, timeline → vertical, nav → hamburger
- 768px: CTA full-width, tilt off, padding 20px
- 480px: smaller type, minimum padding

## TECHNICAL
- Single HTML file, CSS + JS inline
- Vanilla JS only, zero dependencies
- Google Fonts via <link>
- Inline SVG for all icons
- Lazy loading on images
- prefers-reduced-motion respected
- scroll-behavior: smooth
- -webkit-font-smoothing: antialiased
- ::selection styled with accent color
```
