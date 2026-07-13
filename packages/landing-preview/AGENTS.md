# Landing Preview Package DOX

## Purpose

- Owns the shared landing-page preview iframe runtime: `srcDoc` preparation, same-document DOM morphing, script-rerun detection, and in-preview element selection with stable CSS selector generation.
- Source-consumed by `@workspace/client` via `@workspace/landing-preview` so the app renders generated pages through the shared preview path.

## Ownership

- `src/landing-preview.tsx`: `LandingPreview` component and its `LandingPreviewProps`; controls `html` → `srcDoc` + morph, optional element picker (generates a stable CSS selector on selection), and opt-in preview diagnostics. Exports `buildStableSelector(doc, element)` for testability.
- `src/preview-morph.ts`: DOM morphing via `morphdom` (catalog dep); `parsePreviewRoot` + `preparePreviewMorphHtml` build the target document, and `getScriptSignature` / `shouldRerunScriptsAfterMorph` / `rerunPreviewScripts` handle script re-execution (morphdom does not run scripts).
- `src/preview-srcdoc.ts`: `preparePreviewSrcDoc` base-tag injection plus unclosed-`<style>` repair (closes unbalanced `<style>` before `<body>` so the parser keeps body content out of the head) used by both initial `srcDoc` and morph targets.
- `src/index.ts`: public barrel over the preview utilities and component for non-React-boundary consumers.
- `package.json`: exposes `@workspace/landing-preview/react` directly from `src/landing-preview.tsx` as the React-only Fast Refresh boundary.
- `src/landing-preview.test.ts`: pure helper tests for base-tag injection and script signature detection.

## Local Contracts

- Source-consumed like `@workspace/ui` and `@workspace/prompt-panel`: `exports` point at `./src/*`, there is no build step, and consumers import through package exports. React renderers must import `LandingPreview` from `@workspace/landing-preview/react`, not the mixed utility barrel; the component-only Fast Refresh boundary preserves the live iframe document during HMR.
- Depends on `@workspace/prompt-panel` for `ElementAttachmentMeta`, and on catalog `morphdom` for preview DOM morphing; `react`/`react-dom` are peer deps. No rasterization dependency — screenshot capture is fully server-owned via Cloudflare Browser Run.
- Owns preview runtime and element selection only. It must not import app code, reference `import.meta.env`, contain SSE/transport logic, persist projects, or rasterize DOM elements. Transport stays in the consuming app.
- `buildStableSelector(doc, element)` generates a CSS selector that round-trips to exactly the target element via `document.querySelector`: prefers a unique escaped `#id`; otherwise builds an escaped `tag:nth-of-type(n)` ancestry path and verifies uniqueness. Element selection is synchronous and never reads `outerHTML` or screenshot bytes.
- `LandingPreview` is presentational and controlled: callers own `html`, element-selection state, and diagnostics/error callbacks. Keep new behavior opt-in via props so consuming app UI stays explicit.
- `iframeClassName?` overrides the default full-viewport iframe sizing so consumers can fit the preview to a container. The same class also applies to the `LandingEmptyState` container (merged with its centering/background styles), so an empty preview tracks the consumer's layout the same way a rendered iframe does.
- `onPreviewDiagnostic?` is opt-in and best-effort same-origin only: it emits `PreviewDiagnostic` events for iframe `load`, `ready`, runtime `error`, and unhandled promise rejection. It must not break generated-page scripts.

## Work Guidance

- Preserve the `about:srcdoc` base-tag behavior so generated `#section` links resolve inside the iframe without mutating persisted project HTML.
- The preview diff engine is `morphdom`. Do not reintroduce a hand-rolled tree-diff — if morphing misbehaves, the lever is morphdom options (`getNodeKey`, `onBeforeNodeAdded`, `onBeforeNodeDiscarded`), not a custom walker. Re-verify live e2e (reload + an in-place edit) on any `morphdom` major-version bump.
- When preview behavior changes, update `src/` plus tests here, and verify the client still typechecks/lints/builds.

## Verification

- `pnpm --filter @workspace/landing-preview typecheck`
- `pnpm --filter @workspace/landing-preview lint`
- `pnpm --filter @workspace/landing-preview format:check`
- `pnpm --filter @workspace/landing-preview test`

## Child DOX Index

- None.
