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
        // Test utilities (mocks and fixtures for testing)
        'src/__test-utils__/**/*.ts',
      ],
      thresholds: {
        // Target: 75% coverage (72% for branches due to Neo4jStorageProvider integration code)
        // Remaining gap is primarily in Neo4jStorageProvider (requires live Neo4j for testing)
        branches: 72,
        functions: 75,
        lines: 75,
        statements: 75,
      },
    },
  },
});
