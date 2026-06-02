import { defineConfig, mergeConfig, type ViteUserConfig } from 'vitest/config'

export function createVitestConfig(config: ViteUserConfig = {}) {
  return mergeConfig(defaultVitestConfig, defineConfig(config))
}

const defaultVitestConfig = defineConfig({
  test: {
    clearMocks: true,
    environment: 'node',
    globals: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    mockReset: true,
    restoreMocks: true,
  },
})
