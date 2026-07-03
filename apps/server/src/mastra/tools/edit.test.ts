import { describe, expect, it } from 'vitest'

import { createHtmlStore } from '../lib/html-store.ts'
import { createEditTool } from './edit.ts'

describe('createEditTool', () => {
  it('returns diff and patch metadata without returning the full HTML', async () => {
    const store = createHtmlStore('<main>\n  <h1>Hello</h1>\n</main>\n')
    const tool = createEditTool(store)

    const result = await tool.execute?.(
      {
        edits: [{ newText: '<h1>Hi</h1>', oldText: '<h1>Hello</h1>' }],
        intent: 'Update hero heading',
      },
      undefined as never,
    )

    if (!result || !('diff' in result)) {
      throw new Error('Expected edit tool to return edit metadata')
    }

    expect(store.get()).toContain('<h1>Hi</h1>')
    expect(result).toMatchObject({
      firstChangedLine: 2,
      ok: true,
      replacements: 1,
    })
    expect(result.diff).toContain('-2   <h1>Hello</h1>')
    expect(result.diff).toContain('+2   <h1>Hi</h1>')
    expect(result.patch).toContain('@@ -1,3 +1,3 @@')
    expect(result).not.toHaveProperty('html')
  })
})
