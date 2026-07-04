import { fileURLToPath } from 'node:url'

import { createReactConfig } from '@workspace/oxlint-config'

const tailwindEntryPoint = fileURLToPath(
  new URL('../../packages/ui/src/styles/globals.css', import.meta.url),
)

export default createReactConfig({
  tailwindEntryPoint,
})
