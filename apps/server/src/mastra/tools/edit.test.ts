import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createHtmlStore } from '../lib/html-store.ts'
import { createEditTool } from './edit.ts'

describe('createEditTool', () => {
  it('emits an OpenRouter-compatible JSON schema for from/to/code/insert edits', () => {
    const tool = createEditTool(createHtmlStore())
    const schemaText = JSON.stringify(
      z.toJSONSchema(tool.inputSchema as z.ZodType),
    )

    // Named optional fields, not a positional range array.
    expect(schemaText).toContain('"from"')
    expect(schemaText).toContain('"to"')
    expect(schemaText).toContain('"code"')
    expect(schemaText).toContain('"insert"')
    expect(schemaText).toContain('"enum":["after","before"]')
    expect(schemaText).toContain('"required":["action"]')
    expect(schemaText).not.toContain('"items":[]')
    expect(schemaText).not.toContain('"maxItems"')
  })

  it('coerces a stringified edits array into a real array', () => {
    const tool = createEditTool(createHtmlStore())
    const parsed = (tool.inputSchema as z.ZodType).parse({
      edits: JSON.stringify([{ action: 'x', code: '<p>y</p>' }]),
    }) as { edits: unknown }
    expect(Array.isArray(parsed.edits)).toBe(true)
    expect((parsed.edits as { action: string; code: string }[])[0]).toMatchObject({
      action: 'x',
      code: '<p>y</p>',
    })
  })

  it('applies anchor-range edits and returns metadata without full HTML', async () => {
    const store = createHtmlStore('<main>\n  <h1>Hello</h1>\n</main>\n')
    const tool = createEditTool(store)

    const result = await tool.execute?.(
      {
        edits: [
          {
            action: 'Update hero heading',
            code: '  <h1>Hi</h1>',
            from: 'a2',
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
            action: 'Update hero copy',
            code: '  <h1>Hi</h1>',
            from: 'a2',
          },
          {
            action: 'Insert CTA',
            code: '  <a href="#cta">Start</a>',
            from: 'a3',
            insert: 'after',
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
            action: 'Replace full document',
            code: '<!doctype html>\n<html></html>',
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
              action: 'Try stale edit',
              code: '  <h1>Hi</h1>',
              from: 'missing',
            },
          ],
        },
        undefined as never,
      ),
    ).rejects.toThrow('missing anchor')
    expect(store.get()).toBe('<main>\n  <h1>Hello</h1>\n</main>\n')
  })
})
