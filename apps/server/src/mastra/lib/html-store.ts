/**
 * Single-string in-memory workspace for `/index.html`.
 *
 * The landing-page agent operates exclusively on this string. Tools mutate it
 * via closures handed in at agent-construction time (one store per request).
 */
export interface HtmlStore {
  /** Current contents of `/index.html`. */
  get(): string
  /** Reset to a seed (or the default placeholder). */
  reset(seed?: string): void
  /** Replace contents; returns the new bytes count. */
  set(html: string): number
}

export const PLACEHOLDER_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Untitled</title>
  </head>
  <body>
    <main>
      <p>Your landing page will appear here.</p>
    </main>
  </body>
</html>
`

export function createHtmlStore(initial?: string): HtmlStore {
  let html = initial ?? PLACEHOLDER_INDEX_HTML

  return {
    get() {
      return html
    },
    reset(seed) {
      html = seed ?? PLACEHOLDER_INDEX_HTML
    },
    set(next) {
      html = next
      return Buffer.byteLength(next, 'utf8')
    },
  }
}
