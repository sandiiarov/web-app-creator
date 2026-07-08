import { describe, expect, it } from 'vitest'

import { applyEdits } from './apply.ts'
import { parsePatch } from './parser.ts'

/**
 * Characterization tests for the vendored hashline apply engine.
 * Locks behavior BEFORE strictness fixes touch apply.ts, so any
 * behavior drift surfaces. Pure type-level fixes must keep these green.
 */
function applyDiff(oldText: string, diff: string): string {
  const { edits } = parsePatch(diff)
  return applyEdits(oldText, edits).text
}

const DOC = [
  '<!doctype html>',
  '<html>',
  '  <head>',
  '  </head>',
  '  <body>',
  '  </body>',
  '</html>',
].join('\n')
const H = '[index.html#1A2B]'

describe('hashline applyEdits (characterization)', () => {
  it('SWAP single line', () => {
    const diff = `${H}\nSWAP 3.=3:\n+  <head data-x="1">`
    expect(applyDiff(DOC, diff)).toBe(
      DOC.replace('  <head>', '  <head data-x="1">'),
    )
  })

  it('SWAP a range (inclusive)', () => {
    const diff = `${H}\nSWAP 2.=3:\n+<html lang="en">\n+  <head>`
    const out = applyDiff(DOC, diff)
    expect(out).toContain('<html lang="en">')
    const lines = out.split('\n')
    expect(lines[1]).toBe('<html lang="en">') // swapped into line 2
    expect(lines.length).toBe(DOC.split('\n').length) // 2-for-2 swap keeps length
  })

  it('DEL a single line', () => {
    const diff = `${H}\nDEL 3.=3`
    const out = applyDiff(DOC, diff)
    expect(out).not.toContain('  <head>')
    expect(out).toContain('</head>')
  })

  it('INS.POST inserts after the anchor', () => {
    const diff = `${H}\nINS.POST 3:\n+    <meta charset="utf-8" />`
    const out = applyDiff(DOC, diff)
    const lines = out.split('\n')
    const headIdx = lines.findIndex((l) => l === '  <head>')
    expect(lines[headIdx + 1]).toBe('    <meta charset="utf-8" />')
  })

  it('INS.HEAD inserts at the very start', () => {
    const diff = `${H}\nINS.HEAD:\n+<!-- top -->`
    expect(applyDiff(DOC, diff).split('\n')[0]).toBe('<!-- top -->')
  })

  it('multi-hunk: SWAP + DEL in one patch', () => {
    const diff = `${H}\nSWAP 3.=3:\n+  <head>\nDEL 6.=6`
    const out = applyDiff(DOC, diff)
    expect(out).toContain('  <head>')
    expect(out).not.toContain('  </body>')
  })

  it('no-op patch returns the original text', () => {
    const diff = `${H}\nSWAP 3.=3:\n+  <head>`
    expect(applyDiff(DOC, diff)).toBe(DOC)
  })
})
