import { describe, expect, it } from 'vitest'

import { checkHtmlBalance } from './html-balance-guard.ts'

const BALANCED =
  '<!doctype html><html><head><style>a{color:red}</style></head><body><main><p>x</p></main></body></html>'

describe('checkHtmlBalance', () => {
  it('balanced document passes', () => {
    expect(checkHtmlBalance(BALANCED)).toEqual({ ok: true, issues: [] })
  })

  it('eaten </style> is flagged (the root-cause case)', () => {
    const broken = BALANCED.replace('</style>', '')
    const r = checkHtmlBalance(broken)
    expect(r.ok).toBe(false)
    expect(r.issues.join(' ')).toMatch(/<style>: 1 open vs 0 close/)
  })

  it('eaten </head> is flagged', () => {
    expect(checkHtmlBalance(BALANCED.replace('</head>', '')).ok).toBe(false)
  })

  it('eaten </body> is flagged', () => {
    expect(checkHtmlBalance(BALANCED.replace('</body>', '')).ok).toBe(false)
  })

  it('stray duplicate closer is flagged', () => {
    const r = checkHtmlBalance(BALANCED.replace('</main>', '</main></main>'))
    expect(r.ok).toBe(false)
    expect(r.issues.join(' ')).toMatch(/<main>:.*2 close/)
  })

  it('void elements (img/br/meta/input) are ignored', () => {
    const html =
      '<!doctype html><html><head><meta charset="utf-8"></head><body><img src="x"><br><input></body></html>'
    expect(checkHtmlBalance(html).ok).toBe(true)
  })

  it("attributes and self-closing containers don't false-positive", () => {
    const html =
      '<!doctype html><html><body><div class="x"><svg viewBox="0 0 1 1"/></div></body></html>'
    expect(checkHtmlBalance(html).ok).toBe(true)
  })
})
