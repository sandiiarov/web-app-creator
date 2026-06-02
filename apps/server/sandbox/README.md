# Web App Creator sandbox template

This Docker Sandbox template contains the in-sandbox Pi runtime plus globally installed preview validation tools. These tools are intentionally not added to preview app `package.json` files.

## Build and load

From `apps/server`:

```bash
pnpm run sandbox:build
pnpm run sandbox:save
pnpm run sandbox:load
```

Or run all three steps:

```bash
pnpm run sandbox:template
```

Equivalent commands:

```bash
docker build -t web-app-creator-sandbox:dev sandbox
docker image save web-app-creator-sandbox:dev -o sandbox/web-app-creator-sandbox.tar
sbx template load sandbox/web-app-creator-sandbox.tar
```

## Runtime contents

The image installs the following global tools:

- `pnpm`
- React type declarations for TypeScript validation
- `tsgo` from `@typescript/native-preview`
- `typescript`
- `oxlint`
- `oxfmt`
- `vite`

Pi runtime dependencies are installed under `/opt/web-app-creator/node_modules` for the runner.

Global configs are copied to:

```txt
/opt/web-app-creator/config/oxfmt.config.ts
/opt/web-app-creator/config/oxlint.config.ts
/opt/web-app-creator/config/preview-env.d.ts
/opt/web-app-creator/config/tsconfig.preview.json
```

The runner formats files with `oxfmt`, then validates each completed agent turn with the global tools:

```bash
oxfmt -c /opt/web-app-creator/config/oxfmt.config.ts --check /workspace
oxlint -c /opt/web-app-creator/config/oxlint.config.ts /workspace
tsgo --noEmit -p /opt/web-app-creator/config/tsconfig.preview.json
vite build --config /workspace/vite.config.ts
```

Validation failures are returned as response diagnostics; generated `dist` output is not returned as a changed preview file.

The runner is copied to:

```txt
/opt/web-app-creator/runner/run-agent.mjs
```

## Required runtime environment

The host passes these env vars to `sbx exec`:

```txt
WEB_APP_CREATOR_MODEL_GATEWAY_BASE_URL
WEB_APP_CREATOR_MODEL_GATEWAY_TOKEN
WEB_APP_CREATOR_MODEL_ID
```

All three are required and have no defaults.
