import type { HtmlStore } from '../html-store.ts'
import { Filesystem, type WriteResult } from './fs.ts'

/**
 * Adapts the in-memory `HtmlStore` (single project HTML document) to the
 * vendored hashline `Filesystem` interface. The "path" is a synthetic stable
 * key — there is one document per workspace — so read/write ignore it and go
 * through the store's rendered-HTML round-trip (`get`/`set`). Delegating to
 * `store.set` preserves the write-through image-URL rewriting in
 * `createProjectHtmlStore`.
 */
export class HtmlStoreFilesystem extends Filesystem {
  private readonly store: HtmlStore

  constructor(store: HtmlStore) {
    super()
    this.store = store
  }

  override async readText(_path: string): Promise<string> {
    return this.store.get()
  }

  override async writeText(_path: string, text: string): Promise<WriteResult> {
    this.store.set(text)
    return { text }
  }
}
