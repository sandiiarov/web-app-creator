import {
  cloneHtmlDocument,
  createHtmlDocumentFromString,
  type HtmlDocumentJsonV1,
  normalizeHtmlDocument,
  renderHtmlDocument,
} from './html-anchor-document.ts'

/**
 * Anchored in-memory workspace for the project HTML document.
 *
 * The landing-page agent can render the document as HTML for preview/SSE
 * compatibility, while read/find/edit tools can mutate stable line anchors
 * without reparsing raw text on every call.
 */
export interface HtmlStore {
  /** Current rendered contents of the project HTML document. */
  get(): string
  /** Current anchored document. Returned as a defensive clone. */
  getDocument(): HtmlDocumentJsonV1
  /** Reset to a seed (or the default placeholder). */
  reset(seed?: string): void
  /** Replace contents from rendered HTML; returns the new bytes count. */
  set(html: string): number
  /** Replace contents from an anchored document; returns rendered bytes. */
  setDocument(document: HtmlDocumentJsonV1): number
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
  let document = createHtmlDocumentFromString(initial ?? PLACEHOLDER_INDEX_HTML)

  return {
    get() {
      return renderHtmlDocument(document)
    },
    getDocument() {
      return cloneHtmlDocument(document)
    },
    reset(seed) {
      document = createHtmlDocumentFromString(seed ?? PLACEHOLDER_INDEX_HTML)
    },
    set(next) {
      document = createHtmlDocumentFromString(next)
      return Buffer.byteLength(renderHtmlDocument(document), 'utf8')
    },
    setDocument(next) {
      document = cloneHtmlDocument(normalizeHtmlDocument(next))
      return Buffer.byteLength(renderHtmlDocument(document), 'utf8')
    },
  }
}
