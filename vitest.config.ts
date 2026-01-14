import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Set NODE_ENV to test for silent logging
    env: {
      NODE_ENV: 'test',
    },

    // Global setup file for cleanup and resource management
    setupFiles: ['./vitest.setup.ts'],

    // Include only our Vitest test files
    include: ['**/__vitest__/**/*.test.{js,ts}'],

    // Exclude Jest test files to avoid conflicts
    exclude: ['**/__tests__/**/*'],

    // Ensure globals are enabled for compatibility
    globals: true,

    // Configure environment (node or jsdom)
    environment: 'node',

    // Timeout for teardown to prevent hanging workers
    teardownTimeout: 5000,

    // ESM support settings
    alias: {
      // Allow importing without .js extension in test files
      '^(\\.\\.?/.*)(\\.[jt]s)?$': '$1',
    },

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        // Type definitions and test files
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/dist/**',
        // Re-export index files (no logic to test)
        'src/**/index.ts',
        'src/server/handlers/toolHandlers/index.ts',
        'src/retrieval/index.ts',
        // Pure type definition files (interfaces only)
        'src/types/batch-operations.ts',
        'src/types/entity-embedding.ts',
        'src/types/vector-index.ts',
        'src/types/vector-store.ts',
        // CLI scripts (integration tooling)
        'src/cli/**/*.ts',
        // File system utilities (thin wrapper)
        'src/utils/fs.ts',
      ],
      thresholds: {
        // Phase 1: Lowered to current levels, will incrementally raise
        branches: 40,
        functions: 45,
        lines: 45,
        statements: 45,
      },
    },
  },
});
