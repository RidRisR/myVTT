import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.worktrees', 'coverage', 'commitlint.config.ts']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
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
      // Numbers in template literals are safe: `${count} items` is fine.
      // This rule targets objects/undefined/null, not numbers.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  // Store Action Convention: only store files may import the api module.
  // Plugin boundary: only registry.ts may import from plugins/ — all other src/ code accesses
  // plugin logic via useRulePlugin(). This enforces the plugin architectural boundary.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/stores/**',
      'src/shared/__tests__/**',
      'src/shared/api.ts',
      'src/rules/registry.ts',
    ],
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
  // Shared boundary: src/shared/ must be self-contained — no imports from outside the directory.
  // This prevents shared type files from silently depending on feature-directory types,
  // which would recreate the cross-boundary leakage that src/shared/ is meant to solve.
  // Pattern: enumerate specific feature dirs outside src/shared/ + block ../../ (escapes via subdirs).
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    ignores: ['src/shared/**/__tests__/**', 'src/shared/**/__test-utils__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../chat/**',
                '../showcase/**',
                '../stores/**',
                '../admin/**',
                '../rules/**',
                '../../**',
              ],
              message:
                'src/shared/ must be self-contained: no imports from outside src/shared/. Move the type into src/shared/ first.',
            },
          ],
        },
      ],
    },
  },
  // Test files: vi.fn()/vi.mock() produce `any`-typed mocks, making no-unsafe-*
  // rules inherently noisy. Disable for test code; keep strict for production code.
  //
  // no-non-null-assertion: in tests, `arr[0]!.prop` after `expect(arr).toHaveLength(1)` is
  // intentional fast-fail — if the assumption is wrong we want a TypeError, not a silent
  // undefined that produces a misleading expect() failure message.
  //
  // no-unnecessary-condition: after a type assertion (e.g. `as AssetMeta`), optional chains
  // are flagged as unnecessary. In tests this pattern is fine and clearer than a guard clause.
  {
    files: ['**/__tests__/**/*.ts', '**/__test-utils__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
  // E2E spec files: waitForFunction/evaluate callbacks are serialized and run in the browser
  // context — TypeScript does not type-check their bodies at compile time. The `any` casts
  // for window.__MYVTT_STORES__ are intentional and unavoidable in this context.
  {
    files: ['e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // Server: req.roomDb! and req.roomId! are guaranteed by withRoom middleware.
  // Server boundary: server/ must not import from src/stores/ (client-only, uses DOM/window)
  // or from src/ feature directories — only src/shared/ is allowed.
  // Shared types should live in src/shared/ or server/socketTypes.ts.
  {
    files: ['server/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/src/stores/**', '**/stores/**'],
              message:
                'Server boundary: server/ must not import from src/stores/ (client-only). Use src/shared/ for shared types.',
            },
            {
              group: ['**/src/chat/**', '**/src/showcase/**', '**/src/admin/**', '**/src/rules/**'],
              message:
                'Server boundary: server/ may only import types from src/shared/. Move the type to src/shared/ first.',
            },
          ],
        },
      ],
    },
  },
  prettier,
])
