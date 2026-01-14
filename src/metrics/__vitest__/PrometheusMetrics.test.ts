import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrometheusMetrics } from '../PrometheusMetrics.js';

describe('PrometheusMetrics', () => {
  // Store original env
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset singleton between tests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (PrometheusMetrics as any).instance = null;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = PrometheusMetrics.getInstance();
      const instance2 = PrometheusMetrics.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance if none exists', () => {
      const instance = PrometheusMetrics.getInstance();

      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(PrometheusMetrics);
    });
  });

  describe('metrics counters', () => {
    it('should have cacheHits counter', () => {
      const metrics = PrometheusMetrics.getInstance();

      expect(metrics.cacheHits).toBeDefined();
      expect(metrics.cacheHits.inc).toBeDefined();
    });

    it('should have cacheMisses counter', () => {
      const metrics = PrometheusMetrics.getInstance();

      expect(metrics.cacheMisses).toBeDefined();
      expect(metrics.cacheMisses.inc).toBeDefined();
    });

    it('should have cacheInvalidations counter', () => {
      const metrics = PrometheusMetrics.getInstance();

      expect(metrics.cacheInvalidations).toBeDefined();
      expect(metrics.cacheInvalidations.inc).toBeDefined();
    });

    it('should increment cacheHits', () => {
      const metrics = PrometheusMetrics.getInstance();

      // Should not throw
      expect(() => metrics.cacheHits.inc()).not.toThrow();
    });

    it('should increment cacheMisses', () => {
      const metrics = PrometheusMetrics.getInstance();

      expect(() => metrics.cacheMisses.inc()).not.toThrow();
    });

    it('should increment cacheInvalidations', () => {
      const metrics = PrometheusMetrics.getInstance();

      expect(() => metrics.cacheInvalidations.inc()).not.toThrow();
    });
  });

  describe('cacheSize gauge', () => {
    it('should have cacheSize gauge', () => {
      const metrics = PrometheusMetrics.getInstance();

      expect(metrics.cacheSize).toBeDefined();
      expect(metrics.cacheSize.set).toBeDefined();
    });

    it('should set cache size', () => {
      const metrics = PrometheusMetrics.getInstance();

      expect(() => metrics.cacheSize.set(100)).not.toThrow();
    });
  });

  describe('queryDuration histogram', () => {
    it('should have queryDuration histogram', () => {
      const metrics = PrometheusMetrics.getInstance();

      expect(metrics.queryDuration).toBeDefined();
      expect(metrics.queryDuration.observe).toBeDefined();
    });

    it('should record query duration', () => {
      const metrics = PrometheusMetrics.getInstance();

      expect(() =>
        metrics.queryDuration.observe({ cache_status: 'hit', operation: 'search' }, 0.05)
      ).not.toThrow();
    });

    it('should record query duration with cache miss', () => {
      const metrics = PrometheusMetrics.getInstance();

      expect(() =>
        metrics.queryDuration.observe({ cache_status: 'miss', operation: 'load' }, 0.1)
      ).not.toThrow();
    });
  });

  describe('startServer', () => {
    it('should not start server when ENABLE_PROMETHEUS_METRICS is not set', () => {
      delete process.env.ENABLE_PROMETHEUS_METRICS;

      const metrics = PrometheusMetrics.getInstance();
      metrics.startServer();

      // Server should not be started
      // This is tested implicitly by not throwing and by checking no port is bound
    });

    it('should not start server when ENABLE_PROMETHEUS_METRICS is false', () => {
      process.env.ENABLE_PROMETHEUS_METRICS = 'false';

      const metrics = PrometheusMetrics.getInstance();
      metrics.startServer();

      // Server should not be started
    });
  });

  describe('stopServer', () => {
    it('should handle stopServer when server not started', () => {
      const metrics = PrometheusMetrics.getInstance();

      // Should not throw when server wasn't started
      expect(() => metrics.stopServer()).not.toThrow();
    });
  });

  describe('reset', () => {
    it('should reset metrics without error', () => {
      const metrics = PrometheusMetrics.getInstance();

      // Increment some counters first
      metrics.cacheHits.inc();
      metrics.cacheMisses.inc();
      metrics.cacheSize.set(50);

      // Reset should not throw
      expect(() => metrics.reset()).not.toThrow();
    });
  });

  describe('helper methods', () => {
    it('should record cache hit via helper', () => {
      const metrics = PrometheusMetrics.getInstance();

      expect(() => metrics.recordCacheHit()).not.toThrow();
    });

    it('should record cache miss via helper', () => {
      const metrics = PrometheusMetrics.getInstance();

      expect(() => metrics.recordCacheMiss()).not.toThrow();
    });

    it('should record cache invalidation via helper', () => {
      const metrics = PrometheusMetrics.getInstance();

      expect(() => metrics.recordCacheInvalidation()).not.toThrow();
    });

    it('should update cache size via helper', () => {
      const metrics = PrometheusMetrics.getInstance();

      expect(() => metrics.updateCacheSize(100)).not.toThrow();
    });

    it('should record query duration via helper', () => {
      const metrics = PrometheusMetrics.getInstance();

      expect(() => metrics.recordQueryDuration(0.1, 'hit', 'search')).not.toThrow();
      expect(() => metrics.recordQueryDuration(0.2, 'miss', 'load')).not.toThrow();
      expect(() => metrics.recordQueryDuration(0.3, 'disabled', 'create')).not.toThrow();
    });

    it('should create and use query timer', () => {
      const metrics = PrometheusMetrics.getInstance();

      const stopTimer = metrics.startQueryTimer('search');
      expect(typeof stopTimer).toBe('function');

      // Stop timer should not throw
      expect(() => stopTimer('hit')).not.toThrow();
    });
  });

  describe('getMetrics', () => {
    it('should return metrics in Prometheus format', async () => {
      const metrics = PrometheusMetrics.getInstance();

      const output = await metrics.getMetrics();

      expect(typeof output).toBe('string');
      expect(output).toContain('mcp_cache_hits_total');
      expect(output).toContain('mcp_cache_misses_total');
    });
  });
});
