import { Agent } from '@mastra/core/agent'
import { Mastra } from '@mastra/core/mastra'
import { MastraCompositeStore } from '@mastra/core/storage'
import { DuckDBStore } from '@mastra/duckdb'
import { LibSQLStore } from '@mastra/libsql'
import { PinoLogger } from '@mastra/loggers'
import {
  MastraStorageExporter,
  Observability,
  SensitiveDataFilter,
} from '@mastra/observability'

import { landingPageAgentConfig } from './agents/landing-page-agent.ts'

/**
 * Mastra instance for the landing-page agent.
 *
 * - Storage: LibSQL (default domain) + DuckDB (observability domain), both
 *   local files written into the server's cwd.
 * - Observability: traces persist locally (DuckDB via `MastraStorageExporter`)
 *   and are also sent to the Mastra Platform when `MASTRA_PLATFORM_ACCESS_TOKEN`
 *   is present (the platform exporter self-disables otherwise).
 *
 * The landing-page `Agent` is registered in Phase 2.
 */
export const mastra = new Mastra({
  agents: { landingPageAgent: new Agent(landingPageAgentConfig) },
  logger: new PinoLogger({
    level: 'info',
    name: 'landing-page-agent',
  }),
  observability: new Observability({
    configs: {
      default: {
        exporters: [new MastraStorageExporter()],
        serviceName: 'landing-page-agent',
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
  storage: new MastraCompositeStore({
    default: new LibSQLStore({
      id: 'landing-page-agent',
      url: 'file:./mastra.db',
    }),
    domains: {
      observability: new DuckDBStore({
        path: 'mastra.duckdb',
      }).observability,
    },
    id: 'landing-page-agent',
  }),
})
