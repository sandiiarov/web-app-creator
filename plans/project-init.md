# Project initialization plan

## Decision update

Use the official `shadcn` Vite monorepo scaffold as the starting point, because the current `shadcn` CLI has first-class `--monorepo` support and generates the desired Turborepo shape (`apps/web` + `packages/ui` + per-workspace `components.json`). Then normalize it for this repo's constraints: `pnpm`, `tsgo`, `oxlint`, `oxfmt`, `fallow`, shared config packages, and **no root TS/Vite/Ox configs**.

## Docs and references read

- `shadcn` skill and MCP notes, plus shadcn CLI docs, Vite install docs, monorepo docs, and `components.json` docs.
- Temporary shadcn Vite monorepo scaffold inspected with `pnpm dlx shadcn@latest init -t vite --monorepo --base radix --preset nova ...`.
- Turborepo skill and official docs for repository structure, Vite integration, task configuration, and package configurations.
- pnpm workspace docs and `pnpm-workspace.yaml` docs.
- Vite configuration and getting-started docs, including TypeScript config files and `--configLoader runner` guidance for monorepos.
- `tsgo` / `@typescript/native-preview` README and npm metadata.
- Oxlint/Oxfmt docs from `oxc-project/website/src/docs`: TypeScript config files, nested configs, type-aware linting, formatter config, and config reference.
- `AWeber-Imbi/imbi-ui` oxlint/oxfmt examples.
- Fallow docs index (`llms.txt`), quickstart, configuration, workspaces, rules, dead-code, agent-skills, built-in plugins, CSS/Tailwind analysis, and CI docs.

## Constraints and assumptions

- Root infrastructure files are allowed: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, lockfile, README, git files.
- No root `tsconfig.json`, `vite.config.ts`, `oxlint.config.ts`, `oxfmt.config.ts`, ESLint config, or Prettier config.
- Every app/package that runs tooling gets its own config files:
  - `tsconfig.json`
  - `oxlint.config.ts`
  - `oxfmt.config.ts`
  - `vite.config.ts` only where Vite is actually used
- Shared configs live in workspace packages and are imported by per-package config files.
- Use `package.json#imports` and package `exports` for shadcn aliases instead of `baseUrl`/`paths`, to stay friendlier to TS7/tsgo and oxlint type-aware compatibility.
- Node should be `>=22.18` because Oxlint/Oxfmt TypeScript config files require a Node runtime that can execute TypeScript.

## Target structure

```txt
.
├── apps/
│   └── web/
│       ├── components.json
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── oxlint.config.ts
│       ├── oxfmt.config.ts
│       └── src/
├── packages/
│   ├── ui/
│   │   ├── components.json
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── oxlint.config.ts
│   │   ├── oxfmt.config.ts
│   │   └── src/
│   ├── typescript-config/
│   ├── vite-config/
│   ├── oxlint-config/
│   └── oxfmt-config/
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── turbo.json
```

## Phase 1 — Scaffold baseline with shadcn

1. Use the shadcn Vite monorepo template as a baseline, preferably with pnpm:
   ```bash
   pnpm dlx shadcn@latest init -t vite --monorepo --base radix --preset nova --name <project-name> -y
   ```
2. If direct scaffolding into the current empty repo is awkward, scaffold into `/tmp`, then copy the generated files into this repo.
3. Keep the useful generated pieces:
   - `apps/web`
   - `packages/ui`
   - both `components.json` files
   - Tailwind v4 global CSS setup
   - UI package `exports`
   - initial `Button` example
4. Remove or replace generated tooling that conflicts with requirements:
   - root `tsconfig.json`
   - root `.prettierrc` / `.prettierignore`
   - per-package `eslint.config.js`
   - Prettier and ESLint dependencies/scripts

## Phase 2 — Normalize pnpm and Turborepo

1. Ensure `pnpm-workspace.yaml` includes:
   ```yaml
   packages:
     - "apps/*"
     - "packages/*"
   ```
2. Set root `packageManager` to the intended pnpm version and `engines.node` to `>=22.18`.
3. Follow the Turborepo skill rules:
   - root scripts must use `turbo run ...`, not `turbo ...`
   - task logic belongs in package scripts
   - root scripts only delegate to Turborepo, except intentionally registered root tasks
4. Replace shadcn scaffold root scripts like `turbo build` with `turbo run build`.
5. Configure `turbo.json` with package tasks:
   - `build`: `dependsOn: ["^build"]`, `outputs: ["dist/**"]`
   - `dev`: `cache: false`, `persistent: true`
   - `typecheck`: use a transit node for dependency-aware parallel typechecks
   - `lint`, `format:check`, `format`
   - optional root task for full-repo `fallow` if we choose repo-wide analysis

## Phase 3 — Add shared config packages

1. `packages/typescript-config`
   - `base.json`
   - `react-app.json`
   - `react-library.json`
   - `node.json` for config packages
   - TS7/tsgo-compatible settings; avoid `baseUrl` and `paths` unless absolutely necessary.
2. `packages/vite-config`
   - Export a typed React + Tailwind Vite config factory using `defineConfig`, `@vitejs/plugin-react`, and `@tailwindcss/vite`.
   - Apps keep their own `vite.config.ts` and import this shared config.
   - Use Vite `--configLoader runner` in scripts if importing shared TS config from the monorepo causes config loader issues.
3. `packages/oxlint-config`
   - Export shared typed config objects/helpers.
   - Borrow from `imbi-ui`: correctness category, React/TypeScript/OXC plugins, React Refresh, underscore ignored unused vars, Tailwind lint integration where appropriate.
   - Use package config helpers/spread when we need fields that Oxlint `extends` does not merge (`env`, `settings`, `ignorePatterns`).
4. `packages/oxfmt-config`
   - Export shared typed config values.
   - Borrow from `imbi-ui`: `semi: false`, `singleQuote: true`, `tabWidth: 2`, `trailingComma: "all"`, `printWidth: 80`, `sortPackageJson`, `sortTailwindcss`.
   - Keep per-package `sortTailwindcss.stylesheet` paths in package-level configs because paths are resolved relative to the config file.

## Phase 4 — Convert TypeScript to tsgo

1. Add `@typescript/native-preview` where scripts invoke `tsgo`.
2. Replace `tsc` commands with `tsgo` equivalents:
   - app build: `tsgo --noEmit -p tsconfig.json && vite build ...`
   - typecheck: `tsgo --noEmit -p tsconfig.json`
3. Keep package `tsconfig.json` files self-contained and narrow:
   - apps include `src` and Vite config
   - UI includes `src`
   - config packages include `src`
4. Avoid a root `tsconfig.json`.
5. Avoid TypeScript project references unless a package truly needs build mode.

## Phase 5 — Wire shadcn monorepo aliases without TS paths

1. In `apps/web/package.json`, define package imports for local app code:
   ```json
   {
     "imports": {
       "#components/*": "./src/components/*.tsx",
       "#hooks/*": "./src/hooks/*.ts",
       "#lib/*": "./src/lib/*.ts"
     }
   }
   ```
2. In `packages/ui/package.json`, expose UI install targets:
   ```json
   {
     "imports": {
       "#components/*": "./src/components/*.tsx",
       "#hooks/*": "./src/hooks/*.ts",
       "#lib/*": "./src/lib/*.ts"
     },
     "exports": {
       "./globals.css": "./src/styles/globals.css",
       "./components/*": "./src/components/*.tsx",
       "./hooks/*": "./src/hooks/*.ts",
       "./lib/*": "./src/lib/*.ts"
     }
   }
   ```
3. Configure `components.json` files per shadcn monorepo docs:
   - app routes UI installs to `@workspace/ui/components`
   - UI package uses package-local `#...` aliases
   - Tailwind v4 config remains blank
4. Import global CSS in the app from `@workspace/ui/globals.css`.
5. After components are generated, run the shadcn audit checklist via the shadcn MCP workflow.

## Phase 6 — Replace ESLint/Prettier with Oxlint/Oxfmt

1. Add per-package `oxlint.config.ts` files that import shared config from `@workspace/oxlint-config`.
2. Add per-package `oxfmt.config.ts` files that import shared config from `@workspace/oxfmt-config`.
3. Package scripts:
   - `lint`: `oxlint .`
   - `lint:fix`: `oxlint --fix .`
   - `format`: `oxfmt ...`
   - `format:check`: `oxfmt --check ...`
4. Keep commands package-local so Oxlint/Oxfmt use that package's config as the nearest/root config.
5. If enabling Oxlint type-aware rules, add `oxlint-tsgolint` and run via package-local scripts; do not run root `oxlint .` with nested configs.

## Phase 7 — Add Fallow

1. Install `fallow` as a repo tool.
2. Start with zero config because Fallow auto-detects pnpm workspaces, Turborepo, Vite, Tailwind, TypeScript, Oxlint, and package exports/imports.
3. Add scripts for useful checks:
   - full: `fallow`
   - dead code: `fallow dead-code`
   - changed code/audit: `fallow audit --gate new-only`
4. Prefer no root `.fallowrc` initially to respect the no-root-config requirement.
5. If false positives appear, decide deliberately between:
   - package/workspace flags (`--workspace`)
   - inline JSDoc markers (`@public`, `@expected-unused`)
   - a minimal Fallow config only after confirming it is necessary
6. Specifically validate shadcn/Tailwind CSS imports and `@workspace/ui` exports with `fallow list --plugins` and `fallow dead-code`.

## Phase 8 — Dependency cleanup and package boundaries

1. Move app/runtime dependencies to the packages that use them.
2. Keep root dependencies limited to repo tools (`turbo`, maybe `fallow` and workspace orchestration tools).
3. Use `workspace:*` for internal packages.
4. Ensure all cross-package imports go through package names and exported subpaths, never relative `../packages/...` paths.
5. Consider pnpm catalogs later for version consistency, but avoid adding extra moving parts in the initial scaffold unless needed.

## Phase 9 — Validation

Run validation in this order:

```bash
pnpm install
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm run fallow:dead-code
```

Also verify:

```bash
pnpm exec turbo run build --dry-run
pnpm exec fallow list --plugins
pnpm dlx shadcn@latest add button -c apps/web --dry-run
```

Expected outcomes:

- No root TS/Vite/Ox/Prettier/ESLint configs remain.
- Every app/package has its own needed configs.
- Root scripts use `turbo run`.
- `tsgo` is used instead of `tsc`.
- shadcn can add UI components to `packages/ui` from `apps/web` context.
- Oxlint and Oxfmt read package-local TypeScript config files.
- Fallow sees pnpm/Turborepo/Vite/Tailwind workspaces and does not flag the scaffold itself as dead.

## Phase 10 — Documentation handoff

1. Update README with:
   - package manager and Node requirements
   - common commands
   - adding shadcn components
   - config package layout
   - no-root-config convention
2. Add a short note explaining when to create a new shared config vs a package-local override.
3. Record any intentional Fallow exceptions if they become necessary.
