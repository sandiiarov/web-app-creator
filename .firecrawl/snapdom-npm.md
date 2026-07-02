# @zumer/snapdom  ![TypeScript icon, indicating that this package has built-in type declarations](https://static-production.npmjs.com/4a2a680dfcadf231172b78b1d3beb975.svg)

2.12.9 • Public • Published 15 days ago

- [Readme](https://www.npmjs.com/package/@zumer/snapdom?activeTab=readme)
- [Code Beta](https://www.npmjs.com/package/@zumer/snapdom?activeTab=code)
- [0 Dependencies](https://www.npmjs.com/package/@zumer/snapdom?activeTab=dependencies)
- [70 Dependents](https://www.npmjs.com/package/@zumer/snapdom?activeTab=dependents)
- [58 Versions](https://www.npmjs.com/package/@zumer/snapdom?activeTab=versions)

[![](https://raw.githubusercontent.com/zumerlab/snapdom/main/docs/assets/newhero.png)](http://zumerlab.github.io/snapdom)

[![NPM version](https://camo.githubusercontent.com/6cf0e50ba28becf40e7c5f5af5a7a6c5f52b56bb9c38d86a1ef6375a2b3ec2aa/68747470733a2f2f696d672e736869656c64732e696f2f6e706d2f762f407a756d65722f736e6170646f6d3f7374796c653d666c61742d737175617265266c6162656c3d56657273696f6e)](https://www.npmjs.com/package/@zumer/snapdom)[![NPM weekly downloads](https://camo.githubusercontent.com/a46cc0859499de3391f383da3645132aa402e8561605bb683a3b8b91bde70371/68747470733a2f2f696d672e736869656c64732e696f2f6e706d2f64772f407a756d65722f736e6170646f6d3f7374796c653d666c61742d737175617265266c6162656c3d446f776e6c6f616473)](https://www.npmjs.com/package/@zumer/snapdom)[![GitHub contributors](https://camo.githubusercontent.com/5f9dac1da085bfd9015b2ff7a5c131738ce2a463e1f44cce9e12d1c245d21551/68747470733a2f2f696d672e736869656c64732e696f2f6769746875622f636f6e7472696275746f72732f7a756d65726c61622f736e6170646f6d3f7374796c653d666c61742d737175617265266c6162656c3d436f6e7472696275746f7273)](https://github.com/zumerlab/snapdom/graphs/contributors)[![GitHub stars](https://camo.githubusercontent.com/a98af482f7d27fa6955259c0505e0287399391ae043aa6cd52c7c963b6a6583f/68747470733a2f2f696d672e736869656c64732e696f2f6769746875622f73746172732f7a756d65726c61622f736e6170646f6d3f7374796c653d666c61742d737175617265266c6162656c3d5374617273)](https://github.com/zumerlab/snapdom/stargazers)[![GitHub forks](https://camo.githubusercontent.com/3e3e0cd39e7af36014dd85520d454c015c1e3f5458998903a290df11f513a24d/68747470733a2f2f696d672e736869656c64732e696f2f6769746875622f666f726b732f7a756d65726c61622f736e6170646f6d3f7374796c653d666c61742d737175617265266c6162656c3d466f726b73)](https://github.com/zumerlab/snapdom/network/members)[![Sponsor tinchox5](https://camo.githubusercontent.com/b3504864dbc2b850a1cc0c01691d5dcdef8b2dad060df1bd370f7297018fecc0/68747470733a2f2f696d672e736869656c64732e696f2f6769746875622f73706f6e736f72732f74696e63686f78353f7374796c653d666c61742d737175617265266c6162656c3d53706f6e736f72)](https://github.com/sponsors/tinchox5)[![License](https://camo.githubusercontent.com/128b8c73fee617fabddc4d3de89e61b648624b7be2fd4368b2bd22e4869e9023/68747470733a2f2f696d672e736869656c64732e696f2f6769746875622f6c6963656e73652f7a756d65726c61622f736e6170646f6d3f7374796c653d666c61742d737175617265)](https://github.com/zumerlab/snapdom/blob/main/LICENSE)

English \| [简体中文](https://github.com/zumerlab/snapdom/blob/HEAD/README_CN.md)

# SnapDOM

[Permalink: SnapDOM](https://www.npmjs.com/package/@zumer/snapdom#snapdom)

**SnapDOM** is a next-generation **DOM Capture Engine** — the fast, modern alternative to **html2canvas**, **dom-to-image**, and **html-to-image**.

It converts any DOM subtree into a self-contained representation that can be exported to SVG, PNG, JPG, WebP, Canvas, Blob, or **any custom format** through plugins — ultra-fast, modular, extensible, and dependency-free.

- Full DOM capture
- Embedded styles, pseudo-elements, and fonts
- Export to SVG, PNG, JPG, WebP, `canvas`, or Blob
- ⚡ Ultra fast, no dependencies
- 100% based on standard Web APIs
- Support same-origin `ìframe`
- Support CSS counter() and CSS counters()
- Support `...` line-clamp

## Demo

[Permalink: Demo](https://www.npmjs.com/package/@zumer/snapdom#demo)

[https://snapdom.dev](https://snapdom.dev/)

## Quick Start

[Permalink: Quick Start](https://www.npmjs.com/package/@zumer/snapdom#quick-start)

**Capture any DOM element to PNG in one line:**

```
import { snapdom } from '@zumer/snapdom';

const img = await snapdom.toPng(document.querySelector('#card'));
document.body.appendChild(img);
```

**Reusable capture** (one clone, multiple exports):

```
const result = await snapdom(document.querySelector('#card'));
await result.toPng();      // → HTMLImageElement
await result.toSvg();      // → SVG as Image
await result.download({ format: 'jpg', filename: 'card.jpg' });
```

* * *

## Capture Flow

[Permalink: Capture Flow](https://www.npmjs.com/package/@zumer/snapdom#capture-flow)

SnapDOM transforms your DOM element through these stages:

```
DOM Element
    ↓
Clone
    ↓
Styles & Pseudo
    ↓
Images & Backgrounds
    ↓
Fonts
    ↓
SVG foreignObject
    ↓
data:image/svg+xml
    ↓
toPng / toSvg / toBlob / download
```

| Stage | What happens |
| --- | --- |
| **Clone** | Deep clone with styles, Shadow DOM, iframes. Exclude/filter nodes. |
| **Styles & Pseudo** | Inline `::before`/`::after` as elements, resolve `counter()`/`counters()`. |
| **Images & Backgrounds** | Fetch and inline external images/backgrounds as data URLs. |
| **Fonts** | Embed `@font-face` (optional) and icon fonts. |
| **SVG** | Wrap clone in `<foreignObject>`, serialize to `data:image/svg+xml`. |
| **Export** | Convert SVG to PNG/JPG/WebP/Blob or trigger download. |

Plugin hooks: `beforeSnap` → `beforeClone` → `afterClone` → `beforeRender` → `afterRender` → `beforeExport` → `afterExport`.

## Table of Contents

[Permalink: Table of Contents](https://www.npmjs.com/package/@zumer/snapdom#table-of-contents)

- [Quick Start](https://www.npmjs.com/package/@zumer/snapdom#quick-start)
- [Capture Flow](https://www.npmjs.com/package/@zumer/snapdom#capture-flow)
- [Installation](https://www.npmjs.com/package/@zumer/snapdom#installation)  - [NPM / Yarn (stable)](https://www.npmjs.com/package/@zumer/snapdom#npm--yarn-stable)
  - [NPM / Yarn (dev builds)](https://www.npmjs.com/package/@zumer/snapdom#npm--yarn-dev-builds)
  - [CDN (stable)](https://www.npmjs.com/package/@zumer/snapdom#cdn-stable)
  - [CDN (dev builds)](https://www.npmjs.com/package/@zumer/snapdom#cdn-dev-builds)
- [Build Outputs](https://www.npmjs.com/package/@zumer/snapdom#build-outputs--tree-shaking)
- [Usage](https://www.npmjs.com/package/@zumer/snapdom#usage)  - [Reusable capture](https://www.npmjs.com/package/@zumer/snapdom#reusable-capture)
  - [One-step shortcuts](https://www.npmjs.com/package/@zumer/snapdom#one-step-shortcuts)
- [API](https://www.npmjs.com/package/@zumer/snapdom#api)  - [snapdom(el, options?)](https://www.npmjs.com/package/@zumer/snapdom#snapdomel-options)
  - [Shortcut methods](https://www.npmjs.com/package/@zumer/snapdom#shortcut-methods)
- [Options](https://www.npmjs.com/package/@zumer/snapdom#options)  - [debug](https://www.npmjs.com/package/@zumer/snapdom#debug)
  - [Fallback image on `<img>` load failure](https://www.npmjs.com/package/@zumer/snapdom#fallback-image-on-img-load-failure)
  - [Dimensions (`scale`, `width`, `height`)](https://www.npmjs.com/package/@zumer/snapdom#dimensions-scale-width-height)
  - [Cross-Origin Images & Fonts (`useProxy`)](https://www.npmjs.com/package/@zumer/snapdom#cross-origin-images--fonts-useproxy)
  - [Fonts](https://www.npmjs.com/package/@zumer/snapdom#fonts)    - [embedFonts](https://www.npmjs.com/package/@zumer/snapdom#embedfonts)
    - [localFonts](https://www.npmjs.com/package/@zumer/snapdom#localfonts)
    - [iconFonts](https://www.npmjs.com/package/@zumer/snapdom#iconfonts)
    - [excludeFonts](https://www.npmjs.com/package/@zumer/snapdom#excludefonts)
  - [Filtering nodes: `exclude` vs `filter`](https://www.npmjs.com/package/@zumer/snapdom#filtering-nodes-exclude-vs-filter)
  - [outerTransforms](https://www.npmjs.com/package/@zumer/snapdom#outerTransforms)
  - [outerShadows](https://www.npmjs.com/package/@zumer/snapdom#no-shadows)
  - [Cache control](https://www.npmjs.com/package/@zumer/snapdom#cache-control)
- [preCache](https://www.npmjs.com/package/@zumer/snapdom#precache--optional-helper)
- [Plugins (BETA)](https://www.npmjs.com/package/@zumer/snapdom#plugins-beta)  - [Official Plugins](https://www.npmjs.com/package/@zumer/snapdom#official-plugins)
  - [Community Plugins](https://www.npmjs.com/package/@zumer/snapdom#community-plugins)
  - [Build a Plugin in 5 Minutes](https://www.npmjs.com/package/@zumer/snapdom#build-a-plugin-in-5-minutes)
  - [Registering Plugins](https://www.npmjs.com/package/@zumer/snapdom#registering-plugins)
  - [Plugin Lifecycle Hooks](https://www.npmjs.com/package/@zumer/snapdom#plugin-lifecycle-hooks)
  - [Context Object](https://www.npmjs.com/package/@zumer/snapdom#context-object)
  - [Custom Exports via Plugins](https://www.npmjs.com/package/@zumer/snapdom#custom-exports-via-plugins)
  - [Example: Overlay Filter Plugin](https://www.npmjs.com/package/@zumer/snapdom#example-overlay-filter-plugin)
  - [Full Plugin Template](https://www.npmjs.com/package/@zumer/snapdom#full-plugin-template)
- [Limitations](https://www.npmjs.com/package/@zumer/snapdom#limitations)
- [⚡ Performance Benchmarks (Chromium)](https://www.npmjs.com/package/@zumer/snapdom#performance-benchmarks)  - [Simple elements](https://www.npmjs.com/package/@zumer/snapdom#simple-elements)
  - [Complex elements](https://www.npmjs.com/package/@zumer/snapdom#complex-elements)
  - [Run the benchmarks](https://www.npmjs.com/package/@zumer/snapdom#run-the-benchmarks)
- [Roadmap](https://www.npmjs.com/package/@zumer/snapdom#roadmap)
- [Development](https://www.npmjs.com/package/@zumer/snapdom#development)
- [Contributors 🙌](https://www.npmjs.com/package/@zumer/snapdom#contributors)
- [💖 Sponsors](https://www.npmjs.com/package/@zumer/snapdom#sponsors)
- [Star History](https://www.npmjs.com/package/@zumer/snapdom#star-history)
- [License](https://www.npmjs.com/package/@zumer/snapdom#license)

## Installation

[Permalink: Installation](https://www.npmjs.com/package/@zumer/snapdom#installation)

### NPM / Yarn (stable)

[Permalink: NPM / Yarn (stable)](https://www.npmjs.com/package/@zumer/snapdom#npm--yarn-stable)

```
npm i @zumer/snapdom
yarn add @zumer/snapdom
```

### NPM / Yarn (dev builds)

[Permalink: NPM / Yarn (dev builds)](https://www.npmjs.com/package/@zumer/snapdom#npm--yarn-dev-builds)

For early access to new features and fixes:

```
npm i @zumer/snapdom@dev
yarn add @zumer/snapdom@dev
```

⚠️ The `@dev` tag usually includes improvements before they reach production, but may be less stable.

### CDN (stable)

[Permalink: CDN (stable)](https://www.npmjs.com/package/@zumer/snapdom#cdn-stable)

```
<!-- Minified build -->
<script src="https://unpkg.com/@zumer/snapdom/dist/snapdom.js"></script>

<!-- Minified ES Module build -->
<script type="module">
  import { snapdom } from "https://unpkg.com/@zumer/snapdom/dist/snapdom.mjs";
</script>
```

### CDN (dev builds)

[Permalink: CDN (dev builds)](https://www.npmjs.com/package/@zumer/snapdom#cdn-dev-builds)

```
<!-- Minified build (dev) -->
<script src="https://unpkg.com/@zumer/snapdom@dev/dist/snapdom.js"></script>

<!-- Minified ES Module build (dev) -->
<script type="module">
  import { snapdom } from "https://unpkg.com/@zumer/snapdom@dev/dist/snapdom.mjs";
</script>
```

## Build Outputs

[Permalink: Build Outputs](https://www.npmjs.com/package/@zumer/snapdom#build-outputs)

| Variant | File | Use case |
| --- | --- | --- |
| **ESM** (tree-shakeable) | `dist/snapdom.mjs` | Bundlers (Vite, webpack), `import` |
| **IIFE** (global) | `dist/snapdom.js` | Script tag, legacy `require` |

**Bundler (npm):**

```
import { snapdom } from '@zumer/snapdom';  // → dist/snapdom.mjs
```

**Script tag (CDN):**

```
<script src="https://unpkg.com/@zumer/snapdom/dist/snapdom.js"></script>
<script> snapdom.toPng(document.body).then(img => document.body.appendChild(img)); </script>
```

**Subpath imports** (lighter bundle if you only need one):

```
import { preCache } from '@zumer/snapdom/preCache';
import { plugins } from '@zumer/snapdom/plugins';
```

## Usage

[Permalink: Usage](https://www.npmjs.com/package/@zumer/snapdom#usage)

| Pattern | When to use |
| --- | --- |
| **Reusable**`snapdom(el)` | One clone → many exports (PNG + JPG + download). |
| **Shortcuts**`snapdom.toPng(el)` | Single export, less code. |

### Reusable capture

[Permalink: Reusable capture](https://www.npmjs.com/package/@zumer/snapdom#reusable-capture)

Capture once, export many times (no re-clone):

```
const el = document.querySelector('#target');
const result = await snapdom(el);

const img = await result.toPng();
document.body.appendChild(img);
await result.download({ format: 'jpg', filename: 'my-capture.jpg' });
```

### One-step shortcuts

[Permalink: One-step shortcuts](https://www.npmjs.com/package/@zumer/snapdom#one-step-shortcuts)

Direct export when you need a single format:

```
const png = await snapdom.toPng(el);
const blob = await snapdom.toBlob(el);
document.body.appendChild(png);
```

## API

[Permalink: API](https://www.npmjs.com/package/@zumer/snapdom#api)

### `snapdom(el, options?)`

[Permalink: snapdom(el, options?)](https://www.npmjs.com/package/@zumer/snapdom#snapdomel-options)

Returns an object with reusable export methods:

```
{
  url: string;
  toRaw(): string;
  toImg(): Promise<HTMLImageElement>; // deprecated
  toSvg(): Promise<HTMLImageElement>;
  toCanvas(): Promise<HTMLCanvasElement>;
  toBlob(options?): Promise<Blob>;
  toPng(options?): Promise<HTMLImageElement>;
  toJpg(options?): Promise<HTMLImageElement>;
  toWebp(options?): Promise<HTMLImageElement>;
  download(options?): Promise<void>;
}
```

### Shortcut methods

[Permalink: Shortcut methods](https://www.npmjs.com/package/@zumer/snapdom#shortcut-methods)

| Method | Description |
| --- | --- |
| `snapdom.toImg(el, options?)` | Returns an SVG `HTMLImageElement` (deprecated) |
| `snapdom.toSvg(el, options?)` | Returns an SVG `HTMLImageElement` |
| `snapdom.toCanvas(el, options?)` | Returns a `Canvas` |
| `snapdom.toBlob(el, options?)` | Returns an SVG or raster `Blob` |
| `snapdom.toPng(el, options?)` | Returns a PNG image |
| `snapdom.toJpg(el, options?)` | Returns a JPG image |
| `snapdom.toWebp(el, options?)` | Returns a WebP image |
| `snapdom.download(el, options?)` | Triggers a download |

### Exporter-specific options

[Permalink: Exporter-specific options](https://www.npmjs.com/package/@zumer/snapdom#exporter-specific-options)

Some exporters accept a small set of **export-only options** in addition to the global capture options.

#### `download()`

[Permalink: download()](https://www.npmjs.com/package/@zumer/snapdom#download)

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `filename` | `string` | `snapdom` | Download name. |
| `format` | `"png" | "jpeg" | "jpg" | "webp" | "svg"` | `"png"` | Output format for the downloaded file. |

**Example:**

```
await result.download({
  format: 'jpg',
  quality: 0.92,
  filename: 'my-capture'
});
```

#### `toBlob()`

[Permalink: toBlob()](https://www.npmjs.com/package/@zumer/snapdom#toblob)

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `type` | `"svg" | "png" | "jpeg" | "jpg" | "webp"` | `"svg"` | Blob type to generate. |

**Example:**

```
const blob = await result.toBlob({ type: 'jpeg', quality: 0.92 });
```

## Options

[Permalink: Options](https://www.npmjs.com/package/@zumer/snapdom#options)

All capture methods accept an `options` object:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `debug` | boolean | `false` | When `true`, logs suppressed errors to `console.warn` for troubleshooting |
| `fast` | boolean | `true` | Skips small idle delays for faster results |
| `embedFonts` | boolean | `false` | Inlines non-icon fonts (icon fonts always on) |
| `localFonts` | array | `[]` | Local fonts `{ family, src, weight?, style? }` |
| `iconFonts` | string\|RegExp\|Array | `[]` | Extra icon font matchers |
| `excludeFonts` | object | `{}` | Exclude families/domains/subsets during embedding |
| `scale` | number | `1` | Output scale multiplier |
| `dpr` | number | `devicePixelRatio` | Device pixel ratio |
| `width` | number | - | Output width |
| `height` | number | - | Output height |
| `backgroundColor` | string | `"#fff"` | Fallback color for JPG/WebP |
| `quality` | number | `1` | Quality for JPG/WebP (0 to 1) |
| `useProxy` | string | `''` | Proxy base for CORS fallbacks |
| `exclude` | string\[\] | - | CSS selectors to exclude |
| `excludeMode` | `"hide"`\|`"remove"` | `"hide"` | How `exclude` is applied |
| `filter` | function | - | Custom predicate `(el) => boolean` |
| `filterMode` | `"hide"`\|`"remove"` | `"hide"` | How `filter` is applied |
| `cache` | string | `"soft"` | `disabled` \| `soft` \| `auto` \| `full` |
| `placeholders` | boolean | `true` | Show placeholders for images/CORS iframes |
| `fallbackURL` | string \| function | - | Fallback image for `<img>` load failure |
| `outerTransforms` | boolean | `true` | When `false` removes `translate/rotate` but preserves `scale/skew`, producing a flat, reusable capture |
| `outerShadows` | boolean | `false` | Do not expand the root’s bounding box for shadows/blur/outline, and strip those visual effects from the cloned root |
| `safariWarmupAttempts` | number | `3` | Safari only: iterations to prime font/decode (WebKit #219770). Use `1` if 3 causes lag |

### debug

[Permalink: debug](https://www.npmjs.com/package/@zumer/snapdom#debug)

When `debug: true`, SnapDOM logs normally suppressed errors to `console.warn` (with the `[snapdom]` prefix). Useful for troubleshooting capture issues (canvas failures, blob resolution, style stripping, etc.) without noisy output in production.

```
await snapdom.toPng(el, { debug: true });
```

### Fallback image on `<img>` load failure

[Permalink: Fallback image on <img> load failure](https://www.npmjs.com/package/@zumer/snapdom#fallback-image-on-img-load-failure)

Provide a default image for failed `<img>` loads. You can pass a fixed URL or a callback that receives measured dimensions and returns a URL (handy to generate dynamic placeholders).

```
// 1) Fixed URL fallback
await snapdom.toSvg(element, {
  fallbackURL: '/images/fallback.png'
});

// 2) Dynamic placeholder via callback
await snapdom.toSvg(element, {
  fallbackURL: ({ width: 300, height: 150 }) =>
    `https://placehold.co/${width}x${height}`
});

// 3) With proxy (if your fallback host has no CORS)
await snapdom.toSvg(element, {
  fallbackURL: ({ width = 300, height = 150 }) =>
    `https://dummyimage.com/${width}x${height}/cccccc/666.png&text=img`,
  useProxy: 'https://proxy.corsfix.com/?'
});
```

Notes:

- If the fallback image also fails to load, snapDOM replaces the `<img>` with a placeholder block preserving width/height.
- Width/height used by the callback are gathered from the original element (dataset, style/attrs, etc.) when available.

### Dimensions (`scale`, `width`, `height`)

[Permalink: Dimensions (scale, width, height)](https://www.npmjs.com/package/@zumer/snapdom#dimensions-scale-width-height)

- If `scale` is provided, it **takes precedence** over `width`/`height`.
- If only `width` is provided, height scales proportionally (and vice versa).
- Providing both `width` and `height` forces an exact size (may distort).

### Cross-Origin Images & Fonts (`useProxy`)

[Permalink: Cross-Origin Images & Fonts (useProxy)](https://www.npmjs.com/package/@zumer/snapdom#cross-origin-images--fonts-useproxy)

By default snapDOM tries `crossOrigin="anonymous"` (or `use-credentials` for same-origin). If an asset is CORS-blocked, you can set `useProxy` to a prefix URL that forwards the actual `src`:

```
await snapdom.toPng(el, {
  useProxy: 'https://proxy.corsfix.com/?' // Note: Any cors proxy could be used 'https://proxy.corsfix.com/?'
});
```

- The proxy is only used as a **fallback**; same-origin and CORS-enabled assets skip it.

### Fonts

[Permalink: Fonts](https://www.npmjs.com/package/@zumer/snapdom#fonts)

#### `embedFonts`

[Permalink: embedFonts](https://www.npmjs.com/package/@zumer/snapdom#embedfonts)

When `true`, snapDOM embeds **non-icon**`@font-face` rules detected as used within the captured subtree. Icon fonts (Font Awesome, Material Icons, etc.) are embedded **always**.

#### `localFonts`

[Permalink: localFonts](https://www.npmjs.com/package/@zumer/snapdom#localfonts)

If you serve fonts yourself or have data URLs, you can declare them here to avoid extra CSS discovery:

```
await snapdom.toPng(el, {
  embedFonts: true,
  localFonts: [\
    { family: 'Inter', src: '/fonts/Inter-Variable.woff2', weight: 400, style: 'normal' },\
    { family: 'Inter', src: '/fonts/Inter-Italic.woff2', style: 'italic' }\
  ]
});
```

#### `iconFonts`

[Permalink: iconFonts](https://www.npmjs.com/package/@zumer/snapdom#iconfonts)

Add custom icon families (names or regex matchers). Useful for private icon sets:

```
await snapdom.toPng(el, {
  iconFonts: ['MyIcons', /^(Remix|Feather) Icons?$/i]
});
```

#### `excludeFonts`

[Permalink: excludeFonts](https://www.npmjs.com/package/@zumer/snapdom#excludefonts)

Skip specific non-icon fonts to speed up capture or avoid unnecessary downloads.

```
await snapdom.toPng(el, {
  embedFonts: true,
  excludeFonts: {
    families: ['Noto Serif', 'SomeHeavyFont'],     // skip by family name
    domains: ['fonts.gstatic.com', 'cdn.example'], // skip by source host
    subsets: ['cyrillic-ext']                      // skip by unicode-range subset tag
  }
});
```

_Notes_

- `excludeFonts` only applies to **non-icon** fonts. Icon fonts are always embedded.
- Matching is case-insensitive for `families`. Hosts are matched by substring against the resolved URL.

#### Filtering nodes: `exclude` vs `filter`

[Permalink: Filtering nodes: exclude vs filter](https://www.npmjs.com/package/@zumer/snapdom#filtering-nodes-exclude-vs-filter)

- `exclude`: remove by **selector**.
- `excludeMode`: `hide` applies `visibility:hidden` CSS rule on excluded nodes and the layout remains as the original. `remove` do not clone excluded nodes at all.
- `filter`: advanced predicate per element (return `false` to drop).
- `filterMode`: `hide` applies `visibility:hidden` CSS rule on filtered nodes and the layout remains as the original. `remove` do not clone filtered nodes at all.

**Example: filter out elements with `display:none`:**

```
/**
 * Example filter: skip elements with display:none
 * @param {Element} el
 * @returns {boolean} true = keep, false = exclude
 */
function filterHidden(el) {
  const cs = window.getComputedStyle(el);
  if (cs.display === 'none') return false;
  return true;
}

await snapdom.toPng(document.body, { filter: filterHidden });
```

**Example with `exclude`:** remove banners or tooltips by selector

```
await snapdom.toPng(el, {
  exclude: ['.cookie-banner', '.tooltip', '[data-test="debug"]']
});
```

### outerTransforms

[Permalink: outerTransforms](https://www.npmjs.com/package/@zumer/snapdom#outertransforms)

When capturing rotated or translated elements, you may want use **outerTransforms: false** option if you want to eliminate those external transforms. So, the output is **flat, upright, and ready** to use elsewhere.

- **`outerTransforms: true (default)`**

**Keeps the original `transforms` and `rotate`**.

### outerShadows

[Permalink: outerShadows](https://www.npmjs.com/package/@zumer/snapdom#outershadows)

- **`outerShadows: false (default)`**


Prevents expanding the bounding box for shadows, blur, or outline on the root, and also strips `box-shadow`, `text-shadow`, `filter: blur()/drop-shadow()`, and `outline` from the cloned root.

> 💡 **Tip:** Using both (`outerTransforms: false` \+ `outerShadows: false`) produces a strict, minimal bounding box with no visual bleed.

**Example**

```
// outerTransforms and remove shadow bleed
await snapdom.toSvg(el, { outerTransforms: true, outerShadows: true });
```

## Cache control

[Permalink: Cache control](https://www.npmjs.com/package/@zumer/snapdom#cache-control)

SnapDOM maintains internal caches for images, backgrounds, resources, styles, and fonts.
You can control how they are cleared between captures using the `cache` option:

| Mode | Description |
| --- | --- |
| `"disabled"` | No cache |
| `"soft"` | Clears session caches (`styleMap`, `nodeMap`, `styleCache`) _(default)_ |
| `"auto"` | Minimal cleanup: only clears transient maps |
| `"full"` | Keeps all caches (nothing is cleared, maximum performance) |

**Examples:**

```
// Use minimal but fast cache
await snapdom.toPng(el, { cache: 'auto' });

// Keep everything in memory between captures
await snapdom.toPng(el, { cache: 'full' });

// Force a full cleanup on every capture
await snapdom.toPng(el, { cache: 'disabled' });
```

## `preCache()` – Optional helper

[Permalink: preCache() – Optional helper](https://www.npmjs.com/package/@zumer/snapdom#precache--optional-helper)

Preloads external resources to avoid first-capture stalls (helpful for big/complex trees).

```
import { preCache } from '@zumer/snapdom';

await preCache({
  root: document.body,
  embedFonts: true,
  localFonts: [{ family: 'Inter', src: '/fonts/Inter.woff2', weight: 400 }],
  useProxy: 'https://proxy.corsfix.com/?'
});
```

## Plugins (BETA)

[Permalink: Plugins (BETA)](https://www.npmjs.com/package/@zumer/snapdom#plugins-beta)

SnapDOM includes a lightweight **plugin system** that allows you to extend or override behavior at any stage of the capture and export process — without touching the core library.

A plugin is a simple object with a unique `name` and one or more lifecycle **hooks**.
Hooks can be synchronous or `async`, and they receive a shared **`context`** object.

### Official Plugins

[Permalink: Official Plugins](https://www.npmjs.com/package/@zumer/snapdom#official-plugins)

Install the official plugin package:

```
npm install @zumer/snapdom-plugins
```

```
import { filter } from '@zumer/snapdom-plugins/filter';
import { timestampOverlay } from '@zumer/snapdom-plugins/timestamp-overlay';
```

| Plugin | Category | Description |
| --- | --- | --- |
| `picture-resolver` | Capture | Resolves lazy-loaded `<picture>` placeholders. Detects base64 stubs and fetches the real image before capture. |
| `timestamp-overlay` | Transform | Adds a configurable timestamp label on the captured clone. Supports multiple date formats and positions. |
| `filter` | Transform | Applies CSS filter effects to captures. Ships with presets: `grayscale`, `sepia`, `blur`, `vintage`, `dramatic`. |
| `replace-text` | Transform | Find-and-replace text in the captured clone. Supports strings and regex patterns. |
| `color-tint` | Transform | Tints the entire capture to a specified color using an overlay with `mix-blend-mode`. |
| `ascii-export` | Export | Adds a `toAscii()` method that converts captures to ASCII art. Configurable width, charset, and luminance. |
| `pdf-image` | Export | Exports the capture as a PNG embedded in a downloadable PDF. Supports portrait and landscape orientations. |
| `html-in-canvas` | Export | Uses the experimental WICG `drawElementImage` API for direct DOM-to-canvas rendering where supported. |
| `prompt-export` | Export | LLM-friendly capture: adds a `toPrompt()` method that returns an annotated screenshot, structured element map with bounding boxes, and a pre-formatted text prompt. |

### Community Plugins

[Permalink: Community Plugins](https://www.npmjs.com/package/@zumer/snapdom#community-plugins)

Community plugins are listed on the [Plugins page](https://zumerlab.github.io/snapdom/plugins.html). To submit your plugin, open a PR adding one line to `community-plugins.md`. See [CONTRIBUTING\_PLUGINS.md](https://github.com/zumerlab/snapdom/blob/HEAD/CONTRIBUTING_PLUGINS.md).

### Build a Plugin in 5 Minutes

[Permalink: Build a Plugin in 5 Minutes](https://www.npmjs.com/package/@zumer/snapdom#build-a-plugin-in-5-minutes)

SnapDOM's hook system gives you full control over every stage of the capture pipeline:

1. **Clone the template** — `npx degit zumerlab/snapdom/packages/plugin-template my-plugin`
2. **Write your hook logic** — `export function myPlugin() {}`
3. **Get listed** — open a PR adding one line to `community-plugins.md`

See [PLUGIN\_SPEC.md](https://github.com/zumerlab/snapdom/blob/HEAD/PLUGIN_SPEC.md) for the full specification and [CONTRIBUTING\_PLUGINS.md](https://github.com/zumerlab/snapdom/blob/HEAD/CONTRIBUTING_PLUGINS.md) for submission guidelines.

### Registering Plugins

[Permalink: Registering Plugins](https://www.npmjs.com/package/@zumer/snapdom#registering-plugins)

**Global registration** (applies to all captures):

```
import { snapdom } from '@zumer/snapdom';

// You can register instances, factories, or [factory, options]
snapdom.plugins(
  myPluginInstance,
  [myPluginFactory, { optionA: true }],
  { plugin: anotherFactory, options: { level: 2 } }
);
```

**Per-capture registration** (only for that specific call):

```
const out = await snapdom(element, {
  plugins: [\
    [overlayFilterPlugin, { color: 'rgba(0,0,0,0.25)' }],\
    [myFullPlugin, { providePdf: true }]\
  ]
});
```

- **Execution order = registration order** (first registered, first executed).
- **Per-capture plugins** run **before** global ones.
- Duplicates are automatically skipped by `name`; a per-capture plugin with the same `name` overrides its global version.

### Plugin Lifecycle Hooks

[Permalink: Plugin Lifecycle Hooks](https://www.npmjs.com/package/@zumer/snapdom#plugin-lifecycle-hooks)

Hooks run in capture order (see [Capture Flow](https://www.npmjs.com/package/@zumer/snapdom#capture-flow)):

| Hook | Stage | Purpose |
| --- | --- | --- |
| `beforeSnap` | Start | Adjust options before any work. |
| `beforeClone` | Pre-clone | Before DOM clone (modify live DOM carefully). |
| `afterClone` | Post-clone | Modify cloned tree safely (e.g. inject overlay). |
| `beforeRender` | Pre-serialize | Right before SVG → data URL. |
| `afterRender` | Post-serialize | Inspect `context.svgString` / `context.dataURL`. |
| `beforeExport` | Per export | Before each `toPng`, `toSvg`, etc. |
| `afterExport` | Per export | Transform returned result. |
| `afterSnap` | Once | After first export; cleanup. |
| `defineExports` | Setup | Add custom exporters (e.g. `toPdf`). |

> Returned values from `afterExport` are chained to the next plugin (transform pipeline).

### Context Object

[Permalink: Context Object](https://www.npmjs.com/package/@zumer/snapdom#context-object)

Every hook receives a single `context` object that contains normalized capture state:

- **Input & options:**`element`, `debug`, `fast`, `scale`, `dpr`, `width`, `height`, `backgroundColor`, `quality`, `useProxy`, `cache`, `outerTransforms`, `outerShadows`, `safariWarmupAttempts`, `embedFonts`, `localFonts`, `iconFonts`, `excludeFonts`, `exclude`, `excludeMode`, `filter`, `filterMode`, `fallbackURL`.

- **Intermediate values (depending on stage):**`clone`, `classCSS`, `styleCache`, `fontsCSS`, `baseCSS`, `svgString`, `dataURL`.

- **During export:**`context.export = { type, options, url }`
where `type` is the exporter name (`"png"`, `"jpeg"`, `"svg"`, `"blob"`, etc.), and `url` is the serialized SVG base.


> You may safely modify `context` (e.g., override `backgroundColor` or `quality`) — but do so early (`beforeSnap`) for global effects or in `beforeExport` for single-export changes.

## Custom Exports via Plugins

[Permalink: Custom Exports via Plugins](https://www.npmjs.com/package/@zumer/snapdom#custom-exports-via-plugins)

Plugins can add new exports using `defineExports(context)`.
For each export key you return (e.g., `"pdf"`), SnapDOM automatically exposes a helper method named **`toPdf()`** on the capture result.

**Register the plugin (global or per capture):**

```
import { snapdom } from '@zumer/snapdom';

// global
snapdom.plugins(pdfExportPlugin());

// or per capture
const out = await snapdom(element, { plugins: [pdfExportPlugin()] });
```

**Call the custom export:**

```
const out = await snapdom(document.querySelector('#report'));

// because the plugin returns { pdf: async (ctx, opts) => ... }
const pdfBlob = await out.toPdf({
  // exporter-specific options (width, height, quality, filename, etc.)
});
```

### Example: Overlay Filter Plugin

[Permalink: Example: Overlay Filter Plugin](https://www.npmjs.com/package/@zumer/snapdom#example-overlay-filter-plugin)

Adds a translucent overlay or color filter **only** to the captured clone (not your live DOM).
Useful for highlighting or dimming sections before export.

```
/**
 * Ultra-simple overlay filter for SnapDOM (HTML-only).
 * Inserts a full-size <div> overlay on the cloned root.
 *
 * @param {{ color?: string; blur?: number }} [options]
 *   color: overlay color (rgba/hex/hsl). Default: 'rgba(0,0,0,0.25)'
 *   blur: optional blur in px (default: 0)
 */
export function overlayFilterPlugin(options = {}) {
  const color = options.color ?? 'rgba(0,0,0,0.25)';
  const blur = Math.max(0, options.blur ?? 0);

  return {
    name: 'overlay-filter',

    /**
     * Add a full-coverage overlay to the cloned HTML root.
     * @param {any} context
     */
    async afterClone(context) {
      const root = context.clone;
      if (!(root instanceof HTMLElement)) return; // HTML-only

      // Ensure containing block so absolute overlay anchors to the root
      if (getComputedStyle(root).position === 'static') {
        root.style.position = 'relative';
      }

      const overlay = document.createElement('div');
      overlay.style.position = 'absolute';
      overlay.style.left = '0';
      overlay.style.top = '0';
      overlay.style.right = '0';
      overlay.style.bottom = '0';
      overlay.style.background = color;
      overlay.style.pointerEvents = 'none';
      if (blur) overlay.style.filter = `blur(${blur}px)`;

      root.appendChild(overlay);
    }
  };
}
```

**Usage:**

```
import { snapdom } from '@zumer/snapdom';

// Global registration
snapdom.plugins([overlayFilterPlugin, { color: 'rgba(0,0,0,0.3)', blur: 2 }]);

// Per-capture
const out = await snapdom(document.querySelector('#card'), {
  plugins: [[overlayFilterPlugin, { color: 'rgba(255,200,0,0.15)' }]]
});

const png = await out.toPng();
document.body.appendChild(png);
```

> The overlay is injected **only in the cloned tree**, never in your live DOM, ensuring perfect fidelity and zero flicker.

### Full Plugin Template

[Permalink: Full Plugin Template](https://www.npmjs.com/package/@zumer/snapdom#full-plugin-template)

Use this as a starting point for custom logic or exporters.

```
export function myPlugin(options = {}) {
  return {
    /** Unique name used for de-duplication/overrides */
    name: 'my-plugin',

    /** Early adjustments before any clone/style work. */
    async beforeSnap(context) {},

    /** Before subtree cloning (use sparingly if touching the live DOM). */
    async beforeClone(context) {},

    /** After subtree cloning (safe to modify the cloned tree). */
    async afterClone(context) {},

    /** Right before serialization (SVG/dataURL). */
    async beforeRender(context) {},

    /** After serialization; inspect context.svgString/context.dataURL if needed. */
    async afterRender(context) {},

    /** Before EACH export call (toPng/toSvg/toBlob/...). */
    async beforeExport(context) {},

    /**
     * After EACH export call.
     * If you return a value, it becomes the result for the next plugin (chaining).
     */
    async afterExport(context, result) { return result; },

    /**
     * Define custom exporters (auto-added as helpers like out.toPdf()).
     * Return a map { [key: string]: (ctx:any, opts:any) => Promise<any> }.
     */
    async defineExports(context) { return {}; },

    /** Runs ONCE after the FIRST export finishes (cleanup). */
    async afterSnap(context) {}
  };
}
```

**Quick recap:**

- Plugins can modify capture behavior (`beforeSnap`, `afterClone`, etc.).
- You can inject visuals or transformations safely into the cloned tree.
- New exporters defined in `defineExports()` automatically become helpers like `out.toPdf()`.
- All hooks can be asynchronous, run in order, and share the same `context`.

## Limitations

[Permalink: Limitations](https://www.npmjs.com/package/@zumer/snapdom#limitations)

- External images should be CORS-accessible (use `useProxy` option for handling CORS denied)
- When WebP format is used on Safari, it will fallback to PNG rendering.
- `@font-face` CSS rule is well supported, but if need to use JS `FontFace()`, see this workaround [`#43`](https://github.com/zumerlab/snapdom/issues/43)
- **Safari**: captures with `embedFonts` or background/mask images run slower due to [WebKit #219770](https://bugs.webkit.org/show_bug.cgi?id=219770) (font decode timing). SnapDOM does pre-captures + `drawImage` to prime the pipeline; configurable via `safariWarmupAttempts` (default 3).
- **Custom scrollbar styles** (`::-webkit-scrollbar`): Applied only when the element has _not_ been scrolled. When scrolled, the viewport content is captured without the scrollbar.

## Performance Benchmarks

[Permalink: Performance Benchmarks](https://www.npmjs.com/package/@zumer/snapdom#performance-benchmarks)

**Setup.** Vitest benchmarks on Chromium, repo tests. Hardware may affect results.
Values are **average capture time (ms)** → lower is better.

### Simple elements

[Permalink: Simple elements](https://www.npmjs.com/package/@zumer/snapdom#simple-elements)

| Scenario | SnapDOM current | SnapDOM v1.9.9 | html2canvas | html-to-image |
| --- | --- | --- | --- | --- |
| Small (200×100) | **0.5 ms** | 0.8 ms | 67.7 ms | 3.1 ms |
| Modal (400×300) | **0.5 ms** | 0.8 ms | 75.5 ms | 3.6 ms |
| Page View (1200×800) | **0.5 ms** | 0.8 ms | 114.2 ms | 3.3 ms |
| Large Scroll (2000×1500) | **0.5 ms** | 0.8 ms | 186.3 ms | 3.2 ms |
| Very Large (4000×2000) | **0.5 ms** | 0.9 ms | 425.9 ms | 3.3 ms |

### Complex elements

[Permalink: Complex elements](https://www.npmjs.com/package/@zumer/snapdom#complex-elements)

| Scenario | SnapDOM current | SnapDOM v1.9.9 | html2canvas | html-to-image |
| --- | --- | --- | --- | --- |
| Small (200×100) | **1.6 ms** | 3.3 ms | 68.0 ms | 14.3 ms |
| Modal (400×300) | **2.9 ms** | 6.8 ms | 87.5 ms | 34.8 ms |
| Page View (1200×800) | **17.5 ms** | 50.2 ms | 178.0 ms | 429.0 ms |
| Large Scroll (2000×1500) | **54.0 ms** | 201.8 ms | 735.2 ms | 984.2 ms |
| Very Large (4000×2000) | **171.4 ms** | 453.7 ms | 1,800.4 ms | 2,611.9 ms |

### Run the benchmarks

[Permalink: Run the benchmarks](https://www.npmjs.com/package/@zumer/snapdom#run-the-benchmarks)

```
git clone https://github.com/zumerlab/snapdom.git
cd snapdom
npm install
npm run test:benchmark
```

## Roadmap

[Permalink: Roadmap](https://www.npmjs.com/package/@zumer/snapdom#roadmap)

Planned improvements for future versions of SnapDOM:

- \[X\] **Implement plugin system**
SnapDOM will support external plugins to extend or override internal behavior (e.g. custom node transformers, exporters, or filters).

- \[ \] **Refactor to modular architecture**
Internal logic will be split into smaller, focused modules to improve maintainability and code reuse.

- \[X\] **Decouple internal logic from global options**
Functions will be redesigned to avoid relying directly on `options`. A centralized capture context will improve clarity, autonomy, and testability. See [`next` branch](https://github.com/zumerlab/snapdom/tree/main)

- \[X\] **Expose cache control**
Users will be able to manually clear image and font caches or configure their own caching strategies.

- \[X\] **Auto font preloading**
Required fonts will be automatically detected and preloaded before capture, reducing the need for manual `preCache()` calls.

- \[X\] **Document plugin development**
A full guide will be provided for creating and registering custom SnapDOM plugins.

- \[ \] **Make export utilities tree-shakeable**
Export functions like `toPng`, `toJpg`, `toBlob`, etc. will be restructured into independent modules to support tree shaking and minimal builds.


Have ideas or feature requests?
Feel free to share suggestions or feedback in [GitHub Discussions](https://github.com/zumerlab/snapdom/discussions).

## Development

[Permalink: Development](https://www.npmjs.com/package/@zumer/snapdom#development)

**Source layout:**

- `src/api/` – Public API (`snapdom`, `preCache`)
- `src/core/` – Capture pipeline, clone, prepare, plugins
- `src/modules/` – Images, fonts, pseudo-elements, backgrounds, SVG
- `src/exporters/` – toPng, toSvg, toBlob, etc.
- `dist/` – Build output (`snapdom.js`, `snapdom.mjs`, `preCache.mjs`, `plugins.mjs`)

**Build:**

```
git clone https://github.com/zumerlab/snapdom.git
cd snapdom
git checkout dev
npm install
npm run compile
```

**Test:**

```
npx playwright install   # Required for browser tests
npm test
npm run test:benchmark
```

For detailed guidelines, see [CONTRIBUTING](https://github.com/zumerlab/snapdom/blob/main/CONTRIBUTING.md).

## Contributors

[Permalink: Contributors](https://www.npmjs.com/package/@zumer/snapdom#contributors)

[![tinchox5](https://avatars.githubusercontent.com/u/11557901?v=4&s=100)](https://github.com/tinchox5 "tinchox5")[![pdufour](https://avatars.githubusercontent.com/u/1239145?v=4&s=100)](https://github.com/pdufour "pdufour")[![Jarvis2018](https://avatars.githubusercontent.com/u/36788851?v=4&s=100)](https://github.com/Jarvis2018 "Jarvis2018")[![tarwin](https://avatars.githubusercontent.com/u/646149?v=4&s=100)](https://github.com/tarwin "tarwin")[![Amyuan23](https://avatars.githubusercontent.com/u/25892910?v=4&s=100)](https://github.com/Amyuan23 "Amyuan23")[![kohaiy](https://avatars.githubusercontent.com/u/15622127?v=4&s=100)](https://github.com/kohaiy "kohaiy")[![airamhr9](https://avatars.githubusercontent.com/u/57371081?v=4&s=100)](https://github.com/airamhr9 "airamhr9")[![FlavioLimaMindera](https://avatars.githubusercontent.com/u/96424442?v=4&s=100)](https://github.com/FlavioLimaMindera "FlavioLimaMindera")[![jswhisperer](https://avatars.githubusercontent.com/u/1177690?v=4&s=100)](https://github.com/jswhisperer "jswhisperer")[![K1ender](https://avatars.githubusercontent.com/u/146767945?v=4&s=100)](https://github.com/K1ender "K1ender")[![17biubiu](https://avatars.githubusercontent.com/u/13295895?v=4&s=100)](https://github.com/17biubiu "17biubiu")[![av01d](https://avatars.githubusercontent.com/u/6247646?v=4&s=100)](https://github.com/av01d "av01d")[![CHOYSEN](https://avatars.githubusercontent.com/u/25995358?v=4&s=100)](https://github.com/CHOYSEN "CHOYSEN")[![pedrocateexte](https://avatars.githubusercontent.com/u/207524750?v=4&s=100)](https://github.com/pedrocateexte "pedrocateexte")[![claude](https://avatars.githubusercontent.com/u/81847?v=4&s=100)](https://github.com/claude "claude")[![domialex](https://avatars.githubusercontent.com/u/4694217?v=4&s=100)](https://github.com/domialex "domialex")[![elliots](https://avatars.githubusercontent.com/u/622455?v=4&s=100)](https://github.com/elliots "elliots")[![stypr](https://avatars.githubusercontent.com/u/6625978?v=4&s=100)](https://github.com/stypr "stypr")[![mon-jai](https://avatars.githubusercontent.com/u/91261297?v=4&s=100)](https://github.com/mon-jai "mon-jai")[![puneetdixit200](https://avatars.githubusercontent.com/u/236133619?v=4&s=100)](https://github.com/puneetdixit200 "puneetdixit200")[![RinZ27](https://avatars.githubusercontent.com/u/222222878?v=4&s=100)](https://github.com/RinZ27 "RinZ27")[![sharuzzaman](https://avatars.githubusercontent.com/u/7421941?v=4&s=100)](https://github.com/sharuzzaman "sharuzzaman")[![simon1uo](https://avatars.githubusercontent.com/u/60037549?v=4&s=100)](https://github.com/simon1uo "simon1uo")[![titoBouzout](https://avatars.githubusercontent.com/u/64156?v=4&s=100)](https://github.com/titoBouzout "titoBouzout")[![ZiuChen](https://avatars.githubusercontent.com/u/64892985?v=4&s=100)](https://github.com/ZiuChen "ZiuChen")[![harshasiddartha](https://avatars.githubusercontent.com/u/147021873?v=4&s=100)](https://github.com/harshasiddartha "harshasiddartha")[![karasHou](https://avatars.githubusercontent.com/u/27048083?v=4&s=100)](https://github.com/karasHou "karasHou")[![jhbae200](https://avatars.githubusercontent.com/u/20170610?v=4&s=100)](https://github.com/jhbae200 "jhbae200")

## Sponsors

[Permalink: Sponsors](https://www.npmjs.com/package/@zumer/snapdom#sponsors)

Special thanks to [@megaphonecolin](https://github.com/megaphonecolin), [@sdraper69](https://github.com/sdraper69), [@reynaldichernando](https://github.com/reynaldichernando), [@gamma-app](https://github.com/gamma-app), [@jrjohnson](https://github.com/jrjohnson), and [@ryanander](https://github.com/ryanander) for supporting this project!

If you'd like to support this project too, you can [become a sponsor](https://github.com/sponsors/tinchox5).

## Star History

[Permalink: Star History](https://www.npmjs.com/package/@zumer/snapdom#star-history)

[![Star History Chart](https://camo.githubusercontent.com/cbb4dae2f9ce9a3a32601cf1cfd7852941fc400dff3b78c780aa8aadfa7eba34/68747470733a2f2f6170692e737461722d686973746f72792e636f6d2f7376673f7265706f733d7a756d65726c61622f736e6170646f6d26747970653d44617465)](https://www.star-history.com/#zumerlab/snapdom&Date)

## License

[Permalink: License](https://www.npmjs.com/package/@zumer/snapdom#license)

MIT © Zumerlab

## Readme

### Keywords

- [zumerlab](https://www.npmjs.com/search?q=keywords:zumerlab)
- [snapDOM](https://www.npmjs.com/search?q=keywords:snapDOM)
- [html2canvas](https://www.npmjs.com/search?q=keywords:html2canvas)
- [html2canvas alternative](https://www.npmjs.com/search?q=keywords:%22html2canvas%20alternative%22)
- [dom-to-image alternative](https://www.npmjs.com/search?q=keywords:%22dom-to-image%20alternative%22)
- [html-to-image](https://www.npmjs.com/search?q=keywords:html-to-image)
- [screenshot](https://www.npmjs.com/search?q=keywords:screenshot)
- [engine](https://www.npmjs.com/search?q=keywords:engine)
- [html capture](https://www.npmjs.com/search?q=keywords:%22html%20capture%22)
- [dom capture](https://www.npmjs.com/search?q=keywords:%22dom%20capture%22)
- [html to image](https://www.npmjs.com/search?q=keywords:%22html%20to%20image%22)
- [dom to image](https://www.npmjs.com/search?q=keywords:%22dom%20to%20image%22)
- [html screenshot](https://www.npmjs.com/search?q=keywords:%22html%20screenshot%22)
- [capture element](https://www.npmjs.com/search?q=keywords:%22capture%20element%22)
- [html snapshot](https://www.npmjs.com/search?q=keywords:%22html%20snapshot%22)
- [element screenshot](https://www.npmjs.com/search?q=keywords:%22element%20screenshot%22)
- [web capture](https://www.npmjs.com/search?q=keywords:%22web%20capture%22)
- [snapshot tool](https://www.npmjs.com/search?q=keywords:%22snapshot%20tool%22)
- [render html](https://www.npmjs.com/search?q=keywords:%22render%20html%22)
- [capture dom](https://www.npmjs.com/search?q=keywords:%22capture%20dom%22)
- [web snapshot](https://www.npmjs.com/search?q=keywords:%22web%20snapshot%22)
- [html export](https://www.npmjs.com/search?q=keywords:%22html%20export%22)
- [dom snapshot](https://www.npmjs.com/search?q=keywords:%22dom%20snapshot%22)
- [html to png](https://www.npmjs.com/search?q=keywords:%22html%20to%20png%22)
- [html to svg](https://www.npmjs.com/search?q=keywords:%22html%20to%20svg%22)

Viewing @zumer/snapdom version 2.12.9