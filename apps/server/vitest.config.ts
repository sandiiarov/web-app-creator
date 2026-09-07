import { createVitestConfig } from '@workspace/vitest-preset'

export default createVitestConfig({
  test: { setupFiles: ['./src/testing/deny-network.ts'] },
})
