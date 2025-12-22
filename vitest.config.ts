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

    // Timeout for teardown to prevent hanging workers
    teardownTimeout: 5000,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/*.test.ts', 'src/dist/**'],
      thresholds: {
        branches: 50,
        functions: 50,
        lines: 50,
        statements: 50,
      },
    },
  },
});
