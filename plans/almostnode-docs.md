# almostnode notes for AI tools

Sources read:

- https://github.com/macaly/almostnode
- https://almostnode.dev/docs/
- https://almostnode.dev/docs/core-concepts.html
- https://almostnode.dev/docs/api-reference.html
- https://almostnode.dev/docs/vite-guide.html
- Local installed package declarations under `node_modules/almostnode/dist/*.d.ts`

## What almostnode is

almostnode is a browser-native Node-like runtime. It provides:

- `VirtualFS`: an in-memory POSIX-like filesystem.
- `Runtime`: JavaScript/TypeScript execution with Node module resolution and shims.
- `PackageManager`: fetches npm metadata/tarballs and installs packages into the VFS.
- `ServerBridge`: registers virtual servers behind service-worker URLs.
- `ViteDevServer`: serves Vite/React apps from `VirtualFS` and posts HMR updates to an iframe window.

The current app uses `VirtualFS`, `ViteDevServer`, and `ServerBridge` in the browser. The Node server never receives a live `VirtualFS` reference.

## VirtualFS behavior relevant to tools

`VirtualFS` is in-memory and exposes Node-like sync APIs:

- `writeFileSync(path, data)` creates parent directories.
- `readFileSync(path, 'utf8')` returns text.
- `existsSync(path)`, `statSync(path)`, `readdirSync(path)` inspect paths.
- `unlinkSync`, `rmdirSync`, `renameSync`, `mkdirSync`, `copyFileSync` mutate the VFS.
- `watch()` emits changes for dev-server/HMR.
- `toSnapshot()` / `VirtualFS.fromSnapshot()` can serialize/rehydrate a full tree.

Implication: filesystem AI tools should execute in the browser against the live `VirtualFS`, not on a copied workspace on the Node server. Tool outputs sent back to the model should be bounded snippets/results only.

## ViteDevServer behavior relevant to tools

The Vite dev server:

- Transforms TS/TSX/JSX with esbuild-wasm.
- Serves CSS as JS modules.
- Injects React Refresh/HMR into HTML.
- Redirects npm imports to CDN URLs (`esm.sh`) using dependency versions from `/package.json`.
- Caches transformed modules and dependency metadata.
- Watches VFS writes and sends HMR updates for JS/CSS, full reloads for other files.

Implication: client tools should write directly to `VirtualFS` so Vite/HMR sees real file changes. If `/package.json` changes, the client should clear dependency caches when possible. almostnode exposes this in runtime JS (`clearInstalledPackagesCache`) but it is not in the public `ViteDevServer` declaration, so calls must be guarded.

## Package manager behavior relevant to `npm-install`

almostnode `PackageManager` can install real npm packages in the browser by fetching package manifests and tarballs, resolving dependencies, extracting into `/node_modules`, and creating bin stubs.

The current preview app does not use `PackageManager`; it relies on ViteDevServer import rewriting to `esm.sh`. Therefore `npm-install` should be a browser/client tool that updates live `/package.json` in `VirtualFS`. It must not install packages on the Node server or run lifecycle scripts.

## Service worker / bridge behavior

`ServerBridge` registers a virtual server on a port after `initServiceWorker()`. The page accesses it through a service-worker virtual URL. The bridge lives in the browser context.

Implication: server-side AI generation cannot directly call `bridge.handleRequest` or mutate the preview. Client tools, running in the browser, are the correct boundary for preview mutations.

## Security and sandbox notes

Docs warn that `createContainer().execute()` and `runtime.execute()` on the main thread can access the host page. Untrusted code should run in a cross-origin sandbox via `createRuntime` and generated sandbox files.

Implication: the Node server should only run AI generation and stream tool calls. It should not execute generated app code, access host filesystem paths for app edits, or receive full VFS snapshots. Browser tools should validate paths against client-maintained allowed roots/registries before mutating `VirtualFS`.

## Tool design constraints

- Tool execution for `read`, `write`, `edit`, `find`, `ls`, and `npm-install` belongs on the client against live almostnode state.
- Server tool definitions should be schemas/descriptions only, with no `execute` handlers for VFS/package tools.
- The client should validate POSIX paths and allowed roots before each tool action.
- Tool outputs should be bounded/truncated to control token use and avoid uploading the whole workspace.
- Writes/edits should happen immediately in `VirtualFS` and rely on almostnode/Vite HMR.
- `npm-install` updates browser VFS `/package.json`; it does not install on the Node server.
- E2E tests must verify the browser VFS and iframe preview actually receive tool-driven changes.
