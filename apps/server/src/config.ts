import { env } from 'node:process'

import { createConfigFromEnv } from './config-env.ts'

export const config = createConfigFromEnv(env)
