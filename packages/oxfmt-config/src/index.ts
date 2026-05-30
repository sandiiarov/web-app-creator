import { defineConfig } from 'oxfmt'

type SharedOxfmtOptions = {
  ignorePatterns?: string[]
  tailwindStylesheet?: string
}

const baseIgnorePatterns = [
  'dist/**',
  'node_modules/**',
  '.turbo/**',
  'coverage/**',
]

function withSharedIgnores(ignorePatterns: string[] = []) {
  return [...baseIgnorePatterns, ...ignorePatterns]
}

export function createOxfmtConfig(options: SharedOxfmtOptions = {}) {
  return defineConfig({
    ignorePatterns: withSharedIgnores(options.ignorePatterns),
    printWidth: 80,
    semi: false,
    singleQuote: true,
    sortImports: true,
    sortPackageJson: {
      sortScripts: true,
    },
    sortTailwindcss: {
      functions: ['cn', 'cva'],
      ...(options.tailwindStylesheet
        ? { stylesheet: options.tailwindStylesheet }
        : {}),
    },
    tabWidth: 2,
    trailingComma: 'all',
  })
}

export const baseOxfmtConfig = createOxfmtConfig()
