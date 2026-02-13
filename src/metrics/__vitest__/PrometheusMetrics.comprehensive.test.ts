/**
 * Comprehensive tests for PrometheusMetrics server functionality
 * Covers: server startup, server requests, HTTP responses
 */

import http from 'node:http';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrometheusMetrics } from '../PrometheusMetrics.js';

// Mock the logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('PrometheusMetrics Server', () => {
  let originalEnableMetrics: string | undefined;
  let metrics: PrometheusMetrics;

  beforeEach(() => {
    // Store and clear env
    originalEnableMetrics = process.env.ENABLE_PROMETHEUS_METRICS;

    // Clean up any existing instance
    const existingInstance = (PrometheusMetrics as { instance: PrometheusMetrics | null }).instance;
    if (existingInstance) {
      existingInstance.stopServer();
      existingInstance.stopDefaultMetrics();
    }

    // Reset singleton
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (PrometheusMetrics as any).instance = null;
  });

  afterEach(async () => {
    // Stop any running server
    if (metrics) {
      metrics.stopServer();
      metrics.stopDefaultMetrics();
    }

    // Restore env
    if (originalEnableMetrics === undefined) {
      delete process.env.ENABLE_PROMETHEUS_METRICS;
    } else {
      process.env.ENABLE_PROMETHEUS_METRICS = originalEnableMetrics;
    }

    // Small delay to ensure server is fully closed
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('server startup', () => {
    it('should start server when ENABLE_PROMETHEUS_METRICS is true', async () => {
      process.env.ENABLE_PROMETHEUS_METRICS = 'true';

      metrics = PrometheusMetrics.getInstance();

      // Use a random high port to avoid conflicts
      const testPort = 19091 + Math.floor(Math.random() * 1000);
      metrics.startServer(testPort);

      // Give server time to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify server is running by making a request
      const response = await new Promise<{ statusCode: number; body: string }>(
        (resolve, reject) => {
          const req = http.get(`http://localhost:${testPort}/metrics`, res => {
            let body = '';
            res.on('data', chunk => {
              body += chunk;
            });
            res.on('end', () => {
              resolve({ statusCode: res.statusCode || 500, body });
            });
          });
          req.on('error', reject);
          req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
          });
        }
      );

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('mcp_cache_hits_total');
    });

    it('should return 404 for non-metrics endpoint', async () => {
      process.env.ENABLE_PROMETHEUS_METRICS = 'true';

      metrics = PrometheusMetrics.getInstance();

      const testPort = 19191 + Math.floor(Math.random() * 1000);
      metrics.startServer(testPort);

      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await new Promise<{ statusCode: number; body: string }>(
        (resolve, reject) => {
          const req = http.get(`http://localhost:${testPort}/invalid`, res => {
            let body = '';
            res.on('data', chunk => {
              body += chunk;
            });
            res.on('end', () => {
              resolve({ statusCode: res.statusCode || 500, body });
            });
          });
          req.on('error', reject);
          req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
          });
        }
      );

      expect(response.statusCode).toBe(404);
      expect(response.body).toBe('Not Found');
    });

    it('should not start second server if already running', async () => {
      process.env.ENABLE_PROMETHEUS_METRICS = 'true';

      metrics = PrometheusMetrics.getInstance();

      const testPort = 19291 + Math.floor(Math.random() * 1000);
      metrics.startServer(testPort);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Try to start again - should not throw or create second server
      expect(() => metrics.startServer(testPort)).not.toThrow();
    });
  });

  describe('stopDefaultMetrics', () => {
    it('should stop default metrics collection', () => {
      metrics = PrometheusMetrics.getInstance();

      // stopDefaultMetrics should clear the interval
      expect(() => metrics.stopDefaultMetrics()).not.toThrow();

      // Calling again should not throw
      expect(() => metrics.stopDefaultMetrics()).not.toThrow();
    });
  });

  describe('stopServer', () => {
    it('should stop running server', async () => {
      process.env.ENABLE_PROMETHEUS_METRICS = 'true';

      metrics = PrometheusMetrics.getInstance();

      const testPort = 19391 + Math.floor(Math.random() * 1000);
      metrics.startServer(testPort);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Stop the server
      metrics.stopServer();

      // Give server time to close
      await new Promise(resolve => setTimeout(resolve, 100));

      // Server should no longer be accessible
      await expect(
        new Promise((resolve, reject) => {
          const req = http.get(`http://localhost:${testPort}/metrics`, resolve);
          req.on('error', reject);
          req.setTimeout(1000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
          });
        })
      ).rejects.toThrow();
    });
  });
});
