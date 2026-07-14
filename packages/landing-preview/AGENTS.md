# Landing Preview Package DOX

## Purpose

- Owns shared landing-page preview iframe runtime: `srcDoc` prep, same-document DOM morphing, script-rerun detection, in-preview element selection w/ stable CSS selector generation.
- Source-consumed by `@workspace/client` via `@workspace/landing-preview` so app renders generated pages through shared preview path.

## Ownership

- `src/landing-preview.tsx`: `LandingPreview` component + `LandingPreviewProps`; controls `html` → `srcDoc` + morph, optional element picker (generates stable CSS selector on selection), opt-in preview diagnostics. Exports `buildStableSelector(doc, element)` for testability.
- `src/preview-morph.ts`: DOM morphing via `morphdom` (catalog dep); `parsePreviewRoot` + `preparePreviewMorphHtml` build target doc; `getScriptSignature` / `shouldRerunScriptsAfterMorph` / `rerunPreviewScripts` handle script re-execution (morphdom doesn't run scripts).
- `src/preview-srcdoc.ts`: `preparePreviewSrcDoc` base-tag injection + unclosed-`<style>` repair (closes unbalanced `<style>` before `<body>` so parser keeps body content out of head) used by both initial `srcDoc` + morph targets.
- `src/index.ts`: public barrel over preview utils + component for non-React-boundary consumers.
- `package.json`: exposes `@workspace/landing-preview/react` directly from `src/landing-preview.tsx` as React-only Fast Refresh boundary.
- `src/landing-preview.test.ts`: pure helper tests for base-tag injection + script signature detection.

## Local Contracts

- Source-consumed like `@workspace/ui` + `@workspace/prompt-panel`: `exports` point at `./src/*`, no build step, consumers import through package exports. React renderers must import `LandingPreview` from `@workspace/landing-preview/react`, not mixed utility barrel; component-only Fast Refresh boundary preserves live iframe doc during HMR.
- Depends on `@workspace/prompt-panel` for `ElementAttachmentMeta`, catalog `morphdom` for preview DOM morphing; `react`/`react-dom` are peer deps. No rasterization dep — screenshot capture fully server-owned via Cloudflare Browser Run.
- Owns preview runtime + element selection only. Must not import app code, reference `import.meta.env`, contain SSE/transport logic, persist projects, or rasterize DOM elements. Transport stays in consuming app.
- `buildStableSelector(doc, element)` generates CSS selector that round-trips to exactly target element via `document.querySelector`: prefers unique escaped `#id`; else builds escaped `tag:nth-of-type(n)` ancestry path + verifies uniqueness. Element selection synchronous, never reads `outerHTML` or screenshot bytes.
- `LandingPreview` is presentational + controlled: callers own `html`, element-selection state, diagnostics/error callbacks. Keep new behavior opt-in via props so consuming app UI stays explicit. Opt-in `reloadToken?: number` = controlled reload signal: bumping to new value forces full preview reload rebuilding `srcDoc` from current `html` + remounting iframe (internal `reloadKey` path), so consumer refreshes frame without changing `html`. No-op when omitted, on initial value, or when `html` empty.
- `iframeClassName?` overrides default full-viewport iframe sizing so consumers fit preview to container. Same class applies to `LandingEmptyState` container (merged w/ its centering/background styles), so empty preview tracks consumer's layout same way rendered iframe does.
- `onPreviewDiagnostic?` opt-in, best-effort same-origin only: emits `PreviewDiagnostic` events for iframe `load`, `ready`, runtime `error`, + unhandled promise rejection. Must not break generated-page scripts.

## Work Guidance

- Preserve `about:srcdoc` base-tag behavior so generated `#section` links resolve inside iframe without mutating persisted project HTML.
- Preview diff engine = `morphdom`. Don't reintroduce hand-rolled tree-diff — if morphing misbehaves, lever is morphdom options (`getNodeKey`, `onBeforeNodeAdded`, `onBeforeNodeDiscarded`), not custom walker. Re-verify live e2e (reload + in-place edit) on any `morphdom` major-version bump.
- When preview behavior changes, update `src/` + tests here, verify client still typechecks/lints/builds.

## Verification

- `pnpm --filter @workspace/landing-preview typecheck`
- `pnpm --filter @workspace/landing-preview lint`
- `pnpm --filter @workspace/landing-preview format:check`
- `pnpm --filter @workspace/landing-preview test`

## Child DOX Index

- None.