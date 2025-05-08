import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { EmbeddingJobManager } from '../EmbeddingJobManager.js';
import type { Entity, KnowledgeGraph } from '../../KnowledgeGraphManager.js';
import type { EmbeddingService } from '../EmbeddingService.js';
import type { Relation } from '../../types/relation.js';
import type { EntityEmbedding, SemanticSearchOptions } from '../../types/entity-embedding.js';

// Define a more accurate EmbeddingStorageProvider interface
interface EmbeddingStorageProvider {
  db: any; // Database object used by EmbeddingJobManager

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

  // Optional but useful methods
  getEntityHistory?(entityName: string): Promise<any[]>;
  close(): Promise<void>;
  init(): Promise<void>;
}

// Create temporary test directory
const testDir = path.join(process.cwd(), 'test-output', 'embedding-rate-limiter');

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

describe('EmbeddingJobManager Rate Limiting', () => {
  // Mock dependencies
  let mockStorageProvider: EmbeddingStorageProvider;
  let mockEmbeddingService: EmbeddingService;
  let manager: EmbeddingJobManager;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock database
    const mockDb = {
      exec: vi.fn(),
      prepare: vi.fn().mockImplementation(() => ({
        run: vi.fn(),
        all: vi.fn().mockReturnValue([]),
        get: vi.fn(),
      })),
      close: vi.fn(),
    };

    // Setup mock storage provider
    mockStorageProvider = {
      db: mockDb,
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

    // Create a default manager
    manager = new EmbeddingJobManager(mockStorageProvider, mockEmbeddingService);
  });

  it('should enforce rate limits for API calls', () => {
    // Create a manager with a specific rate limit
    manager = new EmbeddingJobManager(mockStorageProvider, mockEmbeddingService, {
      tokensPerInterval: 3,
      interval: 1000,
    });

    // Set initial tokens and last refill time manually for predictable testing
    (manager as any).rateLimiter = {
      tokens: 3,
      tokensPerInterval: 3,
      interval: 1000,
      lastRefill: Date.now(),
    };

    // Should be able to make exactly 3 calls
    expect((manager as any)._checkRateLimiter().success).toBe(true);
    expect((manager as any)._checkRateLimiter().success).toBe(true);
    expect((manager as any)._checkRateLimiter().success).toBe(true);

    // Fourth call should be rate limited
    expect((manager as any)._checkRateLimiter().success).toBe(false);
  });

  it('should refill tokens after an interval passes', () => {
    // Create a manager with a specific rate limit
    manager = new EmbeddingJobManager(mockStorageProvider, mockEmbeddingService, {
      tokensPerInterval: 2,
      interval: 1000,
    });

    // Set initial state
    const now = Date.now();
    (manager as any).rateLimiter = {
      tokens: 0, // Start with no tokens
      tokensPerInterval: 2,
      interval: 1000,
      lastRefill: now,
    };

    // Should be rate limited initially
    expect((manager as any)._checkRateLimiter().success).toBe(false);

    // Mock Date.now to simulate time passing
    const originalNow = Date.now;
    Date.now = vi.fn().mockReturnValue(now + 1001); // Just over 1 second later

    try {
      // Now should be refilled
      expect((manager as any)._checkRateLimiter().success).toBe(true);
      expect((manager as any)._checkRateLimiter().success).toBe(true);

      // But no more than max allowed
      expect((manager as any)._checkRateLimiter().success).toBe(false);
    } finally {
      // Restore original Date.now
      Date.now = originalNow;
    }
  });

  it('should enforce maximum token count', () => {
    // Create a rate limiter with known parameters
    manager = new EmbeddingJobManager(mockStorageProvider, mockEmbeddingService, {
      tokensPerInterval: 5,
      interval: 1000,
    });

    // Set initial state
    const now = Date.now();
    (manager as any).rateLimiter = {
      tokens: 3, // Start with 3 tokens
      tokensPerInterval: 5,
      interval: 1000,
      lastRefill: now,
    };

    // Check that the status reports correctly
    expect(manager.getRateLimiterStatus().availableTokens).toBe(3);

    // Mock Date.now to simulate time passing
    const originalNow = Date.now;
    Date.now = vi.fn().mockReturnValue(now + 1001); // Just over 1 second later

    try {
      // After refill, should have the max tokens (5), not 8 (3 + 5)
      expect(manager.getRateLimiterStatus().availableTokens).toBe(5);
    } finally {
      // Restore original Date.now
      Date.now = originalNow;
    }
  });

  it('should integrate rate limiting with job processing', async () => {
    // We'll test the integration of rate limiting into processJobs by
    // mocking part of the method and checking that it behaves correctly

    // Create a real implementation of _checkRateLimiter to test
    const realCheckRateLimiter = EmbeddingJobManager.prototype._checkRateLimiter;

    // Create a modified EmbeddingJobManager class for this test
    class TestManager extends EmbeddingJobManager {
      processedCount: number;

      constructor(storage: EmbeddingStorageProvider, embedding: EmbeddingService) {
        super(storage, embedding, { tokensPerInterval: 2, interval: 1000 });

        // Spy on the rate limiter method
        this._checkRateLimiter = vi.fn().mockImplementation(realCheckRateLimiter.bind(this));

        // Count how many entities we tried to process
        this.processedCount = 0;
      }

      // Override the full job processing with a simplified version that just checks rate limiting
      async processJobs(batchSize: number) {
        const pendingJobs = Array(batchSize)
          .fill({})
          .map((_, i) => ({
            id: `job-${i}`,
            entity_name: `Entity-${i}`,
          }));

        let processed = 0;
        let successful = 0;

        for (const job of pendingJobs) {
          // Check rate limiting before processing
          const rateLimitResult = (this as any)._checkRateLimiter();
          if (!rateLimitResult.success) {
            break; // Stop processing if rate limited
          }

          // Process would happen here in the real implementation
          processed++;
          successful++;
        }

        return { processed, successful, failed: 0 };
      }
    }

    // Create our test manager
    const testManager = new TestManager(mockStorageProvider, mockEmbeddingService);

    // Make sure tokens are set to 2
    (testManager as any).rateLimiter.tokens = 2;

    // Process a batch of 5 jobs (more than our rate limit)
    const result = await testManager.processJobs(5);

    // Should have processed exactly 2 jobs before hitting rate limit
    expect(result.processed).toBe(2);

    // Rate limiter should have been called 3 times (2 successful, 1 failed)
    expect((testManager as any)._checkRateLimiter).toHaveBeenCalledTimes(3);
  });

  it('should provide rate limit status information', () => {
    // Create a manager with specific rate limit
    manager = new EmbeddingJobManager(mockStorageProvider, mockEmbeddingService, {
      tokensPerInterval: 10,
      interval: 60000,
    });

    // Set initial state
    const now = Date.now();
    (manager as any).rateLimiter = {
      tokens: 10, // Full tokens
      tokensPerInterval: 10,
      interval: 60000, // 1 minute
      lastRefill: now,
    };

    // Check initial status
    const initialStatus = manager.getRateLimiterStatus();
    expect(initialStatus.availableTokens).toBe(10);
    expect(initialStatus.maxTokens).toBe(10);
    expect(initialStatus.resetInMs).toBe(60000);
  });
});
