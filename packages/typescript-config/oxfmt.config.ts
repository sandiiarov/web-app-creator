import { defineConfig } from 'oxfmt'

export default defineConfig({
  ignorePatterns: ['dist/**', 'node_modules/**', '.turbo/**'],
  printWidth: 80,
  semi: false,
  singleQuote: true,
  sortImports: {
    internalPattern: ['#', '@workspace/'],
  },
  sortPackageJson: {
    sortScripts: false,
  },
  tabWidth: 2,
  trailingComma: 'all',
})
