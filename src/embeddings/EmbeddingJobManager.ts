import crypto from 'node:crypto';

import { LRUCache } from 'lru-cache';

import type { Entity } from '../KnowledgeGraphManager.js';
import type { StorageProvider } from '../storage/StorageProvider.js';
import type { EntityEmbedding } from '../types/entity-embedding.js';

import type { EmbeddingService } from './EmbeddingService.js';
import type { JobStore } from './JobStore.js';

interface CacheOptions {
  size: number;
  ttl: number;
  // For test compatibility (older API style)
  maxItems?: number;
  ttlHours?: number;
}

interface RateLimiterOptions {
  tokensPerInterval: number;
  interval: number;
}

interface JobProcessResults {
  processed: number;
  successful: number;
  failed: number;
}

interface RateLimiterStatus {
  availableTokens: number;
  maxTokens: number;
  resetInMs: number;
}

interface CachedEmbedding {
  embedding: number[];
  timestamp: number;
  model: string;
}

interface Logger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Storage shape required by `EmbeddingJobManager` for entity access.
 * Persistence of the queue itself is delegated to `JobStore`.
 */
interface EmbeddingStorageProvider extends StorageProvider {
  getEntity(entityName: string): Promise<Entity | null>;
  storeEntityVector(entityName: string, embedding: EntityEmbedding): Promise<void>;
  /**
   * Optional: efficient predicate-based lookup for entities lacking an embedding.
   * When present, `scheduleIncrementalRegeneration` prefers it over the
   * `loadGraph()`-and-filter fallback (which strips the embedding property in
   * its return mapper and so always reports 100% missing).
   */
  getEntityNamesMissingEmbeddings?(): Promise<string[]>;
}

interface QueueStatus {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  totalJobs: number;
}

const DEFAULT_STALE_CLAIM_MS = 5 * 60 * 1000;

const nullLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Manages embedding jobs for semantic search.
 *
 * Persistence of the queue lives behind a `JobStore` — production wiring
 * uses `Neo4jJobStore`, which stores jobs as `:EmbeddingJob` nodes and
 * makes `claim()` safe under multi-worker contention.
 */
export class EmbeddingJobManager {
  private storageProvider: EmbeddingStorageProvider;
  public readonly embeddingService: EmbeddingService;
  public rateLimiter: {
    tokens: number;
    lastRefill: number;
    tokensPerInterval: number;
    interval: number;
  };

  public cache: LRUCache<string, CachedEmbedding>;
  private cacheOptions: CacheOptions = { size: 1000, ttl: 3_600_000 };
  private logger: Logger;
  private jobStore: JobStore;
  private staleClaimMs: number;
  /** Stable id for this process — visible in `:EmbeddingJob.claimedBy`. */
  public readonly workerId: string = crypto.randomUUID();

  constructor(
    storageProvider: EmbeddingStorageProvider,
    embeddingService: EmbeddingService,
    rateLimiterOptions?: RateLimiterOptions | null,
    cacheOptions?: CacheOptions | null,
    logger?: Logger | null,
    jobStore?: JobStore,
    staleClaimMs?: number
  ) {
    this.storageProvider = storageProvider;
    this.embeddingService = embeddingService;
    this.logger = logger || nullLogger;

    if (!jobStore) {
      throw new Error('EmbeddingJobManager requires a JobStore (v2.4.0+)');
    }
    this.jobStore = jobStore;
    this.staleClaimMs = staleClaimMs ?? DEFAULT_STALE_CLAIM_MS;

    const defaultRateLimiter = {
      tokensPerInterval: 60,
      interval: 60 * 1000,
    };
    const rateOptions = rateLimiterOptions || defaultRateLimiter;
    this.rateLimiter = {
      tokens: rateOptions.tokensPerInterval,
      lastRefill: Date.now(),
      tokensPerInterval: rateOptions.tokensPerInterval,
      interval: rateOptions.interval,
    };

    if (cacheOptions) {
      this.cacheOptions = {
        size: cacheOptions.size || cacheOptions.maxItems || 1000,
        ttl:
          cacheOptions.ttl ||
          (cacheOptions.ttlHours ? Math.round(cacheOptions.ttlHours * 60 * 60 * 1000) : 3_600_000),
      };
    }

    this.cache = new LRUCache({
      max: this.cacheOptions.size,
      ttl: Math.max(1, Math.round(this.cacheOptions.ttl)),
      updateAgeOnGet: true,
      allowStale: false,
      ttlAutopurge: true,
    });

    // Schema bootstrap — fire-and-log; safe on every start.
    this.jobStore.ensureSchema().catch(err => {
      this.logger.error('Failed to ensure JobStore schema', {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    this.logger.info('EmbeddingJobManager initialized', {
      workerId: this.workerId,
      staleClaimMs: this.staleClaimMs,
      cacheSize: this.cacheOptions.size,
      cacheTtl: this.cacheOptions.ttl,
      rateLimit: `${this.rateLimiter.tokensPerInterval} per ${this.rateLimiter.interval}ms`,
    });
  }

  async scheduleEntityEmbedding(entityName: string, priority = 1): Promise<string> {
    const entity = await this.storageProvider.getEntity(entityName);
    if (!entity) {
      const error = `Entity ${entityName} not found`;
      this.logger.error('Failed to schedule embedding', { entityName, error });
      throw new Error(error);
    }

    const jobId = await this.jobStore.enqueue({ entityName, priority });
    this.logger.info('Scheduled embedding job', { jobId, entityName, priority });
    return jobId;
  }

  async processJobs(batchSize = 10): Promise<JobProcessResults> {
    this.logger.info('Starting job processing', { batchSize, workerId: this.workerId });

    // Stale-claim sweep — releases jobs orphaned by dead workers before
    // we attempt to claim. Cheap when nothing's stale; essential for
    // recovery when a worker died mid-claim.
    await this.jobStore.releaseStale(this.staleClaimMs);

    const jobs = await this.jobStore.claim(this.workerId, batchSize);
    this.logger.debug('Claimed jobs', { count: jobs.length });

    const result: JobProcessResults = { processed: 0, successful: 0, failed: 0 };

    for (const job of jobs) {
      const rateLimitCheck = this._checkRateLimiter();
      if (!rateLimitCheck.success) {
        const remaining = jobs.slice(result.processed).map(j => j.id);
        this.logger.warn('Rate limit reached, releasing remaining claims', {
          remaining: remaining.length,
        });
        // Release without burning retry attempts — these jobs never ran.
        await this.jobStore.releaseClaims(remaining).catch(() => {});
        break;
      }

      this.logger.info('Processing embedding job', {
        jobId: job.id,
        entityName: job.entityName,
        attempt: job.attempts,
        maxAttempts: job.maxAttempts,
      });

      try {
        const entity = await this.storageProvider.getEntity(job.entityName);
        if (!entity) throw new Error(`Entity ${job.entityName} not found`);

        const text = this._prepareEntityText(entity);
        const embedding = await this._getCachedEmbeddingOrGenerate(text);
        const modelInfo = this.embeddingService.getModelInfo();

        await this.storageProvider.storeEntityVector(job.entityName, {
          vector: embedding,
          model: modelInfo.name,
          lastUpdated: Date.now(),
        });

        await this.jobStore.complete(job.id);

        this.logger.info('Successfully processed embedding job', {
          jobId: job.id,
          entityName: job.entityName,
          model: modelInfo.name,
          dimensions: embedding.length,
        });
        result.successful++;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        const failResult = await this.jobStore.fail(job.id, errorMessage);
        this.logger.error('Failed to process embedding job', {
          jobId: job.id,
          entityName: job.entityName,
          error: errorMessage,
          errorStack,
          attempt: job.attempts,
          maxAttempts: job.maxAttempts,
          nextStatus: failResult.status,
        });
        result.failed++;
      }

      result.processed++;
    }

    const queueStatus = await this.getQueueStatus();
    this.logger.info('Job processing complete', {
      processed: result.processed,
      successful: result.successful,
      failed: result.failed,
      remaining: queueStatus.pending,
    });
    return result;
  }

  async getQueueStatus(): Promise<QueueStatus> {
    const counts = await this.jobStore.countByStatus();
    this.logger.debug('Retrieved queue status', { ...counts });
    return counts;
  }

  async retryFailedJobs(): Promise<number> {
    const reset = await this.jobStore.retryFailed();
    this.logger.info('Reset failed jobs for retry', { count: reset });
    return reset;
  }

  async cleanupJobs(threshold?: number): Promise<number> {
    const cleanupThreshold = threshold || 7 * 24 * 60 * 60 * 1000;
    const deleted = await this.jobStore.cleanup(cleanupThreshold);
    this.logger.info('Cleaned up old completed jobs', {
      count: deleted,
      threshold: cleanupThreshold,
      olderThan: new Date(Date.now() - cleanupThreshold).toISOString(),
    });
    return deleted;
  }

  /**
   * Token-bucket rate limiter. Public for legacy test compatibility — was
   * `_checkRateLimiter` historically; kept callable from tests via underscore.
   */
  _checkRateLimiter(): { success: boolean } {
    const now = Date.now();
    const elapsed = now - this.rateLimiter.lastRefill;

    if (elapsed >= this.rateLimiter.interval) {
      const intervals = Math.floor(elapsed / this.rateLimiter.interval);
      this.rateLimiter.tokens = this.rateLimiter.tokensPerInterval;
      this.rateLimiter.lastRefill = now;
      this.logger.debug('Refilled rate limiter tokens', {
        current: this.rateLimiter.tokens,
        max: this.rateLimiter.tokensPerInterval,
        intervals,
      });
    }

    if (this.rateLimiter.tokens > 0) {
      this.rateLimiter.tokens--;
      this.logger.debug('Consumed rate limiter token', {
        remaining: this.rateLimiter.tokens,
        max: this.rateLimiter.tokensPerInterval,
      });
      return { success: true };
    }

    this.logger.warn('Rate limit exceeded', {
      availableTokens: 0,
      maxTokens: this.rateLimiter.tokensPerInterval,
      nextRefillIn: this.rateLimiter.interval - (now - this.rateLimiter.lastRefill),
    });
    return { success: false };
  }

  getRateLimiterStatus(): RateLimiterStatus {
    const now = Date.now();
    const elapsed = now - this.rateLimiter.lastRefill;
    if (elapsed >= this.rateLimiter.interval) {
      return {
        availableTokens: this.rateLimiter.tokensPerInterval,
        maxTokens: this.rateLimiter.tokensPerInterval,
        resetInMs: this.rateLimiter.interval,
      };
    }
    return {
      availableTokens: this.rateLimiter.tokens,
      maxTokens: this.rateLimiter.tokensPerInterval,
      resetInMs: this.rateLimiter.interval - elapsed,
    };
  }

  async _getCachedEmbeddingOrGenerate(text: string): Promise<number[]> {
    const cacheKey = this._generateCacheKey(text);
    const cachedValue = this.cache.get(cacheKey);
    if (cachedValue) {
      this.logger.debug('Cache hit', {
        textHash: cacheKey.slice(0, 8),
        age: Date.now() - cachedValue.timestamp,
      });
      return cachedValue.embedding;
    }
    this.logger.debug('Cache miss', { textHash: cacheKey.slice(0, 8) });
    try {
      const embedding = await this.embeddingService.generateEmbedding(text);
      this._cacheEmbedding(text, embedding);
      return embedding;
    } catch (error) {
      this.logger.error('Failed to generate embedding', {
        error,
        textLength: text.length,
      });
      throw error;
    }
  }

  private _cacheEmbedding(text: string, embedding: number[]): void {
    const cacheKey = this._generateCacheKey(text);
    const modelInfo = this.embeddingService.getModelInfo();
    this.cache.set(cacheKey, {
      embedding,
      timestamp: Date.now(),
      model: modelInfo.name,
    });
    this.logger.debug('Cached embedding', {
      textHash: cacheKey.slice(0, 8),
      model: modelInfo.name,
      dimensions: embedding.length,
    });
  }

  _generateCacheKey(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  private _prepareEntityText(entity: Entity): string {
    const lines = [`Name: ${entity.name}`, `Type: ${entity.entityType}`, 'Observations:'];

    if (entity.observations) {
      let observationsArray: unknown = entity.observations;
      if (typeof entity.observations === 'string') {
        try {
          observationsArray = JSON.parse(entity.observations);
        } catch {
          observationsArray = [entity.observations];
        }
      }
      if (!Array.isArray(observationsArray)) {
        observationsArray = [String(observationsArray)];
      }
      const arr = observationsArray as string[];
      if (arr.length > 0) {
        lines.push(...arr.map(obs => `- ${obs}`));
      } else {
        lines.push('  (No observations)');
      }
    } else {
      lines.push('  (No observations)');
    }

    const text = lines.join('\n');
    this.logger.debug('Prepared entity text for embedding', {
      entityName: entity.name,
      entityType: entity.entityType,
      observationCount: Array.isArray(entity.observations) ? entity.observations.length : 0,
      textLength: text.length,
    });
    return text;
  }

  getCacheEntry(key: string): CachedEmbedding | undefined {
    return this.cache.get(key);
  }

  /**
   * Enqueue embedding jobs for every currently-valid entity that lacks an
   * embedding. Intended for a server-side cron tick to backfill entities
   * created by thin clients running with `WRITE_EMBEDDINGS_LOCALLY=false`.
   *
   * v2.4.1+ — prefers `storageProvider.getEntityNamesMissingEmbeddings()`
   * when available (a single Cypher predicate, no client-side filtering).
   * Falls back to the legacy `loadGraph`-and-filter path for compatibility,
   * but that path is buggy with the current `nodeToEntity` mapper which
   * strips the embedding property — so it always reports 100% missing.
   */
  async scheduleIncrementalRegeneration(): Promise<number> {
    this.logger.info('Starting incremental embedding regeneration check');
    try {
      const missingNames = await this._getEntityNamesMissingEmbeddings();

      this.logger.info('Found entities without embeddings', {
        count: missingNames.length,
      });

      let scheduledCount = 0;
      for (const name of missingNames) {
        try {
          await this.scheduleEntityEmbedding(name, 1);
          scheduledCount++;
        } catch (error) {
          this.logger.warn('Failed to schedule embedding for entity', {
            entityName: name,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      this.logger.info('Incremental regeneration scheduling complete', {
        scheduled: scheduledCount,
        missing: missingNames.length,
      });
      return scheduledCount;
    } catch (error) {
      this.logger.error('Failed during incremental regeneration', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Resolve the list of entity names lacking embeddings. Prefer the storage
   * provider's dedicated Cypher predicate; otherwise fall back to walking
   * `loadGraph()` (legacy, suboptimal — see the v2.4.1 notes above).
   */
  private async _getEntityNamesMissingEmbeddings(): Promise<string[]> {
    if (typeof this.storageProvider.getEntityNamesMissingEmbeddings === 'function') {
      return this.storageProvider.getEntityNamesMissingEmbeddings();
    }
    this.logger.warn(
      'storageProvider.getEntityNamesMissingEmbeddings not available — falling back to loadGraph()'
    );
    const allEntities = await this._getAllEntitiesFromStorage();
    return allEntities.filter(e => !e.embedding).map(e => e.name);
  }

  private async _getAllEntitiesFromStorage(): Promise<Entity[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storageProviderAny = this.storageProvider as any;
    if (typeof storageProviderAny.loadGraph === 'function') {
      const graph = await storageProviderAny.loadGraph();
      return graph.entities || [];
    } else if (typeof storageProviderAny.getAllEntities === 'function') {
      return await storageProviderAny.getAllEntities();
    } else {
      this.logger.error('Storage provider does not support entity retrieval');
      throw new Error('Storage provider does not support getAllEntities or loadGraph');
    }
  }
}
