import { createNodeConfig } from '@workspace/oxlint-config'

/**
 * Vendored hashline edit engine (ported from pi-hashline).
 * Kept under relaxed STYLE rules: it must pass correctness/typecheck, but the
 * project's perfectionist member-sort aesthetic and no-explicit-any do not
 * apply to imported engine internals (reordering them is high-churn/zero-value).
 */
const hashlineOverride = {
  files: ['src/mastra/lib/hashline/**/*.ts'],
  rules: {
    'perfectionist/sort-array-includes': 'off',
    'perfectionist/sort-classes': 'off',
    'perfectionist/sort-decorators': 'off',
    'perfectionist/sort-enums': 'off',
    'perfectionist/sort-export-attributes': 'off',
    'perfectionist/sort-exports': 'off',
    'perfectionist/sort-heritage-clauses': 'off',
    'perfectionist/sort-interfaces': 'off',
    'perfectionist/sort-intersection-types': 'off',
    'perfectionist/sort-maps': 'off',
    'perfectionist/sort-modules': 'off',
    'perfectionist/sort-named-exports': 'off',
    'perfectionist/sort-object-types': 'off',
    'perfectionist/sort-objects': 'off',
    'perfectionist/sort-sets': 'off',
    'perfectionist/sort-switch-case': 'off',
    'perfectionist/sort-union-types': 'off',
    'perfectionist/sort-variable-declarations': 'off',
    'typescript/no-explicit-any': 'off',
  },
}

export default {
  ...createNodeConfig(),
  overrides: [hashlineOverride],
}
