import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { HtmlStoreFilesystem } from '../lib/hashline/html-store-filesystem.ts'
import { createSnapshotStore } from '../lib/hashline/snapshot-store.ts'
import { createHtmlStore } from '../lib/html-store.ts'
import { createReadTool } from './read.ts'

type ReadRange = { endLine: number; startLine: number; truncated: boolean }
type ReadResult = {
  endLine: number
  lines: number
  ok: true
  ranges: ReadRange[]
  startLine: number
  tag: string
  text: string
  totalLines: number
  truncated: boolean
}

function makeTools(seed?: string) {
  const store = createHtmlStore(seed)
  return {
    fs: new HtmlStoreFilesystem(store),
    snapshots: createSnapshotStore(),
    store,
  }
}

describe('createReadTool', () => {
  it('emits a JSON schema with offset/limit/ranges and no required top-level fields', () => {
    const { fs, snapshots } = makeTools()
    const tool = createReadTool(fs, snapshots)
    const schema = z.toJSONSchema(tool.inputSchema as z.ZodType)
    const schemaText = JSON.stringify(schema)
    expect(schemaText).toContain('"offset"')
    expect(schemaText).toContain('"limit"')
    expect(schemaText).toContain('"ranges"')
    expect((schema as { required?: string[] }).required).toBeUndefined()
  })

  it('returns a [index.html#TAG] header + N:TEXT rows + records a snapshot tag', async () => {
    const { fs, snapshots } = makeTools(
      '<!doctype html>\n<html>\n<body>\n<p>hi</p>\n</body>\n</html>',
    )
    const tool = createReadTool(fs, snapshots)
    const res = (await tool.execute?.(
      { action: 'read all' },
      undefined as never,
    )) as ReadResult
    expect(res.ok).toBe(true)
    expect(res.tag).toMatch(/^[0-9A-F]{4}$/)
    expect(res.text.startsWith('[index.html#')).toBe(true)
    expect(res.text).toContain('1:<!doctype html>')
    expect(res.totalLines).toBe(6)
    expect(res.truncated).toBe(false)
  })

  it('offset/limit paginates and emits a continue notice', async () => {
    const { fs, snapshots } = makeTools('a\nb\nc\nd\ne')
    const tool = createReadTool(fs, snapshots)
    const res = (await tool.execute?.(
      { action: 'page', limit: 2, offset: 2 },
      undefined as never,
    )) as ReadResult
    expect(res.startLine).toBe(2)
    expect(res.endLine).toBe(3)
    expect(res.truncated).toBe(true)
    expect(res.text).toContain('2:b')
    expect(res.text).toContain('3:c')
    expect(res.text).toContain('offset=4')
  })

  it('tagOnly emits a [#TAG] header with no path (single-file mode)', async () => {
    const { fs, snapshots } = makeTools('<p>hi</p>')
    const tool = createReadTool(fs, snapshots, { tagOnly: true })
    const res = (await tool.execute?.(
      { action: 'read all' },
      undefined as never,
    )) as ReadResult
    expect(res.text.startsWith('[#')).toBe(true)
    expect(res.text).not.toContain('index.html')
    expect(res.tag).toMatch(/^[0-9A-F]{4}$/)
  })

  it('ranges reads several disjoint regions under one tag and marks all seen', async () => {
    const { fs, snapshots } = makeTools('a\nb\nc\nd\ne\nf\ng\nh')
    const tool = createReadTool(fs, snapshots)
    const res = (await tool.execute?.(
      {
        action: 'multi-region',
        ranges: [
          { limit: 1, offset: 2 },
          { limit: 5, offset: 6 },
        ],
      },
      undefined as never,
    )) as ReadResult
    expect(res.tag).toMatch(/^[0-9A-F]{4}$/)
    expect(res.lines).toBe(4) // line 2 + lines 6-8
    expect(res.ranges).toEqual([
      { endLine: 2, startLine: 2, truncated: true },
      { endLine: 8, startLine: 6, truncated: false },
    ])
    expect(res.text).toContain('2:b')
    expect(res.text).toContain('6:f')
    expect(res.text).toContain('8:h')
    expect(res.text).not.toContain('3:c')
    // targeted multi-range read emits no paging notices
    expect(res.text).not.toContain('call read with offset')
  })
})
