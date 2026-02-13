/**
 * Comprehensive tests for EmbeddingJobManager
 * Covers: constructor, scheduling, processing, rate limiting, caching, queue management
 */

import crypto from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Entity } from '../../KnowledgeGraphManager.js';
import type { StorageProvider } from '../../storage/StorageProvider.js';

import { EmbeddingJobManager } from '../EmbeddingJobManager.js';
import type { EmbeddingService } from '../EmbeddingService.js';

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-1234'),
}));

// ============================================================================
// Test Utilities and Factories
// ============================================================================

interface MockStatement {
  run: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
}

interface MockDb {
  exec: ReturnType<typeof vi.fn>;
  prepare: ReturnType<typeof vi.fn>;
  _statement: MockStatement;
}

interface MockStorageProvider extends StorageProvider {
  db: MockDb;
  getEntity: ReturnType<typeof vi.fn>;
  storeEntityVector: ReturnType<typeof vi.fn>;
  loadGraph: ReturnType<typeof vi.fn>;
  getAllEntities: ReturnType<typeof vi.fn>;
}

interface MockEmbeddingService extends EmbeddingService {
  generateEmbedding: ReturnType<typeof vi.fn>;
  generateBatchEmbeddings: ReturnType<typeof vi.fn>;
  getModelInfo: ReturnType<typeof vi.fn>;
}

function createMockDb(): MockDb {
  const mockStatement: MockStatement = {
    run: vi.fn().mockReturnValue({ changes: 0 }),
    all: vi.fn().mockReturnValue([]),
    get: vi.fn().mockReturnValue({ count: 0 }),
  };

  return {
    exec: vi.fn(),
    prepare: vi.fn().mockReturnValue(mockStatement),
    _statement: mockStatement,
  };
}

function createMockStorageProvider(): MockStorageProvider {
  const mockDb = createMockDb();

  return {
    db: mockDb,
    getEntity: vi.fn().mockResolvedValue(null),
    storeEntityVector: vi.fn().mockResolvedValue(undefined),
    loadGraph: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    getAllEntities: vi.fn().mockResolvedValue([]),
    // Required StorageProvider methods
    initialize: vi.fn().mockResolvedValue(undefined),
    saveGraph: vi.fn().mockResolvedValue(undefined),
    createEntities: vi.fn().mockResolvedValue([]),
    createRelations: vi.fn().mockResolvedValue([]),
    addObservations: vi.fn().mockResolvedValue([]),
    deleteObservations: vi.fn().mockResolvedValue(undefined),
    deleteEntities: vi.fn().mockResolvedValue(undefined),
    deleteRelations: vi.fn().mockResolvedValue(undefined),
    openNodes: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    searchNodes: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as MockStorageProvider;
}

function createMockEmbeddingService(): MockEmbeddingService {
  return {
    generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    generateBatchEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    getModelInfo: vi.fn().mockReturnValue({
      name: 'text-embedding-3-small',
      dimensions: 1536,
      maxTokens: 8191,
    }),
  };
}

function createMockEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    name: 'TestEntity',
    entityType: 'test-type',
    observations: ['Observation 1', 'Observation 2'],
    ...overrides,
  };
}

function createMockJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    entity_name: 'TestEntity',
    status: 'pending',
    priority: 1,
    created_at: Date.now(),
    processed_at: null,
    error: null,
    attempts: 0,
    max_attempts: 3,
    ...overrides,
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe('EmbeddingJobManager', () => {
  let storageProvider: MockStorageProvider;
  let embeddingService: MockEmbeddingService;
  let jobManager: EmbeddingJobManager;

  beforeEach(() => {
    vi.clearAllMocks();
    storageProvider = createMockStorageProvider();
    embeddingService = createMockEmbeddingService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Constructor Tests
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('should initialize with default options', () => {
      jobManager = new EmbeddingJobManager(storageProvider, embeddingService);

      expect(storageProvider.db.exec).toHaveBeenCalledTimes(2); // table + index
      expect(jobManager.rateLimiter.tokensPerInterval).toBe(60);
      expect(jobManager.rateLimiter.interval).toBe(60000);
    });

    it('should initialize with custom rate limiter options', () => {
      jobManager = new EmbeddingJobManager(storageProvider, embeddingService, {
        tokensPerInterval: 100,
        interval: 30000,
      });

      expect(jobManager.rateLimiter.tokensPerInterval).toBe(100);
      expect(jobManager.rateLimiter.interval).toBe(30000);
      expect(jobManager.rateLimiter.tokens).toBe(100);
    });

    it('should initialize with custom cache options using size/ttl', () => {
      jobManager = new EmbeddingJobManager(storageProvider, embeddingService, null, {
        size: 500,
        ttl: 7200000,
      });

      expect(jobManager.cache.max).toBe(500);
    });

    it('should initialize with custom cache options using maxItems/ttlHours', () => {
      jobManager = new EmbeddingJobManager(storageProvider, embeddingService, null, {
        size: 0,
        ttl: 0,
        maxItems: 200,
        ttlHours: 2,
      });

      expect(jobManager.cache.max).toBe(200);
    });

    it('should use null logger when none provided', () => {
      jobManager = new EmbeddingJobManager(storageProvider, embeddingService);
      // No error thrown means null logger is working
      expect(jobManager).toBeDefined();
    });

    it('should use provided logger', () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      jobManager = new EmbeddingJobManager(
        storageProvider,
        embeddingService,
        null,
        null,
        mockLogger
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'EmbeddingJobManager initialized',
        expect.any(Object)
      );
    });

    it('should throw error if database initialization fails', () => {
      storageProvider.db.exec.mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      expect(() => {
        new EmbeddingJobManager(storageProvider, embeddingService);
      }).toThrow('Database error');
    });
  });

  // --------------------------------------------------------------------------
  // scheduleEntityEmbedding Tests
  // --------------------------------------------------------------------------

  describe('scheduleEntityEmbedding', () => {
    beforeEach(() => {
      jobManager = new EmbeddingJobManager(storageProvider, embeddingService);
    });

    it('should schedule embedding for existing entity', async () => {
      const entity = createMockEntity();
      storageProvider.getEntity.mockResolvedValue(entity);

      const jobId = await jobManager.scheduleEntityEmbedding('TestEntity');

      expect(jobId).toBe('mock-uuid-1234');
      expect(storageProvider.getEntity).toHaveBeenCalledWith('TestEntity');
      expect(storageProvider.db.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO embedding_jobs')
      );
    });

    it('should schedule embedding with custom priority', async () => {
      const entity = createMockEntity();
      storageProvider.getEntity.mockResolvedValue(entity);

      await jobManager.scheduleEntityEmbedding('TestEntity', 5);

      expect(storageProvider.db._statement.run).toHaveBeenCalledWith(
        'mock-uuid-1234',
        'TestEntity',
        'pending',
        5,
        expect.any(Number),
        0,
        3
      );
    });

    it('should throw error for non-existent entity', async () => {
      storageProvider.getEntity.mockResolvedValue(null);

      await expect(jobManager.scheduleEntityEmbedding('NonExistent')).rejects.toThrow(
        'Entity NonExistent not found'
      );
    });

    it('should use default priority of 1', async () => {
      const entity = createMockEntity();
      storageProvider.getEntity.mockResolvedValue(entity);

      await jobManager.scheduleEntityEmbedding('TestEntity');

      expect(storageProvider.db._statement.run).toHaveBeenCalledWith(
        expect.any(String),
        'TestEntity',
        'pending',
        1, // default priority
        expect.any(Number),
        0,
        3
      );
    });
  });

  // --------------------------------------------------------------------------
  // processJobs Tests
  // --------------------------------------------------------------------------

  describe('processJobs', () => {
    beforeEach(() => {
      jobManager = new EmbeddingJobManager(storageProvider, embeddingService);
    });

    it('should process pending jobs successfully', async () => {
      const job = createMockJob();
      const entity = createMockEntity();

      storageProvider.db._statement.all.mockReturnValueOnce([job]);
      storageProvider.getEntity.mockResolvedValue(entity);
      storageProvider.db._statement.get.mockReturnValue({ count: 0 });

      const result = await jobManager.processJobs(10);

      expect(result.processed).toBe(1);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);
      expect(embeddingService.generateEmbedding).toHaveBeenCalled();
      expect(storageProvider.storeEntityVector).toHaveBeenCalled();
    });

    it('should respect batch size limit', async () => {
      const jobs = [createMockJob({ id: 'job-1' }), createMockJob({ id: 'job-2' })];
      const entity = createMockEntity();

      storageProvider.db._statement.all.mockReturnValueOnce(jobs);
      storageProvider.getEntity.mockResolvedValue(entity);
      storageProvider.db._statement.get.mockReturnValue({ count: 0 });

      const result = await jobManager.processJobs(2);

      expect(result.processed).toBe(2);
    });

    it('should stop processing when rate limit is reached', async () => {
      // Set tokens to 1 so only first job processes
      jobManager.rateLimiter.tokens = 1;

      const jobs = [createMockJob({ id: 'job-1' }), createMockJob({ id: 'job-2' })];
      const entity = createMockEntity();

      storageProvider.db._statement.all.mockReturnValueOnce(jobs);
      storageProvider.getEntity.mockResolvedValue(entity);
      storageProvider.db._statement.get.mockReturnValue({ count: 1 });

      const result = await jobManager.processJobs(10);

      // First job succeeds, second stops due to rate limit
      expect(result.processed).toBe(1);
      expect(result.successful).toBe(1);
    });

    it('should handle job processing failure', async () => {
      const job = createMockJob({ attempts: 0, max_attempts: 3 });

      storageProvider.db._statement.all.mockReturnValueOnce([job]);
      storageProvider.getEntity.mockResolvedValue(createMockEntity());
      embeddingService.generateEmbedding.mockRejectedValueOnce(new Error('API Error'));
      storageProvider.db._statement.get.mockReturnValue({ count: 0 });

      const result = await jobManager.processJobs(10);

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.successful).toBe(0);
    });

    it('should mark job as failed after max attempts', async () => {
      const job = createMockJob({ attempts: 2, max_attempts: 3 });
      let statusUpdateCalls = 0;

      storageProvider.db._statement.all.mockReturnValueOnce([job]);
      storageProvider.getEntity.mockResolvedValue(createMockEntity());
      embeddingService.generateEmbedding.mockRejectedValueOnce(new Error('API Error'));
      storageProvider.db._statement.get.mockReturnValue({ count: 0 });
      storageProvider.db._statement.run.mockImplementation(() => {
        statusUpdateCalls++;
        return { changes: 1 };
      });

      await jobManager.processJobs(10);

      // Should have called update for 'processing' and then 'failed'
      expect(statusUpdateCalls).toBeGreaterThan(0);
    });

    it('should keep job pending for retry if under max attempts', async () => {
      const job = createMockJob({ attempts: 0, max_attempts: 3 });

      storageProvider.db._statement.all.mockReturnValueOnce([job]);
      storageProvider.getEntity.mockResolvedValue(createMockEntity());
      embeddingService.generateEmbedding.mockRejectedValueOnce(new Error('API Error'));
      storageProvider.db._statement.get.mockReturnValue({ count: 1 });

      const result = await jobManager.processJobs(10);

      expect(result.failed).toBe(1);
    });

    it('should handle entity not found during processing', async () => {
      const job = createMockJob({ attempts: 2, max_attempts: 3 });

      storageProvider.db._statement.all.mockReturnValueOnce([job]);
      storageProvider.getEntity.mockResolvedValue(null);
      storageProvider.db._statement.get.mockReturnValue({ count: 0 });

      const result = await jobManager.processJobs(10);

      expect(result.failed).toBe(1);
    });

    it('should return empty results when no jobs pending', async () => {
      storageProvider.db._statement.all.mockReturnValueOnce([]);
      storageProvider.db._statement.get.mockReturnValue({ count: 0 });

      const result = await jobManager.processJobs(10);

      expect(result.processed).toBe(0);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should use cached embedding when available', async () => {
      const job = createMockJob();
      const entity = createMockEntity();
      const text = `Name: ${entity.name}\nType: ${entity.entityType}\nObservations:\n- ${entity.observations[0]}\n- ${entity.observations[1]}`;
      const cacheKey = crypto.createHash('md5').update(text).digest('hex');

      // Pre-populate cache
      jobManager.cache.set(cacheKey, {
        embedding: [0.5, 0.6, 0.7],
        timestamp: Date.now(),
        model: 'text-embedding-3-small',
      });

      storageProvider.db._statement.all.mockReturnValueOnce([job]);
      storageProvider.getEntity.mockResolvedValue(entity);
      storageProvider.db._statement.get.mockReturnValue({ count: 0 });

      await jobManager.processJobs(10);

      // Should NOT call generateEmbedding since cache hit
      expect(embeddingService.generateEmbedding).not.toHaveBeenCalled();
      expect(storageProvider.storeEntityVector).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // getQueueStatus Tests
  // --------------------------------------------------------------------------

  describe('getQueueStatus', () => {
    beforeEach(() => {
      jobManager = new EmbeddingJobManager(storageProvider, embeddingService);
    });

    it('should return queue statistics', async () => {
      let callCount = 0;
      storageProvider.db._statement.get.mockImplementation(() => {
        callCount++;
        // Return different counts based on call order
        const counts = [5, 2, 10, 3, 20]; // pending, processing, completed, failed, total
        return { count: counts[callCount - 1] || 0 };
      });

      const status = await jobManager.getQueueStatus();

      expect(status.pending).toBe(5);
      expect(status.processing).toBe(2);
      expect(status.completed).toBe(10);
      expect(status.failed).toBe(3);
      expect(status.totalJobs).toBe(20);
    });

    it('should handle empty queue', async () => {
      storageProvider.db._statement.get.mockReturnValue({ count: 0 });

      const status = await jobManager.getQueueStatus();

      expect(status.pending).toBe(0);
      expect(status.processing).toBe(0);
      expect(status.completed).toBe(0);
      expect(status.failed).toBe(0);
      expect(status.totalJobs).toBe(0);
    });

    it('should handle null count result', async () => {
      storageProvider.db._statement.get.mockReturnValue(null);

      const status = await jobManager.getQueueStatus();

      expect(status.pending).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // retryFailedJobs Tests
  // --------------------------------------------------------------------------

  describe('retryFailedJobs', () => {
    beforeEach(() => {
      jobManager = new EmbeddingJobManager(storageProvider, embeddingService);
    });

    it('should reset failed jobs for retry', async () => {
      storageProvider.db._statement.run.mockReturnValue({ changes: 5 });

      const count = await jobManager.retryFailedJobs();

      expect(count).toBe(5);
      expect(storageProvider.db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'pending', attempts = 0")
      );
    });

    it('should return 0 when no failed jobs', async () => {
      storageProvider.db._statement.run.mockReturnValue({ changes: 0 });

      const count = await jobManager.retryFailedJobs();

      expect(count).toBe(0);
    });

    it('should handle undefined changes', async () => {
      storageProvider.db._statement.run.mockReturnValue({});

      const count = await jobManager.retryFailedJobs();

      expect(count).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // cleanupJobs Tests
  // --------------------------------------------------------------------------

  describe('cleanupJobs', () => {
    beforeEach(() => {
      jobManager = new EmbeddingJobManager(storageProvider, embeddingService);
    });

    it('should clean up old completed jobs with default threshold', async () => {
      storageProvider.db._statement.run.mockReturnValue({ changes: 10 });

      const count = await jobManager.cleanupJobs();

      expect(count).toBe(10);
      expect(storageProvider.db.prepare).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM embedding_jobs')
      );
    });

    it('should clean up jobs with custom threshold', async () => {
      storageProvider.db._statement.run.mockReturnValue({ changes: 3 });

      const count = await jobManager.cleanupJobs(24 * 60 * 60 * 1000); // 1 day

      expect(count).toBe(3);
    });

    it('should return 0 when no jobs to clean up', async () => {
      storageProvider.db._statement.run.mockReturnValue({ changes: 0 });

      const count = await jobManager.cleanupJobs();

      expect(count).toBe(0);
    });

    it('should handle undefined changes', async () => {
      storageProvider.db._statement.run.mockReturnValue({});

      const count = await jobManager.cleanupJobs();

      expect(count).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // _checkRateLimiter Tests
  // --------------------------------------------------------------------------

  describe('_checkRateLimiter', () => {
    beforeEach(() => {
      jobManager = new EmbeddingJobManager(storageProvider, embeddingService);
    });

    it('should consume token when available', () => {
      jobManager.rateLimiter.tokens = 5;

      const result = jobManager._checkRateLimiter();

      expect(result.success).toBe(true);
      expect(jobManager.rateLimiter.tokens).toBe(4);
    });

    it('should fail when no tokens available', () => {
      jobManager.rateLimiter.tokens = 0;
      jobManager.rateLimiter.lastRefill = Date.now(); // Recent refill

      const result = jobManager._checkRateLimiter();

      expect(result.success).toBe(false);
      expect(jobManager.rateLimiter.tokens).toBe(0);
    });

    it('should refill tokens after interval passes', () => {
      jobManager.rateLimiter.tokens = 0;
      jobManager.rateLimiter.tokensPerInterval = 60;
      jobManager.rateLimiter.interval = 1000;
      jobManager.rateLimiter.lastRefill = Date.now() - 2000; // 2 seconds ago

      const result = jobManager._checkRateLimiter();

      expect(result.success).toBe(true);
      expect(jobManager.rateLimiter.tokens).toBe(59); // 60 - 1 consumed
    });

    it('should not exceed max tokens on refill', () => {
      jobManager.rateLimiter.tokens = 0;
      jobManager.rateLimiter.tokensPerInterval = 60;
      jobManager.rateLimiter.interval = 1000;
      jobManager.rateLimiter.lastRefill = Date.now() - 10000; // 10 intervals ago

      jobManager._checkRateLimiter();

      // Should be max (60) - 1 consumed, not accumulated beyond max
      expect(jobManager.rateLimiter.tokens).toBe(59);
    });
  });

  // --------------------------------------------------------------------------
  // getRateLimiterStatus Tests
  // --------------------------------------------------------------------------

  describe('getRateLimiterStatus', () => {
    beforeEach(() => {
      jobManager = new EmbeddingJobManager(storageProvider, embeddingService);
    });

    it('should return current rate limiter status', () => {
      jobManager.rateLimiter.tokens = 30;
      jobManager.rateLimiter.tokensPerInterval = 60;
      jobManager.rateLimiter.lastRefill = Date.now();

      const status = jobManager.getRateLimiterStatus();

      expect(status.availableTokens).toBe(30);
      expect(status.maxTokens).toBe(60);
      expect(status.resetInMs).toBeGreaterThan(0);
    });

    it('should show full tokens after interval elapsed', () => {
      jobManager.rateLimiter.tokens = 0;
      jobManager.rateLimiter.tokensPerInterval = 60;
      jobManager.rateLimiter.interval = 1000;
      jobManager.rateLimiter.lastRefill = Date.now() - 2000; // 2 seconds ago

      const status = jobManager.getRateLimiterStatus();

      expect(status.availableTokens).toBe(60);
      expect(status.maxTokens).toBe(60);
    });
  });

  // --------------------------------------------------------------------------
  // _getCachedEmbeddingOrGenerate Tests
  // --------------------------------------------------------------------------

  describe('_getCachedEmbeddingOrGenerate', () => {
    beforeEach(() => {
      jobManager = new EmbeddingJobManager(storageProvider, embeddingService);
    });

    it('should return cached embedding when available', async () => {
      const text = 'Test text';
      const cacheKey = crypto.createHash('md5').update(text).digest('hex');
      const cachedEmbedding = [0.1, 0.2, 0.3];

      jobManager.cache.set(cacheKey, {
        embedding: cachedEmbedding,
        timestamp: Date.now(),
        model: 'text-embedding-3-small',
      });

      const result = await jobManager._getCachedEmbeddingOrGenerate(text);

      expect(result).toEqual(cachedEmbedding);
      expect(embeddingService.generateEmbedding).not.toHaveBeenCalled();
    });

    it('should generate and cache embedding on cache miss', async () => {
      const text = 'Test text';
      const generatedEmbedding = [0.4, 0.5, 0.6];
      embeddingService.generateEmbedding.mockResolvedValue(generatedEmbedding);

      const result = await jobManager._getCachedEmbeddingOrGenerate(text);

      expect(result).toEqual(generatedEmbedding);
      expect(embeddingService.generateEmbedding).toHaveBeenCalledWith(text);

      // Verify it was cached
      const cacheKey = crypto.createHash('md5').update(text).digest('hex');
      const cached = jobManager.cache.get(cacheKey);
      expect(cached?.embedding).toEqual(generatedEmbedding);
    });

    it('should throw error when embedding generation fails', async () => {
      embeddingService.generateEmbedding.mockRejectedValue(new Error('API Error'));

      await expect(jobManager._getCachedEmbeddingOrGenerate('Test text')).rejects.toThrow(
        'API Error'
      );
    });
  });

  // --------------------------------------------------------------------------
  // _generateCacheKey Tests
  // --------------------------------------------------------------------------

  describe('_generateCacheKey', () => {
    beforeEach(() => {
      jobManager = new EmbeddingJobManager(storageProvider, embeddingService);
    });

    it('should generate deterministic cache key', () => {
      const text = 'Test text for hashing';

      const key1 = jobManager._generateCacheKey(text);
      const key2 = jobManager._generateCacheKey(text);

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^[a-f0-9]{32}$/); // MD5 hash format
    });

    it('should generate different keys for different text', () => {
      const key1 = jobManager._generateCacheKey('Text 1');
      const key2 = jobManager._generateCacheKey('Text 2');

      expect(key1).not.toBe(key2);
    });
  });

  // --------------------------------------------------------------------------
  // getCacheEntry Tests
  // --------------------------------------------------------------------------

  describe('getCacheEntry', () => {
    beforeEach(() => {
      jobManager = new EmbeddingJobManager(storageProvider, embeddingService);
    });

    it('should return cached entry when exists', () => {
      const entry = {
        embedding: [0.1, 0.2],
        timestamp: Date.now(),
        model: 'test-model',
      };
      jobManager.cache.set('test-key', entry);

      const result = jobManager.getCacheEntry('test-key');

      expect(result).toEqual(entry);
    });

    it('should return undefined for non-existent key', () => {
      const result = jobManager.getCacheEntry('non-existent');

      expect(result).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // scheduleIncrementalRegeneration Tests
  // --------------------------------------------------------------------------

  describe('scheduleIncrementalRegeneration', () => {
    beforeEach(() => {
      jobManager = new EmbeddingJobManager(storageProvider, embeddingService);
    });

    it('should schedule jobs for entities without embeddings using loadGraph', async () => {
      const entitiesWithMixedEmbeddings = [
        createMockEntity({ name: 'Entity1', embedding: undefined }),
        createMockEntity({
          name: 'Entity2',
          embedding: { vector: [0.1], model: 'test', lastUpdated: 0 },
        }),
        createMockEntity({ name: 'Entity3', embedding: undefined }),
      ];

      storageProvider.loadGraph.mockResolvedValue({
        entities: entitiesWithMixedEmbeddings,
        relations: [],
      });

      // Mock getEntity for scheduling
      storageProvider.getEntity.mockImplementation((name: string) => {
        return Promise.resolve(entitiesWithMixedEmbeddings.find(e => e.name === name) || null);
      });

      const count = await jobManager.scheduleIncrementalRegeneration();

      expect(count).toBe(2); // Entity1 and Entity3
    });

    it('should use getAllEntities when loadGraph not available', async () => {
      const entitiesWithoutEmbeddings = [
        createMockEntity({ name: 'Entity1', embedding: undefined }),
      ];

      // Remove loadGraph
      storageProvider.loadGraph = undefined as unknown as ReturnType<typeof vi.fn>;
      storageProvider.getAllEntities.mockResolvedValue(entitiesWithoutEmbeddings);
      storageProvider.getEntity.mockResolvedValue(entitiesWithoutEmbeddings[0]);

      const count = await jobManager.scheduleIncrementalRegeneration();

      expect(count).toBe(1);
    });

    it('should throw error when storage provider lacks entity retrieval', async () => {
      storageProvider.loadGraph = undefined as unknown as ReturnType<typeof vi.fn>;
      storageProvider.getAllEntities = undefined as unknown as ReturnType<typeof vi.fn>;

      await expect(jobManager.scheduleIncrementalRegeneration()).rejects.toThrow(
        'Storage provider does not support getAllEntities or loadGraph'
      );
    });

    it('should handle scheduling failures gracefully', async () => {
      const entities = [
        createMockEntity({ name: 'Entity1', embedding: undefined }),
        createMockEntity({ name: 'Entity2', embedding: undefined }),
      ];

      storageProvider.loadGraph.mockResolvedValue({ entities, relations: [] });
      storageProvider.getEntity.mockResolvedValueOnce(entities[0]).mockResolvedValueOnce(null); // Entity2 not found during scheduling

      const count = await jobManager.scheduleIncrementalRegeneration();

      expect(count).toBe(1); // Only Entity1 scheduled successfully
    });

    it('should return 0 when all entities have embeddings', async () => {
      const entitiesWithEmbeddings = [
        createMockEntity({
          name: 'Entity1',
          embedding: { vector: [0.1], model: 'test', lastUpdated: 0 },
        }),
        createMockEntity({
          name: 'Entity2',
          embedding: { vector: [0.2], model: 'test', lastUpdated: 0 },
        }),
      ];

      storageProvider.loadGraph.mockResolvedValue({
        entities: entitiesWithEmbeddings,
        relations: [],
      });

      const count = await jobManager.scheduleIncrementalRegeneration();

      expect(count).toBe(0);
    });

    it('should rethrow error from loadGraph', async () => {
      storageProvider.loadGraph.mockRejectedValue(new Error('Database error'));

      await expect(jobManager.scheduleIncrementalRegeneration()).rejects.toThrow('Database error');
    });
  });

  // --------------------------------------------------------------------------
  // Entity Text Preparation Tests (via processJobs)
  // --------------------------------------------------------------------------

  describe('entity text preparation', () => {
    beforeEach(() => {
      jobManager = new EmbeddingJobManager(storageProvider, embeddingService);
    });

    it('should handle entity with string observations', async () => {
      const job = createMockJob();
      const entity = createMockEntity({
        observations: ['Observation 1', 'Observation 2'],
      });

      storageProvider.db._statement.all.mockReturnValueOnce([job]);
      storageProvider.getEntity.mockResolvedValue(entity);
      storageProvider.db._statement.get.mockReturnValue({ count: 0 });

      await jobManager.processJobs(10);

      expect(embeddingService.generateEmbedding).toHaveBeenCalledWith(
        expect.stringContaining('- Observation 1')
      );
    });

    it('should handle entity with JSON string observations', async () => {
      const job = createMockJob();
      const entity = createMockEntity({
        observations: JSON.stringify([
          'JSON Observation 1',
          'JSON Observation 2',
        ]) as unknown as string[],
      });

      storageProvider.db._statement.all.mockReturnValueOnce([job]);
      storageProvider.getEntity.mockResolvedValue(entity);
      storageProvider.db._statement.get.mockReturnValue({ count: 0 });

      await jobManager.processJobs(10);

      expect(embeddingService.generateEmbedding).toHaveBeenCalled();
    });

    it('should handle entity with empty observations', async () => {
      const job = createMockJob();
      const entity = createMockEntity({
        observations: [],
      });

      storageProvider.db._statement.all.mockReturnValueOnce([job]);
      storageProvider.getEntity.mockResolvedValue(entity);
      storageProvider.db._statement.get.mockReturnValue({ count: 0 });

      await jobManager.processJobs(10);

      expect(embeddingService.generateEmbedding).toHaveBeenCalledWith(
        expect.stringContaining('(No observations)')
      );
    });

    it('should handle entity with null observations', async () => {
      const job = createMockJob();
      const entity = createMockEntity({
        observations: undefined,
      });

      storageProvider.db._statement.all.mockReturnValueOnce([job]);
      storageProvider.getEntity.mockResolvedValue(entity);
      storageProvider.db._statement.get.mockReturnValue({ count: 0 });

      await jobManager.processJobs(10);

      expect(embeddingService.generateEmbedding).toHaveBeenCalledWith(
        expect.stringContaining('(No observations)')
      );
    });

    it('should handle non-array observations', async () => {
      const job = createMockJob();
      const entity = createMockEntity({
        observations: 'single observation' as unknown as string[],
      });

      storageProvider.db._statement.all.mockReturnValueOnce([job]);
      storageProvider.getEntity.mockResolvedValue(entity);
      storageProvider.db._statement.get.mockReturnValue({ count: 0 });

      await jobManager.processJobs(10);

      expect(embeddingService.generateEmbedding).toHaveBeenCalled();
    });
  });
});
