import { describe, expect, it } from 'vitest'

import { createHtmlStore } from '../lib/html-store.ts'
import { createFindTool } from './find.ts'

describe('createFindTool', () => {
  it('finds literal text and returns compact anchored context', async () => {
    const store = createHtmlStore(
      '<main>\n  <h1>Hello</h1>\n  <p>World</p>\n</main>',
    )
    const tool = createFindTool(store)

    const result = await tool.execute?.(
      { context: 1, intent: 'Find heading anchors', text: 'Hello' },
      undefined as never,
    )

    expect(result).toMatchObject({
      checksum: expect.stringMatching(/^sha256:/),
      matchCount: 1,
      ok: true,
      returnedLines: 3,
      text: 'a1|<main>\na2|  <h1>Hello</h1>\na3|  <p>World</p>',
      totalLines: 4,
      truncatedLines: false,
    })
  })

  it('supports regex mode without throwing on invalid regex', async () => {
    const store = createHtmlStore('<main><h1>Hello</h1></main>')
    const tool = createFindTool(store)

    const match = await tool.execute?.(
      { intent: 'Find heading tags', regex: true, text: '<h\\d>' },
      undefined as never,
    )
    const invalid = await tool.execute?.(
      { intent: 'Try invalid pattern', regex: true, text: '[' },
      undefined as never,
    )

    expect(match).toMatchObject({ matchCount: 1, ok: true })
    expect(invalid).toMatchObject({
      error: expect.stringContaining('Invalid regex'),
      matchCount: 0,
      ok: false,
      text: '',
    })
  })
})
