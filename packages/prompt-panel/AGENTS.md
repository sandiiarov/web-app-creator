# Prompt Panel Package DOX

## Purpose

- Owns the landing-page prompt panel UI and the landing conversation domain model it renders. Source-consumed by `@workspace/client` (and reusable by future consumers) via `@workspace/prompt-panel`.

## Ownership

- `src/prompt-panel.tsx`: root `PromptPanel` component and its `PromptPanelProps`.
- `src/`: panel UI components (`panel-header`, `panel-body`, `panel-command-menu`, `composer`, `turn-message`, `turn-metadata`, `turn-steps`, `streamdown-content`, `model-dropdown`, `status-pill`, `chat-empty-state`, icons) and helpers (`panel-constants`, `panel-status`, `format`, `keyboard-shortcut`).
- `src/domain.ts`: landing conversation domain model — model options, attachment types, conversation model (`LandingTurn`, `TurnPart` variants, `RetryPart` inlined), cost/usage types, `LandingAgentSendInput`, and formatting helpers.
- `src/keyboard-shortcuts.ts`: `KEYBOARD_SHORTCUTS` metadata + types.
- `src/index.ts`: public barrel (`PromptPanel`, `PromptPanelProps`, domain model, keyboard-shortcuts, panel-constants types).

## Local Contracts

- Source-consumed like `@workspace/ui`: `exports` point at `./src/*`, there is no build step, and consumers import through package exports (`@workspace/prompt-panel`, `@workspace/prompt-panel/domain`, `@workspace/prompt-panel/keyboard-shortcuts`).
- Depends on `@workspace/ui` and catalog deps (`lucide-react`, `react-hotkeys-hook`, `streamdown`, `@streamdown/code`); `react`/`react-dom` are peer deps. Tailwind design tokens come from `packages/ui/src/styles/globals.css` (referenced by this package's oxlint/oxfmt configs).
- The package owns the **domain model only**. It must not import app code, reference `import.meta.env`, or contain SSE/transport logic. `RetryPart` is defined inline (not extending the app's wire `RetryEvent`) to avoid a package→app dependency.
- App behavior is injected via props, never imported: navigation through `onAllProjects`, theme through `theme: PanelTheme` + `onToggleTheme`. The package imports no `react-router-dom` and no theme context.
- `PanelTheme = 'dark' | 'light' | 'system'` lives in `src/panel-constants.ts`.

## Work Guidance

- Keep `PromptPanel` presentational: state belongs in hooks/consumers; the panel receives data + callbacks. Theme and navigation are passed in from the composition site.
- When the domain model changes, update `src/domain.ts` and re-export from `src/index.ts`; transport/wire shapes stay in the consuming app.

## Verification

- `pnpm --filter @workspace/prompt-panel typecheck`
- `pnpm --filter @workspace/prompt-panel lint`
- `pnpm --filter @workspace/prompt-panel format:check`

## Child DOX Index

- None.
