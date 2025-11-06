import promClient from 'prom-client';
import http from 'http';
import { logger } from '../utils/logger.js';

/**
 * PrometheusMetrics - Manages Prometheus metrics collection for the MCP Knowledge Graph server
 *
 * Provides metrics for:
 * - Query result cache performance (hits, misses, invalidations)
 * - Cache size monitoring
 * - Query execution duration with cache status tracking
 *
 * Metrics are exposed on /metrics endpoint on port 9091 when enabled via environment variable.
 */
export class PrometheusMetrics {
  private static instance: PrometheusMetrics | null = null;
  private register: promClient.Registry;
  private server: http.Server | null = null;
  private defaultMetricsInterval: (() => void) | null = null;

  // Cache performance counters
  public readonly cacheHits: promClient.Counter;
  public readonly cacheMisses: promClient.Counter;
  public readonly cacheInvalidations: promClient.Counter;

  // Cache size gauge
  public readonly cacheSize: promClient.Gauge;

  // Query duration histogram with cache status label
  public readonly queryDuration: promClient.Histogram;

  private constructor() {
    this.register = new promClient.Registry();

    // Add default metrics (process CPU, memory, etc.)
    // Store interval reference for cleanup
    const clearFn = promClient.collectDefaultMetrics({ register: this.register });
    this.defaultMetricsInterval = typeof clearFn === 'function' ? clearFn : null;

    // Initialize cache hit counter
    this.cacheHits = new promClient.Counter({
      name: 'mcp_cache_hits_total',
      help: 'Total number of cache hits',
      registers: [this.register],
    });

    // Initialize cache miss counter
    this.cacheMisses = new promClient.Counter({
      name: 'mcp_cache_misses_total',
      help: 'Total number of cache misses',
      registers: [this.register],
    });

    // Initialize cache invalidation counter
    this.cacheInvalidations = new promClient.Counter({
      name: 'mcp_cache_invalidations_total',
      help: 'Total number of cache invalidations',
      registers: [this.register],
    });

    // Initialize cache size gauge
    this.cacheSize = new promClient.Gauge({
      name: 'mcp_cache_size_current',
      help: 'Current number of items in the cache',
      registers: [this.register],
    });

    // Initialize query duration histogram
    this.queryDuration = new promClient.Histogram({
      name: 'mcp_query_duration_seconds',
      help: 'Query execution duration in seconds',
      labelNames: ['cache_status', 'operation'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5], // 1ms to 5s
      registers: [this.register],
    });
  }

  /**
   * Get singleton instance of PrometheusMetrics
   */
  public static getInstance(): PrometheusMetrics {
    if (!PrometheusMetrics.instance) {
      PrometheusMetrics.instance = new PrometheusMetrics();
    }
    return PrometheusMetrics.instance;
  }

  /**
   * Start the metrics HTTP server on specified port
   * Only starts if ENABLE_PROMETHEUS_METRICS=true in environment
   */
  public startServer(port: number = 9091): void {
    const enabled = process.env.ENABLE_PROMETHEUS_METRICS === 'true';

    if (!enabled) {
      logger.info('[PrometheusMetrics] Metrics collection disabled (ENABLE_PROMETHEUS_METRICS != true)');
      return;
    }

    if (this.server) {
      logger.info(`[PrometheusMetrics] Server already running on port ${port}`);
      return;
    }

    this.server = http.createServer(async (req, res) => {
      if (req.url === '/metrics') {
        res.setHeader('Content-Type', this.register.contentType);
        const metrics = await this.register.metrics();
        res.end(metrics);
      } else {
        res.statusCode = 404;
        res.end('Not Found');
      }
    });

    this.server.listen(port, () => {
      logger.info(`[PrometheusMetrics] Metrics server listening on http://localhost:${port}/metrics`);
    });
  }

  /**
   * Stop the metrics HTTP server
   */
  public stopServer(): void {
    // Clear intervals first to prevent resource leaks
    this.stopDefaultMetrics();

    if (this.server) {
      this.server.close(() => {
        logger.info('[PrometheusMetrics] Metrics server stopped');
      });
      this.server = null;
    }
  }

  /**
   * Stop the default metrics collection intervals
   * This prevents resource leaks by clearing the setInterval timers
   * created by collectDefaultMetrics()
   */
  public stopDefaultMetrics(): void {
    if (this.defaultMetricsInterval) {
      this.defaultMetricsInterval();
      this.defaultMetricsInterval = null;
      logger.info('[PrometheusMetrics] Default metrics collection stopped');
    }
  }

  /**
   * Record a cache hit
   */
  public recordCacheHit(): void {
    this.cacheHits.inc();
  }

  /**
   * Record a cache miss
   */
  public recordCacheMiss(): void {
    this.cacheMisses.inc();
  }

  /**
   * Record a cache invalidation
   */
  public recordCacheInvalidation(): void {
    this.cacheInvalidations.inc();
  }

  /**
   * Update current cache size
   */
  public updateCacheSize(size: number): void {
    this.cacheSize.set(size);
  }

  /**
   * Record query execution duration
   * @param durationSeconds - Duration in seconds
   * @param cacheStatus - 'hit' | 'miss' | 'disabled'
   * @param operation - Operation name (e.g., 'readGraph', 'searchNodes')
   */
  public recordQueryDuration(
    durationSeconds: number,
    cacheStatus: 'hit' | 'miss' | 'disabled',
    operation: string
  ): void {
    this.queryDuration.observe({ cache_status: cacheStatus, operation }, durationSeconds);
  }

  /**
   * Create a timer for measuring query duration
   * Returns a function that stops the timer and records the metric
   */
  public startQueryTimer(operation: string): (cacheStatus: 'hit' | 'miss' | 'disabled') => void {
    const start = Date.now();

    return (cacheStatus: 'hit' | 'miss' | 'disabled') => {
      const durationSeconds = (Date.now() - start) / 1000;
      this.recordQueryDuration(durationSeconds, cacheStatus, operation);
    };
  }

  /**
   * Get metrics in Prometheus exposition format
   */
  public async getMetrics(): Promise<string> {
    return await this.register.metrics();
  }

  /**
   * Reset all metrics (useful for testing)
   */
  public reset(): void {
    this.register.resetMetrics();
  }
}
