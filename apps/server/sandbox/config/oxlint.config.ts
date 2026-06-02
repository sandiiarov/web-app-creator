export default {
  categories: {
    correctness: 'error',
  },
  env: {
    browser: true,
    es2020: true,
  },
  ignorePatterns: [
    '**/.web-app-creator/**',
    '**/dist/**',
    '**/node_modules/**',
  ],
  plugins: ['typescript', 'react', 'oxc'],
}
