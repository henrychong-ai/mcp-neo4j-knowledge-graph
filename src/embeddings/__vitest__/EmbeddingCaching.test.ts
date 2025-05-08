import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { EmbeddingJobManager } from '../EmbeddingJobManager.js';
import type { EmbeddingService } from '../EmbeddingService.js';
import type { Entity, KnowledgeGraph } from '../../KnowledgeGraphManager.js';
import type { EntityEmbedding } from '../../types/entity-embedding.js';
import type { Relation } from '../../types/relation.js';

// Define the type for EmbeddingStorageProvider based on what the EmbeddingJobManager expects
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
const testDir = path.join(process.cwd(), 'test-output', 'embedding-caching');

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

describe('EmbeddingJobManager Caching', () => {
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

    // Setup mock storage provider with all required methods
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
      getProviderInfo: vi.fn().mockReturnValue({
        provider: 'test-provider',
        model: 'test-model',
        dimensions: 384,
      }),
    };

    // Create a new manager with test cache options
    manager = new EmbeddingJobManager(
      mockStorageProvider,
      mockEmbeddingService,
      null, // default rate limiting
      { size: 100, ttl: 3600000 } // 1 hour cache TTL
    );
  });

  it('should cache embedding results and reuse them for identical text', async () => {
    const testText = 'This is a test observation';

    // Call generateEmbedding twice with the same text
    await (manager as any)._getCachedEmbeddingOrGenerate(testText);
    await (manager as any)._getCachedEmbeddingOrGenerate(testText);

    // Verify the embedding service was called only once
    expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledTimes(1);
    expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(testText);
  });

  it('should use cached embeddings within the TTL period', async () => {
    const testText = 'Another test observation';

    // Generate the embedding
    await (manager as any)._getCachedEmbeddingOrGenerate(testText);

    // Fast forward time but stay within TTL
    vi.useFakeTimers();
    vi.advanceTimersByTime(1000 * 60 * 30); // advance 30 minutes

    // Request the same embedding again
    await (manager as any)._getCachedEmbeddingOrGenerate(testText);

    // Verify the service was called only once
    expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledTimes(1);

    // Reset timers
    vi.useRealTimers();
  });

  it('should regenerate embeddings after TTL expires', async () => {
    const testText = 'Expiring test observation';

    // Create a custom cache implementation for testing TTL expiration
    const mockCache = {
      set: vi.fn(),
      get: vi
        .fn()
        .mockReturnValueOnce({
          // Return value for first call
          embedding: new Array(384).fill(0.1),
          timestamp: Date.now(),
          model: 'test-model',
        })
        .mockReturnValueOnce(undefined), // Return undefined for second call (simulate expired)
    };

    // Create a manager with our mock cache
    manager = new EmbeddingJobManager(mockStorageProvider, mockEmbeddingService);

    // Replace the internal cache with our mock
    (manager as any).cache = mockCache;

    // First call should use the cache
    await (manager as any)._getCachedEmbeddingOrGenerate(testText);

    // Cache miss should trigger a new embedding generation
    await (manager as any)._getCachedEmbeddingOrGenerate(testText);

    // Verify the embedding service was called once (second time)
    expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledTimes(1);
    expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(testText);
  });

  it('should respect the cache size limit', async () => {
    // Create a manager with a tiny cache
    const smallCacheManager = new EmbeddingJobManager(
      mockStorageProvider,
      mockEmbeddingService,
      null,
      { size: 2, ttl: 3600000 } // Only 2 items max
    );

    // Generate embeddings for 3 different texts
    await (smallCacheManager as any)._getCachedEmbeddingOrGenerate('Text 1');
    await (smallCacheManager as any)._getCachedEmbeddingOrGenerate('Text 2');
    await (smallCacheManager as any)._getCachedEmbeddingOrGenerate('Text 3');

    // Reset the mock to clear the call count
    vi.mocked(mockEmbeddingService.generateEmbedding).mockClear();

    // Request the first text again - it should have been evicted from the cache
    await (smallCacheManager as any)._getCachedEmbeddingOrGenerate('Text 1');

    // Verify the service was called again for the first text
    expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledTimes(1);
    expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith('Text 1');
  });

  it('should calculate cache key consistently for the same text', async () => {
    // This test verifies the cache key generation is deterministic
    const testText = 'Cache key test';

    // Call the private method that generates cache keys
    const key1 = (manager as any)._generateCacheKey(testText);
    const key2 = (manager as any)._generateCacheKey(testText);

    // Keys should be consistent for the same text
    expect(key1).toBe(key2);
  });

  it('should include model information in cached embedding metadata', async () => {
    const testText = 'Metadata test';

    // Override the _cacheEmbedding method to spy on it
    const originalCacheMethod = (manager as any)._cacheEmbedding;
    (manager as any)._cacheEmbedding = vi.fn(originalCacheMethod);

    // Generate an embedding
    await (manager as any)._getCachedEmbeddingOrGenerate(testText);

    // Verify the cache method was called with model info
    expect((manager as any)._cacheEmbedding).toHaveBeenCalled();

    // Check cache entry includes model info
    const cacheKey = (manager as any)._generateCacheKey(testText);
    const cachedEntry = (manager as any).getCacheEntry(cacheKey);

    expect(cachedEntry).toBeDefined();
    expect(cachedEntry?.model).toBe('test-model');
    expect(cachedEntry?.timestamp).toBeDefined();
  });
});
