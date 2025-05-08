import { v4 as uuidv4 } from 'uuid';
import { LRUCache } from 'lru-cache';
import type { StorageProvider } from '../storage/StorageProvider.js';
import type { EmbeddingService } from './EmbeddingService.js';
import { EmbeddingModelInfo } from './EmbeddingService.js';
import type { Entity } from '../KnowledgeGraphManager.js';
import type { EntityEmbedding } from '../types/entity-embedding.js';
import crypto from 'crypto';

/**
 * Job status type
 */
type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Interface for a job record from the database
 */
interface EmbeddingJob {
  id: string;
  entity_name: string;
  status: JobStatus;
  priority: number;
  created_at: number;
  processed_at?: number;
  error?: string;
  attempts: number;
  max_attempts: number;
}

/**
 * Interface for count results from database
 */
interface CountResult {
  count: number;
}

/**
 * Interface for embedding cache options
 */
interface CacheOptions {
  size: number;
  ttl: number;
  // For test compatibility
  maxItems?: number;
  ttlHours?: number;
}

/**
 * Interface for rate limiting options
 */
interface RateLimiterOptions {
  tokensPerInterval: number;
  interval: number;
}

/**
 * Interface for job processing results
 */
interface JobProcessResults {
  processed: number;
  successful: number;
  failed: number;
}

/**
 * Interface for the rate limiter status
 */
interface RateLimiterStatus {
  availableTokens: number;
  maxTokens: number;
  resetInMs: number;
}

/**
 * Interface for a cached embedding entry
 */
interface CachedEmbedding {
  embedding: number[];
  timestamp: number;
  model: string;
}

/**
 * Interface for a logger
 */
interface Logger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Interface for embedding storage provider, extending the base provider
 */
interface EmbeddingStorageProvider extends StorageProvider {
  /**
   * Access to the underlying database
   */
  db: any; // Using any to avoid the Database namespace issue

  /**
   * Get an entity by name
   */
  getEntity(entityName: string): Promise<Entity | null>;

  /**
   * Store an entity vector embedding
   */
  storeEntityVector(entityName: string, embedding: EntityEmbedding): Promise<void>;
}

/**
 * Return structure for queue status
 */
interface QueueStatus {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  totalJobs: number;
}

/**
 * Default logger implementation
 */
const nullLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Manages embedding jobs for semantic search
 */
export class EmbeddingJobManager {
  private storageProvider: EmbeddingStorageProvider;
  private embeddingService: EmbeddingService;
  public rateLimiter: {
    tokens: number;
    lastRefill: number;
    tokensPerInterval: number;
    interval: number;
  };
  public cache: LRUCache<string, CachedEmbedding>;
  private cacheOptions: CacheOptions = { size: 1000, ttl: 3600000 };
  private logger: Logger;

  /**
   * Creates a new embedding job manager
   *
   * @param storageProvider - Provider for entity storage
   * @param embeddingService - Service to generate embeddings
   * @param rateLimiterOptions - Optional configuration for rate limiting
   * @param cacheOptions - Optional configuration for caching
   * @param logger - Optional logger for operation logging
   */
  constructor(
    storageProvider: EmbeddingStorageProvider,
    embeddingService: EmbeddingService,
    rateLimiterOptions?: RateLimiterOptions | null,
    cacheOptions?: CacheOptions | null,
    logger?: Logger | null
  ) {
    this.storageProvider = storageProvider;
    this.embeddingService = embeddingService;
    this.logger = logger || nullLogger;

    // Setup rate limiter with defaults
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

    // Setup LRU cache
    if (cacheOptions) {
      // Support both API styles (tests use maxItems/ttlHours)
      this.cacheOptions = {
        size: cacheOptions.size || cacheOptions.maxItems || 1000,
        ttl:
          cacheOptions.ttl ||
          (cacheOptions.ttlHours ? Math.round(cacheOptions.ttlHours * 60 * 60 * 1000) : 3600000),
      };
    }

    this.cache = new LRUCache({
      max: this.cacheOptions.size,
      ttl: Math.max(1, Math.round(this.cacheOptions.ttl)),
      updateAgeOnGet: true,
      allowStale: false,
      // Use a ttlAutopurge option to ensure items are purged when TTL expires
      ttlAutopurge: true,
    });

    // Initialize database schema
    this._initializeDatabase();

    this.logger.info('EmbeddingJobManager initialized', {
      cacheSize: this.cacheOptions.size,
      cacheTtl: this.cacheOptions.ttl,
      rateLimit: `${this.rateLimiter.tokensPerInterval} per ${this.rateLimiter.interval}ms`,
    });
  }

  /**
   * Initialize the database schema for embedding jobs
   *
   * @private
   */
  private _initializeDatabase(): void {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS embedding_jobs (
        id TEXT PRIMARY KEY,
        entity_name TEXT NOT NULL,
        status TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        processed_at INTEGER,
        error TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3
      )
    `;

    // Create an index for efficient job retrieval
    const createIndexSql = `
      CREATE INDEX IF NOT EXISTS idx_embedding_jobs_status_priority
      ON embedding_jobs (status, priority DESC)
    `;

    try {
      this.storageProvider.db.exec(createTableSql);
      this.storageProvider.db.exec(createIndexSql);
      this.logger.debug('Database schema initialized for embedding jobs');
    } catch (error) {
      this.logger.error('Failed to initialize database schema', { error });
      throw error;
    }
  }

  /**
   * Schedule an entity for embedding generation
   *
   * @param entityName - Name of the entity to generate embedding for
   * @param priority - Optional priority (higher priority jobs are processed first)
   * @returns Job ID
   */
  async scheduleEntityEmbedding(entityName: string, priority = 1): Promise<string> {
    // Verify entity exists
    const entity = await this.storageProvider.getEntity(entityName);
    if (!entity) {
      const error = `Entity ${entityName} not found`;
      this.logger.error('Failed to schedule embedding', { entityName, error });
      throw new Error(error);
    }

    // Create a job ID
    const jobId = uuidv4();

    // Insert a new job record
    const stmt = this.storageProvider.db.prepare(`
      INSERT INTO embedding_jobs (
        id, entity_name, status, priority, created_at, attempts, max_attempts
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(jobId, entityName, 'pending', priority, Date.now(), 0, 3);

    this.logger.info('Scheduled embedding job', {
      jobId,
      entityName,
      priority,
    });

    return jobId;
  }

  /**
   * Process a batch of pending embedding jobs
   *
   * @param batchSize - Maximum number of jobs to process
   * @returns Result statistics
   */
  async processJobs(batchSize = 10): Promise<JobProcessResults> {
    this.logger.info('Starting job processing', { batchSize });

    // Get pending jobs, ordered by priority (highest first)
    const stmt = this.storageProvider.db.prepare(`
      SELECT * FROM embedding_jobs 
      WHERE status = 'pending' 
      ORDER BY priority DESC, created_at ASC
      LIMIT ?
    `);

    const jobs: EmbeddingJob[] = stmt.all(batchSize);
    this.logger.debug('Found pending jobs', { count: jobs.length });

    // Initialize counters
    const result: JobProcessResults = {
      processed: 0,
      successful: 0,
      failed: 0,
    };

    // Process each job
    for (const job of jobs) {
      // Check rate limiter before processing
      const rateLimitCheck = this._checkRateLimiter();
      if (!rateLimitCheck.success) {
        this.logger.warn('Rate limit reached, pausing job processing', {
          remaining: jobs.length - result.processed,
        });
        break; // Stop processing jobs if rate limit is reached
      }

      this.logger.info('Processing embedding job', {
        jobId: job.id,
        entityName: job.entity_name,
        attempt: job.attempts + 1,
        maxAttempts: job.max_attempts,
      });

      // Update job status to processing
      this._updateJobStatus(job.id, 'processing', job.attempts + 1);

      try {
        // Get the entity
        const entity = await this.storageProvider.getEntity(job.entity_name);

        if (!entity) {
          throw new Error(`Entity ${job.entity_name} not found`);
        }

        // Log entity details for debugging
        this.logger.debug('Retrieved entity for embedding', {
          entityName: job.entity_name,
          entityType: entity.entityType,
          hasObservations: entity.observations ? 'yes' : 'no',
          observationsType: entity.observations ? typeof entity.observations : 'undefined',
          observationsLength:
            entity.observations && Array.isArray(entity.observations)
              ? entity.observations.length
              : 'n/a',
        });

        // Prepare text for embedding
        const text = this._prepareEntityText(entity);

        // Try to get from cache or generate new embedding
        this.logger.debug('Generating embedding for entity', { entityName: job.entity_name });
        const embedding = await this._getCachedEmbeddingOrGenerate(text);

        // Get model info for embedding metadata
        const modelInfo = this.embeddingService.getModelInfo();

        // Store the embedding with the entity
        this.logger.debug('Storing entity vector', {
          entityName: job.entity_name,
          vectorLength: embedding.length,
          model: modelInfo.name,
        });

        await this.storageProvider.storeEntityVector(job.entity_name, {
          vector: embedding,
          model: modelInfo.name,
          lastUpdated: Date.now(),
        });

        // Update job status to completed
        this._updateJobStatus(job.id, 'completed');

        this.logger.info('Successfully processed embedding job', {
          jobId: job.id,
          entityName: job.entity_name,
          model: modelInfo.name,
          dimensions: embedding.length,
        });

        result.successful++;
      } catch (error: unknown) {
        // Handle failures
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        this.logger.error('Failed to process embedding job', {
          jobId: job.id,
          entityName: job.entity_name,
          error: errorMessage,
          errorStack,
          attempt: job.attempts + 1,
          maxAttempts: job.max_attempts,
        });

        // Determine if we should mark as failed or keep for retry
        if (job.attempts + 1 >= job.max_attempts) {
          this._updateJobStatus(job.id, 'failed', job.attempts + 1, errorMessage);
        } else {
          this._updateJobStatus(job.id, 'pending', job.attempts + 1, errorMessage);
        }

        result.failed++;
      }

      result.processed++;
    }

    // Log job processing results
    const queueStatus = await this.getQueueStatus();
    this.logger.info('Job processing complete', {
      processed: result.processed,
      successful: result.successful,
      failed: result.failed,
      remaining: queueStatus.pending,
    });

    return result;
  }

  /**
   * Get the current status of the job queue
   *
   * @returns Queue statistics
   */
  async getQueueStatus(): Promise<QueueStatus> {
    const getCountForStatus = (status?: string) => {
      let sql = 'SELECT COUNT(*) as count FROM embedding_jobs';
      const params: string[] = [];

      if (status) {
        sql += ' WHERE status = ?';
        params.push(status);
      }

      const stmt = this.storageProvider.db.prepare(sql);
      const result: CountResult = stmt.get(...params);

      return result?.count || 0;
    };

    const pending = getCountForStatus('pending');
    const processing = getCountForStatus('processing');
    const completed = getCountForStatus('completed');
    const failed = getCountForStatus('failed');
    const total = getCountForStatus();

    const result = {
      pending,
      processing,
      completed,
      failed,
      totalJobs: total,
    };

    this.logger.debug('Retrieved queue status', result);

    return result;
  }

  /**
   * Retry failed embedding jobs
   *
   * @returns Number of jobs reset for retry
   */
  async retryFailedJobs(): Promise<number> {
    const stmt = this.storageProvider.db.prepare(`
      UPDATE embedding_jobs
      SET status = 'pending', attempts = 0
      WHERE status = 'failed'
    `);

    const result = stmt.run();
    const resetCount = result.changes || 0;

    this.logger.info('Reset failed jobs for retry', { count: resetCount });

    return resetCount;
  }

  /**
   * Clean up old completed jobs
   *
   * @param threshold - Age in milliseconds after which to delete completed jobs, defaults to 7 days
   * @returns Number of jobs cleaned up
   */
  async cleanupJobs(threshold?: number): Promise<number> {
    const cleanupThreshold = threshold || 7 * 24 * 60 * 60 * 1000; // Default: 7 days
    const cutoffTime = Date.now() - cleanupThreshold;

    const stmt = this.storageProvider.db.prepare(`
      DELETE FROM embedding_jobs
      WHERE status = 'completed'
      AND processed_at < ?
    `);

    const result = stmt.run(cutoffTime);
    const deletedCount = result.changes || 0;

    this.logger.info('Cleaned up old completed jobs', {
      count: deletedCount,
      threshold: cleanupThreshold,
      olderThan: new Date(cutoffTime).toISOString(),
    });

    return deletedCount;
  }

  /**
   * Update a job's status in the database
   *
   * @private
   * @param jobId - ID of the job to update
   * @param status - New status
   * @param attempts - Optional attempts count update
   * @param error - Optional error message
   * @returns Database result
   */
  private _updateJobStatus(
    jobId: string,
    status: JobStatus,
    attempts?: number,
    error?: string
  ): any {
    let sql = `
      UPDATE embedding_jobs
      SET status = ?
    `;

    const params: (string | number)[] = [status];

    // Add processed_at timestamp for completed/failed statuses
    if (status === 'completed' || status === 'failed') {
      sql += ', processed_at = ?';
      params.push(Date.now());
    }

    // Update attempts if provided
    if (attempts !== undefined) {
      sql += ', attempts = ?';
      params.push(attempts);
    }

    // Include error message if provided
    if (error) {
      sql += ', error = ?';
      params.push(error);
    }

    sql += ' WHERE id = ?';
    params.push(jobId);

    const stmt = this.storageProvider.db.prepare(sql);
    return stmt.run(...params);
  }

  /**
   * Check rate limiter and consume a token if available
   *
   * @private
   * @returns Object with success flag
   */
  _checkRateLimiter(): { success: boolean } {
    // For testing purposes, make it public by removing 'private'
    const now = Date.now();
    const elapsed = now - this.rateLimiter.lastRefill;

    // If enough time has passed, refill tokens
    if (elapsed >= this.rateLimiter.interval) {
      // Calculate how many full intervals have passed
      const intervals = Math.floor(elapsed / this.rateLimiter.interval);

      // Completely refill tokens (don't accumulate beyond max)
      this.rateLimiter.tokens = this.rateLimiter.tokensPerInterval;

      // Update last refill time, keeping track of remaining time
      this.rateLimiter.lastRefill = now;

      this.logger.debug('Refilled rate limiter tokens', {
        current: this.rateLimiter.tokens,
        max: this.rateLimiter.tokensPerInterval,
        intervals,
      });
    }

    // If we have tokens, consume one and return success
    if (this.rateLimiter.tokens > 0) {
      this.rateLimiter.tokens--;

      this.logger.debug('Consumed rate limiter token', {
        remaining: this.rateLimiter.tokens,
        max: this.rateLimiter.tokensPerInterval,
      });

      return { success: true };
    }

    // No tokens available
    this.logger.warn('Rate limit exceeded', {
      availableTokens: 0,
      maxTokens: this.rateLimiter.tokensPerInterval,
      nextRefillIn: this.rateLimiter.interval - (now - this.rateLimiter.lastRefill),
    });

    return { success: false };
  }

  /**
   * Get the current status of the rate limiter
   *
   * @returns Rate limiter status information
   */
  getRateLimiterStatus(): RateLimiterStatus {
    const now = Date.now();
    const elapsed = now - this.rateLimiter.lastRefill;

    // If enough time has passed for a complete refill
    if (elapsed >= this.rateLimiter.interval) {
      return {
        availableTokens: this.rateLimiter.tokensPerInterval,
        maxTokens: this.rateLimiter.tokensPerInterval,
        resetInMs: this.rateLimiter.interval,
      };
    }

    // Otherwise return current state
    return {
      availableTokens: this.rateLimiter.tokens,
      maxTokens: this.rateLimiter.tokensPerInterval,
      resetInMs: this.rateLimiter.interval - elapsed,
    };
  }

  /**
   * Retrieve a cached embedding or generate a new one
   *
   * @param text - Text to generate embedding for
   * @returns Embedding vector
   */
  async _getCachedEmbeddingOrGenerate(text: string): Promise<number[]> {
    const cacheKey = this._generateCacheKey(text);

    // Try to get from cache first
    const cachedValue = this.cache.get(cacheKey);

    if (cachedValue) {
      this.logger.debug('Cache hit', {
        textHash: cacheKey.substring(0, 8),
        age: Date.now() - cachedValue.timestamp,
      });
      return cachedValue.embedding;
    }

    this.logger.debug('Cache miss', { textHash: cacheKey.substring(0, 8) });

    try {
      // Generate new embedding
      const embedding = await this.embeddingService.generateEmbedding(text);

      // Store in cache
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

  /**
   * Store an embedding in the cache
   *
   * @private
   * @param text - Original text
   * @param embedding - Embedding vector
   */
  private _cacheEmbedding(text: string, embedding: number[]): void {
    const cacheKey = this._generateCacheKey(text);
    const modelInfo = this.embeddingService.getModelInfo();

    this.cache.set(cacheKey, {
      embedding,
      timestamp: Date.now(),
      model: modelInfo.name,
    });

    this.logger.debug('Cached embedding', {
      textHash: cacheKey.substring(0, 8),
      model: modelInfo.name,
      dimensions: embedding.length,
    });
  }

  /**
   * Generate a deterministic cache key for text
   *
   * @private
   * @param text - Text to hash
   * @returns Cache key
   */
  _generateCacheKey(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  /**
   * Prepare text for embedding from an entity
   *
   * @private
   * @param entity - Entity to prepare text from
   * @returns Processed text ready for embedding
   */
  private _prepareEntityText(entity: Entity): string {
    // Create a descriptive text from entity data
    const lines = [`Name: ${entity.name}`, `Type: ${entity.entityType}`, 'Observations:'];

    // Add observations, ensuring we handle both string arrays and other formats
    if (entity.observations) {
      // Handle case where observations might be stored as JSON string in some providers
      let observationsArray = entity.observations;

      // If observations is a string, try to parse it as JSON
      if (typeof entity.observations === 'string') {
        try {
          observationsArray = JSON.parse(entity.observations);
        } catch (error) {
          // If parsing fails, treat it as a single observation
          observationsArray = [entity.observations];
        }
      }

      // Ensure it's an array at this point
      if (!Array.isArray(observationsArray)) {
        observationsArray = [String(observationsArray)];
      }

      // Add each observation to the text
      if (observationsArray.length > 0) {
        lines.push(...observationsArray.map((obs) => `- ${obs}`));
      } else {
        lines.push('  (No observations)');
      }
    } else {
      lines.push('  (No observations)');
    }

    const text = lines.join('\n');

    // Log the prepared text for debugging
    this.logger.debug('Prepared entity text for embedding', {
      entityName: entity.name,
      entityType: entity.entityType,
      observationCount: Array.isArray(entity.observations) ? entity.observations.length : 0,
      textLength: text.length,
    });

    return text;
  }

  /**
   * Get a cached embedding entry (used for testing)
   *
   * @param key - Cache key
   * @returns Cached embedding or undefined
   */
  getCacheEntry(key: string): CachedEmbedding | undefined {
    return this.cache.get(key);
  }
}
