# ✨ Block 4 — Animations & Interactions

This block is what separates a "meh" site from a "wow" site. Pick what you want. More = more impressive.

---

## Full Animations Block (copy-paste)

```
## ANIMATIONS & INTERACTIONS (vanilla JS only)

### Scroll Reveal (MANDATORY — changes everything)
- Class .rv on all elements to animate
- IntersectionObserver adds .show when visible (threshold 0.1)
- Transition: opacity 0→1 + translateY(40px)→0, duration 0.8s, easing cubic-bezier(.22,1,.36,1)
- Progressive delays for stagger effect: data-d="1" (0.1s), data-d="2" (0.2s), etc.
- Respect prefers-reduced-motion: disable animations if active

### Rolling Text in Hero (RECOMMENDED)
- overflow hidden container, fixed height = 1 line
- 3 words stacked vertically
- CSS keyframes animation: translateY between 3 positions, 6s infinite
- Visible word changes every 2s

### Animated Counters (RECOMMENDED)
- data-count="[NUMBER]" on elements to animate
- IntersectionObserver triggers counting when visible
- Increments over steps across 2s with quadratic easing
- French/English number format: toLocaleString()

### 3D Tilt on Cards (OPTIONAL — very impressive)
- data-tilt on concerned elements
- On mousemove: calculate relative mouse position within the card
- transform: perspective(1000px) rotateX(Ydeg) rotateY(Xdeg)
- Subtle intensity: ±5 to ±8 degrees max
- Smooth reset on mouseleave
- Disabled on mobile/touch devices

### Custom Cursor (OPTIONAL — guaranteed "wow" effect)
- Desktop only (matchMedia hover:hover)
- 20px circle following mouse with lag (lerp 0.12)
- Small 5px dot without lag at center
- mix-blend-mode: difference for automatic contrast
- Scales to 50px on hover over links/buttons/cards

### Animated Background Glows (OPTIONAL)
- 2–3 divs in absolute position, border-radius 50%
- Radial gradients with accent + secondary color
- filter: blur(80px), opacity 0.3
- Slow animation: translate + scale, 8–12s infinite alternate
```

---

## Individual Animation Recipes

### 🔵 Scroll Reveal (CSS + JS)

```css
.rv {
  opacity: 0;
  transform: translateY(40px);
  transition: opacity 0.8s cubic-bezier(.22,1,.36,1),
              transform 0.8s cubic-bezier(.22,1,.36,1);
}
.rv.show {
  opacity: 1;
  transform: translateY(0);
}
[data-d="1"] { transition-delay: 0.1s; }
[data-d="2"] { transition-delay: 0.2s; }
[data-d="3"] { transition-delay: 0.3s; }

@media (prefers-reduced-motion: reduce) {
  .rv { opacity: 1; transform: none; transition: none; }
}
```

```javascript
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('show'); });
}, { threshold: 0.1 });
document.querySelectorAll('.rv').forEach(el => observer.observe(el));
```

---

### 🔄 Rolling Text Hero (CSS)

```css
.rolling-container {
  overflow: hidden;
  height: 1.1em; /* matches line-height */
  display: inline-block;
}
.rolling-words {
  animation: roll 6s infinite;
}
.rolling-words span {
  display: block;
  height: 1.1em;
}
@keyframes roll {
  0%, 28%  { transform: translateY(0); }
  33%, 61% { transform: translateY(-1.1em); }
  66%, 94% { transform: translateY(-2.2em); }
  100%     { transform: translateY(0); }
}
```

---

### 🔢 Animated Counters (JS)

```javascript
function animateCounter(el) {
  const target = parseInt(el.dataset.count);
  const duration = 2000;
  const start = performance.now();
  const update = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // cubic easing
    el.textContent = Math.floor(eased * target).toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      animateCounter(e.target);
      counterObserver.unobserve(e.target);
    }
  });
});
document.querySelectorAll('[data-count]').forEach(el => counterObserver.observe(el));
```

---

### 🌀 3D Tilt on Cards (JS)

```javascript
document.querySelectorAll('[data-tilt]').forEach(card => {
  if (window.matchMedia('(hover: none)').matches) return; // skip mobile
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `perspective(1000px) rotateY(${x * 12}deg) rotateX(${-y * 12}deg) translateZ(10px)`;
  });
  card.addEventListener('mouseleave', () => {
    card.style.transform = 'perspective(1000px) rotateY(0) rotateX(0) translateZ(0)';
    card.style.transition = 'transform 0.5s cubic-bezier(.22,1,.36,1)';
  });
});
```

---

### 🖱️ Custom Cursor (JS)

```javascript
if (window.matchMedia('(hover: hover)').matches) {
  const cursor = document.createElement('div');
  cursor.className = 'custom-cursor';
  document.body.appendChild(cursor);

  let mx = 0, my = 0, cx = 0, cy = 0;
  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

  function animateCursor() {
    cx += (mx - cx) * 0.12;
    cy += (my - cy) * 0.12;
    cursor.style.transform = `translate(${cx - 10}px, ${cy - 10}px)`;
    requestAnimationFrame(animateCursor);
  }
  animateCursor();

  document.querySelectorAll('a, button, [data-tilt]').forEach(el => {
    el.addEventListener('mouseenter', () => cursor.classList.add('hover'));
    el.addEventListener('mouseleave', () => cursor.classList.remove('hover'));
  });
}
```

```css
.custom-cursor {
  position: fixed;
  width: 20px; height: 20px;
  border-radius: 50%;
  background: white;
  mix-blend-mode: difference;
  pointer-events: none;
  z-index: 9999;
  transition: width 0.2s, height 0.2s;
}
.custom-cursor.hover {
  width: 50px;
  height: 50px;
  margin: -15px; /* re-center */
}
```

---

## 📊 Impact vs Effort Matrix

| Animation | Impact | Effort |
|-----------|--------|--------|
| Scroll reveal (fade up + stagger) | 🔥🔥🔥 | Easy |
| Dark/light section alternation | 🔥🔥🔥 | Easy |
| Pill buttons with hover translateY | 🔥🔥 | Easy |
| Rolling text in hero | 🔥🔥🔥 | Medium |
| Animated counters on scroll | 🔥🔥 | Medium |
| Glassmorphism navbar on scroll | 🔥🔥 | Easy |
| 3D Tilt on cards | 🔥🔥🔥 | Medium |
| Animated background glows | 🔥🔥 | Easy |
| Custom cursor | 🔥🔥🔥 | Medium |
| Marquee scrolling banner | 🔥🔥 | Easy |
| Animated FAQ accordion | 🔥 | Easy |
