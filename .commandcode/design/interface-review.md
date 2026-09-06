# Panel and project library interface review

Reviewed and implemented on 2026-09-06 using `better-interface` and all six owning skills. Scope: the compact panel header, composer, collapse/restore, dragging, docking, project switcher, project library, and rename dialog. Existing conversation history was inspected in its normal collapsed-activity presentation; this is not a review of every diagnostic or generated-page variant.

Stack: React, TypeScript, Vite, Tailwind v4, Radix/shadcn primitives, Lucide, shared semantic color and motion tokens. Conventions: root, apps, client, packages, prompt-panel, and UI AGENTS.md; approved `.commandcode/design/reconsidered-preview.html`. The square corners, compact 352 × 360 floating composition, full-height docks, and page-first workspace remain the design constraints.

## Coverage

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Browser accessibility tree, named controls, status tooltip, keyboard dragging, rename and Escape focus return, search and filter names | 2 findings fixed |
| Layout | Expanded/collapsed floating panel and both docks; switcher; library rows and controls at seven viewport sizes | 1 finding fixed |
| Writing | Search label/hint, result counts, current filter/sort labels, empty and error recovery copy | 1 finding fixed |
| Typography | Rendered input sizes, long titles/briefs, text hierarchy and metadata | 1 finding fixed |
| Colors | Computed CSS colors, alpha compositing and WCAG contrast calculations in both themes; conservative white/black backdrops for glass | 2 findings fixed |
| UI | Pointer capture, drag versus click, collapse continuity, repeated view transitions, reduced motion | 3 findings fixed |

## Ranked findings

All changes in the After column are implemented. Locations refer to the isolated release source.

| Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| HIGH | Colors | `packages/ui/src/components/input.tsx:10`; `textarea.tsx:10`; `packages/ui/src/styles/globals.css:126` | Placeholder opacity reduced muted text to 72%; search measured 3.19:1 light and 4.37:1 dark | Full muted foreground; slightly darker light token. Search now 6.06:1 / 7.24:1; composer at least 4.69:1 / 4.76:1 against conservative glass backdrops | Small instructional text failed the 4.5:1 requirement |
| HIGH | Colors | `packages/prompt-panel/src/status-pill.tsx:15`; composer, activity/error text; client rename and page-action errors | Error text used the destructive surface color; library Error measured 3.51:1 light and 3.79:1 dark | Use existing destructive-foreground; Error now 4.72:1 / 6.07:1 | Error labels must remain readable; reuse the semantic text token |
| HIGH | Accessibility | `packages/prompt-panel/src/panel-header.tsx:157`; `packages/ui/src/styles/globals.css:454` | Default status presentation was a 5px color dot | Recognizable ready, busy, error, stopped and offline icons; named tooltip and 24px focus target with visible outline | Status must have a recognizable cue beyond color; offline takes precedence over stale run state |
| MEDIUM | UI | `packages/prompt-panel/src/prompt-panel.tsx:196`; `use-launcher-drag.ts:69` | Collapse switched to an unrelated compact position and refocused the textarea | Capture visible top-left before collapse; float restores from compact placement; docks restore their side; focus composer only on expansion | Prevents jumps and an unwanted keyboard on minimize |
| MEDIUM | UI | `packages/prompt-panel/src/use-launcher-drag.ts:107`; `prompt-panel.tsx:345` | Capturing the pointer on the header swallowed title-button clicks | Capture on the stable title button for title gestures; preserve the drag threshold and suppress only drag clicks; keyboard activation clears suppression | Clicking reliably opens/renames, while dragging only moves |
| MEDIUM | Accessibility | `apps/client/src/components/rename-project-dialog.tsx:39` | Escape/Cancel returned focus to the document body | Restore the opening control, with project-action/title fallback | Preserves the keyboard user's position in the task |
| MEDIUM | Typography | `packages/ui/src/styles/globals.css:1221` | Phone library search rendered at 14px and switcher search at 12px | Search and rename inputs use 16px text and at least 40px height below 768px | Improves mobile input readability and avoids small-input zoom |
| MEDIUM | Layout | `apps/client/src/components/projects-page.tsx:608`; `packages/ui/src/styles/globals.css:1117` | Search matched briefs that rows did not display | Show a restrained brief excerpt under each title, retaining full title/brief values and the editor link | Makes results easier to distinguish and explains brief matches |
| LOW | Writing | `apps/client/src/components/projects-page.tsx:350`; `projects-page.tsx:429`; `project-switcher.tsx:69` | Three counts competed; search scope and selected filter/sort were unclear | One live result count, visible search label, name-or-brief hint, reset action, and current selection in accessible names | Reduces repetition and makes the controls easier to understand |
| LOW | UI | `packages/ui/src/styles/globals.css:422` | Conversation and Projects replayed a vertical entrance on each switch | Remove repeated content entrance; preserve initial panel arrival and existing motion preferences | Frequent view changes stay immediate and visually continuous |

## Verification

Passed in the isolated release checkout:

- `pnpm --filter @workspace/prompt-panel --filter @workspace/client --filter @workspace/ui format:check`
- `pnpm --filter @workspace/prompt-panel --filter @workspace/client --filter @workspace/ui typecheck`
- `pnpm --filter @workspace/prompt-panel --filter @workspace/client --filter @workspace/ui lint` — existing warnings only.
- `pnpm --filter @workspace/prompt-panel --filter @workspace/client test` — 45 tests passed.
- `pnpm --filter @workspace/client build` — succeeded; existing large-chunk warning remains.
- `git diff --check`.

Browser verification used `agent-browser` against localhost, with read-only existing projects and temporary browser fetch fixtures:

- Expanded rectangle `(1068,580,352,360)` collapsed to `(1068,580,352,131)` with unchanged top-left and focus on Show conversation.
- Dragged compact panel to `(598,260)`; the drag kept it collapsed. Clicking its title expanded it at `(598,260)`.
- Left and right docks: collapse, move compact control with arrows, restore; each returned to its original full-height side.
- Floating: Shift+ArrowLeft moved the compact control 48px; Enter restored at that position. Title click opened Rename; Escape returned focus to the title. Library Rename returned focus to its project action button.
- At 320×640, 375×812, 640×480, 768×1024, 1024×768, 1440×960, and 2560×1440: expanded and collapsed panel bounds remained inside the viewport; library controls fit without horizontal overflow. Mobile search computed to 16px.
- Search with no matches showed zero results and recovery. Clearing filters restored projects and focused search. The switcher showed matching projects and a readable no-results message at 320px.
- Browser-only API fixtures exercised library error → Try again → loading → empty, then reload restored real data. No real projects were renamed or deleted and no generation request was submitted.
- Both themes inspected. Selected text pairs passed 4.5:1; the offline icon passed the 3:1 non-text threshold. Measurements use CSS colors before text antialiasing, composited through backgrounds; glass checks bound the backdrop with black and white.
- `agent-browser --session release-interface set media dark reduced-motion`: OS preference matched, content animation was `none`, panel transition duration was `0.00001s`.
- The isolated release browser verified empty/offline panel rendering, collapse, title activation and focus return. Its separate port was outside the running server's allowed origin, so connected-server flows were verified on the normal localhost:5173 development origin.

Not verified: VoiceOver or other screen-reader speech output; physical touch devices and software keyboards; native browser 200% zoom; every generated iframe/Markdown/diagnostic variation; live generation, export, rename persistence, or deletion. The 640×480 check covers a constrained layout but is not claimed as native zoom testing.

## DOX closeout

Updated client, prompt-panel and UI AGENTS.md for the changed behavior and tokens. Added this record to root-owned design materials. Parent apps/packages documents and child indexes remain unchanged because ownership and package boundaries did not change. Unrelated server, model and architecture work is excluded from the release.

## Verdict

**Approve** within the coverage above. All ten findings are fixed; no HIGH finding remains in the inspected scope.
