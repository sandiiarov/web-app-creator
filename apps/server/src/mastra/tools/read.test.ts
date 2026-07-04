import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createHtmlStore } from '../lib/html-store.ts'
import { createReadTool } from './read.ts'

describe('createReadTool', () => {
  it('emits OpenRouter-compatible JSON schema for empty anchor ranges', () => {
    const tool = createReadTool(createHtmlStore())
    const schemaText = JSON.stringify(
      z.toJSONSchema(tool.inputSchema as z.ZodType),
    )

    expect(schemaText).toContain('"maxItems":2')
    expect(schemaText).not.toContain('"items":[]')
  })

  it('returns compact anchored text for offsets and ranges', async () => {
    const store = createHtmlStore(
      '<main>\n  <h1>Hello</h1>\n  <p>World</p>\n</main>\n',
    )
    const tool = createReadTool(store)

    const offsetResult = await tool.execute?.(
      { intent: 'Read hero anchors', limit: 2, offset: 2 },
      undefined as never,
    )
    const rangeResult = await tool.execute?.(
      { intent: 'Read paragraph anchor', range: ['a3'] },
      undefined as never,
    )

    expect(offsetResult).toMatchObject({
      checksum: expect.stringMatching(/^sha256:/),
      lines: 2,
      ok: true,
      startAnchor: 'a2',
      text: 'a2|  <h1>Hello</h1>\na3|  <p>World</p>',
      totalLines: 4,
    })
    expect(rangeResult).toMatchObject({
      endAnchor: 'a3',
      lines: 1,
      startAnchor: 'a3',
      text: 'a3|  <p>World</p>',
    })
    expect(offsetResult).not.toHaveProperty('rawText')
    expect(offsetResult).not.toHaveProperty('numberedText')
  })
})
