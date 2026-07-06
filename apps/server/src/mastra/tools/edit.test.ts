import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createHtmlStore } from '../lib/html-store.ts'
import { createEditTool } from './edit.ts'

describe('createEditTool', () => {
  it('emits OpenRouter-compatible JSON schema for empty anchor ranges', () => {
    const tool = createEditTool(createHtmlStore())
    const schemaText = JSON.stringify(
      z.toJSONSchema(tool.inputSchema as z.ZodType),
    )

    expect(schemaText).toContain('"maxItems":2')
    expect(schemaText).not.toContain('"items":[]')
  })

  it('applies anchor-range edits and returns metadata without full HTML', async () => {
    const store = createHtmlStore('<main>\n  <h1>Hello</h1>\n</main>\n')
    const tool = createEditTool(store)

    const result = await tool.execute?.(
      {
        edits: [
          {
            intent: 'Update hero heading',
            operation: 'replace',
            range: ['a2'],
            text: '  <h1>Hi</h1>',
          },
        ],
      },
      undefined as never,
    )

    if (!result || !('changedText' in result)) {
      throw new Error('Expected edit tool to return edit metadata')
    }

    expect(store.get()).toContain('<h1>Hi</h1>')
    expect(result).toMatchObject({
      changedLines: 1,
      checksum: expect.stringMatching(/^sha256:/),
      firstChangedAnchor: 'a4',
      firstChangedLine: 2,
      lastChangedAnchor: 'a4',
      ok: true,
      operations: 1,
    })
    expect(result.changedText).toContain('a4|  <h1>Hi</h1>')
    expect(result).not.toHaveProperty('html')
    expect(result).not.toHaveProperty('diff')
    expect(result).not.toHaveProperty('patch')
  })

  it('applies multiple edit operations against the original anchors', async () => {
    const store = createHtmlStore(
      '<main>\n  <h1>Hello</h1>\n  <p>World</p>\n</main>\n',
    )
    const tool = createEditTool(store)

    await tool.execute?.(
      {
        edits: [
          {
            intent: 'Update hero copy',
            operation: 'replace',
            range: ['a2'],
            text: '  <h1>Hi</h1>',
          },
          {
            intent: 'Insert CTA',
            operation: 'insert_after',
            range: ['a3'],
            text: '  <a href="#cta">Start</a>',
          },
        ],
      },
      undefined as never,
    )

    expect(store.get()).toBe(
      '<main>\n  <h1>Hi</h1>\n  <p>World</p>\n  <a href="#cta">Start</a>\n</main>\n',
    )
    expect(store.getDocument().lines).toEqual([
      ['a1', '<main>'],
      ['a5', '  <h1>Hi</h1>'],
      ['a3', '  <p>World</p>'],
      ['a6', '  <a href="#cta">Start</a>'],
      ['a4', '</main>'],
    ])
  })

  it('supports whole-document replacement with range []', async () => {
    const store = createHtmlStore('<main>Old</main>\n')
    const tool = createEditTool(store)

    await tool.execute?.(
      {
        edits: [
          {
            intent: 'Replace full document',
            operation: 'replace',
            range: [],
            text: '<!doctype html>\n<html></html>',
          },
        ],
      },
      undefined as never,
    )

    expect(store.get()).toBe('<!doctype html>\n<html></html>')
  })

  it('rejects stale anchors without mutating the store', async () => {
    const store = createHtmlStore('<main>\n  <h1>Hello</h1>\n</main>\n')
    const tool = createEditTool(store)

    await expect(
      tool.execute?.(
        {
          edits: [
            {
              intent: 'Try stale edit',
              operation: 'replace',
              range: ['missing'],
              text: '  <h1>Hi</h1>',
            },
          ],
        },
        undefined as never,
      ),
    ).rejects.toThrow('missing anchor')
    expect(store.get()).toBe('<main>\n  <h1>Hello</h1>\n</main>\n')
  })
})
