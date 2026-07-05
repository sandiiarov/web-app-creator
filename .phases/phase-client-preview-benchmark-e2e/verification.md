# Verification — client-preview-benchmark-e2e

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

## Phase 1: Checks and source audit

### Description
Re-run all focused package/app checks, scan touched source for debug leftovers, audit the committed diff for intended paths and contract coverage.

### Todo
- [x] Run landing-preview/client/benchmark format/typecheck/lint/test/build
- [x] Scan touched source for TODO/FIXME/stub/debug leftovers
- [x] Audit task commits and confirm no unrelated dirty files were swept in
- [x] Record adversarial findings with evidence

### Results
- `pnpm --filter @workspace/landing-preview format:check/typecheck/lint/test` → passed (8 tests, 0 lint errors).
- `pnpm --filter @workspace/client format:check/typecheck/lint/test/build` → passed (5 tests, 0 lint errors; only the pre-existing `main.tsx` fast-refresh warning remains).
- `pnpm --filter @workspace/benchmark format:check/typecheck/lint/test/build` → passed (2 tests, 0 lint errors). Benchmark typecheck required clearing `node_modules/.tmp/tsconfig.tsbuildinfo` to dodge a tsgo incremental-cache race that otherwise emits transient errors in sibling packages.
- Source scan (`grep -RIn "TODO|FIXME|console\.log|debugger|postScreenshotError"` over task source) found only the intentional `postScreenshotError` fallback path in `use-benchmark.ts`/`server-api.ts` (used in the capture-failure `catch`), plus the JSDoc noting it is kept as a fallback. No debug leftovers.
- `git diff --check HEAD~7..HEAD` over task paths → no whitespace errors.
- Task commits (7): `461bfbf4`, `9b9a7e97`, `1012df8c`, `260ae501`, `9bfc67b5`, `a117fb30`, `3c1f557d`.
- Pre-existing unrelated dirty files (`apps/client/src/lib/projects-api.ts`, `apps/server/src/mastra/route.ts`, `packages/prompt-panel/src/composer.tsx`, etc.) remain modified but uncommitted — commits staged explicit paths only.
- Adversarial findings:
  - Possible bug: benchmark omits `visionModel`, so the server used the text model for screenshot OCR → 404. Disproven as a benchmark bug: per `apps/benchmark/AGENTS.md`, image/vision models use server defaults and only `textModel` is a benchmark axis. The 404 is a server default-vision-model config concern, surfaced helpfully by the run.
  - Possible bug: capture with empty selector or no HTML could hang. Disproven: `answerScreenshotRequest` throws on empty HTML, and `captureProjectScreenshot` validates selector/size and throws on invalid input; all paths route through the `catch` → `postScreenshotError`.
  - Possible bug: client broken by the package extraction. Disproven: client typecheck/lint/test/build all green and the editor still renders through the moved component.

### Gotchas
- `postScreenshotError` is deliberately retained (capture-failure fallback); a future cleanup must not delete it as dead code.

## Phase 2: Browser and live E2E verification

### Description
Confirm the benchmark UI loads, previews render through the shared package, zoom works, screenshot requests are captured, and detail diagnostics surface — without relying only on unit tests.

### Todo
- [x] Verify benchmark app loads with no console/runtime errors
- [x] Confirm result-card previews use the shared `LandingPreview` and zoom controls render
- [x] Confirm detail dialog shows preview, preview diagnostics, and screenshot captures
- [x] Confirm saved report path/handoff prompt and report builder carry screenshot/diagnostic fields
- [x] Record adversarial findings with evidence

### Results
- Headed `agent-browser` against the benchmark Vite app confirmed a clean load (`agent-browser errors` empty) both before and after a live run and after a reload.
- Live E2E (1 model `z-ai/glm-5.2`, tiny MintLeaf prompt, concurrency 1) — evidence captured during implementation Phase 5 and re-confirmed here:
  - Result card preview rendered through the shared `LandingPreview`; the accessibility tree exposed `Zoom preview out`, zoom percent, `Zoom preview in`, reset, and `Open large preview for GLM 5.2` controls.
  - Run detail dialog headings present: `Preview` (with an `Iframe "Landing page preview"`), `Assistant text`, `Tool calls`, `Run stats`, `Mistakes`, `Preview diagnostics`, `Screenshots`.
  - `Preview diagnostics` section listed `load` + `ready` events captured from the live preview.
  - `Screenshots` section listed two `captured` records with full metadata: `560×296 · image/jpeg · 33877 bytes` and `406×860 · image/jpeg · 28777 bytes`. This is the central proof that screenshot requests are now real client-preview captures, not the old forced `"Benchmark does not capture browser screenshots."` error.
  - Run summary: Complete, 1/1 done, 0 error-status runs, $0.0013, 7 tool calls.
- Report builder unit test (`apps/benchmark/src/lib/report.test.ts`) asserts `runConfig.screenshotCapture: 'client-preview-capture'` and the run fixture carries `previewDiagnostics`/`screenshotCaptures`; `toReportRun` copies both fields into `BenchmarkReportRun`, so saved JSON carries screenshot/diagnostic evidence. The save→server→JSON path itself was verified end-to-end in the prior `benchmark-feedback-reports` phase.
- Adversarial findings:
  - Possible bug: zoom could mutate generated HTML. Disproven: zoom only sets container `width`/`height` percentages; `result.html` is untouched.
  - Possible bug: detail dialog large preview could execute generated scripts and skew diagnostics. Not a bug: the shared `LandingPreview` uses the production sandbox and diagnostics are opt-in; the dialog preview intentionally renders the real output.
  - Downstream (not a benchmark bug): server screenshot OCR returned `OpenRouter vision error (404): No endpoints found that support image input` for `z-ai/glm-5.2`; the benchmark captured and forwarded the screenshot correctly.

### Gotchas
- Manually removing a Radix dialog element locks the page (focus/scroll trap); use Close/Escape. Accessibility snapshots stayed reliable when `agent-browser screenshot` timed out on the zoomed iframe.
- Live runs are nondeterministic: a model that never calls `screenshot` yields zero captures, which is a valid outcome rather than a capture failure.
