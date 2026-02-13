/**
 * Global vitest setup file for cleanup and resource management
 *
 * This file ensures proper cleanup of resources after all tests complete,
 * preventing resource leaks that could cause vitest workers to hang.
 */
import { afterAll } from 'vitest';

/**
 * Global cleanup after all tests complete
 *
 * This prevents resource leaks by ensuring all background intervals,
 * timers, and connections are properly closed.
 */
afterAll(async () => {
  // Cleanup PrometheusMetrics if it was initialized
  // Note: In normal test runs, PrometheusMetrics should NOT be initialized
  // because of the environment check in src/index.ts. This is a safety net.
  try {
    const { PrometheusMetrics } = await import('./src/metrics/PrometheusMetrics.js');
    const metrics = PrometheusMetrics.getInstance();

    // Stop metrics server and cleanup intervals
    if (metrics) {
      metrics.stopServer();
      metrics.stopDefaultMetrics();
    }
  } catch (error) {
    // Ignore errors if PrometheusMetrics wasn't imported/initialized
    // This is expected in most test runs
  }

  // Force exit after a short delay to ensure all async operations complete
  // This prevents hanging vitest workers
  await new Promise(resolve => setTimeout(resolve, 100));
});
