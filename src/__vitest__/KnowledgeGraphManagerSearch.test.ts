import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fileURLToPath } from 'url';
import path from 'path';
import { KnowledgeGraphManager, SemanticSearchOptions } from '../KnowledgeGraphManager.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import type { LRUCache } from 'lru-cache';

// Setup test paths
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testFilePath = path.join(__dirname, '../../test-output/test-memory.json');

describe('KnowledgeGraphManager Search', () => {
  let manager: KnowledgeGraphManager;
  let mockStorageProvider: Partial<StorageProvider>;
  let mockEmbeddingJobManager: {
    embeddingService: {
      generateEmbedding: (text: string) => Promise<number[]>;
    };
    scheduleEntityEmbedding: (entityName: string, priority?: number) => Promise<string>;
    storageProvider: any;
    rateLimiter: {
      tokens: number;
      lastRefill: number;
      tokensPerInterval: number;
      interval: number;
    };
    cache: any;
    cacheOptions: { size: number; ttl: number };
  };

  beforeEach(async () => {
    // Mock storage provider
    mockStorageProvider = {
      loadGraph: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
      saveGraph: vi.fn().mockResolvedValue(undefined),
      searchNodes: vi.fn().mockResolvedValue({
        entities: [{ name: 'KeywordResult', entityType: 'Test', observations: ['keyword result'] }],
        relations: [],
      }),
      semanticSearch: vi.fn().mockResolvedValue({
        entities: [
          { name: 'SemanticResult', entityType: 'Test', observations: ['semantic result'] },
        ],
        relations: [],
        total: 1,
        facets: { entityType: { counts: { Test: 1 } } },
        timeTaken: 10,
      }),
      openNodes: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    };

    // Mock embedding service
    const mockEmbeddingService = {
      generateEmbedding: vi.fn().mockResolvedValue(Array(1536).fill(0.1)),
    };

    // Mock embedding job manager
    mockEmbeddingJobManager = {
      embeddingService: mockEmbeddingService,
      scheduleEntityEmbedding: vi.fn().mockResolvedValue('mock-job-id'),
      storageProvider: mockStorageProvider,
      rateLimiter: {
        tokens: 60,
        lastRefill: Date.now(),
        tokensPerInterval: 60,
        interval: 60 * 1000,
      },
      cache: {},
      cacheOptions: { size: 1000, ttl: 3600000 },
    };

    // Create manager with mocks
    manager = new KnowledgeGraphManager({
      storageProvider: mockStorageProvider as StorageProvider,
      memoryFilePath: testFilePath,
      embeddingJobManager: mockEmbeddingJobManager as any,
    });
  });

  it('should use basic searchNodes when no options are provided', async () => {
    // Call the search method without options
    const result = await manager.search('test query');

    // Should call searchNodes
    expect(mockStorageProvider.searchNodes).toHaveBeenCalledWith('test query');
    expect(mockStorageProvider.semanticSearch).not.toHaveBeenCalled();

    // Result should be what searchNodes returns
    expect(result.entities.length).toBe(1);
    expect(result.entities[0].name).toBe('KeywordResult');
  });

  it('should use semanticSearch when semanticSearch option is true', async () => {
    // Call the search method with semanticSearch option
    const result = await manager.search('test query', { semanticSearch: true });

    // Should call semanticSearch
    expect(mockStorageProvider.semanticSearch).toHaveBeenCalledWith(
      'test query',
      expect.objectContaining({
        semanticSearch: true,
        queryVector: expect.any(Array),
      })
    );
    expect(mockStorageProvider.searchNodes).not.toHaveBeenCalled();

    // Result should be what semanticSearch returns
    expect(result.entities.length).toBe(1);
    expect(result.entities[0].name).toBe('SemanticResult');
  });

  it('should use semanticSearch when hybridSearch option is true', async () => {
    // Call the search method with hybridSearch option
    const result = await manager.search('test query', { hybridSearch: true });

    // Should call semanticSearch with both options
    expect(mockStorageProvider.semanticSearch).toHaveBeenCalledWith(
      'test query',
      expect.objectContaining({
        hybridSearch: true,
        semanticSearch: true,
        queryVector: expect.any(Array),
      })
    );

    // Result should be what semanticSearch returns
    expect(result.entities.length).toBe(1);
    expect(result.entities[0].name).toBe('SemanticResult');
  });

  it('should fall back to searchNodes if semanticSearch is not available', async () => {
    // Remove semanticSearch method from the mock
    delete mockStorageProvider.semanticSearch;

    // Call the search method with semanticSearch option
    const result = await manager.search('test query', { semanticSearch: true });

    // Should fall back to searchNodes
    expect(mockStorageProvider.searchNodes).toHaveBeenCalledWith('test query');

    // Result should be what searchNodes returns
    expect(result.entities.length).toBe(1);
    expect(result.entities[0].name).toBe('KeywordResult');
  });

  it('should fall back to basic search for file-based implementation', async () => {
    // Create a manager without a storage provider
    const fileBasedManager = new KnowledgeGraphManager({
      memoryFilePath: testFilePath,
    });

    // Mock searchNodes implementation
    fileBasedManager.searchNodes = vi.fn().mockResolvedValue({
      entities: [{ name: 'FileResult', entityType: 'Test', observations: ['file result'] }],
      relations: [],
    });

    // Call the search method
    const result = await fileBasedManager.search('test query', { semanticSearch: true });

    // Should call searchNodes
    expect(fileBasedManager.searchNodes).toHaveBeenCalledWith('test query');

    // Result should be what searchNodes returns
    expect(result.entities.length).toBe(1);
    expect(result.entities[0].name).toBe('FileResult');
  });

  it('should pass additional search options to semanticSearch', async () => {
    // Call search with multiple options
    const searchOptions: SemanticSearchOptions = {
      semanticSearch: true,
      minSimilarity: 0.8,
      limit: 20,
      includeExplanations: true,
      filters: [{ field: 'entityType', operator: 'eq', value: 'Person' }],
    };

    await manager.search('test query', searchOptions);

    // Should pass all options to semanticSearch with a queryVector
    expect(mockStorageProvider.semanticSearch).toHaveBeenCalledWith(
      'test query',
      expect.objectContaining({
        semanticSearch: true,
        minSimilarity: 0.8,
        limit: 20,
        includeExplanations: true,
        filters: [{ field: 'entityType', operator: 'eq', value: 'Person' }],
        queryVector: expect.any(Array),
      })
    );
  });
});
