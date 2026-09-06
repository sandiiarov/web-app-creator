# UI Package DOX

## Purpose

- Shared React UI pkg, shadcn/ui + Tailwind v4 globals.

## Ownership

- `src/components/`: reusable UI primitives, exported `@workspace/ui/components/*`.
- `src/lib/utils.ts`: shared `cn()`.
- `src/styles/globals.css`: Tailwind v4 imports, theme tokens, source scan, base styles, glass material, and workspace layout. Owns typed `--landing-panel-width` (352px default), preview dock-offset transitions, assistant open/close/launcher transitions, frame arrival, press/hover feedback, and reduced-motion/transparency fallbacks.
- Design system: liquid glass in neutral silver light mode and charcoal dark mode, amber primary, system sans typography, semantic status colors. All rectangular app surfaces and controls use 0px corners, including panels, launcher, dialogs, menus, inputs, cards, and preview frames; circular identity marks and status dots retain their natural shape. Material tokens and liquid-glass/dropdown-glass/dialog-glass utilities own translucency, inset highlights, and elevation. Menus use a denser tint than workspace surfaces to remain readable over generated content. Reduced motion and reduced transparency preferences, plus a no-backdrop-filter fallback, are centralized here.
- Input and Textarea placeholders use the full muted-foreground token for readable contrast; error text uses destructive-foreground, reserving destructive for surfaces/borders. Library and switcher search and project rename inputs use at least 16px text below 768px to avoid input zoom.
- Chat chrome is deliberately compact: 34px header (46px for touch), 28px desktop header controls, 12px conversation padding, and a small starter section. Preserve larger touch targets and bounded scrolling references; conversation and input take priority over decoration.
- Product style hooks cover the compact project library (thumbnail rows, aligned columns, search/filter tools, and mobile metadata reflow), edge-to-edge editor, unified assistant header/menu/composer/launcher, and empty canvas. Component container rules adapt narrow panels/previews. Mobile keeps the live page beneath a Compact/Expanded assistant overlay. Attachment references scroll within a bounded area; input and Send remain visible. visualViewport height/inset variables keep the overlay above the keyboard. Projects, project title, and page actions stay in the assistant; no auxiliary toolbar. Both desktop dock positions fill the viewport height.
- `components.json`: shadcn config for pkg.

## Local Contracts

- Public consumers import via `@workspace/ui/components/*`, `@workspace/ui/lib/*`, `@workspace/ui/hooks/*`, `@workspace/ui/globals.css`.
- Internal imports: `#components`, `#hooks`, `#lib`.
- Add shadcn components via client config: `pnpm dlx shadcn@latest add <component> -c apps/client`.
- Keep Tailwind theme/global CSS centralized in `src/styles/globals.css`; no competing global sheets. Include source-consumed workspace pkg paths (e.g. `packages/prompt-panel/src`) + external runtime `dist/*.js` paths in `@source` list so Tailwind emits all classes.
- `src/styles/globals.css` registers `@property --landing-panel-width` (`syntax: '<length>'`, `inherits: true`, `initial-value` = default panel width). Runtime width of prompt panel + docked preview offset; `@workspace/prompt-panel` writes/owns it — don't redefine/drive elsewhere.
- Assistant arrival animates opacity/transform; repeated conversation/project-view switches are immediate to preserve continuity. Collapsing hides only the conversation and preserves the mounted header/composer. Preview dock offsets track `--landing-panel-width` and disable transitions under resizing. `data-viewport` selects a brief frame reveal without replacing the iframe. `src/lib/motion-preference.ts` owns none/reduced/standard/enhanced preferences (`workspace.motion.v1`), synchronizes consumers/tabs, and applies `data-motion` to the root. The app theme provider initializes it; the assistant settings slider updates it. OS reduced motion overrides all manual choices. Never animate or restyle generated iframe content from app chrome.
- Preserve current `radix-lyra`, Tailwind v4, Lucide icon setup unless preset intentionally changed. Keep existing primitives on Radix; apply the shared glass recipes without switching primitive libraries.
- `TooltipProvider` (in `src/components/tooltip.tsx`) defaults `delayDuration=0` + `disableHoverableContent=true`. They interact: `delayDuration=0` + hoverable on (Radix default) → moving between adjacent triggers leaves prev tooltip open during grace while next opens instantly → stack/swap. Tooltips here non-interactive (label + `kbd` hint) so hoverable disabled by default; consumer can override `disableHoverableContent={false}` per provider if needs interactive tooltip. Dropdown-trigger tooltips that also open menu must force-close on open (`Tooltip open={open ? false : undefined}`), owned at trigger site.

## Work Guidance

- Use existing shadcn components first, follow shadcn rules: semantic colors, `gap-*` not `space-*`, `size-*` for square dims, `cn()` for conditional classes, no raw color overrides, accessible overlay titles. New/changed components use the shared liquid-glass material and radius tokens.
- For component create/fix, check shadcn docs before guessing APIs.
- Keep components reusable + app-agnostic; product-specific layout in `apps/client`.

## Verification

- `pnpm --filter @workspace/ui typecheck`
- `pnpm --filter @workspace/ui lint`
- `pnpm --filter @workspace/ui format:check`

## Child DOX Index

- None.
