# UI Package DOX

## Purpose

- Shared React UI component package built from shadcn/ui components and Tailwind v4 globals.

## Ownership

- `src/components/`: reusable UI primitives/components exported as `@workspace/ui/components/*`.
- `src/lib/utils.ts`: shared `cn()` utility.
- `src/styles/globals.css`: Tailwind v4 imports, theme tokens, app source scanning, base styles, UI utilities, and the registered `@property --landing-panel-width` (owned by/for `@workspace/prompt-panel`).
- `components.json`: shadcn config for this package.

## Local Contracts

- Public consumers import through `@workspace/ui/components/*`, `@workspace/ui/lib/*`, `@workspace/ui/hooks/*`, or `@workspace/ui/globals.css`.
- Internal imports use `#components`, `#hooks`, and `#lib` aliases.
- Add shadcn components through the client config when generating for the app: `pnpm dlx shadcn@latest add <component> -c apps/client`.
- Keep Tailwind theme/global CSS centralized in `src/styles/globals.css`; do not create competing global stylesheets. Include source-consumed workspace package paths (for example `packages/prompt-panel/src`) plus any external runtime package `dist/*.js` paths in this file's `@source` list so Tailwind emits every class used by consumers.
- `src/styles/globals.css` registers `@property --landing-panel-width` (`syntax: '<length>'`, `inherits: true`, `initial-value` = the default panel width). It is the runtime width of the prompt panel and the docked preview offset; `@workspace/prompt-panel` writes its value and owns it — do not redefine or drive it from anywhere else.
- Preserve the current `radix-lyra`, Tailwind v4, Lucide icon setup unless the preset is intentionally changed.
- `TooltipProvider` (in `src/components/tooltip.tsx`) defaults `delayDuration=0` and `disableHoverableContent=true`. The two interact: with `delayDuration=0` and hoverable content enabled (the Radix default), moving between adjacent triggers leaves the previous tooltip open during its grace period while the next opens instantly, so tooltips stack/swap. Tooltips across this app are non-interactive (label + `kbd` hint), so hoverable content is disabled by default; a consumer can still override `disableHoverableContent={false}` per provider if it later needs an interactive tooltip. Dropdown-trigger tooltips that also open a menu must additionally force-close on open (`Tooltip open={open ? false : undefined}`), owned at the trigger site.

## Work Guidance

- Use existing shadcn components first and follow shadcn rules: semantic colors, `gap-*` instead of `space-*`, `size-*` for square dimensions, `cn()` for conditional classes, no raw color overrides, and accessible overlay titles.
- For component creation/fixes, check shadcn component docs before guessing APIs.
- Keep components reusable and app-agnostic; product-specific layout belongs in `apps/client`.

## Verification

- `pnpm --filter @workspace/ui typecheck`
- `pnpm --filter @workspace/ui lint`
- `pnpm --filter @workspace/ui format:check`

## Child DOX Index

- None.
