# Prompt Panel Package DOX

## Purpose

- Owns the landing-page prompt panel UI and the landing conversation domain model it renders. Source-consumed by `@workspace/client` (and reusable by future consumers) via `@workspace/prompt-panel`.

## Ownership

- `src/prompt-panel.tsx`: root `PromptPanel` component, its `PromptPanelProps`, the horizontal-resize `ResizeState`/handlers, and the `PanelResizeHandle` edge handles.
- `src/`: panel UI components (`panel-header`, `panel-body`, `panel-command-menu`, `composer`, `turn-message`, `turn-metadata`, `turn-steps`, `streamdown-content`, `model-dropdown`, `status-pill`, `chat-empty-state`, icons) and helpers (`panel-constants`, `panel-status`, `panel-storage`, `format`, `keyboard-shortcut`).
- `src/panel-storage.ts`: read-only panel position/layout persistence — owns the `landing.promptPanel.position.v1` localStorage key, `StoredPanelState` (`x`/`y`, `collapsed`, `layout`, `width`), `readStoredPanelState`, and the public `readStoredPanelLayout` (effective layout, treating a collapsed panel as `floating` so a minimized panel does not reserve a docked column) and `readStoredPanelWidth`. The component keeps write logic (`writeStoredPanelState`) because it is intertwined with docked-side derivation.
- `src/domain.ts`: landing conversation domain model — model options (text `LANDING_MODEL_OPTIONS`, plus `LANDING_VISION_MODEL_OPTIONS` and `LANDING_IMAGE_MODEL_OPTIONS`), the per-category `LandingModels` selection + `DEFAULT_LANDING_MODELS` + `resolveLandingModels`, attachment types, conversation model (`LandingTurn`, `TurnPart` variants, `RetryPart` inlined), cost/usage types, `LandingAgentSendInput`, and formatting helpers.
- `src/keyboard-shortcuts.ts`: `KEYBOARD_SHORTCUTS` metadata + types.
- `src/index.ts`: public barrel (`PromptPanel`, `PromptPanelProps`, `readStoredPanelLayout`, `readStoredPanelWidth`, `PANEL_WIDTH`, `MIN_PANEL_WIDTH`, `maxPanelWidth`, `clampPanelWidth`, `DEFAULT_PREVIEW_VIEWPORT`, `PREVIEW_VIEWPORTS`, domain model, keyboard-shortcuts, panel-constants types including `PreviewViewport`).

## Local Contracts

- Source-consumed like `@workspace/ui`: `exports` point at `./src/*`, there is no build step, and consumers import through package exports (`@workspace/prompt-panel`, `@workspace/prompt-panel/domain`, `@workspace/prompt-panel/keyboard-shortcuts`).
- Depends on `@workspace/ui` and catalog deps (`lucide-react`, `react-hotkeys-hook`, `streamdown`, `@streamdown/code`); `react`/`react-dom` are peer deps. Tailwind design tokens come from `packages/ui/src/styles/globals.css` (referenced by this package's oxlint/oxfmt configs).
- The package owns the **domain model only**. It must not import app code, reference `import.meta.env`, or contain SSE/transport logic. `RetryPart` is defined inline (not extending the app's wire `RetryEvent`) to avoid a package→app dependency.
- App behavior is injected via props, never imported: navigation through `onAllProjects`, theme through `theme: PanelTheme` + `onToggleTheme`, the current effective layout through the optional `onLayoutChange?: (layout: PanelLayout) => void` (reports `floating`/`left-sidebar`/`right-sidebar`; a collapsed panel reports `floating`), and the selected preview viewport through the controlled pair `viewport: PreviewViewport` + `onViewportChange` (consumer-owned; not persisted by the panel). `readStoredPanelLayout` lets a consumer initialize its own preview layout from the persisted state without a first-paint flash. The package imports no `react-router-dom` and no theme context.
- Dropdown-menu triggers in `src/panel-command-menu.tsx` (`PanelLayoutMenu`, `PreviewViewportMenu`, `PanelSettingsMenu`) wrap their `DropdownMenuTrigger` in a Radix `Tooltip`. Each menu controls its own `open` state (`PanelLayoutMenu` via the parent-controlled `open` prop; the others via local `useState`) and binds `Tooltip open={open ? false : undefined}` so the tooltip is forced closed while the menu is open — without this the tooltip lingers/overlaps the menu content, because the pointer stays hovered on the stationary trigger and the `TooltipProvider` uses `delayDuration={0}`. `PreviewViewportMenu`'s trigger icon reflects the current selection (`Monitor`/`Tablet`/`Smartphone`); choices render as plain menu items without checkbox/radio indicators. Reuse this pattern for any new header dropdown that has a tooltip on its trigger.
- `PanelTheme = 'dark' | 'light' | 'system'` lives in `src/panel-constants.ts`, alongside `PreviewViewport` (`'desktop' | 'mobile' | 'tablet'`), the ordered `PREVIEW_VIEWPORTS` list, `DEFAULT_PREVIEW_VIEWPORT` (`'desktop'`), `MIN_PANEL_WIDTH` (default `PANEL_WIDTH` equals the min), `maxPanelWidth()` (half the viewport, the max), `clampPanelWidth(width, max?)`, and `PANEL_WIDTH_CSS_VAR` (the `--landing-panel-width` custom-property name).
- The panel is horizontally resizable from both edges. Its rendered width **is** the `--landing-panel-width` CSS custom property, registered as a typed `@property` in `packages/ui` globals (CSS `initial-value` default, so no JS is required for the first paint and it can be `transition`ed later) — the panel never sets width from a React inline value. The numeric width lives in a ref (no React width state, no re-render during the gesture); `setPanelWidthVar` writes the var on `:root` on mount and while resizing, and the width persists via `writeStoredPanelState`. Resize mirrors the position drag: pointer-captured, rAF-throttled, direct-DOM writes during the gesture, committed on pointerup. The right-edge handle pins the panel left; the left-edge handle pins the panel right (and repositions `left`); each is clamped to `[MIN_PANEL_WIDTH, maxPanelWidth()]` and to the available viewport so the panel cannot overflow. The `data-resizing` attribute on the section is the hook to disable that transition during a drag.
- Cost formatting renders USD with exactly four digits after the decimal point for zero, tiny, and larger costs; do not use less-than-cent shorthand.

## Work Guidance

- Keep `PromptPanel` presentational: state belongs in hooks/consumers; the panel receives data + callbacks. Theme and navigation are passed in from the composition site.
- When the domain model changes, update `src/domain.ts` and re-export from `src/index.ts`; transport/wire shapes stay in the consuming app.
- `src/model-dropdown.tsx` renders one outline trigger showing all three role selections side by side (text, image, vision) as two-icon segments — a lucide role icon plus the selected model's provider logo — separated by dividers, each with a tooltip showing `[provider logo] model name` (relies on the app-level TooltipProvider). It opens a menu whose top is a segmented toggle (`[Icon] Text | [Icon] Image | [Icon] Vision`, lucide role icons) that switches which role's single radio list shows below. Only the active role's model list renders. Brand icons map by model id in `MODEL_ICONS`; add a per-id entry as new provider logos land.

## Verification

- `pnpm --filter @workspace/prompt-panel typecheck`
- `pnpm --filter @workspace/prompt-panel lint`
- `pnpm --filter @workspace/prompt-panel format:check`

## Child DOX Index

- None.
