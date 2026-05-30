import { createRequire } from 'node:module'

import { defineConfig, type DummyRuleMap } from 'oxlint'

type SharedOxlintOptions = {
  ignorePatterns?: string[]
  tailwindEntryPoint?: string
  typeAware?: boolean
}

const require = createRequire(import.meta.url)

const baseIgnorePatterns = [
  'dist',
  'dist/**',
  'node_modules/**',
  '.turbo/**',
  'coverage/**',
]
const jsPlugins = [
  {
    name: 'react-refresh',
    specifier: require.resolve('eslint-plugin-react-refresh'),
  },
  {
    name: 'perfectionist',
    specifier: require.resolve('eslint-plugin-perfectionist'),
  },
  {
    name: 'tailwindcss',
    specifier: require.resolve('oxlint-tailwindcss'),
  },
]
const naturalAscendingOrder = {
  order: 'asc',
  type: 'natural',
} as const
const sharedRules = {
  'no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    },
  ],
  'perfectionist/sort-array-includes': ['error', naturalAscendingOrder],
  'perfectionist/sort-classes': ['error', naturalAscendingOrder],
  'perfectionist/sort-decorators': ['error', naturalAscendingOrder],
  'perfectionist/sort-enums': ['error', naturalAscendingOrder],
  'perfectionist/sort-export-attributes': ['error', naturalAscendingOrder],
  'perfectionist/sort-exports': ['error', naturalAscendingOrder],
  'perfectionist/sort-heritage-clauses': ['error', naturalAscendingOrder],
  'perfectionist/sort-interfaces': ['error', naturalAscendingOrder],
  'perfectionist/sort-intersection-types': ['error', naturalAscendingOrder],
  'perfectionist/sort-jsx-props': ['error', naturalAscendingOrder],
  'perfectionist/sort-maps': ['error', naturalAscendingOrder],
  'perfectionist/sort-modules': ['error', naturalAscendingOrder],
  'perfectionist/sort-named-exports': ['error', naturalAscendingOrder],
  'perfectionist/sort-object-types': ['error', naturalAscendingOrder],
  'perfectionist/sort-objects': ['error', naturalAscendingOrder],
  'perfectionist/sort-sets': ['error', naturalAscendingOrder],
  'perfectionist/sort-switch-case': ['error', naturalAscendingOrder],
  'perfectionist/sort-union-types': ['error', naturalAscendingOrder],
  'perfectionist/sort-variable-declarations': ['error', naturalAscendingOrder],
  'react-refresh/only-export-components': [
    'warn',
    {
      allowConstantExport: true,
    },
  ],
  'react/exhaustive-deps': 'warn',
  'react/rules-of-hooks': 'error',
  'tailwindcss/consistent-variant-order': 'off',
  'tailwindcss/enforce-canonical': 'warn',
  'tailwindcss/enforce-consistent-important-position': 'warn',
  'tailwindcss/enforce-consistent-variable-syntax': 'warn',
  'tailwindcss/enforce-negative-arbitrary-values': 'warn',
  'tailwindcss/enforce-shorthand': 'warn',
  'tailwindcss/enforce-sort-order': 'off',
  'tailwindcss/no-conflicting-classes': 'warn',
  'tailwindcss/no-contradicting-variants': 'warn',
  'tailwindcss/no-dark-without-light': 'warn',
  'tailwindcss/no-deprecated-classes': 'error',
  'tailwindcss/no-duplicate-classes': 'error',
  'tailwindcss/no-hardcoded-colors': 'warn',
  'tailwindcss/no-unknown-classes': 'error',
  'tailwindcss/no-unnecessary-arbitrary-value': 'warn',
  'tailwindcss/no-unnecessary-whitespace': 'off',
  'typescript/no-explicit-any': 'warn',
} as const

export function createNodeConfig(options: SharedOxlintOptions = {}) {
  return defineConfig({
    categories: {
      correctness: 'error',
    },
    env: {
      builtin: true,
      es2020: true,
      node: true,
    },
    ignorePatterns: withSharedIgnores(options.ignorePatterns),
    jsPlugins,
    options: options.typeAware ? { typeAware: true } : {},
    plugins: ['typescript', 'react', 'oxc'],
    rules: sharedRules as unknown as DummyRuleMap,
  })
}

export function createReactConfig(options: SharedOxlintOptions = {}) {
  return defineConfig({
    categories: {
      correctness: 'error',
    },
    env: {
      browser: true,
      builtin: true,
      es2020: true,
    },
    ignorePatterns: withSharedIgnores(options.ignorePatterns),
    jsPlugins,
    options: options.typeAware ? { typeAware: true } : {},
    plugins: ['typescript', 'react', 'oxc'],
    rules: sharedRules as unknown as DummyRuleMap,
    settings: options.tailwindEntryPoint
      ? {
          tailwindcss: {
            entryPoint: options.tailwindEntryPoint,
          },
        }
      : {},
  })
}

function withSharedIgnores(ignorePatterns: string[] = []) {
  return [...baseIgnorePatterns, ...ignorePatterns]
}
