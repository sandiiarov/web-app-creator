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
})
