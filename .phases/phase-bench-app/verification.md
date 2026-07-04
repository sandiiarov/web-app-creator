# Verification — bench-app

Status: Complete
Prerequisite: implementation.md `Status: Complete`

> **Purpose:** adversarial review of the finished result. Don't trust green checks alone — actively hunt for what's wrong.

## Guidance

- **Re-run every check** from research, from the implementation worktree. List each command and its actual result — don't summarize "all tests passed" unless each command is listed individually with evidence.
- **Adversarial doubt.** List concrete possible errors (requirement mismatch, missing test, boundary case, integration break, scope leak, debug leftover, stub/TODO left in). For each, prove it or disprove it with evidence — a failing test, an exact code path, or a spec contradiction. A suspicion with no proof is not a bug.
- **Passing tests are evidence, not acceptance.** A green suite does not prove the result is correct or complete.
- **Inspect the diff** for debug logs, scratch files, TODOs, and stubs before declaring done.
- **Resolve each finding:** `proven bug` → loop back (below), `disproven` → no action, or `not a bug` → valid as-is. Record the call with evidence.

## If a check fails or you find a real bug → loop back to implementation

This is the only allowed backward move:

1. Append a new `## Phase N` to **implementation.md** (do not reopen an already-Complete phase). Set its **Description** to what's broken and its **Todo** to the concrete fix steps.
2. Work that sub-phase to `Complete`, following the same commit rule — each fix todo gets its own commit.
3. Set implementation.md back to `Complete` only when the fix sub-phase is done.
4. Return here and re-verify. Repeat until no `proven bug` remains.

## Phase 1: Final app and browser verification

### Description
Re-run focused benchmark checks, inspect for debug/stub leftovers, verify DOX, and smoke-test the rendered app with headed `agent-browser`.

### Todo
- [x] Run `pnpm --filter @workspace/benchmark typecheck`
- [x] Run `pnpm --filter @workspace/benchmark lint`
- [x] Run `pnpm --filter @workspace/benchmark format:check`
- [x] Run `pnpm --filter @workspace/benchmark build`
- [x] Scan benchmark sources/docs for TODO/FIXME/stub/scaffold leftovers
- [x] Run `git diff --check -- apps/benchmark apps/AGENTS.md .phases/phase-bench-app pnpm-lock.yaml`
- [x] Run headed `agent-browser` smoke test on the benchmark Vite app
- [x] Confirm no benchmark-owned proven bugs remain

### Results
- `pnpm --filter @workspace/benchmark typecheck` → passed (`tsgo --noEmit -p tsconfig.json`).
- `pnpm --filter @workspace/benchmark lint` → passed (`0` lint errors).
- `pnpm --filter @workspace/benchmark format:check` → passed (`Finished in 213ms on 20 files`).
- `pnpm --filter @workspace/benchmark build` → passed (`dist/index.html`, `✓ built in 352ms`).
- `grep -RIn "TODO\|FIXME\|stub\|scaffold" apps/benchmark/src apps/benchmark/AGENTS.md` → no matches.
- `git diff --check -- apps/benchmark apps/AGENTS.md .phases/phase-bench-app pnpm-lock.yaml` → no whitespace/errors.
- Headed browser smoke test:
  - Started/used Vite benchmark dev server at `http://localhost:5175/`.
  - `agent-browser close`, then `agent-browser open --headed http://localhost:5175` successfully opened the headed browser session.
  - Snapshot showed `Landing Page Benchmark`, two prompt textareas, four text-model checkboxes, concurrency spinbutton, and `Run benchmark` button.
  - Safe interactions passed: toggled `Nemotron Ultra` unchecked and changed concurrency from `1` to `2`; snapshot reflected the new states.
  - `agent-browser console` after load/interactions showed only normal Vite connect messages and React DevTools info; `agent-browser errors` showed no benchmark page errors.

### Gotchas
- Did not click `Run benchmark` during headed smoke testing because the real server was running at `localhost:3001`; pressing Run would start live OpenRouter calls. A live 1×1 smoke run should be done separately when model spend is explicitly acceptable.

## Phase 2: Visual regression verification after screenshot-found bugs

### Description
Verify fixes for the user-provided screenshots: collapsed detail tool-call layout, misleading in-progress report metrics, fixed header/footer with scrollable content panes, and the requested light/dark theme toggle.

### Todo
- [x] Run a reduced live benchmark matrix in headed `agent-browser`
- [x] Capture running report screenshot and confirm unfinished metrics do not show fake averages
- [x] Open run detail dialog and capture screenshot to confirm readable tool-call rows
- [x] Confirm dialog header/footer stay fixed while the middle content area scrolls
- [x] Confirm desktop app shell keeps the top header and sidebar footer fixed while content areas scroll
- [x] Toggle light/dark theme and capture screenshots
- [x] Re-run focused benchmark gates

### Results
- Reduced live matrix: one selected text model (`GLM 5.2`) with two short prompts, concurrency `1`.
- Running report screenshot: `/Users/alexsandiiarov/.pi/agent/sessions/web-app-creator/pi-session-scripts/visual-qa/benchmark-running-fixed.png`.
  - Verified unfinished rows show State `Running`, score `—`, avg issues `—`, avg time `—`, avg cost `—`; tool calls still update live.
- Detail dialog screenshot before explicit max-width override: `/Users/alexsandiiarov/.pi/agent/sessions/web-app-creator/pi-session-scripts/visual-qa/benchmark-detail-fixed.png`.
- Final wide detail dialog screenshot: `/Users/alexsandiiarov/.pi/agent/sessions/web-app-creator/pi-session-scripts/visual-qa/benchmark-detail-wide-fixed.png`.
  - Verified the dialog is wide, header/metric/footer rows remain fixed, and the middle area scrolls; tool-call rows no longer collapse into a skinny strip.
- Theme screenshots:
  - Dark state with toggle visible: `/Users/alexsandiiarov/.pi/agent/sessions/web-app-creator/pi-session-scripts/visual-qa/benchmark-header-toggle-light.png`.
  - Light state after toggle click: `/Users/alexsandiiarov/.pi/agent/sessions/web-app-creator/pi-session-scripts/visual-qa/benchmark-header-toggle-light-after-click.png`.
- `agent-browser console` showed only Vite/React development messages; `agent-browser errors` showed no benchmark page errors.
- Stopped the live benchmark run with keyboard activation (`focus` + `Enter`) to avoid further model spend.
- Focused benchmark gates passed after final changes:
  - `pnpm --filter @workspace/benchmark format:check` → passed (`Finished in 208ms on 20 files`).
  - `pnpm --filter @workspace/benchmark typecheck` → passed (`tsgo --noEmit -p tsconfig.json`).
  - `pnpm --filter @workspace/benchmark lint` → passed (`0` errors).
  - `pnpm --filter @workspace/benchmark build` → passed (`✓ built in 321ms`).

### Gotchas
- `agent-browser click` did not reliably activate Run/Stop in this state, but keyboard activation did and is a valid accessibility path. The screenshot-visible layout issues are resolved.
