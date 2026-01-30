// ESLint Flat Config - TypeScript + Recommended Plugins
// MCP Neo4j Knowledge Graph Server

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';
import importPlugin from 'eslint-plugin-import';
import unicorn from 'eslint-plugin-unicorn';
import sonarjs from 'eslint-plugin-sonarjs';
import promise from 'eslint-plugin-promise';
import prettier from 'eslint-config-prettier';

// Node.js backend
import n from 'eslint-plugin-n';

// Vitest testing
import vitest from 'eslint-plugin-vitest';

export default tseslint.config(
  // =============================================================================
  // IGNORES
  // =============================================================================
  {
    ignores: [
      'dist/',
      'node_modules/',
      'coverage/',
      '*.config.js',
      '*.config.mjs',
      'src/utils/__mocks__/**',
      'src/utils/test-teardown.js',
      // Test files excluded from type-checked linting (not in tsconfig)
      '**/__vitest__/**',
      '**/*.test.ts',
      '**/*.spec.ts',
    ],
  },

  // =============================================================================
  // CORE PLUGINS (Always enabled)
  // =============================================================================

  // Base ESLint recommended
  eslint.configs.recommended,

  // TypeScript recommended (not strictTypeChecked for existing codebase)
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Parser options for type-aware linting
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Stylistic plugin
  stylistic.configs.recommended,

  // Import plugin
  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-duplicates': 'error',
      'import/no-cycle': 'warn',
      'import/no-unresolved': 'off',
    },
  },

  // Unicorn plugin
  {
    plugins: {
      unicorn,
    },
    rules: {
      ...unicorn.configs.recommended.rules,
      // Allow camelCase filenames (existing convention: temporalEntity.ts)
      // Also ignore specific files like OpenAIEmbeddingService.ts (AI acronym)
      'unicorn/filename-case': [
        'error',
        {
          cases: { kebabCase: true, pascalCase: true, camelCase: true },
          ignore: ['^OpenAI.*\\.ts$'],
        },
      ],
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-null': 'off',
      'unicorn/no-array-reduce': 'off',
      'unicorn/no-array-for-each': 'off',
      'unicorn/prefer-spread': 'off',
      'unicorn/prefer-top-level-await': 'off',
      // Relaxed for existing codebase
      'unicorn/prefer-array-some': 'off',
      'unicorn/prefer-ternary': 'off',
      'unicorn/prefer-number-properties': 'off',
      'unicorn/switch-case-braces': 'off',
      'unicorn/no-array-sort': 'off', // toSorted is ES2023+, project uses ES2020
      'unicorn/text-encoding-identifier-case': 'off',
      'unicorn/no-await-expression-member': 'off',
      'unicorn/no-process-exit': 'off', // This is a CLI tool
      'unicorn/no-new-array': 'off',
      'unicorn/prefer-code-point': 'off',
      'unicorn/explicit-length-check': 'off',
      'unicorn/consistent-function-scoping': 'off',
      'unicorn/no-useless-switch-case': 'off',
      'unicorn/no-immediate-mutation': 'off',
      'unicorn/prefer-single-call': 'off',
    },
  },

  // SonarJS plugin
  {
    plugins: {
      sonarjs,
    },
    rules: {
      ...sonarjs.configs.recommended.rules,
      // Relax for existing codebase
      'sonarjs/cognitive-complexity': ['warn', 25],
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/redundant-type-aliases': 'off',
      'sonarjs/no-async-constructor': 'warn',
      'sonarjs/pseudo-random': 'off',
      'sonarjs/no-dead-store': 'warn',
      'sonarjs/no-unused-vars': 'off', // Handled by @typescript-eslint
      'sonarjs/deprecation': 'warn', // Some deprecated usage is intentional
      'sonarjs/no-alphabetical-sort': 'off',
      'sonarjs/no-hardcoded-passwords': 'off', // False positives on default config
      'sonarjs/no-redundant-optional': 'off',
      'sonarjs/different-types-comparison': 'warn',
      'sonarjs/no-all-duplicated-branches': 'warn',
      'sonarjs/no-small-switch': 'off',
      'sonarjs/updated-loop-counter': 'off',
      'sonarjs/unused-import': 'off', // Handled by @typescript-eslint
      'sonarjs/hashing': 'off', // Hash algorithms used for non-crypto purposes
      'sonarjs/use-type-alias': 'off',
      'sonarjs/no-commented-code': 'warn',
    },
  },

  // Promise plugin
  {
    plugins: {
      promise,
    },
    rules: {
      ...promise.configs.recommended.rules,
    },
  },

  // =============================================================================
  // CONDITIONAL PLUGINS - Node.js Backend
  // =============================================================================
  {
    plugins: { n },
    rules: {
      ...n.configs.recommended.rules,
      'n/no-missing-import': 'off',
      'n/no-unpublished-import': 'off',
      'n/no-unsupported-features/node-builtins': 'off',
      'n/no-process-exit': 'off', // This is a CLI tool
    },
  },

  // =============================================================================
  // CONDITIONAL PLUGINS - Vitest (unit/integration testing)
  // =============================================================================
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/__vitest__/**/*.ts'],
    plugins: {
      vitest,
    },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'warn',
    },
  },

  // =============================================================================
  // CUSTOM RULE OVERRIDES
  // =============================================================================
  {
    rules: {
      // TypeScript rules - relaxed for existing codebase
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
          disallowTypeAnnotations: false, // Allow import() type annotations
        },
      ],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-empty-function': 'off', // Allow empty stubs
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
      ],

      // Base ESLint rules
      'no-useless-catch': 'off',

      // Stylistic rules
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/max-len': ['error', { code: 100, ignoreUrls: true, ignoreStrings: true }],
    },
  },

  // =============================================================================
  // PRETTIER (must be last)
  // =============================================================================
  prettier
);
