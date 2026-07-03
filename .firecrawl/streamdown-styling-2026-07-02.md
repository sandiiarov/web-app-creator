[Introduction](https://streamdown.ai/docs) [Getting Started](https://streamdown.ai/docs/getting-started) [Usage](https://streamdown.ai/docs/usage) [Migrate from react-markdown](https://streamdown.ai/docs/migrate) [FAQ](https://streamdown.ai/docs/faq)

Customization

[Configuration](https://streamdown.ai/docs/configuration) [Styling](https://streamdown.ai/docs/styling) [Components](https://streamdown.ai/docs/components)

Plugins

[Built-in Plugins](https://streamdown.ai/docs/plugins) [@streamdown/code](https://streamdown.ai/docs/plugins/code) [@streamdown/mermaid](https://streamdown.ai/docs/plugins/mermaid) [@streamdown/math](https://streamdown.ai/docs/plugins/math) [@streamdown/cjk](https://streamdown.ai/docs/plugins/cjk)

Features

[Animation](https://streamdown.ai/docs/animation) [Carets](https://streamdown.ai/docs/carets) [Code Blocks](https://streamdown.ai/docs/code-blocks) [Custom renderers](https://streamdown.ai/docs/custom-renderers) [GitHub Flavored Markdown](https://streamdown.ai/docs/gfm) [Interactivity](https://streamdown.ai/docs/interactivity) [Internationalization](https://streamdown.ai/docs/internationalization) [Link Safety](https://streamdown.ai/docs/link-safety) [Memoization](https://streamdown.ai/docs/memoization) [Security](https://streamdown.ai/docs/security) [Unterminated Block Parsing](https://streamdown.ai/docs/termination) [Typography](https://streamdown.ai/docs/typography)

# Styling

Learn how to customize the appearance of Streamdown components.

Streamdown is designed to be flexible and customizable, allowing you to adapt its appearance to match your application's design system. This guide covers the various ways you can modify Streamdown's styles to suit your needs.

## [CSS Variables (Recommended)](https://streamdown.ai/docs/styling\#css-variables-recommended)

Streamdown components are built using shadcn/ui's design system, which means they use CSS variables for theming. This is the simplest way to customize colors, borders, and other design tokens across all Streamdown components.

### [Setting Up Variables](https://streamdown.ai/docs/styling\#setting-up-variables)

Add or modify the CSS variables in your `globals.css` file:

app/globals.css

```
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}
```

### [Variables Used by Streamdown](https://streamdown.ai/docs/styling\#variables-used-by-streamdown)

Streamdown components primarily use these CSS variables:

| Variable | Usage | Example Elements |
| --- | --- | --- |
| `--primary` | Links, accent colors | Links (`<a>`) |
| `--primary-foreground` | Text on primary backgrounds | N/A |
| `--muted` | Subtle backgrounds | Code blocks, table headers |
| `--muted-foreground` | De-emphasized text | Blockquote text |
| `--border` | Borders and dividers | Tables, horizontal rules, code blocks |
| `--ring` | Focus rings on interactive elements | Buttons (copy, download) |
| `--radius` | Border radius | Code blocks, tables, buttons |

### [Quick Theme Examples](https://streamdown.ai/docs/styling\#quick-theme-examples)

**Minimal Gray Theme:**

app/globals.css

```
:root {
  --primary: 0 0% 20%;
  --muted: 0 0% 96%;
  --border: 0 0% 90%;
  --radius: 0.25rem;
}
```

**Vibrant Blue Theme:**

app/globals.css

```
:root {
  --primary: 217 91% 60%;
  --muted: 214 100% 97%;
  --border: 214 32% 91%;
  --radius: 0.75rem;
}
```

**No Borders Theme:**

app/globals.css

```
:root {
  --border: transparent;
  --muted: 0 0% 98%;
  --radius: 0rem;
}
```

## [Custom Components](https://streamdown.ai/docs/styling\#custom-components)

For structural changes like replacing Markdown elements with custom React components, see the [Components](https://streamdown.ai/docs/components) documentation.

## [Global CSS Targeting](https://streamdown.ai/docs/styling\#global-css-targeting)

For simpler styling needs, you can use global CSS to target Streamdown elements using the `data-streamdown` attribute. Every Streamdown element includes a unique `data-streamdown` attribute that makes it easy to apply custom styles.

### [Available Selectors](https://streamdown.ai/docs/styling\#available-selectors)

Target specific Streamdown elements using these data attributes:

styles/streamdown.css

```
/* Headings */
[data-streamdown="heading-1"] { }
[data-streamdown="heading-2"] { }
[data-streamdown="heading-3"] { }
[data-streamdown="heading-4"] { }
[data-streamdown="heading-5"] { }
[data-streamdown="heading-6"] { }

/* Text elements */
[data-streamdown="strong"] { }
[data-streamdown="link"] { }
[data-streamdown="inline-code"] { }

/* Lists */
[data-streamdown="ordered-list"] { }
[data-streamdown="unordered-list"] { }
[data-streamdown="list-item"] { }

/* Blocks */
[data-streamdown="blockquote"] { }
[data-streamdown="horizontal-rule"] { }

/* Code */
[data-streamdown="code-block"] { }
[data-streamdown="mermaid-block"] { }

/* Tables */
[data-streamdown="table-wrapper"] { }
[data-streamdown="table"] { }
[data-streamdown="table-header"] { }
[data-streamdown="table-body"] { }
[data-streamdown="table-row"] { }
[data-streamdown="table-header-cell"] { }
[data-streamdown="table-cell"] { }
[data-streamdown="table-fullscreen"] { }

/* Other */
[data-streamdown="superscript"] { }
[data-streamdown="subscript"] { }
```

### [Example Usage](https://streamdown.ai/docs/styling\#example-usage)

Here's a practical example of customizing Streamdown styles with CSS:

styles/streamdown.css

```
/* Custom heading styles */
[data-streamdown="heading-1"] {
  color: #1a202c;
  border-bottom: 2px solid #e2e8f0;
  padding-bottom: 0.5rem;
}

[data-streamdown="heading-2"] {
  color: #2d3748;
  margin-top: 2rem;
}

/* Custom link appearance */
[data-streamdown="link"] {
  color: #3182ce;
  text-decoration: none;
  border-bottom: 1px solid #90cdf4;
  transition: border-color 0.2s;
}

[data-streamdown="link"]:hover {
  border-bottom-color: #3182ce;
}

/* Custom code block styling */
[data-streamdown="code-block"] {
  border-radius: 0.5rem;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* Custom table styling */
[data-streamdown="table"] {
  border-radius: 0.5rem;
  overflow: hidden;
}

[data-streamdown="table-header"] {
  background: linear-gradient(to bottom, #f7fafc, #edf2f7);
}

/* Custom blockquote styling */
[data-streamdown="blockquote"] {
  background-color: #f7fafc;
  border-left-color: #4299e1;
  border-radius: 0.25rem;
}
```

### [Scoped Styling](https://streamdown.ai/docs/styling\#scoped-styling)

You can scope your styles to specific instances of Streamdown by using the `className` prop:

app/page.tsx

```
<Streamdown className="docs-content">
  {markdown}
</Streamdown>
```

styles/streamdown.css

```
/* Styles only apply to this specific instance */
.docs-content [data-streamdown="heading-1"] {
  font-family: 'Inter', sans-serif;
  letter-spacing: -0.02em;
}

.docs-content [data-streamdown="code-block"] {
  font-family: 'Fira Code', monospace;
}
```

## [Combining Approaches](https://streamdown.ai/docs/styling\#combining-approaches)

For maximum flexibility, you can combine both approaches - using custom components for structural changes and CSS for visual styling:

app/page.tsx

```
<Streamdown
  className="custom-markdown"
  components={{
    h1: ({ children, ...props }) => (
      <h1 {...props}>
        <span className="heading-icon">📖</span>
        {children}
      </h1>
    ),
  }}
>
  {markdown}
</Streamdown>
```

styles/streamdown.css

```
.custom-markdown [data-streamdown="heading-1"] {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.custom-markdown .heading-icon {
  font-size: 1.5rem;
}
```

## [Additional Styling Props](https://streamdown.ai/docs/styling\#additional-styling-props)

Beyond component overrides and CSS, Streamdown provides additional styling-related props:

### [Container Class Name](https://streamdown.ai/docs/styling\#container-class-name)

Use the `className` prop to add custom classes to the Streamdown container:

app/page.tsx

```
<Streamdown className="prose prose-lg dark:prose-invert max-w-none">
  {markdown}
</Streamdown>
```

### [Syntax Highlighting Themes](https://streamdown.ai/docs/styling\#syntax-highlighting-themes)

Customize code block appearance with Shiki themes:

app/page.tsx

```
<Streamdown
  shikiTheme={['github-light', 'github-dark']}
>
  {markdown}
</Streamdown>
```

See the [Code Blocks](https://streamdown.ai/docs/code-blocks) documentation for more details on syntax highlighting customization.

## [Tailwind CSS prefix](https://streamdown.ai/docs/styling\#tailwind-css-prefix)

If your project uses Tailwind v4's `prefix()` feature to namespace utility classes, pass the same prefix to Streamdown so its internal classes match:

app/page.tsx

```
<Streamdown prefix="tw">{markdown}</Streamdown>
```

With the matching Tailwind config:

app/globals.css

```
@import "tailwindcss" prefix(tw);
```

This transforms all internal utility classes from `flex` to `tw:flex`, `items-center` to `tw:items-center`, and so on.

The prefix also applies to user-supplied `className` values. If you pass `className="prose max-w-none"`, Streamdown outputs `tw:prose tw:max-w-none`.

## [Best Practices](https://streamdown.ai/docs/styling\#best-practices)

When customizing Streamdown styles, consider these best practices:

1. **Start with CSS Variables** \- For most theming needs (colors, borders, radius), modifying CSS variables in `globals.css` is the simplest and most maintainable approach.

2. **Use `data-streamdown` Selectors for Specific Elements** \- When you need to target individual elements without affecting the entire theme, use the `data-streamdown` attribute selectors.

3. **Use Custom Components for Structural Changes** \- When you need to change the HTML structure or add wrapper elements, use the `components` prop. See the [Components](https://streamdown.ai/docs/components) documentation for details.

4. **Maintain Accessibility** \- Ensure your custom styles maintain proper color contrast, focus states, and semantic HTML structure.

5. **Test During Streaming** \- Verify that your custom styles work well with incomplete content during streaming.

6. **Scope Your Styles** \- Use the `className` prop to scope styles and avoid conflicts with other parts of your application.

7. **Preserve Animations** \- Streamdown includes built-in animations for smooth streaming. Be careful not to override animation-related classes unless intentional.


## [Styling Priority](https://streamdown.ai/docs/styling\#styling-priority)

The three styling approaches have the following priority (highest to lowest):

1. **Custom Components** \- Complete control over rendering
2. **CSS via `data-streamdown` selectors** \- Element-specific styling
3. **CSS Variables** \- Global theme tokens

[Configuration\\
\\
Learn how to configure Streamdown in your project.](https://streamdown.ai/docs/configuration) [Components\\
\\
Learn how to customize and extend Streamdown with custom component overrides.](https://streamdown.ai/docs/components)

### On this page

[CSS Variables (Recommended)](https://streamdown.ai/docs/styling#css-variables-recommended) [Setting Up Variables](https://streamdown.ai/docs/styling#setting-up-variables) [Variables Used by Streamdown](https://streamdown.ai/docs/styling#variables-used-by-streamdown) [Quick Theme Examples](https://streamdown.ai/docs/styling#quick-theme-examples) [Custom Components](https://streamdown.ai/docs/styling#custom-components) [Global CSS Targeting](https://streamdown.ai/docs/styling#global-css-targeting) [Available Selectors](https://streamdown.ai/docs/styling#available-selectors) [Example Usage](https://streamdown.ai/docs/styling#example-usage) [Scoped Styling](https://streamdown.ai/docs/styling#scoped-styling) [Combining Approaches](https://streamdown.ai/docs/styling#combining-approaches) [Additional Styling Props](https://streamdown.ai/docs/styling#additional-styling-props) [Container Class Name](https://streamdown.ai/docs/styling#container-class-name) [Syntax Highlighting Themes](https://streamdown.ai/docs/styling#syntax-highlighting-themes) [Tailwind CSS prefix](https://streamdown.ai/docs/styling#tailwind-css-prefix) [Best Practices](https://streamdown.ai/docs/styling#best-practices) [Styling Priority](https://streamdown.ai/docs/styling#styling-priority)

[GitHubEdit this page on GitHub](https://github.com/vercel/streamdown/edit/main/content/docs/styling.mdx) Scroll to topGive feedbackCopy pageAsk AI about this pageOpen in chat

## Chat

What is Streamdown?How does unterminated markdown parsing work?How is Streamdown secure?Is Streamdown performance optimized?

Tip: You can open and close chat with `⌘I`

0 / 1000