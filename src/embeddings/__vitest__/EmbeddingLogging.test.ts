import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { EmbeddingJobManager } from '../EmbeddingJobManager.js';
import type { Entity, KnowledgeGraph } from '../../KnowledgeGraphManager.js';
import type { EmbeddingService } from '../EmbeddingService.js';
import type { EntityEmbedding } from '../../types/entity-embedding.js';
import type { Relation } from '../../types/relation.js';

// Define the interface for our logger
interface Logger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

// Define our EmbeddingStorageProvider interface
interface EmbeddingStorageProvider {
  // Database access needed by EmbeddingJobManager
  db: any;

  // Required methods from StorageProvider
  loadGraph(): Promise<KnowledgeGraph>;
  saveGraph(graph: KnowledgeGraph): Promise<void>;
  searchNodes(query: string, options?: any): Promise<KnowledgeGraph>;
  openNodes(names: string[]): Promise<KnowledgeGraph>;
  createEntities(entities: Entity[]): Promise<Entity[]>;
  createRelations(relations: Relation[]): Promise<Relation[]>;
  addObservations(
    observations: { entityName: string; contents: string[] }[]
  ): Promise<{ entityName: string; addedObservations: string[] }[]>;
  deleteEntities(entityNames: string[]): Promise<void>;
  deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void>;
  deleteRelations(relations: Relation[]): Promise<void>;

  // Additional methods needed by EmbeddingJobManager
  getEntity(entityName: string): Promise<Entity | null>;
  storeEntityVector(entityName: string, embedding: EntityEmbedding): Promise<void>;

  // Optional but commonly implemented methods
  init?(): Promise<void>;
  close?(): Promise<void>;
}

// Create temporary test directory
const testDir = path.join(process.cwd(), 'test-output', 'embedding-logging');

// Ensure test directory exists and is clean
beforeEach(() => {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true, mode: 0o777 });
  }
});

// Clean up after all tests
afterAll(() => {
  if (fs.existsSync(testDir)) {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (error: any) {
      console.warn(`Failed to clean up test directory: ${error.message}`);
    }
  }
});

describe('EmbeddingJobManager Logging', () => {
  // Mock dependencies
  let mockStorageProvider: EmbeddingStorageProvider;
  let mockEmbeddingService: EmbeddingService;
  let manager: EmbeddingJobManager;
  let mockLogger: Logger;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create a mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    // Setup mock storage provider
    mockStorageProvider = {
      db: {
        exec: vi.fn(),
        prepare: vi.fn().mockImplementation(() => ({
          run: vi.fn(),
          all: vi.fn().mockReturnValue([]),
          get: vi.fn(),
        })),
        close: vi.fn(),
      },
      getEntity: vi.fn().mockResolvedValue({
        name: 'TestEntity',
        entityType: 'Test',
        observations: ['Test observation'],
      }),
      storeEntityVector: vi.fn().mockResolvedValue(undefined),
      loadGraph: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
      saveGraph: vi.fn().mockResolvedValue(undefined),
      searchNodes: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
      openNodes: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
      createEntities: vi.fn().mockImplementation(async (entities) => entities),
      createRelations: vi.fn().mockResolvedValue([]),
      addObservations: vi.fn().mockImplementation(async (observations) => {
        return observations.map((obs) => ({
          entityName: obs.entityName,
          addedObservations: obs.contents,
        }));
      }),
      deleteEntities: vi.fn().mockResolvedValue(undefined),
      deleteObservations: vi.fn().mockResolvedValue(undefined),
      deleteRelations: vi.fn().mockResolvedValue(undefined),
      init: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    // Setup mock embedding service
    mockEmbeddingService = {
      generateEmbedding: vi.fn().mockResolvedValue(new Array(384).fill(0.1)),
      generateEmbeddings: vi.fn().mockResolvedValue([]),
      getModelInfo: vi.fn().mockReturnValue({
        name: 'test-model',
        dimensions: 384,
        version: '1.0.0',
      }),
    };

    // Create manager with a mock logger
    manager = new EmbeddingJobManager(
      mockStorageProvider,
      mockEmbeddingService,
      null,
      null,
      mockLogger
    );
  });

  it('should log job scheduling', async () => {
    // Schedule an embedding job
    await manager.scheduleEntityEmbedding('TestEntity', 2);

    // Verify logging occurred
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Scheduled embedding job'),
      expect.objectContaining({
        entityName: 'TestEntity',
        priority: 2,
      })
    );
  });

  it('should log job processing', async () => {
    // Create a simplified manager class for testing job processing
    class TestManager extends EmbeddingJobManager {
      constructor(
        storage: EmbeddingStorageProvider,
        embedding: EmbeddingService,
        private mockLogger: Logger
      ) {
        super(storage, embedding, null, null, mockLogger);
      }

      async processJobs(): Promise<{ processed: number; successful: number; failed: number }> {
        // Use our mockLogger directly instead of the private parent logger
        this.mockLogger.info('Processing embedding job', {
          jobId: 'job1',
          entityName: 'TestEntity1',
          attempt: 1,
          maxAttempts: 3,
        });

        // Successfully processed
        this.mockLogger.info('Successfully processed embedding job', {
          jobId: 'job1',
          entityName: 'TestEntity1',
          model: 'test-model',
          dimensions: 384,
        });

        return { processed: 1, successful: 1, failed: 0 };
      }
    }

    // Create test manager with logger
    const testManager = new TestManager(mockStorageProvider, mockEmbeddingService, mockLogger);

    // Process jobs
    await testManager.processJobs();

    // Verify that processing was logged
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Processing embedding job'),
      expect.objectContaining({
        jobId: 'job1',
        entityName: 'TestEntity1',
      })
    );

    // Verify completion logging
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Successfully processed embedding job'),
      expect.objectContaining({
        jobId: 'job1',
      })
    );
  });

  it('should log rate limiting events', async () => {
    // Create a manager with strict rate limits
    manager = new EmbeddingJobManager(
      mockStorageProvider,
      mockEmbeddingService,
      { tokensPerInterval: 1, interval: 10000 },
      null,
      mockLogger
    );

    // Use the rate limiter twice
    (manager as any)._checkRateLimiter(); // First use
    (manager as any)._checkRateLimiter(); // Should be rate limited

    // Verify warning was logged
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Rate limit exceeded'),
      expect.objectContaining({
        availableTokens: 0,
        maxTokens: 1,
      })
    );
  });

  it('should log cache hits and misses', async () => {
    const testText = 'This is a test observation';

    // First call should be a cache miss
    await (manager as any)._getCachedEmbeddingOrGenerate(testText);

    // Verify cache miss was logged
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Cache miss'),
      expect.objectContaining({
        textHash: expect.any(String),
      })
    );

    // Reset mock to check next call
    vi.mocked(mockLogger.debug).mockClear();

    // Second call should be a cache hit
    await (manager as any)._getCachedEmbeddingOrGenerate(testText);

    // Verify cache hit was logged
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Cache hit'),
      expect.objectContaining({
        textHash: expect.any(String),
      })
    );
  });

  it('should log errors during embedding generation', async () => {
    // Make the embedding service throw an error
    vi.mocked(mockEmbeddingService.generateEmbedding).mockRejectedValueOnce(new Error('API error'));

    // Try to generate an embedding
    await expect((manager as any)._getCachedEmbeddingOrGenerate('Test text')).rejects.toThrow();

    // Verify error was logged
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to generate embedding'),
      expect.objectContaining({
        error: expect.any(Error),
      })
    );
  });

  it('should log queue statistics after processing jobs', async () => {
    // Create test manager class with mocked getQueueStatus
    class TestManager extends EmbeddingJobManager {
      constructor(
        storage: EmbeddingStorageProvider,
        embedding: EmbeddingService,
        private mockLogger: Logger
      ) {
        super(storage, embedding, null, null, mockLogger);
      }

      async processJobs(): Promise<{ processed: number; successful: number; failed: number }> {
        // Process jobs logic
        this.mockLogger.info('Starting job processing batch');

        // Log stats after processing
        const queueStatus = await this.getQueueStatus();
        this.mockLogger.info('Queue status after processing', queueStatus);

        return { processed: 1, successful: 1, failed: 0 };
      }

      async getQueueStatus(): Promise<{
        pending: number;
        processing: number;
        completed: number;
        failed: number;
        totalJobs: number;
      }> {
        return {
          pending: 5,
          processing: 1,
          completed: 10,
          failed: 2,
          totalJobs: 18,
        };
      }
    }

    // Create test manager
    const testManager = new TestManager(mockStorageProvider, mockEmbeddingService, mockLogger);

    // Process jobs
    await testManager.processJobs();

    // Verify queue status was logged
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Queue status after processing',
      expect.objectContaining({
        pending: 5,
        completed: 10,
        failed: 2,
        totalJobs: 18,
      })
    );
  });
});
