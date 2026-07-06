import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createHtmlStore } from '../lib/html-store.ts'
import { createReadTool } from './read.ts'

describe('createReadTool', () => {
  it('emits an OpenRouter-compatible JSON schema for from/to reads', () => {
    const tool = createReadTool(createHtmlStore())
    const schemaText = JSON.stringify(
      z.toJSONSchema(tool.inputSchema as z.ZodType),
    )

    expect(schemaText).toContain('"from"')
    expect(schemaText).toContain('"to"')
    expect(schemaText).toContain('"required":["intent"]')
    expect(schemaText).not.toContain('"items":[]')
    expect(schemaText).not.toContain('"maxItems"')
  })

  it('returns compact anchored text for from/to regions', async () => {
    const store = createHtmlStore(
      '<main>\n  <h1>Hello</h1>\n  <p>World</p>\n</main>\n',
    )
    const tool = createReadTool(store)

    const regionResult = await tool.execute?.(
      { from: 'a2', intent: 'Read hero anchors', to: 'a3' },
      undefined as never,
    )
    const singleResult = await tool.execute?.(
      { from: 'a3', intent: 'Read paragraph anchor' },
      undefined as never,
    )

    expect(regionResult).toMatchObject({
      checksum: expect.stringMatching(/^sha256:/),
      lines: 2,
      ok: true,
      startAnchor: 'a2',
      text: 'a2|  <h1>Hello</h1>\na3|  <p>World</p>',
      totalLines: 4,
    })
    expect(singleResult).toMatchObject({
      endAnchor: 'a3',
      lines: 1,
      startAnchor: 'a3',
      text: 'a3|  <p>World</p>',
    })
    expect(regionResult).not.toHaveProperty('rawText')
    expect(regionResult).not.toHaveProperty('numberedText')
  })
})
