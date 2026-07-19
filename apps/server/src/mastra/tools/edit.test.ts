import { describe, expect, it } from 'vitest'

import { HtmlStoreFilesystem } from '../lib/hashline/html-store-filesystem.ts'
import { createSnapshotStore } from '../lib/hashline/snapshot-store.ts'
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

/** Read the doc once and return its fresh snapshot tag. */
async function freshTag(
  read: ReturnType<typeof createReadTool>,
): Promise<string> {
  const res = (await read.execute?.(
    { action: 'read' },
    undefined as never,
  )) as { tag: string }
  return res.tag
}

function makeTools(seed: string = DOC) {
  const store = createHtmlStore(seed)
  const fs = new HtmlStoreFilesystem(store)
  const snapshots = createSnapshotStore()
  return {
    edit: createEditTool(fs, snapshots),
    read: createReadTool(fs, snapshots),
    store,
  }
}

describe('createEditTool', () => {
  it('SWAP a line with a fresh tag succeeds and returns a fresh tag', async () => {
    const { edit, read, store } = makeTools()
    const tag = await freshTag(read)
    const res = (await edit.execute?.(
      {
        action: 'swap headline',
        diff: `[index.html#${tag}]\nSWAP 4.=4:\n    <h1>New</h1>`,
      },
      undefined as never,
    )) as { ok: true; tag: string }
    expect(res.ok).toBe(true)
    expect(res.tag).toMatch(/^[0-9A-F]{4}$/)
    expect(store.get()).toContain('<h1>New</h1>')
    expect(store.get()).not.toContain('<h1>Old</h1>')
  })

  it('rejects a fabricated tag (never read) with a re-read instruction', async () => {
    const { edit, store } = makeTools()
    const before = store.get()
    await expect(
      edit.execute?.(
        {
          action: 'fabricated',
          diff: '[index.html#DEAD]\nSWAP 4.=4:\n    <h1>x</h1>',
        },
        undefined as never,
      ),
    ).rejects.toThrow(/no read snapshot|fabricated|Re-read|mismatch/i)
    expect(store.get()).toBe(before) // nothing written
  })

  it('rejects an edit that would unbalance <style> (eaten closer)', async () => {
    const styleDoc = [
      '<!doctype html>',
      '<html>',
      '  <head>',
      '    <style>',
      '      a { color: red; }',
      '    </style>',
      '  </head>',
      '  <body>',
      '  </body>',
      '</html>',
    ].join('\n')
    const { edit, read, store } = makeTools(styleDoc)
    const tag = await freshTag(read)
    const before = store.get()
    // DEL line 6 (the </style> closer) → unbalanced <style>
    await expect(
      edit.execute?.(
        { action: 'eat closer', diff: `[index.html#${tag}]\nDEL 6.=6` },
        undefined as never,
      ),
    ).rejects.toThrow(/unbalanced/i)
    expect(store.get()).toBe(before) // rejected before write
  })

  it('DEL a line removes it', async () => {
    const { edit, read, store } = makeTools()
    const tag = await freshTag(read)
    await edit.execute?.(
      { action: 'del h1', diff: `[index.html#${tag}]\nDEL 4.=4` },
      undefined as never,
    )
    expect(store.get()).not.toContain('<h1>Old</h1>')
  })

  it('INS.POST inserts after the anchor', async () => {
    const { edit, read, store } = makeTools()
    const tag = await freshTag(read)
    await edit.execute?.(
      {
        action: 'add paragraph',
        diff: `[index.html#${tag}]\nINS.POST 4:\n    <p>added</p>`,
      },
      undefined as never,
    )
    expect(store.get()).toContain('<p>added</p>')
  })

  it('throws on a diff without a [path#TAG] header', async () => {
    const { edit } = makeTools()
    await expect(
      edit.execute?.(
        { action: 'no header', diff: 'SWAP 1.=1:\n+x' },
        undefined as never,
      ),
    ).rejects.toThrow(/no \[index\.html#TAG\] header/i)
  })

  it('tagOnly: accepts a [#TAG] diff and returns a [#TAG] header', async () => {
    const store = createHtmlStore(DOC)
    const fs = new HtmlStoreFilesystem(store)
    const snapshots = createSnapshotStore()
    const read = createReadTool(fs, snapshots, { tagOnly: true })
    const edit = createEditTool(fs, snapshots, { tagOnly: true })
    const tag = await freshTag(read)
    const res = (await edit.execute?.(
      {
        action: 'swap headline',
        diff: `[#${tag}]\nSWAP 4.=4:\n    <h1>New</h1>`,
      },
      undefined as never,
    )) as { header: string; ok: true; tag: string }
    expect(res.ok).toBe(true)
    expect(res.header).toBe(`[#${res.tag}]`)
    expect(store.get()).toContain('<h1>New</h1>')
  })

  it('tagOnly: still accepts a full-form [index.html#TAG] header', async () => {
    const store = createHtmlStore(DOC)
    const fs = new HtmlStoreFilesystem(store)
    const snapshots = createSnapshotStore()
    const read = createReadTool(fs, snapshots, { tagOnly: true })
    const edit = createEditTool(fs, snapshots, { tagOnly: true })
    const tag = await freshTag(read)
    await edit.execute?.(
      { action: 'del h1', diff: `[index.html#${tag}]\nDEL 4.=4` },
      undefined as never,
    )
    expect(store.get()).not.toContain('<h1>Old</h1>')
  })

  it('two single-range reads at the same hash accumulate seen lines', async () => {
    const store = createHtmlStore(DOC)
    const fs = new HtmlStoreFilesystem(store)
    const snapshots = createSnapshotStore()
    const read = createReadTool(fs, snapshots)
    const edit = createEditTool(fs, snapshots)
    // read line 4, then line 2 — same file state, same hash, one accumulated tag
    const a = (await read.execute?.(
      { action: 'a', limit: 1, offset: 4 },
      undefined as never,
    )) as { tag: string }
    const b = (await read.execute?.(
      { action: 'b', limit: 1, offset: 2 },
      undefined as never,
    )) as { tag: string }
    expect(a.tag).toBe(b.tag)
    // editing line 2 (seen only by the second read) is allowed under the tag
    const res = (await edit.execute?.(
      {
        action: 'swap line 2',
        diff: `[index.html#${b.tag}]\nSWAP 2.=2:\n  <html lang="en">`,
      },
      undefined as never,
    )) as { ok: true }
    expect(res.ok).toBe(true)
  })

  it('a multi-range read covers anchors in two regions for one edit', async () => {
    const doc = [
      '<!doctype html>',
      '<html>',
      '  <head>',
      '    <style>',
      '      body { color: red; }',
      '    </style>',
      '  </head>',
      '  <body>',
      '    <main>',
      '      <p>hi</p>',
      '    </main>',
      '  </body>',
      '</html>',
    ].join('\n')
    const store = createHtmlStore(doc)
    const fs = new HtmlStoreFilesystem(store)
    const snapshots = createSnapshotStore()
    const read = createReadTool(fs, snapshots)
    const edit = createEditTool(fs, snapshots)
    // read the CSS line (5) and the HTML line (10) in one call, one tag
    const r = (await read.execute?.(
      {
        action: 'css + html regions',
        ranges: [
          { limit: 1, offset: 5 },
          { limit: 1, offset: 10 },
        ],
      },
      undefined as never,
    )) as { tag: string }
    // one edit touching BOTH regions under the single tag (the CSS+HTML case)
    const res = (await edit.execute?.(
      {
        action: 'css + html edit',
        diff: `[index.html#${r.tag}]\nSWAP 5.=5:\n      body { color: blue; }\nSWAP 10.=10:\n      <p>hello</p>`,
      },
      undefined as never,
    )) as { ok: true }
    expect(res.ok).toBe(true)
    expect(store.get()).toContain('color: blue')
    expect(store.get()).toContain('<p>hello</p>')
    expect(store.get()).not.toContain('color: red')
  })

  it('drops a re-emitted <style> wrapper close when the block already closes later', async () => {
    const doc = [
      '<!doctype html>',
      '<html>',
      '  <head>',
      '    <style>',
      '      a { color: red; }',
      '      b { color: blue; }',
      '    </style>',
      '  </head>',
      '  <body></body>',
      '</html>',
    ].join('\n')
    const store = createHtmlStore(doc)
    const fs = new HtmlStoreFilesystem(store)
    const snapshots = createSnapshotStore()
    const read = createReadTool(fs, snapshots)
    const edit = createEditTool(fs, snapshots)
    const tag = await freshTag(read)
    // SWAP the <style> open + first CSS row; body re-wraps <style>...</style>
    const res = (await edit.execute?.(
      {
        action: 'rewrap style block',
        diff: `[index.html#${tag}]\nSWAP 4.=5:\n    <style>\n      a { color: green; }\n    </style>`,
      },
      undefined as never,
    )) as { ok: true; warnings: string[] }
    expect(res.ok).toBe(true)
    const out = store.get()
    expect((out.match(/<style\b/g) || []).length).toBe(1)
    expect((out.match(/<\/style>/g) || []).length).toBe(1)
    expect(out).toContain('color: green')
    expect(out).toContain('color: blue')
    expect(res.warnings.join(' ')).toMatch(/re-emitted <\/style>/i)
  })

  it('drops a re-emitted <script> wrapper close (raw-text parity with style)', async () => {
    const doc = [
      '<!doctype html>',
      '<html>',
      '  <head>',
      '    <script>',
      '      console.log("a");',
      '      console.log("b");',
      '    </script>',
      '  </head>',
      '  <body></body>',
      '</html>',
    ].join('\n')
    const store = createHtmlStore(doc)
    const fs = new HtmlStoreFilesystem(store)
    const snapshots = createSnapshotStore()
    const read = createReadTool(fs, snapshots)
    const edit = createEditTool(fs, snapshots)
    const tag = await freshTag(read)
    const res = (await edit.execute?.(
      {
        action: 'rewrap script',
        diff: `[index.html#${tag}]\nSWAP 4.=5:\n    <script>\n      console.log("c");\n    </script>`,
      },
      undefined as never,
    )) as { ok: true }
    expect(res.ok).toBe(true)
    const out = store.get()
    expect((out.match(/<script\b/g) || []).length).toBe(1)
    expect((out.match(/<\/script>/g) || []).length).toBe(1)
    expect(out).toContain('console.log("c")')
    expect(out).toContain('console.log("b")')
  })

  it('handles a raw-text opener carrying attributes (<style type="...">)', async () => {
    const doc = ['<style>', '  a { color: red; }', '</style>'].join('\n')
    const store = createHtmlStore(doc)
    const fs = new HtmlStoreFilesystem(store)
    const snapshots = createSnapshotStore()
    const read = createReadTool(fs, snapshots)
    const edit = createEditTool(fs, snapshots)
    const tag = await freshTag(read)
    const res = (await edit.execute?.(
      {
        action: 'rewrap with attrs',
        diff: `[index.html#${tag}]\nSWAP 1.=1:\n<style type="text/css">\n  a { color: green; }\n</style>`,
      },
      undefined as never,
    )) as { ok: true }
    expect(res.ok).toBe(true)
    const out = store.get()
    expect((out.match(/<style\b/g) || []).length).toBe(1)
    expect((out.match(/<\/style>/g) || []).length).toBe(1)
    expect(out).toContain('color: green')
  })

  it('does NOT repair a non-raw-text re-wrap (<div>) — rejects instead', async () => {
    const doc = ['<div>', '  x', '</div>'].join('\n')
    const store = createHtmlStore(doc)
    const fs = new HtmlStoreFilesystem(store)
    const snapshots = createSnapshotStore()
    const read = createReadTool(fs, snapshots)
    const edit = createEditTool(fs, snapshots)
    const tag = await freshTag(read)
    const before = store.get()
    await expect(
      edit.execute?.(
        {
          action: 'rewrap div',
          diff: `[index.html#${tag}]\nSWAP 1.=1:\n<div>\n  y\n</div>`,
        },
        undefined as never,
      ),
    ).rejects.toThrow(/unbalanced/i)
    expect(store.get()).toBe(before)
  })

  it('does NOT fire when the range already includes the original close (legit full-block replace)', async () => {
    const doc = ['<style>', '  a { color: red; }', '</style>'].join('\n')
    const store = createHtmlStore(doc)
    const fs = new HtmlStoreFilesystem(store)
    const snapshots = createSnapshotStore()
    const read = createReadTool(fs, snapshots)
    const edit = createEditTool(fs, snapshots)
    const tag = await freshTag(read)
    const res = (await edit.execute?.(
      {
        action: 'replace whole block',
        diff: `[index.html#${tag}]\nSWAP 1.=3:\n<style>\n  a { color: green; }\n</style>`,
      },
      undefined as never,
    )) as { ok: true; warnings: string[] }
    expect(res.ok).toBe(true)
    expect((store.get().match(/<\/style>/g) || []).length).toBe(1)
    expect(res.warnings.join(' ')).not.toMatch(/re-emitted/i)
  })

  it('does NOT fire when the wrapper open/close tags mismatch', async () => {
    const doc = ['<style>', '  a { }', '</style>'].join('\n')
    const store = createHtmlStore(doc)
    const fs = new HtmlStoreFilesystem(store)
    const snapshots = createSnapshotStore()
    const read = createReadTool(fs, snapshots)
    const edit = createEditTool(fs, snapshots)
    const tag = await freshTag(read)
    await expect(
      edit.execute?.(
        {
          action: 'mismatched wrapper',
          diff: `[index.html#${tag}]\nSWAP 1.=1:\n<style>\n  x\n</script>`,
        },
        undefined as never,
      ),
    ).rejects.toThrow(/unbalanced/i)
  })

  it('balance backstop: a re-wrap that leaves ANOTHER tag imbalanced still rejects (no silent write)', async () => {
    const doc = ['<style>', '  a { }', '</style>'].join('\n')
    const store = createHtmlStore(doc)
    const fs = new HtmlStoreFilesystem(store)
    const snapshots = createSnapshotStore()
    const read = createReadTool(fs, snapshots)
    const edit = createEditTool(fs, snapshots)
    const tag = await freshTag(read)
    const before = store.get()
    await expect(
      edit.execute?.(
        {
          action: 'rewrap + stray div',
          diff: `[index.html#${tag}]\nSWAP 1.=1:\n<style>\n  b { }\n<div>x\n</style>`,
        },
        undefined as never,
      ),
    ).rejects.toThrow(/unbalanced/i)
    expect(store.get()).toBe(before)
  })
})
