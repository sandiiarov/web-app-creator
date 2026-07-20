import type { HtmlDocumentJsonV1 } from '../html-anchor-document.ts'
import type { HtmlStore } from '../html-store.ts'

/**
 * Adapts the in-memory `HtmlStore` (single project HTML document) to the
 * anchor-label edit engine. Exposes the anchored document directly
 * (`getDocument`/`setDocument`) so edits splice the `lines` array and preserve
 * untouched line anchors. There is one document per workspace, so no path.
 */
export class HtmlStoreFilesystem {
  private readonly store: HtmlStore

  constructor(store: HtmlStore) {
    this.store = store
  }

  /** Direct anchored-document access for the anchor-label edit engine. */
  getDocument(): HtmlDocumentJsonV1 {
    return this.store.getDocument()
  }

  /** Persist an anchored document, preserving untouched line anchors. */
  setDocument(document: HtmlDocumentJsonV1): number {
    return this.store.setDocument(document)
  }
}
