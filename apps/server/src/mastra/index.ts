import type { Mastra } from '@mastra/core/mastra'

import { createProductionRuntime } from '../production-runtime.ts'

/** Mastra Studio discovery entry; HTTP factory imports do not reach this module. */
const production = await createProductionRuntime()

export const mastra = production.mastra as Mastra
