import { fileURLToPath } from 'node:url'

import { createReactConfig } from '@workspace/oxlint-config'

// The panel consumes the same Tailwind design tokens as @workspace/ui; point the
// Tailwind plugin at ui's globals stylesheet so semantic classes resolve.
const tailwindEntryPoint = fileURLToPath(
  new URL('../ui/src/styles/globals.css', import.meta.url),
)

export default createReactConfig({
  tailwindEntryPoint,
})
