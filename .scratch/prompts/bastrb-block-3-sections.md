# 🏗️ Block 3 — Section Structure

Pick the sections you need. **6–8 sections is the sweet spot** — more dilutes the impact.

Each section is a self-contained block. Mix and match as needed.

---

## ✅ Fixed Nav (always include)

```
### Fixed Navigation
- Text logo left (heading font, bold, with an accent-colored dot or character)
- Navigation links center (hidden on mobile → hamburger menu)
- Pill CTA button right: "[CTA TEXT]" (accent background, white/dark text)
- On scroll: semi-transparent background + backdrop-filter blur(20px) + subtle shadow
- Smooth transition: transparent → glassmorphism
```

---

## 🚀 Hero (always include)

```
### Hero (dark background, min-height 100vh)
- Pill tag at top: uppercase text + small pulsing dot in accent color
- Giant H1 with a rolling text animation on one keyword (3 words cycling vertically in a loop)
  Words: [WORD1], [WORD2], [WORD3]
  Sentence: "[YOUR SENTENCE WITH [ROLLING WORD] INSIDE]"
- Subtitle in muted gray, max-width 500px
- 2 CTA buttons: primary (accent, filled) + secondary (white outline)
- 2–3 blurred background glows (radial gradients in accent + secondary color)
- Fade gradient to next section at the bottom
```

---

## 📢 Marquee / Scrolling Banner

```
### Marquee (scrolling banner)
- Horizontal band, text scrolling infinitely (CSS translateX)
- Content: client names OR stats OR keywords separated by accent dots
- 30–40s linear infinite animation, duplicated 2x for seamless loop
- Text opacity: 40–60%, uppercase, letter-spacing 1px
- Pause on hover
```

---

## ❗ Problem — Option A: Bento Grid

```
### Problem Section — Bento Grid (light background)
- Muted uppercase label + dash before ("— The Problem")
- H2 with one word in accent / serif italic
- Bento grid: 1 large card (60%) + 2 small stacked cards (40%)
- Large card: animated counter + title + paragraph
- Small cards: SVG icon in rounded accent square + title + text
- All cards: white background, subtle border, hover = accent border + shadow + 3D tilt on mousemove
```

---

## ❗ Problem — Option B: 2-Column Split

```
### Problem Section — Split layout (light background)
- Left column: title + description + 3 features (icon + title + text)
- Right column: illustration in dark rounded rectangle
  → Animated SVG OR decorative gradient OR mockup
  → Glassmorphism badge bottom-left
  → Floating animated card top-right
```

---

## ⚙️ Method — Option A: Timeline

```
### Method Section — Timeline (dark background)
- Centered header: accent label + H2 + subtitle
- Horizontal timeline: 3–4 steps connected by a line
- Background line semi-transparent, accent fill line animates on scroll
- Each step: numbered circle (60px) + title + description
- Last circle = active (accent background)
- Mobile: transforms into vertically stacked cards
```

---

## ⚙️ Method — Option B: Numbered Cards

```
### Method Section — Cards (dark background)
- 3 side-by-side cards
- Each card: large accent number + title + description
- Hover: accent border, translateY(-4px), shadow
```

---

## 📊 Results / Social Proof

```
### Results Section (light background)
- Centered header
- Screenshots/mockups with 3D perspective effect:
  → 1 main centered + 2 side ones in absolute, different rotations
  → Infinite float animation (oscillating translateY)
  → Parallax on mousemove (rotation follows mouse, desktop only)
- OR testimonial grid (cards with stars + quote + author)
- Stats below: 3–4 animated counters on scroll
```

---

## 💼 Portfolio / Projects (optional)

```
### Portfolio Section (dark background)
- 2-column grid
- Each card = browser mockup:
  → Top bar: 3 dots + URL in gray pill
  → Project image (object-fit cover, lazy loading)
  → Gradient fade at bottom
  → Name + accent tag + arrow in circle
- Hover: translateY(-6px), accent border, 3D tilt, accent arrow
```

---

## 💰 Offer / Pricing

```
### Offer Section — Split (light background)
- 2 columns: arguments left, price card right
- Price card on dark background:
  → Radial accent glow behind
  → Giant price "[PRICE]€/mo" (or one-time)
  → Pill badge "No commitment" (or other)
  → Feature list with checks (rounded accent squares + check icon)
  → Full-width CTA button
```

---

## ❓ FAQ

```
### FAQ — Split (dark background)
- 2 columns: sticky title left, accordion right
- Accordion: subtle borders between items
- + icon rotates to × on click
- max-height animation for smooth open/close
- Only one item open at a time
```

---

## 📣 Final CTA (always include)

```
### Final CTA (light background)
- Centered, maximum simplicity
- Blurred accent glow in background
- H2 + subtitle + primary accent button
```

---

## 🔗 Footer + Floating WhatsApp (optional)

```
### Minimal Footer
- Subtle top border
- Copyright left + contact link right

### Floating WhatsApp Button (optional)
- Position fixed, bottom right, z-index 9999
- Green circle #25d366, white WhatsApp SVG icon
- Hover: scale 1.1
```

---

## 💡 Section Ordering Tips

A proven sequence:
1. Nav (fixed)
2. Hero
3. Marquee
4. Problem
5. Method
6. Results / Stats
7. Offer / Pricing
8. FAQ
9. CTA Final
10. Footer
