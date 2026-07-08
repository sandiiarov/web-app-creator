# Landing Preview Package DOX

## Purpose

- Owns the shared landing-page preview iframe runtime: `srcDoc` preparation, same-document DOM morphing, script-rerun detection, in-preview element selection, and browser screenshot capture.
- Source-consumed by `@workspace/client` via `@workspace/landing-preview` so the app renders generated pages through the shared preview path.

## Ownership

- `src/landing-preview.tsx`: `LandingPreview` component (React 19 `ref`-as-prop) and its `LandingPreviewProps`; controls `html` → `srcDoc` + morph, optional element picker, opt-in preview diagnostics, and an imperative `LandingPreviewHandle`.
- `src/browser-screenshot.ts`: `captureElementScreenshot`, `captureProjectScreenshot`, `formatElementMap` (Set-of-Marks formatter), viewport/padding helpers, and screenshot wire types (`ScreenshotResponseInput` with `elementMap`, `ScreenshotViewportSize`, `ScreenshotMediaType`, `SCREENSHOT_VIEWPORT_SIZES`).
- `src/agent-map-plugin.ts`: typed wrapper for the `@zumer/snapdom-plugins` agent-map plugin (the package ships JavaScript only). Exports a cast `agentMap` factory + `AgentMapEntry`/`AgentMapResult`/`AgentMapOptions` shapes (modeled on v2.2.0). A regular module (not an ambient `.d.ts`) so the types travel through the import graph into every source-consuming package.
- `src/preview-morph.ts`: DOM morphing via `morphdom` (catalog dep); `parsePreviewRoot` + `preparePreviewMorphHtml` build the target document, and `getScriptSignature` / `shouldRerunScriptsAfterMorph` / `rerunPreviewScripts` handle script re-execution (morphdom does not run scripts).
- `src/preview-srcdoc.ts`: `preparePreviewSrcDoc` base-tag injection plus unclosed-`<style>` repair (closes unbalanced `<style>` before `<body>` so the parser keeps body content out of the head) used by both initial `srcDoc` and morph targets.
- `src/index.ts`: public barrel over the above modules.
- `src/landing-preview.test.ts`: pure helper tests for base-tag injection, script signature detection, and screenshot viewport/padding helpers.

## Local Contracts

- Source-consumed like `@workspace/ui` and `@workspace/prompt-panel`: `exports` point at `./src/*`, there is no build step, and consumers import through package exports.
- Depends on `@workspace/prompt-panel` for `ElementAttachmentInput` and `ScreenshotMediaType`, on catalog `@zumer/snapdom` for rasterization, on catalog `@zumer/snapdom-plugins` for the `agent-map` Set-of-Marks plugin, and on catalog `morphdom` for preview DOM morphing; `react`/`react-dom` are peer deps.
- Owns preview runtime and screenshot capture only. It must not import app code, reference `import.meta.env`, contain SSE/transport logic, or persist projects. Transport stays in the consuming app.
- Screenshot capture uses the instance `snapdom(el, {plugins})` API (not the static `snapdom.toBlob`, which cannot surface plugin exports) with `agentMap({image:'annotated', fields:'minimal'})`. It returns padded JPEG data URLs with explicit width/height/media type/size PLUS an `elementMap` string (Set-of-Marks: one line per interactive element, `index → role / name / bbox / state`); the consuming app posts both to the server screenshot-response route.
- `LandingPreview` is presentational and controlled: callers own `html`, element-selection state, and diagnostics/error callbacks. Keep new behavior opt-in via props so consuming app UI stays explicit.
- `LandingPreview` exposes a `LandingPreviewHandle` through the React 19 `ref` prop (not `forwardRef`): `captureScreenshot({ selector })` captures the requested element from the live preview iframe and `isReady()` reports document readiness. Do not reintroduce `forwardRef(function …)` — tsgo and oxfmt fail to parse that wrapper inside `.tsx`.
- `iframeClassName?` overrides the default full-viewport iframe sizing so consumers can fit the preview to a container.
- `onPreviewDiagnostic?` is opt-in and best-effort same-origin only: it emits `PreviewDiagnostic` events for iframe `load`, `ready`, runtime `error`, and unhandled promise rejection. It must not break generated-page scripts.

## Work Guidance

- Keep screenshot capture defensive: invalid selectors, missing/zero-size elements, decode failures, and iframe load timeout must throw actionable errors the caller can forward to the server. Oversized elements (any side over 4096) are NOT rejected — `fitScreenshotSize` downscales them (aspect-ratio preserved) so the OCR/vision model receives a model-safe image regardless of element size.
- The `agent-map` plugin runs in `afterClone`: with `image:'annotated'` it mutates the shared clone with numbered badges, so the `result.toBlob()` OCR image carries the badges. The map is read via `result.toAgentMap({image:false})` (no second rasterize). A missing/empty map degrades to `''` and must never fail the capture. On any `@zumer/snapdom` or `@zumer/snapdom-plugins` version bump, re-verify that `result.toAgentMap` is still surfaced (snapdom attaches plugin exports as `to${Capitalize(key)}`).
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
