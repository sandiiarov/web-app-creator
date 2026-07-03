# Design review: prompt diagnostic block status treatment

**Project:** Web App Creator client prompt panel  
**Mode:** `/design review`  
**Date:** 2026-07-03  
**Scope:** Tool/thinking diagnostic block header treatment, based on the provided screenshot.

## Overall score

**35 / 50 — direction is right, status treatment needs simplification**

The block structure is now much closer to the prompt panel's diagnostic language: icon-first, intent-first, square, compact, and inspectable. The weak point is the right-side status cluster. The checkmark chip is visually louder than the actual disclosure chevron, so the header reads like a completed task card with a checkbox instead of a collapsible diagnostic row. The user's instinct is correct: state should be carried more by color/surface treatment, while the right edge should stay reserved for disclosure.

## Heuristic scores

| # | Heuristic | Score | Key finding |
|---|---:|---:|---|
| 1 | First impression | 7/10 | The block feels intentional and product-appropriate, but the check chip creates a heavy end-cap that pulls attention away from the intent. |
| 2 | Hierarchy | 7/10 | Intent is the right primary content. Status currently competes with it because the check chip has button-like weight. |
| 3 | Color voice | 6/10 | State colors are available but underused; the UI is relying on extra icon furniture instead of the block's border/background/icon tone. |
| 4 | Type voice | 8/10 | Header and expanded labels are legible and disciplined. No major type issue in this screenshot. |
| 5 | Interaction feel | 7/10 | User-controlled collapse is correct. The remaining issue is that status and disclosure still feel like separate controls competing for the same corner. |

## Primary flow reviewed

1. A tool call appears as an individual diagnostic block.
2. The user scans the intent in the collapsed header.
3. The block may be loading, done, or failed.
4. The user can expand it to inspect `Intent`, `Args`, and `Result`/`Error`.

The story works until the right edge: the checkmark chip answers “is it done?” but the chevron answers “can I open it?” The screenshot makes the checkmark louder than the chevron, so the block's affordance is muddy.

## What is working

### Intent-first header

The header correctly leads with the action reason: “Review current page structure to find where to add a new games section.” That is the right information hierarchy.

### Expanded content structure

The expanded body is clear. `INTENT` and `RESULT` are easy to parse, and the row feels inspectable rather than decorative.

### Square diagnostic language

Borders, compact spacing, and no-radius treatment fit the surrounding prompt panel style.

## Priority issues

### P1 — Status chip is in the highest-value disclosure position

**Evidence:** In the screenshot, the checkmark sits inside a bordered square near the top-right of the header. It has more visual weight than the adjacent chevron, so the eye reads it as the primary control.

**Fix:** Remove the standalone status chip from the right cluster. Keep the right edge for a single disclosure chevron. Communicate state through the block shell instead:

- Loading: amber/yellow border, faint amber background, amber tool/thinking icon, optional subtle spinner only if it does not occupy the disclosure slot.
- Done: normal/neutral border and background, no extra check chip.
- Error: red/destructive border, faint red background, red icon/text emphasis.

**Next mode:** `/design interaction`

### P1 — Done state should be quiet by default

**Evidence:** A completed diagnostic row is not the user's main decision point. The check chip makes every completed row look like a completed checklist item, adding visual noise in long agent runs.

**Fix:** Treat done as the default rested state. Neutral surface + tool icon + intent + chevron is enough. If a done marker is needed, make it a tiny text/status token only in expanded content or metadata, not a header control.

**Next mode:** `/design finish`

### P2 — Active state should not cause layout churn

**Evidence:** The user already flagged jumpiness from auto-open/close. Even after disabling auto expansion, a heavy loading chip would still create a busy right edge during fast responses.

**Fix:** Use color-first active state. Prefer amber border/background/icon over a prominent spinner chip. If a spinner remains, place it where it does not change the perceived disclosure affordance.

**Next mode:** `/design motion` or `/design interaction`

## Smell check

No broad AI-template smell is present. The pattern is a valid diagnostic row. The smell is micro-interaction clutter: multiple tiny symbols on the right edge trying to explain state, completion, and disclosure at once.

## Recommended next move

Apply a focused interaction pass: remove the right-side status chip from diagnostic blocks, keep one chevron as the only persistent right-edge affordance, and move loading/done/error meaning into color treatment. This matches the user's read: yellow loading, normal done, red error.
