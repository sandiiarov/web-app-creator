import { fileURLToPath } from 'node:url'

import { createOxfmtConfig } from '@workspace/oxfmt-config'

const tailwindStylesheet = fileURLToPath(
  new URL('../ui/src/styles/globals.css', import.meta.url),
)

export default createOxfmtConfig({
  tailwindStylesheet,
})
