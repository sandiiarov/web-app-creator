# 🎨 Block 2 — Design System

Pick **one preset** below, or customize your own. The design system defines your colors, typography, components, and spacing rules.

---

## Preset A — Dark Premium *(Linear / Vercel style)*

Best for: SaaS tools, dev products, AI, fintech, anything that needs to feel cutting-edge.

```
## DESIGN SYSTEM

### Color Palette (CSS custom properties)
- Light background: #fffdf7 (warm cream — NOT pure white)
- Dark background: #0a0a0a (deep black)
- Primary accent: [YOUR COLOR] (e.g. #d1a326 gold, #00915e green, #6366f1 purple)
- Accent dim: rgba([R],[G],[B], 0.1) (for subtle backgrounds)
- Primary text: #0a0a0a (on light) / #ffffff (on dark)
- Secondary text: #444 (light) / rgba(255,255,255,0.5) (dark)
- Muted text: #999
- Borders: rgba(0,0,0,0.06) on light / rgba(255,255,255,0.08) on dark

### Typography (Google Fonts)
- Headings: 'Space Grotesk' weight 700, letter-spacing -0.03em, line-height 1.1
- Accent words in titles: 'DM Serif Display' italic (class .serif)
- Body: 'Inter' weights 400/500/600, line-height 1.65
- Responsive sizes with clamp():
  → h1: clamp(3rem, 7vw, 5.5rem)
  → h2: clamp(2.2rem, 4.5vw, 3.8rem)
  → h3: clamp(1.2rem, 2vw, 1.5rem)

### Components
- Border-radius: 20px (cards), 12px (small elements), 999px (pill buttons)
- Shadows: subtle — 0 20px 60px rgba(0,0,0,0.06), appear on hover only
- Borders: 1px ultra-subtle, turn accent color on hover
- Transitions: cubic-bezier(.22,1,.36,1) everywhere, 0.35s duration

### Section alternation (mandatory)
Alternate dark and light backgrounds between each section.
Creates rhythm and visual depth.
```

---

## Preset B — Light & Warm *(Stripe / Ramp style)*

Best for: B2B SaaS, agencies, professional services, fintech, marketing tools.

```
## DESIGN SYSTEM

### Color Palette
- --bg: #faf9f6 (warm cream)
- --bg2: #f2f0eb (medium cream)
- --surface: #ffffff (cards)
- --dark: #0a0a0a (dark sections)
- --text: #1a1a1a
- --muted: #6b7280
- --accent: [YOUR COLOR] (e.g. #F26522 orange, #3b82f6 blue, #00ff88 green)
- --accent-light: rgba([R],[G],[B], 0.08)
- --radius: 14px

### Typography (Google Fonts)
- Headings: 'Syne' weight 800, negative letter-spacing, line-height 1.1
- Body: 'Inter' weight 400-600, line-height 1.7
- All titles use clamp() for responsive sizing

### Components
- Cards: white background, border 1px solid rgba(0,0,0,0.06), radius 16px
- Card hover: accent border + shadow + translateY(-4px)
- Buttons: radius 999px (pill), subtle gradient, colored shadow
- Transitions: 0.3s cubic-bezier(.22,1,.36,1)
```

---

## Preset C — Bold & Minimal *(Mercury / Arc style)*

Best for: Consumer apps, creative tools, portfolios, anything that needs to feel bold and confident.

```
## DESIGN SYSTEM

### Color Palette
- Background: #ffffff
- Surface: #f8f8f8
- Accent: [YOUR COLOR]
- Text: #000000
- Muted: #666666
- Border: #e0e0e0

### Typography (Google Fonts)
- Single font: 'Space Grotesk' weights 500-700
- Body: system-ui, -apple-system (no Google Font for body)
- High contrast sizes: h1 massive (clamp(3.5rem, 8vw, 7rem)), body small (16px)

### Components
- Radius: 8px (small) / 12px (cards) / 999px (pills)
- No shadows. Sharp borders only.
- Transitions: 0.2s ease
- Monochrome base, accent as the only pop of color
```

---

## 💡 Customization Tips

- **Accent color**: Use a tool like [coolors.co](https://coolors.co) to find yours
- **Never use pure white** `#ffffff` as background — always a warm cream like `#faf9f6`
- **Never use pure black** for body text — use `#1a1a1a` or `#0a0a0a`
- **Stick to 2 Google Fonts max** — one for headings, one for body
- **Use `clamp()` for all title sizes** — it handles responsive without media queries
