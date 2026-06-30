[Skip to main content](https://mastra.ai/docs/mastra-platform/observability#__docusaurus_skipToContent_fallback)

Copy markdown

On this page

Observability on Mastra platform is a standalone hosted product for searchable traces, logs, and metrics across Mastra projects and deploys. Use it when you want observability without deploying Studio first or setting up local storage.

Mastra can configure platform observability during project setup. The CLI provisions a platform project, writes the required environment variables, and registers observability exporters in your Mastra config.

## Quickstart [Direct link to Quickstart](https://mastra.ai/docs/mastra-platform/observability\#quickstart "Direct link to Quickstart")

Choose the setup path that matches your project. New and existing projects can use the CLI to provision Observability automatically, while manual setup is available when you already manage platform projects and environment variables yourself.

### New project [Direct link to New project](https://mastra.ai/docs/mastra-platform/observability\#new-project "Direct link to New project")

Create a new Mastra project:

- npm
- pnpm
- Yarn
- Bun

```bash
npm create mastra@latest
```

```bash
pnpm create mastra
```

```bash
yarn create mastra
```

```bash
bunx create-mastra
```

When prompted, enable Mastra Observability:

```bash
Enable Mastra Observability? (will open auth flow)

> Yes
```

The CLI authenticates with Mastra platform, creates a platform project, writes the required environment variables, and configures the observability exporters.

### Existing non-Mastra projects [Direct link to Existing non-Mastra projects](https://mastra.ai/docs/mastra-platform/observability\#existing-non-mastra-projects "Direct link to Existing non-Mastra projects")

If you already have an application, such as a Next.js app, but haven't added Mastra yet, run `mastra init` and enable Mastra Observability when prompted:

- npm
- pnpm
- Yarn
- Bun

```bash
npx mastra init
```

```bash
pnpm dlx mastra init
```

```bash
yarn dlx mastra init
```

```bash
bun x mastra init
```

The CLI can select an existing platform project or create a new one.

### Manual setup [Direct link to Manual setup](https://mastra.ai/docs/mastra-platform/observability\#manual-setup "Direct link to Manual setup")

Create a project in [Mastra Platform](https://projects.mastra.ai/), add `MASTRA_PLATFORM_ACCESS_TOKEN` and `MASTRA_PROJECT_ID` to `.env`, then register `MastraPlatformExporter` in your Mastra config. Add `MastraStorageExporter` if you also want to persist observability events to your configured Mastra Storage:

src/mastra/index.ts

```ts
import { Mastra } from '@mastra/core/mastra'
import { Observability, MastraPlatformExporter } from '@mastra/observability'

export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [new MastraPlatformExporter()],
      },
    },
  }),
})
```

See [Mastra platform configuration](https://mastra.ai/docs/mastra-platform/configuration#observability) for the environment variables used by platform observability.

## Query observability data [Direct link to Query observability data](https://mastra.ai/docs/mastra-platform/observability\#query-observability-data "Direct link to Query observability data")

After your project is publishing traces, logs, or scores to Mastra Platform Observability, you can query that data from your terminal with the Mastra CLI or with `curl`.

- npm
- pnpm
- Yarn
- Bun

```bash
npx mastra api trace list
```

```bash
pnpm dlx mastra api trace list
```

```bash
yarn dlx mastra api trace list
```

```bash
bun x mastra api trace list
```

For observability commands, the CLI targets the hosted observability API and can infer credentials from your project environment. See the [`mastra api` CLI reference](https://mastra.ai/reference/cli/mastra#mastra-api) for available observability commands, filtering, pagination, credential resolution, and direct `curl` examples.

On this page

- [Quickstart](https://mastra.ai/docs/mastra-platform/observability#quickstart)
  - [New project](https://mastra.ai/docs/mastra-platform/observability#new-project)
  - [Existing non-Mastra projects](https://mastra.ai/docs/mastra-platform/observability#existing-non-mastra-projects)
  - [Manual setup](https://mastra.ai/docs/mastra-platform/observability#manual-setup)
- [Query observability data](https://mastra.ai/docs/mastra-platform/observability#query-observability-data)

Mastra Newsletter

SubscribeShare feedback

reCAPTCHA

Recaptcha requires verification.

protected by **reCAPTCHA**