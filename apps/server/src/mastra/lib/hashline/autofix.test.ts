import { describe, expect, it } from 'vitest'

import { autofixHtmlBalance } from './autofix.ts'
import { checkHtmlBalance } from './html-balance-guard.ts'

const BALANCED =
  '<!doctype html><html><head><style>a{color:red}</style></head><body><main><p>x</p></main></body></html>'

describe('autofixHtmlBalance', () => {
  it('returns input unchanged when already balanced', () => {
    const r = autofixHtmlBalance(BALANCED)
    expect(r.fixed).toBe(true)
    expect(r.applied).toEqual([])
    expect(r.html).toBe(BALANCED)
  })

  it('collapses a duplicate </main> closer (the reported error case)', () => {
    const broken = BALANCED.replace('</main>', '</main></main>')
    const r = autofixHtmlBalance(broken)
    expect(r.fixed).toBe(true)
    expect(checkHtmlBalance(r.html).ok).toBe(true)
    expect(r.html).not.toBe(broken)
    expect(r.applied.join(' ')).toMatch(/duplicate <\/main>/)
  })

  it('collapses whitespace-separated duplicate closers', () => {
    const broken = BALANCED.replace('</main>', '</main>\n  </main>')
    const r = autofixHtmlBalance(broken)
    expect(r.fixed).toBe(true)
    expect(checkHtmlBalance(r.html).ok).toBe(true)
  })

  it('collapses multiple excess closers across passes', () => {
    // three </main> closers, one <main> open -> remove two
    const broken = BALANCED.replace('</main>', '</main></main></main>')
    const r = autofixHtmlBalance(broken)
    expect(r.fixed).toBe(true)
    expect(checkHtmlBalance(r.html).ok).toBe(true)
    expect(r.applied.length).toBe(2)
  })

  it('collapses excess bare openers', () => {
    const broken = BALANCED.replace('<main>', '<main><main>')
    const r = autofixHtmlBalance(broken)
    expect(r.fixed).toBe(true)
    expect(checkHtmlBalance(r.html).ok).toBe(true)
  })

  it('does not collapse openers that differ by attributes', () => {
    const broken = BALANCED.replace('<main>', '<main class="a"><main>')
    const r = autofixHtmlBalance(broken)
    // The unclosed outer <main class="a"> makes </body> arrive out of order,
    // so even the truncation repair aborts on the mis-nesting.
    expect(r.fixed).toBe(false)
    expect(r.applied).toEqual([])
  })

  it('leaves a missing closer (eaten </style>) un-repairable', () => {
    const broken = BALANCED.replace('</style>', '')
    const r = autofixHtmlBalance(broken)
    expect(r.fixed).toBe(false)
    expect(r.applied).toEqual([])
  })

  it('leaves a stray non-adjacent closer un-repairable', () => {
    // two </main> separated by other content -> cannot decide which to drop
    const broken =
      '<!doctype html><html><body><main></main><p>x</p></main></body></html>'
    const r = autofixHtmlBalance(broken)
    expect(r.fixed).toBe(false)
    expect(r.applied).toEqual([])
  })

  it('keeps nested balanced pairs intact', () => {
    const html = '<div><div>x</div></div>'
    const r = autofixHtmlBalance(html)
    expect(r.applied).toEqual([])
    expect(r.fixed).toBe(true)
  })

  it('appends trailing closers for a truncated document (cut-off generation)', () => {
    const broken = '<!doctype html><html><body><main><section>'
    const r = autofixHtmlBalance(broken)
    expect(r.fixed).toBe(true)
    expect(checkHtmlBalance(r.html).ok).toBe(true)
    expect(r.html.trimEnd()).toMatch(
      /<\/section>\n<\/main>\n<\/body>\n<\/html>$/,
    )
    expect(r.applied.join(' ')).toMatch(/truncated closing tag/)
  })

  it('appends only tags still open at EOF (respects already-closed ones)', () => {
    const broken = '<html><head></head><body><main><div>x</div><section>'
    const r = autofixHtmlBalance(broken)
    expect(r.fixed).toBe(true)
    expect(checkHtmlBalance(r.html).ok).toBe(true)
    // head + div were already closed -> not re-appended
    expect(r.html.split('</head>').length - 1).toBe(1)
    expect(r.html).not.toMatch(/<\/div><\/section>/)
    expect(r.html.trimEnd()).toMatch(
      /<\/section>\n<\/main>\n<\/body>\n<\/html>$/,
    )
  })

  it('does NOT append when a mid-document closer was eaten (mis-nesting)', () => {
    // </style> eaten -> </head> arrives while <style> is still open -> mismatch
    const broken =
      '<!doctype html><html><head><style>a{x:1}</head><body><main><p>x</p></main></body></html>'
    const r = autofixHtmlBalance(broken)
    expect(r.fixed).toBe(false)
    expect(r.applied).toEqual([])
  })

  it('ignores void elements and self-closing containers in the walk', () => {
    const broken = '<html><body><main><img src="x"><br/><div/></main>'
    const r = autofixHtmlBalance(broken)
    expect(r.fixed).toBe(true)
    expect(checkHtmlBalance(r.html).ok).toBe(true)
    expect(r.html).not.toContain('</div>')
    expect(r.html.trimEnd()).toMatch(/<\/main>\n<\/body>\n<\/html>$/)
  })
})
