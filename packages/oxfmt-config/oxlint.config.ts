import { defineConfig } from 'oxlint'

export default defineConfig({
  categories: {
    correctness: 'error',
    suspicious: 'warn',
  },
  env: {
    es2024: true,
    node: true,
  },
  ignorePatterns: ['dist/**', 'node_modules/**', '.turbo/**'],
  plugins: ['eslint', 'typescript', 'unicorn', 'oxc', 'import', 'node'],
})
