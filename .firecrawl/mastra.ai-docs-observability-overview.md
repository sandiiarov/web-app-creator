[Skip to main content](https://mastra.ai/docs/observability/overview#__docusaurus_skipToContent_fallback)

Copy markdown

On this page

Mastra's observability system gives you visibility into every agent run, workflow step, tool call, and model interaction. Agent behavior depends on model responses, prompts, tools, memory, and workflow state, so observability helps you inspect runtime decisions from day one. It captures three complementary signals that work together to help you understand what your application is doing and why.

- [**Configuration**](https://mastra.ai/docs/observability/config): Configure observability once for traces, logs, and metrics.
- [**Storage**](https://mastra.ai/docs/observability/storage): Choose storage backends for persisted traces, logs, and metrics aggregation.
- [**Tracing**](https://mastra.ai/docs/observability/tracing/overview): Records every operation as a hierarchical timeline of spans, capturing inputs, outputs, token usage, and timing.
- [**Logging**](https://mastra.ai/docs/observability/logging): Forwards structured log entries from your application and Mastra internals to observability storage, correlated to traces automatically.
- [**Metrics**](https://mastra.ai/docs/observability/metrics/overview): Extracts duration, token usage, and cost data from traces automatically, with no additional instrumentation required.
- [**Integrations**](https://mastra.ai/docs/observability/integrations/overview): Choose exporters, bridges, and span processors for Studio, hosted, or external observability workflows.

## When to use observability [Direct link to When to use observability](https://mastra.ai/docs/observability/overview\#when-to-use-observability "Direct link to When to use observability")

- Debug unexpected agent behavior by inspecting the full decision path, tool calls, and model responses.
- Monitor latency across agents, workflows, and tools to identify bottlenecks.
- Track token consumption and estimated cost over time to control spending.
- Diagnose workflow failures by tracing execution through each step.
- Compare agent performance before and after prompt or model changes.

## How the pieces fit together [Direct link to How the pieces fit together](https://mastra.ai/docs/observability/overview\#how-the-pieces-fit-together "Direct link to How the pieces fit together")

Tracing is the foundation. When observability is configured, every agent run, workflow execution, tool call, and model interaction produces a [span](https://opentelemetry.io/docs/concepts/signals/traces/#spans). Spans are organized into traces that show the full request lifecycle as a hierarchical timeline.

Metrics are derived from traces automatically. When a span ends, Mastra extracts duration, token counts, and cost estimates without any extra code. These metrics power the dashboards in [Studio](https://mastra.ai/docs/studio/observability).

Logs are correlated to traces automatically. Every `logger.info()`, `logger.warn()`, or `logger.error()` call within a traced context is tagged with the current trace and span IDs. You can navigate from a log entry directly to the trace that produced it.

All three signals share correlation IDs (trace ID, span ID, entity type, entity name), so you can jump between a metric spike, the traces behind it, and the logs within those traces.

## Quickstart [Direct link to Quickstart](https://mastra.ai/docs/observability/overview\#quickstart "Direct link to Quickstart")

Install `@mastra/observability` and storage backends that support traces and metrics:

- npm
- pnpm
- Yarn
- Bun

```bash
npm install @mastra/observability @mastra/libsql @mastra/duckdb
```

```bash
pnpm add @mastra/observability @mastra/libsql @mastra/duckdb
```

```bash
yarn add @mastra/observability @mastra/libsql @mastra/duckdb
```

```bash
bun add @mastra/observability @mastra/libsql @mastra/duckdb
```

Then configure observability in your Mastra instance. The following example uses composite storage to route observability data to DuckDB (which supports metrics aggregation) while keeping everything else in LibSQL:

src/mastra/index.ts

```ts
import { Mastra } from '@mastra/core/mastra'
import { LibSQLStore } from '@mastra/libsql'
import { DuckDBStore } from '@mastra/duckdb'
import { MastraCompositeStore } from '@mastra/core/storage'
import {
  Observability,
  MastraStorageExporter,
  MastraPlatformExporter,
  SensitiveDataFilter,
} from '@mastra/observability'

export const mastra = new Mastra({
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new LibSQLStore({
      id: 'mastra-storage',
      url: 'file:./mastra.db',
    }),
    domains: {
      observability: await new DuckDBStore().getStore('observability'),
    },
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [\
          new MastraStorageExporter(), // Persists observability events to Mastra Storage\
          new MastraPlatformExporter(), // Sends observability events to Mastra platform (if MASTRA_PLATFORM_ACCESS_TOKEN is set)\
        ],
        spanOutputProcessors: [\
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys\
        ],
      },
    },
  }),
})
```

This enables tracing, log forwarding, and metrics. Mastra also supports external tracing providers like Langfuse, Datadog, and any OpenTelemetry-compatible platform. Use [Configuration](https://mastra.ai/docs/observability/config), [Storage](https://mastra.ai/docs/observability/storage), and [Integrations overview](https://mastra.ai/docs/observability/integrations/overview) to set up observability.

## Mastra platform [Direct link to Mastra platform](https://mastra.ai/docs/observability/overview\#mastra-platform "Direct link to Mastra platform")

For hosted traces, logs, and metrics across projects and deploys, see [Observability on Mastra platform](https://mastra.ai/docs/mastra-platform/observability).

## Storage [Direct link to Storage](https://mastra.ai/docs/observability/overview\#storage "Direct link to Storage")

Not all storage backends support every signal. Traces work with most backends, but metrics and logs require an OLAP-capable store like DuckDB (development) or ClickHouse (production). For setup guidance, see [Storage](https://mastra.ai/docs/observability/storage).

## Next steps [Direct link to Next steps](https://mastra.ai/docs/observability/overview\#next-steps "Direct link to Next steps")

- [Tracing](https://mastra.ai/docs/observability/tracing/overview)
- [Logging](https://mastra.ai/docs/observability/logging)
- [Metrics](https://mastra.ai/docs/observability/metrics/overview)
- [Configuration](https://mastra.ai/docs/observability/config)
- [Storage](https://mastra.ai/docs/observability/storage)
- [Integrations overview](https://mastra.ai/docs/observability/integrations/overview)
- [Mastra Studio](https://mastra.ai/docs/studio/observability)
- [Automatic metrics reference](https://mastra.ai/reference/observability/metrics/automatic-metrics)
- [Mastra platform observability](https://mastra.ai/docs/mastra-platform/observability)

On this page

- [When to use observability](https://mastra.ai/docs/observability/overview#when-to-use-observability)
- [How the pieces fit together](https://mastra.ai/docs/observability/overview#how-the-pieces-fit-together)
- [Quickstart](https://mastra.ai/docs/observability/overview#quickstart)
- [Mastra platform](https://mastra.ai/docs/observability/overview#mastra-platform)
- [Storage](https://mastra.ai/docs/observability/overview#storage)
- [Next steps](https://mastra.ai/docs/observability/overview#next-steps)

Mastra Newsletter

SubscribeShare feedback