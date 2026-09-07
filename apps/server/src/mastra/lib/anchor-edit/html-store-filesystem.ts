import type { HtmlDocumentJsonV1 } from '../html-anchor-document.ts'
import type { HtmlStore } from '../html-store.ts'

/**
 * Adapts the in-memory `HtmlStore` (single project HTML document) to the
 * anchor-label edit engine. Exposes the anchored document directly
 * (`getDocument`/`setDocument`) so edits splice the `lines` array and preserve
 * untouched line anchors. There is one document per workspace, so no path.
 */
export class HtmlStoreFilesystem {
  private readonly assertWriteAllowed?: () => void
  private readonly store: HtmlStore

  constructor(store: HtmlStore, assertWriteAllowed?: () => void) {
    this.store = store
    this.assertWriteAllowed = assertWriteAllowed
  }

  /** Direct anchored-document access for the anchor-label edit engine. */
  getDocument(): HtmlDocumentJsonV1 {
    return this.store.getDocument()
  }

  /** Persist an anchored document, preserving untouched line anchors. */
  setDocument(document: HtmlDocumentJsonV1): number {
    this.assertWriteAllowed?.()
    return this.store.setDocument(document)
  }

  /** Bind the final document replacement to an operation-owned write lease. */
  withWriteBoundary(assertWriteAllowed: () => void): HtmlStoreFilesystem {
    return new HtmlStoreFilesystem(this.store, assertWriteAllowed)
  }
}
