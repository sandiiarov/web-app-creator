import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { HtmlStoreFilesystem } from '../lib/hashline/html-store-filesystem.ts'
import { createSnapshotStore } from '../lib/hashline/snapshot-store.ts'
import { createHtmlStore } from '../lib/html-store.ts'
import { createReadTool } from './read.ts'

type ReadResult = {
  endLine: number
  ok: true
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
  it('emits a JSON schema with offset/limit and no required fields', () => {
    const { fs, snapshots } = makeTools()
    const tool = createReadTool(fs, snapshots)
    const schemaText = JSON.stringify(
      z.toJSONSchema(tool.inputSchema as z.ZodType),
    )
    expect(schemaText).toContain('"offset"')
    expect(schemaText).toContain('"limit"')
    expect(schemaText).not.toContain('"required"')
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
})
