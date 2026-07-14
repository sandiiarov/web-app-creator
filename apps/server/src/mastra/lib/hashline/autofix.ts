import {
  computeTagBalance,
  CONTAINER_TAGS,
  type BalanceDetail,
} from './html-balance-guard.ts'

export interface AutofixResult {
  /** Human-readable description of each applied repair (empty when nothing fixed). */
  applied: string[]
  /** True iff the returned `html` passes the balance guard. */
  fixed: boolean
  /** Possibly-repaired HTML; identical to the input when no repair applied. */
  html: string
}

interface Repair {
  description: string
  html: string
}

type RepairStrategy = (
  html: string,
  imbalanced: readonly BalanceDetail[],
) => Repair | null

/**
 * Ordered, conservative repair strategies. Each only acts when the fix is
 * unambiguous. `collapseExcessAdjacent*` remove immediately-adjacent duplicate
 * tags. `appendTrailingClosers` repairs a TRUNCATED edit (opens without
 * closers, e.g. a `maxOutputTokens` cut-off): a clean nesting walk collects the
 * tags still open at EOF and appends their closers in reverse. It aborts on any
 * out-of-order closer, so a closer deleted mid-document (the eaten-`</style>`
 * root-cause case the guard exists to catch) still fails and forces a re-read —
 * only a genuinely truncated tail is repaired. Add new deterministic
 * strategies here as ordered array entries.
 */
const STRATEGIES: readonly RepairStrategy[] = [
  collapseExcessAdjacentClosers,
  collapseExcessAdjacentOpeners,
  appendTrailingClosers,
]

/** Hard cap on repair passes; one tag is removed per pass. */
const MAX_PASSES = 64

/**
 * Try to repair unbalanced container tags left over after `applyEdits` (and
 * after `apply.ts`'s line-level `repairReplacementBoundaries` self-heal, which
 * only drops a trailing closer duplicated exactly at a SWAP boundary). Runs
 * each strategy in order, re-checking balance after every successful repair,
 * until the document is balanced or no strategy makes further progress.
 */
export function autofixHtmlBalance(html: string): AutofixResult {
  let work = html
  const applied: string[] = []
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const imbalanced = computeTagBalance(work).filter(
      (d) => d.netOpen !== d.closes,
    )
    if (imbalanced.length === 0) break
    let progress = false
    for (const strategy of STRATEGIES) {
      const repair = strategy(work, imbalanced)
      if (repair && repair.html !== work) {
        work = repair.html
        applied.push(repair.description)
        progress = true
        break
      }
    }
    if (!progress) break
  }
  const fixed = computeTagBalance(work).every((d) => d.netOpen === d.closes)
  return { applied, fixed, html: work }
}

/**
 * Collapse one excess closer per pass: when a tag has more `</tag>` than opens,
 * find the first run of two adjacent identical closers (optional whitespace
 * between) and drop the second. Two identical closers separated only by
 * whitespace can only be valid if a matching open also exists — which, by
 * definition of "excess", it does not — so removing one is the only balanced
 * outcome and never destroys a legitimately nested pair.
 */
function collapseExcessAdjacentClosers(
  html: string,
  imbalanced: readonly BalanceDetail[],
): Repair | null {
  for (const { closes, netOpen, tag } of imbalanced) {
    if (closes <= netOpen) continue
    const t = escapeRe(tag)
    const match = new RegExp(`(</${t}>)([ \\t\\r\\n]*)(</${t}>)`).exec(html)
    if (!match) continue
    // Keep the first closer + the whitespace, drop the trailing closer.
    const head = `${match[1]!}${match[2]!}`
    const fixed = spliceOut(html, match.index, match[0]!.length, head)
    return { description: `removed a duplicate </${tag}> closer`, html: fixed }
  }
  return null
}

/**
 * Mirror of `collapseExcessAdjacentClosers` for excess openers: drop the second
 * of two adjacent identical `<tag>` openers (bare tags only — openers carrying
 * attributes are skipped, since `<div>` and `<div class="x">` are not the same
 * tag and collapsing one could discard a needed attribute).
 */
function collapseExcessAdjacentOpeners(
  html: string,
  imbalanced: readonly BalanceDetail[],
): Repair | null {
  for (const { closes, netOpen, tag } of imbalanced) {
    if (netOpen <= closes) continue
    const t = escapeRe(tag)
    const match = new RegExp(`(<${t}>)([ \\t\\r\\n]*)(<${t}>)`).exec(html)
    if (!match) continue
    const head = `${match[1]!}${match[2]!}`
    const fixed = spliceOut(html, match.index, match[0]!.length, head)
    return { description: `removed a duplicate <${tag}> opener`, html: fixed }
  }
  return null
}

const NESTING_TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g

/**
 * Stack-walk the document's container tags in source order. Returns the tags
 * still open at EOF and whether any closer arrived out of order (a mis-nesting
 * signature). Void elements are excluded by `CONTAINER_TAGS` membership;
 * self-closing containers (`<div/>`) are skipped. Used only to decide whether
 * a truncation repair is safe — never to validate well-formedness generally.
 */
function scanNesting(html: string): { mismatch: boolean; stack: string[] } {
  const stack: string[] = []
  for (const m of html.matchAll(NESTING_TAG_RE)) {
    const tag = (m[2] ?? '').toLowerCase()
    if (!(CONTAINER_TAGS as readonly string[]).includes(tag)) continue
    if ((m[3] ?? '').endsWith('/')) continue // self-closing
    if (m[1] === '/') {
      if (stack[stack.length - 1] === tag) stack.pop()
      else return { mismatch: true, stack }
    } else {
      stack.push(tag)
    }
  }
  return { mismatch: false, stack }
}

/**
 * Repair a truncated edit by appending the closers for every tag still open at
 * EOF (reverse nesting order). Fires only when there is a missing-closer
 * deficit AND the nesting walk is clean — a closer deleted mid-document (e.g.
 * eaten `</style>`) makes a later closer arrive out of order, which the walk
 * flags as a mismatch and aborts on, so that corruption still rejects instead
 * of being papered over with a misplaced EOF closer.
 */
function appendTrailingClosers(
  html: string,
  imbalanced: readonly BalanceDetail[],
): Repair | null {
  if (!imbalanced.some((d) => d.netOpen > d.closes)) return null
  const { mismatch, stack } = scanNesting(html)
  if (mismatch || stack.length === 0) return null
  const reversed = [...stack].reverse()
  const closers = reversed.map((t) => `</${t}>`).join('\n')
  const prefix = html.endsWith('\n') ? '' : '\n'
  return {
    description: `appended ${stack.length} truncated closing tag(s): ${reversed
      .map((t) => `</${t}>`)
      .join(' ')}`,
    html: `${html}${prefix}${closers}\n`,
  }
}

/** Replace `length` chars at `index` with `replacement`. */
function spliceOut(
  html: string,
  index: number,
  length: number,
  replacement: string,
): string {
  return html.slice(0, index) + replacement + html.slice(index + length)
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
