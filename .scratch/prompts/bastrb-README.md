# 🎨 Premium Landing Page Prompts for AI Tools

> A curated collection of battle-tested prompts to generate **premium, production-ready landing pages** using Claude Code, Lovable, Cursor, or any LLM.
> Originally crafted by Mathis — structured and extended for open use.

---

## ✨ What's Inside

This repo gives you a **complete, modular prompt system** to generate stunning landing pages with AI — not generic ones, but pages that look like they were designed by a senior product designer.

The system is built around **4 blocks**:

| Block | What it does |
|-------|-------------|
| 🎯 **Block 1** — Context & Inspiration | Define your project, target, goal and visual reference |
| 🎨 **Block 2** — Design System | Colors, typography, components, spacing |
| 🏗️ **Block 3** — Section Structure | Modular sections: Hero, Marquee, Problem, Method, Results, Pricing, FAQ, CTA |
| ✨ **Block 4** — Animations & Interactions | Scroll reveal, rolling text, counters, tilt 3D, custom cursor, glows |

---

## 🚀 How to Use

1. **Pick your design preset** (Dark Premium / Light & Warm / Bold & Minimal)
2. **Choose your sections** (6–8 recommended)
3. **Choose your animations** (more = more impressive)
4. **Fill in the placeholders** between `[BRACKETS]`
5. **Paste the full prompt** into Claude Code, Lovable, or Cursor
6. **Iterate** — the AI keeps context, so refine freely

---

## 📂 Structure

```
prompts/
└── landing-page/
    ├── full-template.md        # Complete copy-paste prompt (fill the blanks)
    ├── block-1-context.md      # Context & Inspiration block
    ├── block-2-design-system.md # Design System (3 presets)
    ├── block-3-sections.md     # All section templates (modular)
    └── block-4-animations.md   # Animations & Interactions
```

---

## 🎨 Design Presets

### Preset A — Dark Premium *(Linear / Vercel style)*
Dark background, warm cream accents, Space Grotesk + DM Serif Display. Alternating dark/light sections.

### Preset B — Light & Warm *(Stripe / Ramp style)*
Warm cream base, white cards, clean typography with Syne + Inter. Subtle shadows, pill buttons.

### Preset C — Bold & Minimal *(Mercury / Arc style)*
Pure white, single accent color, Space Grotesk only. No shadows, sharp borders, maximum contrast.

---

## 🏆 Golden Rules

| Do ✅ | Don't ❌ |
|-------|---------|
| Give a visual inspiration URL | Say "make it beautiful" |
| Use `clamp()` for responsive type | Forget the responsive block |
| Alternate dark/light sections | Use pure white `#ffffff` |
| Use `cubic-bezier(.22,1,.36,1)` easing | Use heavy drop shadows |
| Keep it to 6–8 sections | Stack 12+ sections |
| Use Google Fonts (Syne, Space Grotesk) | Leave default system fonts |

---

## 💡 Recommended Inspiration Sites

These sites are well-known to AI models and produce great results when used as visual references:

- [linear.app](https://linear.app)
- [vercel.com](https://vercel.com)
- [stripe.com](https://stripe.com)
- [ramp.com](https://ramp.com)
- [mercury.com](https://mercury.com)
- [arc.net](https://arc.net)
- [raycast.com](https://raycast.com)

---

## 🔧 Recommended Tools

| Tool | Best for |
|------|---------|
| **Lovable** | Full React app generation, fast iteration |
| **Claude Code** | Single HTML file, direct file editing |
| **Cursor** | Code-first, multi-file projects |
| **v0 by Vercel** | React components, Tailwind |

---

## 📝 Example Output

The `prompts/landing-page/full-template.md` file contains a **ready-to-use prompt** with all 4 blocks assembled. Just fill in your `[PLACEHOLDERS]` and paste.

---

## 🤝 Contributing

Found a better section template? A new animation trick? Open a PR:

1. Fork the repo
2. Add your prompt in the right folder
3. Follow the existing format
4. Open a pull request with a short description

---

## 📄 License

MIT — use freely, credit appreciated.

---

*Original system by Mathis. Structured for GitHub by the community.*
