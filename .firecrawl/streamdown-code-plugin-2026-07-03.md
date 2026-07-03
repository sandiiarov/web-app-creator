[Introduction](https://streamdown.ai/docs) [Getting Started](https://streamdown.ai/docs/getting-started) [Usage](https://streamdown.ai/docs/usage) [Migrate from react-markdown](https://streamdown.ai/docs/migrate) [FAQ](https://streamdown.ai/docs/faq)

Customization

[Configuration](https://streamdown.ai/docs/configuration) [Styling](https://streamdown.ai/docs/styling) [Components](https://streamdown.ai/docs/components)

Plugins

[Built-in Plugins](https://streamdown.ai/docs/plugins) [@streamdown/code](https://streamdown.ai/docs/plugins/code) [@streamdown/mermaid](https://streamdown.ai/docs/plugins/mermaid) [@streamdown/math](https://streamdown.ai/docs/plugins/math) [@streamdown/cjk](https://streamdown.ai/docs/plugins/cjk)

Features

[Animation](https://streamdown.ai/docs/animation) [Carets](https://streamdown.ai/docs/carets) [Code Blocks](https://streamdown.ai/docs/code-blocks) [Custom renderers](https://streamdown.ai/docs/custom-renderers) [GitHub Flavored Markdown](https://streamdown.ai/docs/gfm) [Interactivity](https://streamdown.ai/docs/interactivity) [Internationalization](https://streamdown.ai/docs/internationalization) [Link Safety](https://streamdown.ai/docs/link-safety) [Memoization](https://streamdown.ai/docs/memoization) [Security](https://streamdown.ai/docs/security) [Unterminated Block Parsing](https://streamdown.ai/docs/termination) [Typography](https://streamdown.ai/docs/typography)

# @streamdown/code

Syntax highlighting for code blocks using Shiki.

The `@streamdown/code` plugin provides syntax highlighting for code blocks using [Shiki](https://shiki.style/).

- Supports 200+ programming languages
- Languages are lazy-loaded on demand
- Dual theme support (light/dark mode)
- Token caching for performance

## [Install](https://streamdown.ai/docs/plugins/code\#install)

npm

pnpm

yarn

bun

```
npm install @streamdown/code
```

## [Tailwind CSS](https://streamdown.ai/docs/plugins/code\#tailwind-css)

### [Tailwind v4](https://streamdown.ai/docs/plugins/code\#tailwind-v4)

Add the following `@source` directive to your `globals.css` or main CSS file:

globals.css

```
@source "../node_modules/@streamdown/code/dist/*.js";
```

The path must be relative from your CSS file to the `node_modules` folder containing `@streamdown/code`. In a monorepo, adjust the number of `../` segments to reach the root `node_modules`.

### [Tailwind v3](https://streamdown.ai/docs/plugins/code\#tailwind-v3)

Add `@streamdown/code` to your `content` array in `tailwind.config.js`:

tailwind.config.js

```
module.exports = {
  content: [\
    "./app/**/*.{js,ts,jsx,tsx,mdx}",\
    "./node_modules/@streamdown/code/dist/*.js",\
  ],
  // ... rest of your config
};
```

In a monorepo, adjust the path to reach the root `node_modules`:

tailwind.config.js

```
module.exports = {
  content: [\
    "./app/**/*.{js,ts,jsx,tsx,mdx}",\
    "../../node_modules/@streamdown/code/dist/*.js",\
  ],
  // ... rest of your config
};
```

## [Usage](https://streamdown.ai/docs/plugins/code\#usage)

```
import { code } from '@streamdown/code';

<Streamdown plugins={{ code }}>
  {markdown}
</Streamdown>
```

## [Custom configuration](https://streamdown.ai/docs/plugins/code\#custom-configuration)

```
import { createCodePlugin } from '@streamdown/code';

const code = createCodePlugin({
  themes: ['github-light', 'github-dark'], // [light, dark]
});
```

See [Code Blocks](https://streamdown.ai/docs/code-blocks) for details on rendering behavior, line numbers, and copy buttons.

[Built-in Plugins\\
\\
Learn about Streamdown's plugin system for rendering and processing.](https://streamdown.ai/docs/plugins) [@streamdown/mermaid\\
\\
Render Mermaid diagrams including flowcharts, sequence diagrams, and more.](https://streamdown.ai/docs/plugins/mermaid)

### On this page

[Install](https://streamdown.ai/docs/plugins/code#install) [Tailwind CSS](https://streamdown.ai/docs/plugins/code#tailwind-css) [Tailwind v4](https://streamdown.ai/docs/plugins/code#tailwind-v4) [Tailwind v3](https://streamdown.ai/docs/plugins/code#tailwind-v3) [Usage](https://streamdown.ai/docs/plugins/code#usage) [Custom configuration](https://streamdown.ai/docs/plugins/code#custom-configuration)

[GitHubEdit this page on GitHub](https://github.com/vercel/streamdown/edit/main/content/docs/plugins/code.mdx) Scroll to topGive feedbackCopy pageAsk AI about this pageOpen in chat

## Chat

What is Streamdown?How does unterminated markdown parsing work?How is Streamdown secure?Is Streamdown performance optimized?

Tip: You can open and close chat with `⌘I`

0 / 1000