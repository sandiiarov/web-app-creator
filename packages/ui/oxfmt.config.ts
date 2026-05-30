import { fileURLToPath } from 'node:url'

import { createOxfmtConfig } from '@workspace/oxfmt-config'

const tailwindStylesheet = fileURLToPath(
  new URL('src/styles/globals.css', import.meta.url),
)

export default createOxfmtConfig({
  tailwindStylesheet,
})
