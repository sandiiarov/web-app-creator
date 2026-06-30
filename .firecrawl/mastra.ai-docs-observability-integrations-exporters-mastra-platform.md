[Skip to main content](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform#__docusaurus_skipToContent_fallback)

Copy markdown

On this page

The `MastraPlatformExporter` sends traces, logs, metrics, scores, and feedback to the Mastra platform. Use it to route observability data from any Mastra app to a hosted project in the Mastra platform.

note

`MastraPlatformExporter` was previously called `CloudExporter`. The original `CloudExporter` class is still exported from `@mastra/observability` for backward compatibility, but it's deprecated. New code should use `MastraPlatformExporter`.

Self-hosted or standalone apps

If you host your Mastra application on your own infrastructure (not on Mastra platform), you still need a deployed Studio project to view traces, logs, and metrics. `MastraPlatformExporter` sends data to a Studio project, so one must exist before you can use it.

1. [Create a Mastra project](https://mastra.ai/guides/getting-started/quickstart) if you don't have one yet.
2. [Deploy Studio](https://mastra.ai/docs/studio/deployment#mastra-platform) to the Mastra platform with `mastra studio deploy`.
3. Follow the [quickstart steps below](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform#quickstart) to create an access token and find your project ID.

## Version compatibility [Direct link to Version compatibility](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform\#version-compatibility "Direct link to Version compatibility")

- `MastraPlatformExporter` is available starting in `@mastra/observability@1.12.0`. In `1.8.0` through `1.11.x` the same exporter ships only as `CloudExporter`; the constructor signature and environment variables are identical.
- In `@mastra/observability@1.8.0` through `1.9.1`, set `MASTRA_PLATFORM_OBSERVABILITY_ENDPOINT=https://observability.mastra.ai` in addition to `MASTRA_PLATFORM_ACCESS_TOKEN` and `MASTRA_PROJECT_ID`.
- Starting in `@mastra/observability@1.9.2`, the exporter defaults to `https://observability.mastra.ai`, so `MASTRA_PLATFORM_OBSERVABILITY_ENDPOINT` is only required when you want to send telemetry to a different collector.

## Quickstart [Direct link to Quickstart](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform\#quickstart "Direct link to Quickstart")

To connect `MastraPlatformExporter`, create an access token, find the destination `projectId`, and add the exporter to your observability config.

### 1\. Create an access token [Direct link to 1. Create an access token](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform\#1-create-an-access-token "Direct link to 1. Create an access token")

Run the following command:

```bash
mastra auth tokens create exporter-token
```

This command prints a token secret that you can use as `MASTRA_PLATFORM_ACCESS_TOKEN`.

If you already have an access token, copy the **Observability** value from the Mastra platform instead. You can find it in either of these places:

- On the **Projects** page, open the project list and find the **Observability** row on the project card.
- On the project **Overview** page, find the **Observability** row directly below the deployment URL.

Set the token as an environment variable:

.env

```bash
MASTRA_PLATFORM_ACCESS_TOKEN=<your-platform-access-token>
```

### 2\. Find your `projectId` [Direct link to 2-find-your-projectid](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform\#2-find-your-projectid "Direct link to 2-find-your-projectid")

Run the following command:

```bash
mastra studio deploy list
```

The output looks similar to this:

```text
✅ <your-project-name> (<your-project-id>)
   Latest:   00000000-0000-0000-0000-000000000000 — running
   URL:      https://260407.studio.mastra.cloud
```

In this output, the value in parentheses is the `projectId`:

```text
<your-project-id>
```

Set it as an environment variable:

.env

```bash
MASTRA_PROJECT_ID=<your-project-id>
```

### 3\. Set your environment variables [Direct link to 3. Set your environment variables](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform\#3-set-your-environment-variables "Direct link to 3. Set your environment variables")

Set both values in your environment so `MastraPlatformExporter` can authenticate and route telemetry to the correct project:

.env

```bash
MASTRA_PLATFORM_ACCESS_TOKEN=<your-platform-access-token>
MASTRA_PROJECT_ID=<your-project-id>
```

If you use `@mastra/observability@1.8.0` through `1.9.1`, also set the Mastra platform collector explicitly:

.env

```bash
MASTRA_PLATFORM_OBSERVABILITY_ENDPOINT=https://observability.mastra.ai
```

If you want to send telemetry somewhere other than Mastra platform, set `MASTRA_PLATFORM_OBSERVABILITY_ENDPOINT` as well. Pass either a base origin or a full traces publish URL ending in `/spans/publish`.

.env

```bash
MASTRA_PLATFORM_OBSERVABILITY_ENDPOINT=https://collector.example.com
```

When you pass a base origin, `MastraPlatformExporter` derives the matching publish URLs for traces, logs, metrics, scores, and feedback automatically.

### 4\. Enable `MastraPlatformExporter` [Direct link to 4-enable-mastraplatformexporter](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform\#4-enable-mastraplatformexporter "Direct link to 4-enable-mastraplatformexporter")

The following example demonstrates how to add `MastraPlatformExporter` to your observability config:

src/mastra/index.ts

```ts
import { Mastra } from '@mastra/core'
import { Observability, MastraPlatformExporter } from '@mastra/observability'

export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      production: {
        serviceName: 'api-server',
        exporters: [new MastraPlatformExporter()],
      },
    },
  }),
})
```

Set `serviceName` on the observability config, not on `MastraPlatformExporter` itself.

Use a stable `serviceName` value. In Studio, traces can be filtered by **Deployments → Service Name**, so a consistent name makes traces easier to find.

Visit [Observability configuration reference](https://mastra.ai/reference/observability/tracing/configuration) for the full observability config shape.

If you prefer, rely entirely on environment variables:

src/mastra/index.ts

```ts
new MastraPlatformExporter()
```

With `MASTRA_PLATFORM_ACCESS_TOKEN` and `MASTRA_PROJECT_ID` set, `MastraPlatformExporter` sends data to the Mastra platform project you configured. If you also set `MASTRA_PLATFORM_OBSERVABILITY_ENDPOINT`, it sends data to that collector instead.

note

Visit [MastraPlatformExporter reference](https://mastra.ai/reference/observability/tracing/exporters/mastra-platform-exporter) for the full list of configuration options.

## Recommended configuration [Direct link to Recommended configuration](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform\#recommended-configuration "Direct link to Recommended configuration")

Include `MastraStorageExporter` if you also want to inspect local traces in Studio or persist observability data to your configured storage.

src/mastra/index.ts

```ts
import { Mastra } from '@mastra/core'
import {
  Observability,
  MastraStorageExporter,
  MastraPlatformExporter,
  SensitiveDataFilter,
} from '@mastra/observability'

export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [new MastraStorageExporter(), new MastraPlatformExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
})
```

## Complete configuration [Direct link to Complete configuration](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform\#complete-configuration "Direct link to Complete configuration")

`MastraPlatformExporter` defaults to Mastra platform. If you want to send telemetry to a different collector, set `MASTRA_PLATFORM_OBSERVABILITY_ENDPOINT` in your environment or pass `endpoint` in code.

.env

```bash
MASTRA_PLATFORM_OBSERVABILITY_ENDPOINT=https://collector.example.com
```

The following example demonstrates how to override the collector endpoint and batching behavior in code:

src/mastra/index.ts

```ts
new MastraPlatformExporter({
  endpoint: 'https://collector.example.com',
  maxBatchSize: 1000,
  maxBatchWaitMs: 5000,
  logLevel: 'info',
})
```

## Viewing data in Mastra Studio [Direct link to Viewing data in Mastra Studio](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform\#viewing-data-in-mastra-studio "Direct link to Viewing data in Mastra Studio")

After you enable `MastraPlatformExporter`, open your project in [Mastra Studio](https://projects.mastra.ai/) to inspect the exported data.

- Open the project you set `MASTRA_PROJECT_ID` to and select **Open Studio**.
- In Studio, go to **Traces** to inspect agent and workflow traces.
- Open the filter menu and use **Deployments → Service Name** to isolate traces from a specific app or deployment.
- Use the **Logs** page in the project dashboard to inspect exported logs.

When you deploy with Mastra Studio, set **Deployment → Service Name** to a stable value and keep it aligned with the `serviceName` in your observability config. This makes traces easier to filter in Studio through **Deployments → Service Name** when multiple services or deployments send data to the same project.

## Performance [Direct link to Performance](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform\#performance "Direct link to Performance")

info

MastraPlatformExporter uses batching to optimize network usage. Events are buffered and sent in batches, reducing overhead while maintaining near real-time visibility.

### Batching behavior [Direct link to Batching behavior](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform\#batching-behavior "Direct link to Batching behavior")

- Events are batched up to `maxBatchSize` (default: 1000).
- Batches are sent when full or after `maxBatchWaitMs` (default: 5 seconds).
- Failed batches are retried with exponential backoff.
- The exporter degrades gracefully if Mastra Studio is unreachable.

## Related [Direct link to Related](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform\#related "Direct link to Related")

- [Tracing Overview](https://mastra.ai/docs/observability/tracing/overview)
- [MastraStorageExporter](https://mastra.ai/docs/observability/integrations/exporters/mastra-storage)

On this page

- [Version compatibility](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform#version-compatibility)
- [Quickstart](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform#quickstart)
  - [1\. Create an access token](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform#1-create-an-access-token)
  - [2\. Find your `projectId`](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform#2-find-your-projectid)
  - [3\. Set your environment variables](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform#3-set-your-environment-variables)
  - [4\. Enable `MastraPlatformExporter`](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform#4-enable-mastraplatformexporter)
- [Recommended configuration](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform#recommended-configuration)
- [Complete configuration](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform#complete-configuration)
- [Viewing data in Mastra Studio](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform#viewing-data-in-mastra-studio)
- [Performance](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform#performance)
  - [Batching behavior](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform#batching-behavior)
- [Related](https://mastra.ai/docs/observability/integrations/exporters/mastra-platform#related)

Mastra Newsletter

SubscribeShare feedback

reCAPTCHA

Recaptcha requires verification.

protected by **reCAPTCHA**