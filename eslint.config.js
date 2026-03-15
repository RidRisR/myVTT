import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.worktrees']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strict,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Allow underscore-prefixed params/caught errors (e.g. _err, _db)
      // varsIgnorePattern is intentionally NOT set — unused variables must be removed, not silenced
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // React Compiler rules — not using Compiler in this project,
      // and the Yjs external-store sync pattern legitimately uses
      // setState-in-effect. Re-enable when adopting React Compiler.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
    },
  },
  // Store Action Convention: only store files may import the api module.
  // Plugin boundary: only registry.ts may import from plugins/ — all other src/ code accesses
  // plugin logic via useRulePlugin(). This enforces the plugin architectural boundary.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/stores/**', 'src/shared/__tests__/**', 'src/shared/api.ts', 'src/rules/registry.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/shared/api', '**/shared/api.ts'],
              message:
                'Store Action Convention: api must only be imported in src/stores/. Move API calls to a store method. See docs/conventions/store-actions.md',
            },
            {
              group: ['**/plugins/**'],
              message:
                'Plugin boundary: src/ base must not import directly from plugins/. Access plugin logic via useRulePlugin(). Only src/rules/registry.ts may import plugins.',
            },
          ],
        },
      ],
    },
  },
  // Server route files use req.roomDb! extensively — middleware guarantees non-null
  {
    files: ['server/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  prettier,
])
