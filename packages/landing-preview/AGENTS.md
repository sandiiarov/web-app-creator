# Landing Preview Package DOX

## Purpose

- Owns the shared landing-page preview iframe runtime: `srcDoc` preparation, same-document DOM morphing, script-rerun detection, in-preview element selection, and browser screenshot capture.
- Source-consumed by `@workspace/client` and `@workspace/benchmark` via `@workspace/landing-preview` so both apps render generated pages through the same client preview path.

## Ownership

- `src/landing-preview.tsx`: `LandingPreview` component (React 19 `ref`-as-prop) and its `LandingPreviewProps`; controls `html` → `srcDoc` + morph, optional element picker, opt-in preview diagnostics, and an imperative `LandingPreviewHandle`.
- `src/browser-screenshot.ts`: `captureElementScreenshot`, `captureProjectScreenshot`, viewport/padding helpers, and screenshot wire types (`ScreenshotResponseInput`, `ScreenshotViewportSize`, `ScreenshotMediaType`, `SCREENSHOT_VIEWPORT_SIZES`).
- `src/preview-morph.ts`: DOM morphing, script signature comparison, and script rerun helpers.
- `src/preview-srcdoc.ts`: `preparePreviewSrcDoc` base-tag injection used by both initial `srcDoc` and morph targets.
- `src/index.ts`: public barrel over the above modules.
- `src/landing-preview.test.ts`: pure helper tests for base-tag injection, script signature detection, and screenshot viewport/padding helpers.

## Local Contracts

- Source-consumed like `@workspace/ui` and `@workspace/prompt-panel`: `exports` point at `./src/*`, there is no build step, and consumers import through package exports.
- Depends on `@workspace/prompt-panel` for `ElementAttachmentInput` and `ScreenshotMediaType`, and on catalog `@zumer/snapdom` for rasterization; `react`/`react-dom` are peer deps.
- Owns preview runtime and screenshot capture only. It must not import app code, reference `import.meta.env`, contain SSE/transport logic, or persist projects. Transport stays in the consuming app.
- Screenshot capture returns padded JPEG data URLs with explicit width/height/media type/size; the consuming app posts them to the server screenshot-response route.
- `LandingPreview` is presentational and controlled: callers own `html`, element-selection state, and diagnostics/error callbacks. Keep new behavior opt-in via props so the production client does not inherit benchmark-only UI.
- `LandingPreview` exposes a `LandingPreviewHandle` through the React 19 `ref` prop (not `forwardRef`): `captureScreenshot({ selector })` captures the requested element from the live preview iframe and `isReady()` reports document readiness. Do not reintroduce `forwardRef(function …)` — tsgo and oxfmt fail to parse that wrapper inside `.tsx`.
- `iframeClassName?` overrides the default full-viewport iframe sizing so consumers (e.g. benchmark cards) can fit the preview to a container.
- `onPreviewDiagnostic?` is opt-in and best-effort same-origin only: it emits `PreviewDiagnostic` events for iframe `load`, `ready`, runtime `error`, and unhandled promise rejection. It must not break generated-page scripts.

## Work Guidance

- Keep screenshot capture defensive: invalid selectors, missing/zero-size elements, decode failures, iframe load timeout, and dimensions over 4096 must throw actionable errors the caller can forward to the server.
- Preserve the `about:srcdoc` base-tag behavior so generated `#section` links resolve inside the iframe without mutating persisted project HTML.
- When preview behavior changes, update `src/` plus tests here, and verify both client and benchmark still typecheck/lint/build.

## Verification

- `pnpm --filter @workspace/landing-preview typecheck`
- `pnpm --filter @workspace/landing-preview lint`
- `pnpm --filter @workspace/landing-preview format:check`
- `pnpm --filter @workspace/landing-preview test`

## Child DOX Index

- None.
