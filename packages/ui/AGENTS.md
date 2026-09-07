# UI Package DOX

## Purpose

- Shared React UI pkg, shadcn/ui + Tailwind v4 globals.

## Ownership

- `src/components/`: reusable UI primitives, exported as `@workspace/ui/components/*`. The separate `sliding-number.tsx` spring digit primitive remains available; active timers use `MotionNumber`.
- `src/lib/utils.ts`: shared `cn()`.
- `src/styles/globals.css`: Tailwind v4 imports, theme tokens, source scan, base styles, glass material, and workspace layout. Owns typed `--landing-panel-width` (352px default), preview dock-offset transitions, assistant open/close/launcher transitions, frame arrival, press/hover feedback, and reduced-motion/transparency fallbacks.
- Design system: a quiet website studio in warm paper light mode and ink dark mode, with amber reserved for primary actions and selection. System sans typography uses a prominent library heading and compact tool labels. All rectangular app surfaces and controls use 0px corners, including panels, dialogs, menus, inputs, toggles, thumbnails, and preview frames. Circular status/identity marks retain their natural shape. Material tokens own dense translucent assistant chrome, readable conversation surfaces, inset highlights, and soft elevation; menus keep their denser glass tint. Reduced motion, reduced transparency, and no-backdrop-filter fallbacks remain centralized here.
- Input and Textarea placeholders use the full muted-foreground token for readable contrast; error text uses destructive-foreground, reserving destructive for surfaces/borders. Library and switcher search and project rename inputs use at least 16px text below 768px to avoid input zoom.
- Chat chrome is deliberately compact: equal 3px header padding on both axes (35px total, 51px for touch), 28px desktop header controls, 12px conversation padding, and a small starter section. Preserve larger touch targets and bounded scrolling references; conversation and input take priority over decoration.
- Product style hooks cover the studio library (desktop navigation rail, responsive preview gallery and compact rows, search/filter/sort/view tools), edge-to-edge editor, unified assistant, and ruled empty canvas. `--studio-rail`, `--studio-field`, and `--studio-preview` separate navigation, inputs, and preview backing from the content plane. The assistant keeps a compact visible composer label, monospace requests with a prompt marker, readable responses, and optional activity. Mobile retains the live page beneath the overlay, bounded attachments, visible input/Send, and visualViewport keyboard handling. All editor navigation and page controls stay in the assistant; both desktop docks fill the viewport height.
- `components.json`: shadcn config for pkg.

## Local Contracts

- Public consumers import via `@workspace/ui/components/*`, `@workspace/ui/lib/*`, `@workspace/ui/hooks/*`, `@workspace/ui/globals.css`.
- Internal imports: `#components`, `#hooks`, `#lib`.
- Add shadcn components via client config: `pnpm dlx shadcn@latest add <component> -c apps/client`.
- Keep Tailwind theme/global CSS centralized in `src/styles/globals.css`; no competing global sheets. Include source-consumed workspace pkg paths (e.g. `packages/prompt-panel/src`) + external runtime `dist/*.js` paths in `@source` list so Tailwind emits all classes.
- `src/styles/globals.css` registers `@property --landing-panel-width` (`syntax: '<length>'`, `inherits: true`, `initial-value` = default panel width). Runtime width of prompt panel + docked preview offset; `@workspace/prompt-panel` writes/owns it — don't redefine/drive elsewhere.
- Assistant arrival animates opacity/transform; repeated conversation/project-view switches are immediate to preserve continuity. Collapsing hides the mounted header/composer/conversation and exposes a transparent 56px launcher with three centered organic layers and a terminal glyph. The blob animates only during live generation and remains keyboard focusable/draggable. Preview dock offsets track `--landing-panel-width` and disable transitions under resizing. `data-viewport` selects a brief frame reveal without replacing the iframe. `src/lib/motion-preference.ts` owns none/reduced/standard/enhanced preferences (`workspace.motion.v1`), synchronizes consumers/tabs, and applies `data-motion` to the root. The app theme provider initializes it; the assistant settings slider updates it. OS reduced motion overrides all manual choices. Never animate or restyle generated iframe content from app chrome.
- Preserve current `radix-lyra`, Tailwind v4, Lucide icon setup unless preset intentionally changed. Keep existing primitives on Radix; apply the shared glass recipes without switching primitive libraries.
- `TooltipProvider` (in `src/components/tooltip.tsx`) defaults `delayDuration=0` + `disableHoverableContent=true`. They interact: `delayDuration=0` + hoverable on (Radix default) → moving between adjacent triggers leaves prev tooltip open during grace while next opens instantly → stack/swap. Tooltips here non-interactive (label + `kbd` hint) so hoverable disabled by default; consumer can override `disableHoverableContent={false}` per provider if needs interactive tooltip. Dropdown-trigger tooltips that also open menu must force-close on open (`Tooltip open={open ? false : undefined}`), owned at trigger site.

- `DropdownMenuSubContent` portals to the document body so the parent menu’s scroll clipping and glass backdrop cannot hide or intercept submenu choices.
- Composer toolbar actions share ghost surfaces, 28px desktop height, 14px icons, square corners, and visible keyboard focus; Send and Stop retain semantic filled states.

## Work Guidance

- Use existing shadcn components first, follow shadcn rules: semantic colors, `gap-*` not `space-*`, `size-*` for square dims, `cn()` for conditional classes, no raw color overrides, accessible overlay titles. New/changed components use the shared liquid-glass material and radius tokens.
- For component create/fix, check shadcn docs before guessing APIs.
- Keep components reusable + app-agnostic; product-specific layout in `apps/client`.

- `MotionNumber` wraps `@number-flow/react` with shared motion preferences and OS reduced-motion support. `RangeSlider` composes Radix Slider with a visible label/value, square thumb, and Arrow/Home/End controls; numeric values use `MotionNumber`.
- `MediaModal` combines Radix Dialog focus management with native View Transitions when supported, falling back to immediate opening under reduced motion. Images stay contained within the viewport and keep their natural aspect ratio; never distort image pixels with the glass material.
- `ProgressBlob` uses three centered overlapping copies of one SVG shape: 48×48px dark bottom, 40×40px amber middle, and 32×32px yellow top. Only the bottom layer casts a soft shadow. The launcher has no visible box, border, or backdrop; keep its transparent 56px hit area. Stagger layer motion during live generation, keep the front terminal glyph still, and respect shared reduced-motion settings. Generating project cards use a masked, animated amber perimeter tied to `data-generating`; text status remains visible when animation is disabled. Layered glass tint and specular highlights unify panels, menus, dialogs, cards, and settings without rounding rectangular edges.

- `--landing-panel-height` carries the chosen floating height, with top/bottom resize handles styled only on expanded desktop floating panels. All four edge grips share a 6px thickness, 8px corner inset, and amber hover/focus highlight. The panel owns persistence and geometry. Header titles are plain text drag handles; no button hover or editing affordance.

## Verification

- `pnpm --filter @workspace/ui typecheck`
- `pnpm --filter @workspace/ui lint`
- `pnpm --filter @workspace/ui format:check`

## Child DOX Index

- None.
