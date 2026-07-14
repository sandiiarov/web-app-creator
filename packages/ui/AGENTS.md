# UI Package DOX

## Purpose
- Shared React UI pkg, shadcn/ui + Tailwind v4 globals.

## Ownership
- `src/components/`: reusable UI primitives, exported `@workspace/ui/components/*`.
- `src/lib/utils.ts`: shared `cn()`.
- `src/styles/globals.css`: Tailwind v4 imports, theme tokens, source scan, base styles, UI utils (incl `landing-grid-bg` 10px grid applied by `@workspace/client` behind centered previews), registered `@property --landing-panel-width` (owned by/for `@workspace/prompt-panel`), landing layout transitions (`[data-landing-prompt-panel]` `height`; `[data-landing-preview-area]` `margin`/`width`, disabled under `:has([data-resizing])`).
- `components.json`: shadcn config for pkg.

## Local Contracts
- Public consumers import via `@workspace/ui/components/*`, `@workspace/ui/lib/*`, `@workspace/ui/hooks/*`, `@workspace/ui/globals.css`.
- Internal imports: `#components`, `#hooks`, `#lib`.
- Add shadcn components via client config: `pnpm dlx shadcn@latest add <component> -c apps/client`.
- Keep Tailwind theme/global CSS centralized in `src/styles/globals.css`; no competing global sheets. Include source-consumed workspace pkg paths (e.g. `packages/prompt-panel/src`) + external runtime `dist/*.js` paths in `@source` list so Tailwind emits all classes.
- `src/styles/globals.css` registers `@property --landing-panel-width` (`syntax: '<length>'`, `inherits: true`, `initial-value` = default panel width). Runtime width of prompt panel + docked preview offset; `@workspace/prompt-panel` writes/owns it — don't redefine/drive elsewhere.
- `src/styles/globals.css` owns landing editor layout transitions: `[data-landing-prompt-panel]` transitions `height` (only on dock/undock/collapse, always safe); `[data-landing-preview-area]` transitions dock offset (`margin`/`width`) — disabled under `[data-project-id]:has([data-resizing])` so offset tracks `--landing-panel-width` exactly while panel width-resized. Hooks `data-landing-prompt-panel`, `data-landing-preview-area`, `data-resizing` set by `@workspace/prompt-panel` / `@workspace/client`.
- Preserve current `radix-lyra`, Tailwind v4, Lucide icon setup unless preset intentionally changed.
- `TooltipProvider` (in `src/components/tooltip.tsx`) defaults `delayDuration=0` + `disableHoverableContent=true`. They interact: `delayDuration=0` + hoverable on (Radix default) → moving between adjacent triggers leaves prev tooltip open during grace while next opens instantly → stack/swap. Tooltips here non-interactive (label + `kbd` hint) so hoverable disabled by default; consumer can override `disableHoverableContent={false}` per provider if needs interactive tooltip. Dropdown-trigger tooltips that also open menu must force-close on open (`Tooltip open={open ? false : undefined}`), owned at trigger site.

## Work Guidance
- Use existing shadcn components first, follow shadcn rules: semantic colors, `gap-*` not `space-*`, `size-*` for square dims, `cn()` for conditional classes, no raw color overrides, accessible overlay titles.
- For component create/fix, check shadcn docs before guessing APIs.
- Keep components reusable + app-agnostic; product-specific layout in `apps/client`.

## Verification
- `pnpm --filter @workspace/ui typecheck`
- `pnpm --filter @workspace/ui lint`
- `pnpm --filter @workspace/ui format:check`

## Child DOX Index
- None.