# UI Package DOX

## Purpose

- Shared React UI component package built from shadcn/ui components and Tailwind v4 globals.

## Ownership

- `src/components/`: reusable UI primitives/components exported as `@workspace/ui/components/*`.
- `src/lib/utils.ts`: shared `cn()` utility.
- `src/styles/globals.css`: Tailwind v4 imports, theme tokens, app source scanning, base styles, and UI utilities.
- `components.json`: shadcn config for this package.

## Local Contracts

- Public consumers import through `@workspace/ui/components/*`, `@workspace/ui/lib/*`, `@workspace/ui/hooks/*`, or `@workspace/ui/globals.css`.
- Internal imports use `#components`, `#hooks`, and `#lib` aliases.
- Add shadcn components through the client config when generating for the app: `pnpm dlx shadcn@latest add <component> -c apps/client`.
- Keep Tailwind theme/global CSS centralized in `src/styles/globals.css`; do not create competing global stylesheets.
- Preserve the current `radix-lyra`, Tailwind v4, Lucide icon setup unless the preset is intentionally changed.

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
