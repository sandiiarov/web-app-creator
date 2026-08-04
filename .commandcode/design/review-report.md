# Review Report — Model Selector (`model-dropdown.tsx`)

**Date:** 2026-08-02
**Mode:** `/design review`
**Surface:** `packages/prompt-panel/src/model-dropdown.tsx` — model picker popover in the prompt panel composer
**Register:** Product (daily operator tool)

## Overall: 32/50

**Verdict:** Focused interventions, not a rethink. The pricing layer and trigger are strong; the three-level composition is over-drilled for the data it holds.

**TL;DR:** The picker reads clean and the live per-1M pricing is genuinely useful, but the composition is three levels of navigation (role tabs → provider rail → model list) for data that is mostly one model per provider. The content pane — the place where the actual decision happens — renders 1–2 rows inside a ~500px-tall void on 6 of 8 text providers, all vision providers but one, and every image provider. The rail dominates; the model row whispers.

**Primary recommendation:** `/design relayout` — flatten the drill-down into one grouped list per role tab.

## Heuristic scores

| # | Lens | Score | Key finding |
|---|------|-------|-------------|
| 1 | First impression | 7/10 | Sharp dark popover with real brand identity from provider marks; arrival on a 1-model provider deflates it |
| 2 | Hierarchy | 6/10 | Tabs → rail → content reads in order, but the squint test fails: rail + tabs dominate, the actual choice is 12% of the surface |
| 3 | Color voice | 7/10 | Role colors (blue/emerald/violet) stay consistent with composer + spend popover; disciplined whisper; nothing memorable, nothing wrong |
| 4 | Type voice | 7/10 | Two-line rows (name over 10px muted price) are the right hierarchy; "Prices per 1M tokens" footer is good honest microcopy |
| 5 | Interaction feel | 5/10 | Hover/selected/tooltips/Escape verified; focus ring is the browser default `outline: auto 1px`; no arrow-key roving; rail marks shown provider, not selected provider |

## Cognitive load / risk

**Level: Medium** — more navigation machinery than the data needs.

- **PASS** Live pricing (input/output/cache per 1M) verified in rendered rows, incl. partial (`$0.1 in · $0.4 out`, no cache) and absent (single-line) cases
- **PASS** A11y tree exposes `tab`/`aria-selected` + `radio`/`aria-checked`; sidebar buttons carry aria-labels + tooltips; Radix focus trap + Escape close verified
- **PASS** Trigger summarizes all three role selections as icon segments with tooltips — glanceable, zero text clutter
- **PASS** Selection keeps the popover open, so all three roles are settable in one session — matches the Configure work shape
- **WATCH** Content void: 1–2 rows in a tall empty pane on most providers (screenshots taken on all three tabs)
- **WATCH** Focus indicator computed as `outline: auto 1px`, no ring shadow, on near-black surface — below the visible-focus bar
- **FAIL** Structure: three-level drill where ~75% of providers have exactly one model — navigation cost with no filtering payoff
- **FAIL** No way to see *which* provider owns the current selection once you drill elsewhere; rail highlight tracks shown provider only

## What's working

**Trigger as summary.** Three role segments (role icon + selected provider logo) separated by dividers, each with a tooltip naming the model. The whole selection state is visible without opening anything.

**Live pricing layer.** Per-1M `in · out · cache` from the server `/api/models` proxy with a bundled static fallback. Two-line rows keep the name primary and the price secondary; degrades honestly when a model has no catalog pricing.

**Role color system.** Text/Image/Vision colors match the composer segments and spend popover categories, so the role mental model carries across the whole panel.

## Priority issues

### P1 — The content pane is a void; the drill-down out-complexes the data

**Evidence:** Screenshots on all three tabs. Text tab → DeepSeek selected: one model row in a ~500px pane below the tab bar. Vision tab → Seed 2.0 Mini: same. Best case (Moonshot, 2 models; Anthropic/OpenAI, 3) still leaves ~70% empty. Popover height is driven by the rail (7–8 icons), so the emptiness is structural, not incidental. 6 of 8 text providers, 6 of 7 vision providers, and all 4 image providers have exactly one model — the provider level filters almost nothing.

**Fix:** `/design relayout` — drop the provider rail. One scrollable list per role tab, all models shown, visually grouped/divided by provider (provider icon + name as group headers, or icon-per-row as today). Tabs stay. Pricing rows stay. The selected model becomes visible on open without any drilling.

### P2 — Focus indicator is the browser default 1px outline

**Evidence:** Tabbed into the open popover; computed style on the focused control: `outline: auto 1px`, `box-shadow: none`. On the near-black popover this is marginal against the 2–3px, offset, 3:1-contrast bar.

**Fix:** `/design interaction` — add `focus-visible` rings (2px, offset, role-consistent color) to tabs, rail buttons, and model rows.

### P3 — Rail shows the *shown* provider, never the *selected* one

**Evidence:** Clicking another provider moves the accent highlight with it; nothing in the rail marks which provider owns the current selection. Drill away and the check's location is lost from view.

**Fix:** `/design interaction` — small selected-dot on the rail icon whose provider owns the role's selection (moot if P1 lands).

### P3 — Arrow-key navigation is not wired

**Evidence:** Rows are plain buttons inside a Popover (not a Menu); `role="radiogroup"` implies arrow-key movement the implementation doesn't provide. Tab reaches items; arrow keys were not verified to move between them and the code has no roving tabindex.

**Fix:** `/design interaction` — either add roving tabindex/arrow handling, or drop the radiogroup semantics to plain buttons so the a11y tree doesn't promise what it can't deliver.

### Accepted tradeoff (not a defect)

Image-gen-only models (Seedream, GPT Image 2, Grok) show no price line because OpenRouter's chat catalog has no token pricing for them. The row collapses cleanly to one line. If users read a missing price as "free", add a tiny `per-image` note later — `/design writing` at most.

## Recommended next modes, in order

1. `/design relayout` — flatten provider drill-down into grouped single list (P1)
2. `/design interaction` — focus rings, arrow-key semantics, selected-provider marker (P2, P3)
3. `/design refine` — density + polish pass after the structural change

---
*Generated with CommandCode · /design review · 2026-08-02*
