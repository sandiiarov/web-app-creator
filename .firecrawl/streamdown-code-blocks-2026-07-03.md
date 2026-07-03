[Introduction](https://streamdown.ai/docs) [Getting Started](https://streamdown.ai/docs/getting-started) [Usage](https://streamdown.ai/docs/usage) [Migrate from react-markdown](https://streamdown.ai/docs/migrate) [FAQ](https://streamdown.ai/docs/faq)

Customization

[Configuration](https://streamdown.ai/docs/configuration) [Styling](https://streamdown.ai/docs/styling) [Components](https://streamdown.ai/docs/components)

Plugins

[Built-in Plugins](https://streamdown.ai/docs/plugins) [@streamdown/code](https://streamdown.ai/docs/plugins/code) [@streamdown/mermaid](https://streamdown.ai/docs/plugins/mermaid) [@streamdown/math](https://streamdown.ai/docs/plugins/math) [@streamdown/cjk](https://streamdown.ai/docs/plugins/cjk)

Features

[Animation](https://streamdown.ai/docs/animation) [Carets](https://streamdown.ai/docs/carets) [Code Blocks](https://streamdown.ai/docs/code-blocks) [Custom renderers](https://streamdown.ai/docs/custom-renderers) [GitHub Flavored Markdown](https://streamdown.ai/docs/gfm) [Interactivity](https://streamdown.ai/docs/interactivity) [Internationalization](https://streamdown.ai/docs/internationalization) [Link Safety](https://streamdown.ai/docs/link-safety) [Memoization](https://streamdown.ai/docs/memoization) [Security](https://streamdown.ai/docs/security) [Unterminated Block Parsing](https://streamdown.ai/docs/termination) [Typography](https://streamdown.ai/docs/typography)

# Code Blocks

Beautiful syntax highlighting and interactive code blocks powered by Shiki.

Streamdown provides beautiful, interactive code blocks with syntax highlighting powered by [Shiki](https://shiki.style/). Every code block includes a copy button and supports a wide range of programming languages.

## [Basic Usage](https://streamdown.ai/docs/code-blocks\#basic-usage)

Create code blocks using triple backticks with an optional language identifier:

````
```javascript
function greet(name) {
return `Hello, ${name}!`;
}
```
````

Streamdown will automatically apply syntax highlighting based on the specified language.

## [Enabling Syntax Highlighting](https://streamdown.ai/docs/code-blocks\#enabling-syntax-highlighting)

Syntax highlighting requires the code plugin. Install it:

npm

pnpm

yarn

bun

```
npm install @streamdown/code
```

Then import and pass the plugin to Streamdown:

app/page.tsx

```
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";

export default function Page() {
  return (
    <Streamdown plugins={{ code: code }}>
      {markdown}
    </Streamdown>
  );
}
```

Without the code plugin, code blocks render as plain text with no highlighting.

## [Supported Languages](https://streamdown.ai/docs/code-blocks\#supported-languages)

Streamdown supports 200+ programming languages through Shiki. All languages are lazy-loaded on demand, so only the grammars you use are downloaded.

### [Common Languages](https://streamdown.ai/docs/code-blocks\#common-languages)

- **Web**: JavaScript, TypeScript, JSX, TSX, HTML, CSS
- **Data**: JSON, YAML, TOML
- **Shell**: Bash, Shell Script, PowerShell
- **Backend**: Python, Go, Java, Rust, C, C++, C#, PHP, Ruby
- **Functional**: Haskell, Elixir, Clojure, F#, OCaml
- **Markup**: Markdown, LaTeX, MDX, XML
- **And 180+ more languages**

### [Language Examples](https://streamdown.ai/docs/code-blocks\#language-examples)

#### [TypeScript](https://streamdown.ai/docs/code-blocks\#typescript)

````
```typescript
interface User {
id: number;
name: string;
email: string;
}

async function fetchUser(id: number): Promise<User> {
const response = await fetch(`/api/users/${id}`);
return response.json();
}
```
````

#### [Python](https://streamdown.ai/docs/code-blocks\#python)

````
```python
def fibonacci(n: int) -> list[int]:
    """Generate Fibonacci sequence up to n terms."""
    fib = [0, 1]
    for i in range(2, n):
        fib.append(fib[i-1] + fib[i-2])
    return fib

print(fibonacci(10))
```
````

#### [Rust](https://streamdown.ai/docs/code-blocks\#rust)

````
```rust
fn main() {
    let numbers = vec![1, 2, 3, 4, 5];
    let sum: i32 = numbers.iter().sum();
    println!("Sum: {}", sum);
}
```
````

## [Theme Configuration](https://streamdown.ai/docs/code-blocks\#theme-configuration)

Streamdown uses dual themes for light and dark modes. You can customize the themes using the `shikiTheme` prop:

app/page.tsx

```
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";

export default function Page() {
  return (
    <Streamdown
      plugins={{ code: code }}
      shikiTheme={["dracula", "dracula"]}
    >
      {markdown}
    </Streamdown>
  );
}
```

### [Available Themes](https://streamdown.ai/docs/code-blocks\#available-themes)

Streamdown supports all Shiki themes including:

- `github-light` (default light theme)
- `github-dark` (default dark theme)
- `dracula`, `nord`, `one-dark-pro`, `monokai`
- `catppuccin-latte`, `catppuccin-mocha`
- `vitesse-light`, `vitesse-dark`
- `tokyo-night`, `slack-dark`, `slack-ochin`
- And [many more](https://shiki.style/themes)

### [Custom theme objects](https://streamdown.ai/docs/code-blocks\#custom-theme-objects)

The `shikiTheme` prop accepts `[ThemeInput, ThemeInput]` where `ThemeInput` is either a bundled theme name (`BundledTheme`) or a custom theme object (`ThemeRegistrationAny`). You can mix and match:

app/page.tsx

```
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import myCustomDarkTheme from "./my-dark-theme.json";

export default function Page() {
  return (
    <Streamdown
      plugins={{ code: code }}
      shikiTheme={["github-light", myCustomDarkTheme]}
    >
      {markdown}
    </Streamdown>
  );
}
```

Bundled theme names (strings) load from Shiki's built-in registry. Custom theme objects follow the `ThemeRegistrationAny` format from Shiki — any VS Code `.tmTheme` or JSON theme file works.

## [Custom start line](https://streamdown.ai/docs/code-blocks\#custom-start-line)

Set the starting line number for a code block using `startLine=N` in the code fence meta:

````
```typescript startLine=10
const user = await getUser(id);
const profile = await getProfile(user);
```
````

Line numbers begin at the value you specify instead of 1. The value must be a positive integer (>= 1).

## [Interactive Features](https://streamdown.ai/docs/code-blocks\#interactive-features)

### [Copy Button](https://streamdown.ai/docs/code-blocks\#copy-button)

Every code block includes a copy button that appears on hover. Users can click to copy the entire code block content to their clipboard.

The copy button:

- Appears on hover (desktop) or is always visible (mobile)
- Provides visual feedback on successful copy
- Is automatically disabled during streaming (when `isAnimating={true}`)

### [Disable Controls](https://streamdown.ai/docs/code-blocks\#disable-controls)

Disable individual code block buttons using the `controls` prop:

app/page.tsx

```
// Hide the download button, keep copy
<Streamdown controls={{ code: { download: false } }}>{markdown}</Streamdown>

// Hide the copy button, keep download
<Streamdown controls={{ code: { copy: false } }}>{markdown}</Streamdown>

// Hide all code block controls
<Streamdown controls={{ code: false }}>{markdown}</Streamdown>

// Hide all controls across all block types
<Streamdown controls={false}>{markdown}</Streamdown>
```

## [Inline Code](https://streamdown.ai/docs/code-blocks\#inline-code)

Inline code uses backticks and receives subtle styling:

```
Use the `useState` hook to manage state in React.
```

Inline code is styled with:

- Monospace font family
- Subtle background color
- Rounded corners
- Appropriate padding

## [Code Block Styling](https://streamdown.ai/docs/code-blocks\#code-block-styling)

Code blocks include:

- **Line Numbers** \- Optional line numbers for reference
- **Rounded Corners** \- Modern, polished appearance
- **Proper Padding** \- Comfortable spacing
- **Scrolling** \- Horizontal scroll for long lines
- **Responsive Design** \- Adapts to container width

## [Streaming Considerations](https://streamdown.ai/docs/code-blocks\#streaming-considerations)

Code blocks work seamlessly with streaming content:

### [Incomplete Code Blocks](https://streamdown.ai/docs/code-blocks\#incomplete-code-blocks)

When a code block is streaming in, Streamdown handles the incomplete state gracefully:

````
```javascript
function example() {
// Streaming in progress...
```
````

The unterminated block parser ensures the code block renders properly even without the closing backticks.

### [Loading Behavior](https://streamdown.ai/docs/code-blocks\#loading-behavior)

Code block shells render immediately with plain text content, then syntax colors are applied when highlighting resolves.

This keeps code readable on first paint and improves visual stability during lazy highlight loading.

### [Disabling Interactions During Streaming](https://streamdown.ai/docs/code-blocks\#disabling-interactions-during-streaming)

Use the `isAnimating` prop to disable copy buttons while streaming:

app/page.tsx

```
<Streamdown isAnimating={isStreaming}>{markdown}</Streamdown>
```

This prevents users from copying incomplete code.

## [Plugin Interface](https://streamdown.ai/docs/code-blocks\#plugin-interface)

The Code plugin implements the `CodeHighlighterPlugin` interface:

```
interface CodeHighlighterPlugin {
  name: "shiki";
  type: "code-highlighter";
  highlight: (options: HighlightOptions, callback?: (result: HighlightResult) => void) => HighlightResult | null;
  supportsLanguage: (language: BundledLanguage) => boolean;
  getSupportedLanguages: () => BundledLanguage[];
  getThemes: () => [BundledTheme, BundledTheme];
}
```

### [Exported Types](https://streamdown.ai/docs/code-blocks\#exported-types)

```
import type {
  CodeHighlighterPlugin,
  HighlightOptions,
  HighlightResult,
} from '@streamdown/code';

// HighlightOptions - parameters for highlighting
interface HighlightOptions {
  code: string;
  language: BundledLanguage;
  themes: [string, string];
}

// HighlightResult - Shiki's TokensResult type
type HighlightResult = TokensResult;
```

### [Programmatic Highlighting](https://streamdown.ai/docs/code-blocks\#programmatic-highlighting)

Use the plugin directly for custom highlighting:

```
import { code } from '@streamdown/code';

// Check language support
if (code.supportsLanguage('typescript')) {
  code.highlight(
    { code: 'const x = 1;', language: 'typescript', themes: ['github-light', 'github-dark'] },
    (result) => {
      // Handle highlighted tokens
      console.log(result.tokens);
    }
  );
}
```

[Carets\\
\\
Visual cursor indicators for streaming content to show active generation.](https://streamdown.ai/docs/carets) [Custom renderers\\
\\
Register custom renderers for arbitrary code fence languages.](https://streamdown.ai/docs/custom-renderers)

### On this page

[Basic Usage](https://streamdown.ai/docs/code-blocks#basic-usage) [Enabling Syntax Highlighting](https://streamdown.ai/docs/code-blocks#enabling-syntax-highlighting) [Supported Languages](https://streamdown.ai/docs/code-blocks#supported-languages) [Common Languages](https://streamdown.ai/docs/code-blocks#common-languages) [Language Examples](https://streamdown.ai/docs/code-blocks#language-examples) [TypeScript](https://streamdown.ai/docs/code-blocks#typescript) [Python](https://streamdown.ai/docs/code-blocks#python) [Rust](https://streamdown.ai/docs/code-blocks#rust) [Theme Configuration](https://streamdown.ai/docs/code-blocks#theme-configuration) [Available Themes](https://streamdown.ai/docs/code-blocks#available-themes) [Custom theme objects](https://streamdown.ai/docs/code-blocks#custom-theme-objects) [Custom start line](https://streamdown.ai/docs/code-blocks#custom-start-line) [Interactive Features](https://streamdown.ai/docs/code-blocks#interactive-features) [Copy Button](https://streamdown.ai/docs/code-blocks#copy-button) [Disable Controls](https://streamdown.ai/docs/code-blocks#disable-controls) [Inline Code](https://streamdown.ai/docs/code-blocks#inline-code) [Code Block Styling](https://streamdown.ai/docs/code-blocks#code-block-styling) [Streaming Considerations](https://streamdown.ai/docs/code-blocks#streaming-considerations) [Incomplete Code Blocks](https://streamdown.ai/docs/code-blocks#incomplete-code-blocks) [Loading Behavior](https://streamdown.ai/docs/code-blocks#loading-behavior) [Disabling Interactions During Streaming](https://streamdown.ai/docs/code-blocks#disabling-interactions-during-streaming) [Plugin Interface](https://streamdown.ai/docs/code-blocks#plugin-interface) [Exported Types](https://streamdown.ai/docs/code-blocks#exported-types) [Programmatic Highlighting](https://streamdown.ai/docs/code-blocks#programmatic-highlighting)

[GitHubEdit this page on GitHub](https://github.com/vercel/streamdown/edit/main/content/docs/code-blocks.mdx) Scroll to topGive feedbackCopy pageAsk AI about this pageOpen in chat

## Chat

What is Streamdown?How does unterminated markdown parsing work?How is Streamdown secure?Is Streamdown performance optimized?

Tip: You can open and close chat with `⌘I`

0 / 1000