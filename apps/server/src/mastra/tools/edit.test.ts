import { describe, expect, it } from 'vitest'

import { HtmlStoreFilesystem } from '../lib/anchor-edit/html-store-filesystem.ts'
import { createHtmlStore } from '../lib/html-store.ts'
import { createEditTool } from './edit.ts'
import { createReadTool } from './read.ts'

const DOC = [
  '<!doctype html>',
  '<html>',
  '  <body>',
  '    <h1>Old</h1>',
  '  </body>',
  '</html>',
].join('\n')

type EditOut = {
  delta: string
  ok: true
  tag: string
  warnings: string[]
}

type ReadOut = { tag: string; text: string; totalLines: number }
function makeTools(seed: string = DOC) {
  const store = createHtmlStore(seed)
  const fs = new HtmlStoreFilesystem(store)
  return {
    edit: createEditTool(fs),
    read: createReadTool(fs),
    store,
  }
}

async function readLabeled(
  read: ReturnType<typeof createReadTool>,
): Promise<{ anchorOf: Map<string, string>; text: string }> {
  const res = (await read.execute?.(
    { action: 'read' },
    undefined as never,
  )) as ReadOut
  const anchorOf = new Map<string, string>()
  for (const line of res.text.split('\n')) {
    const m = /^(a[0-9a-z]+) ?(.*)$/.exec(line)
    if (m) anchorOf.set(m[2]!, m[1]!)
  }
  return { anchorOf, text: res.text }
}

describe('read + edit (anchor-label engine)', () => {
  it('read returns <anchor> <text> labeled lines', async () => {
    const { read } = makeTools()
    const { anchorOf, text } = await readLabeled(read)
    expect(anchorOf.get('<!doctype html>')).toBe('a1')
    expect(text).toContain('a1 <!doctype html>')
    expect(text).toContain('a3   <body>')
  })

  it('inserts by expanding a span and returns a delta of new anchors', async () => {
    const { edit, read, store } = makeTools()
    const { anchorOf } = await readLabeled(read)
    const res = (await edit.execute?.(
      {
        action: 'add section',
        edits: [
          {
            content: '  <body>\n    <section>Hi</section>\n  </body>',
            end: anchorOf.get('  </body>')!,
            start: anchorOf.get('  <body>')!,
          },
        ],
      },
      undefined as never,
    )) as EditOut
    expect(res.ok).toBe(true)
    const deltaAnchors = res.delta
      .split('\n')
      .map((l) => /^(a[0-9a-z]+)/.exec(l)?.[1])
      .filter(Boolean)
    expect(deltaAnchors).toEqual(['a7', 'a8', 'a9'])
    expect(store.get()).toContain('<section>Hi</section>')
  })

  it('preserves untouched anchors across an edit', async () => {
    const { edit, read } = makeTools()
    const { anchorOf: before } = await readLabeled(read)
    await edit.execute?.(
      {
        action: 'expand body',
        edits: [
          {
            content: '  <body>\n    <p>x</p>\n  </body>',
            end: before.get('  </body>')!,
            start: before.get('  <body>')!,
          },
        ],
      },
      undefined as never,
    )
    const { anchorOf: after } = await readLabeled(read)
    expect(after.get('<!doctype html>')).toBe('a1')
    expect(after.get('<html>')).toBe('a2')
    expect(after.get('</html>')).toBe('a6')
  })

  it('replaces a single line (start == end)', async () => {
    const { edit, read, store } = makeTools()
    const { anchorOf } = await readLabeled(read)
    const a = anchorOf.get('    <h1>Old</h1>')!
    const res = (await edit.execute?.(
      {
        action: 'rename heading',
        edits: [{ content: '    <h1>New</h1>', end: a, start: a }],
      },
      undefined as never,
    )) as EditOut
    expect(res.ok).toBe(true)
    expect(store.get()).toContain('<h1>New</h1>')
    expect(store.get()).not.toContain('<h1>Old</h1>')
  })

  it('batches multiple non-overlapping ranges in one call', async () => {
    const { edit, read, store } = makeTools()
    const { anchorOf } = await readLabeled(read)
    await edit.execute?.(
      {
        action: 'two tweaks',
        edits: [
          {
            content: '    <h1>New</h1>',
            end: anchorOf.get('    <h1>Old</h1>')!,
            start: anchorOf.get('    <h1>Old</h1>')!,
          },
          {
            content: '  <body class="dark">',
            end: anchorOf.get('  <body>')!,
            start: anchorOf.get('  <body>')!,
          },
        ],
      },
      undefined as never,
    )
    expect(store.get()).toContain('<h1>New</h1>')
    expect(store.get()).toContain('<body class="dark">')
  })

  it('deletes a span (empty content string)', async () => {
    const { edit, read, store } = makeTools()
    const { anchorOf } = await readLabeled(read)
    await edit.execute?.(
      {
        action: 'delete h1',
        edits: [
          {
            content: '',
            end: anchorOf.get('    <h1>Old</h1>')!,
            start: anchorOf.get('    <h1>Old</h1>')!,
          },
        ],
      },
      undefined as never,
    )
    expect(store.get()).not.toContain('<h1>Old</h1>')
  })

  it('rejects an unknown anchor as stale', async () => {
    const { edit } = makeTools()
    await expect(
      edit.execute?.(
        {
          action: 'bad anchor',
          edits: [{ content: 'x', end: 'zzz', start: 'zzz' }],
        },
        undefined as never,
      ),
    ).rejects.toThrow(/not in the live document/)
  })

  it('rejects an unbalanced edit', async () => {
    const { edit, read } = makeTools()
    const { anchorOf } = await readLabeled(read)
    const a = anchorOf.get('  <body>')!
    await expect(
      edit.execute?.(
        {
          action: 'unbalanced',
          edits: [{ content: '  <div>', end: a, start: a }],
        },
        undefined as never,
      ),
    ).rejects.toThrow(/unbalanced/)
  })
})
