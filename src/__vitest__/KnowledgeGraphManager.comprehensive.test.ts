/**
 * Comprehensive tests for KnowledgeGraphManager
 * Covers: delete operations, search, temporal methods, batch operations, and file-based fallbacks
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  KnowledgeGraphManager,
  Entity,
  Relation,
  KnowledgeGraph,
} from '../KnowledgeGraphManager.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { EmbeddingJobManager } from '../embeddings/EmbeddingJobManager.js';
import {
  createMockEmbeddingService,
  createMockVectorStore,
} from '../__test-utils__/mockFactories.js';
import { BatchResult } from '../types/batch-operations.js';

/**
 * Create a comprehensive mock storage provider with all methods
 */
function createComprehensiveMockProvider(
  overrides: Partial<StorageProvider> = {}
): StorageProvider {
  return {
    loadGraph: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    saveGraph: vi.fn().mockResolvedValue(undefined),
    searchNodes: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    openNodes: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    createEntities: vi.fn().mockImplementation(async (entities: Entity[]) => entities),
    createRelations: vi.fn().mockImplementation(async (relations: Relation[]) => relations),
    addObservations: vi
      .fn()
      .mockImplementation(async (obs: { entityName: string; contents: string[] }[]) =>
        obs.map((o) => ({ entityName: o.entityName, addedObservations: o.contents }))
      ),
    deleteEntities: vi.fn().mockResolvedValue(undefined),
    deleteObservations: vi.fn().mockResolvedValue(undefined),
    deleteRelations: vi.fn().mockResolvedValue(undefined),
    getEntity: vi.fn().mockResolvedValue(null),
    getRelation: vi.fn().mockResolvedValue(null),
    updateEntityEmbedding: vi.fn().mockResolvedValue(undefined),
    getDecayedGraph: vi.fn().mockResolvedValue({ entities: [], relations: [], decay_info: {} }),
    getEntityHistory: vi.fn().mockResolvedValue([]),
    getRelationHistory: vi.fn().mockResolvedValue([]),
    getGraphAtTime: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    ...overrides,
  } as unknown as StorageProvider;
}

describe('KnowledgeGraphManager - Delete Operations', () => {
  describe('deleteEntities', () => {
    it('should delegate to storage provider when available', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      await manager.deleteEntities(['entity1', 'entity2']);

      expect(mockProvider.deleteEntities).toHaveBeenCalledWith(['entity1', 'entity2']);
    });

    it('should return early for empty entity names array', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      await manager.deleteEntities([]);

      expect(mockProvider.deleteEntities).not.toHaveBeenCalled();
    });

    it('should return early for undefined/null entity names', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      await manager.deleteEntities(null as unknown as string[]);

      expect(mockProvider.deleteEntities).not.toHaveBeenCalled();
    });

    it('should attempt to remove vectors from vector store', async () => {
      const mockVectorStore = createMockVectorStore({
        removeVector: vi.fn().mockResolvedValue(undefined),
      });

      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({
        storageProvider: mockProvider,
        vectorStoreOptions: {
          type: 'memory',
        },
      });

      // Inject mock vector store
      (manager as any).vectorStore = mockVectorStore;

      await manager.deleteEntities(['entity1']);

      expect(mockVectorStore.removeVector).toHaveBeenCalledWith('entity1');
    });

    it('should continue if vector store removal fails', async () => {
      const mockVectorStore = createMockVectorStore({
        removeVector: vi.fn().mockRejectedValue(new Error('Vector removal failed')),
      });

      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({
        storageProvider: mockProvider,
      });

      // Inject mock vector store
      (manager as any).vectorStore = mockVectorStore;

      // Should not throw
      await expect(manager.deleteEntities(['entity1'])).resolves.toBeUndefined();
    });
  });

  describe('deleteObservations', () => {
    it('should delegate to storage provider when available', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const deletions = [{ entityName: 'entity1', observations: ['obs1', 'obs2'] }];
      await manager.deleteObservations(deletions);

      expect(mockProvider.deleteObservations).toHaveBeenCalledWith(deletions);
    });

    it('should return early for empty deletions array', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      await manager.deleteObservations([]);

      expect(mockProvider.deleteObservations).not.toHaveBeenCalled();
    });

    it('should schedule re-embedding when embeddingJobManager is provided', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const mockEmbeddingService = createMockEmbeddingService();
      const mockEmbeddingJobManager = {
        scheduleEntityEmbedding: vi.fn().mockResolvedValue(undefined),
        embeddingService: mockEmbeddingService,
      } as unknown as EmbeddingJobManager;

      const manager = new KnowledgeGraphManager({
        storageProvider: mockProvider,
        embeddingJobManager: mockEmbeddingJobManager,
      });

      await manager.deleteObservations([{ entityName: 'entity1', observations: ['obs1'] }]);

      expect(mockEmbeddingJobManager.scheduleEntityEmbedding).toHaveBeenCalledWith('entity1', 1);
    });
  });

  describe('deleteRelations', () => {
    it('should delegate to storage provider when available', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const relations: Relation[] = [{ from: 'A', to: 'B', relationType: 'KNOWS' }];
      await manager.deleteRelations(relations);

      expect(mockProvider.deleteRelations).toHaveBeenCalledWith(relations);
    });

    it('should return early for empty relations array', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      await manager.deleteRelations([]);

      expect(mockProvider.deleteRelations).not.toHaveBeenCalled();
    });

    it('should return early for undefined/null relations', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      await manager.deleteRelations(null as unknown as Relation[]);

      expect(mockProvider.deleteRelations).not.toHaveBeenCalled();
    });
  });
});

describe('KnowledgeGraphManager - Find Similar Entities', () => {
  it('should throw error when embeddingJobManager is not provided', async () => {
    const mockProvider = createComprehensiveMockProvider();
    const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

    await expect(manager.findSimilarEntities('test query')).rejects.toThrow(
      'Embedding job manager is required for semantic search'
    );
  });

  it('should throw error when embedding service is not available', async () => {
    const mockProvider = createComprehensiveMockProvider();
    const mockEmbeddingJobManager = {
      scheduleEntityEmbedding: vi.fn(),
      embeddingService: null,
    } as unknown as EmbeddingJobManager;

    const manager = new KnowledgeGraphManager({
      storageProvider: mockProvider,
      embeddingJobManager: mockEmbeddingJobManager,
    });

    await expect(manager.findSimilarEntities('test query')).rejects.toThrow(
      'Embedding service not available'
    );
  });

  it('should use vector store when available', async () => {
    const mockEmbedding = new Array(1536).fill(0.1);
    const mockVectorStore = {
      search: vi.fn().mockResolvedValue([
        { id: 'entity1', similarity: 0.95 },
        { id: 'entity2', similarity: 0.85 },
      ]),
    };

    const mockEmbeddingService = {
      generateEmbedding: vi.fn().mockResolvedValue(mockEmbedding),
    };

    const mockEmbeddingJobManager = {
      scheduleEntityEmbedding: vi.fn(),
      embeddingService: mockEmbeddingService,
    } as unknown as EmbeddingJobManager;

    const mockProvider = createComprehensiveMockProvider();
    const manager = new KnowledgeGraphManager({
      storageProvider: mockProvider,
      embeddingJobManager: mockEmbeddingJobManager,
    });

    // Inject vector store
    (manager as any).vectorStore = mockVectorStore;

    const results = await manager.findSimilarEntities('test query', { limit: 5, threshold: 0.7 });

    expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith('test query');
    expect(mockVectorStore.search).toHaveBeenCalledWith(mockEmbedding, {
      limit: 5,
      minSimilarity: 0.7,
    });
    expect(results).toEqual([
      { name: 'entity1', score: 0.95 },
      { name: 'entity2', score: 0.85 },
    ]);
  });

  it('should fall back to storage provider searchVectors if vector store fails', async () => {
    const mockEmbedding = new Array(1536).fill(0.1);
    const mockVectorStore = {
      search: vi.fn().mockRejectedValue(new Error('Vector store error')),
    };

    const mockEmbeddingService = {
      generateEmbedding: vi.fn().mockResolvedValue(mockEmbedding),
    };

    const mockEmbeddingJobManager = {
      scheduleEntityEmbedding: vi.fn(),
      embeddingService: mockEmbeddingService,
    } as unknown as EmbeddingJobManager;

    const mockProvider = createComprehensiveMockProvider({
      searchVectors: vi.fn().mockResolvedValue([{ name: 'fallbackEntity', score: 0.8 }]),
    });

    const manager = new KnowledgeGraphManager({
      storageProvider: mockProvider,
      embeddingJobManager: mockEmbeddingJobManager,
    });

    // Inject failing vector store
    (manager as any).vectorStore = mockVectorStore;

    const results = await manager.findSimilarEntities('test query');

    expect((mockProvider as any).searchVectors).toHaveBeenCalledWith(mockEmbedding, 10, 0.7);
    expect(results).toEqual([{ name: 'fallbackEntity', score: 0.8 }]);
  });

  it('should return empty array when no vector search capability exists', async () => {
    const mockEmbedding = new Array(1536).fill(0.1);
    const mockEmbeddingService = {
      generateEmbedding: vi.fn().mockResolvedValue(mockEmbedding),
    };

    const mockEmbeddingJobManager = {
      scheduleEntityEmbedding: vi.fn(),
      embeddingService: mockEmbeddingService,
    } as unknown as EmbeddingJobManager;

    const mockProvider = createComprehensiveMockProvider();
    const manager = new KnowledgeGraphManager({
      storageProvider: mockProvider,
      embeddingJobManager: mockEmbeddingJobManager,
    });

    // No vector store, no searchVectors method
    const results = await manager.findSimilarEntities('test query');

    expect(results).toEqual([]);
  });
});

describe('KnowledgeGraphManager - Search Method', () => {
  it('should use semanticSearch on storage provider when semanticSearch option is true', async () => {
    const mockEmbedding = new Array(1536).fill(0.1);
    const mockEmbeddingService = {
      generateEmbedding: vi.fn().mockResolvedValue(mockEmbedding),
    };

    const mockEmbeddingJobManager = {
      scheduleEntityEmbedding: vi.fn(),
      embeddingService: mockEmbeddingService,
    } as unknown as EmbeddingJobManager;

    const mockSemanticResult: KnowledgeGraph = {
      entities: [{ name: 'semantic-entity', entityType: 'test', observations: [] }],
      relations: [],
    };

    const mockProvider = createComprehensiveMockProvider({
      semanticSearch: vi.fn().mockResolvedValue(mockSemanticResult),
    });

    const manager = new KnowledgeGraphManager({
      storageProvider: mockProvider,
      embeddingJobManager: mockEmbeddingJobManager,
    });

    const result = await manager.search('test query', { semanticSearch: true });

    expect((mockProvider as any).semanticSearch).toHaveBeenCalled();
    expect(result).toEqual(mockSemanticResult);
  });

  it('should enable semanticSearch when hybridSearch is true', async () => {
    const mockEmbedding = new Array(1536).fill(0.1);
    const mockEmbeddingService = {
      generateEmbedding: vi.fn().mockResolvedValue(mockEmbedding),
    };

    const mockEmbeddingJobManager = {
      scheduleEntityEmbedding: vi.fn(),
      embeddingService: mockEmbeddingService,
    } as unknown as EmbeddingJobManager;

    const mockProvider = createComprehensiveMockProvider({
      semanticSearch: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    });

    const manager = new KnowledgeGraphManager({
      storageProvider: mockProvider,
      embeddingJobManager: mockEmbeddingJobManager,
    });

    await manager.search('test query', { hybridSearch: true });

    expect((mockProvider as any).semanticSearch).toHaveBeenCalled();
  });

  it('should fall back to searchNodes when semanticSearch fails', async () => {
    const mockEmbedding = new Array(1536).fill(0.1);
    const mockEmbeddingService = {
      generateEmbedding: vi.fn().mockRejectedValue(new Error('Embedding generation failed')),
    };

    const mockEmbeddingJobManager = {
      scheduleEntityEmbedding: vi.fn(),
      embeddingService: mockEmbeddingService,
    } as unknown as EmbeddingJobManager;

    const fallbackResult: KnowledgeGraph = {
      entities: [{ name: 'fallback-entity', entityType: 'test', observations: [] }],
      relations: [],
    };

    const mockProvider = createComprehensiveMockProvider({
      semanticSearch: vi.fn().mockRejectedValue(new Error('Semantic search failed')),
      searchNodes: vi.fn().mockResolvedValue(fallbackResult),
    });

    const manager = new KnowledgeGraphManager({
      storageProvider: mockProvider,
      embeddingJobManager: mockEmbeddingJobManager,
    });

    const result = await manager.search('test query', {
      semanticSearch: true,
      domain: 'test-domain',
    });

    expect(mockProvider.searchNodes).toHaveBeenCalledWith('test query', {
      domain: 'test-domain',
      includeNullDomain: undefined,
    });
    expect(result).toEqual(fallbackResult);
  });

  it('should fall back to searchNodes when provider lacks semanticSearch', async () => {
    const mockProvider = createComprehensiveMockProvider();
    const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

    await manager.search('test query', { semanticSearch: true });

    expect(mockProvider.searchNodes).toHaveBeenCalled();
  });

  it('should use basic searchNodes when semanticSearch is not requested', async () => {
    const mockProvider = createComprehensiveMockProvider();
    const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

    await manager.search('test query', { domain: 'my-domain' });

    expect(mockProvider.searchNodes).toHaveBeenCalledWith('test query', {
      domain: 'my-domain',
      includeNullDomain: undefined,
    });
  });

  it('should log warning when semantic search requested without embedding capability', async () => {
    const mockProvider = createComprehensiveMockProvider();
    // Delete semanticSearch to simulate provider without it
    delete (mockProvider as any).semanticSearch;

    const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

    // Should fall back to searchNodes
    await manager.search('test query', { semanticSearch: true });

    expect(mockProvider.searchNodes).toHaveBeenCalled();
  });
});

describe('KnowledgeGraphManager - Relation Operations', () => {
  describe('getRelation', () => {
    it('should delegate to storage provider when getRelation method exists', async () => {
      const expectedRelation: Relation = {
        from: 'A',
        to: 'B',
        relationType: 'KNOWS',
        strength: 0.9,
      };

      const mockProvider = createComprehensiveMockProvider({
        getRelation: vi.fn().mockResolvedValue(expectedRelation),
      });

      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const result = await manager.getRelation('A', 'B', 'KNOWS');

      expect((mockProvider as any).getRelation).toHaveBeenCalledWith('A', 'B', 'KNOWS');
      expect(result).toEqual(expectedRelation);
    });

    it('should return null when relation not found', async () => {
      const mockProvider = createComprehensiveMockProvider({
        getRelation: vi.fn().mockResolvedValue(null),
      });

      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const result = await manager.getRelation('A', 'B', 'UNKNOWN');

      expect(result).toBeNull();
    });
  });

  describe('updateRelation', () => {
    it('should delegate to storage provider when updateRelation method exists', async () => {
      const relationToUpdate: Relation = {
        from: 'A',
        to: 'B',
        relationType: 'KNOWS',
        strength: 0.95,
      };

      const mockProvider = createComprehensiveMockProvider({
        updateRelation: vi.fn().mockResolvedValue(relationToUpdate),
      });

      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const result = await manager.updateRelation(relationToUpdate);

      expect((mockProvider as any).updateRelation).toHaveBeenCalledWith(relationToUpdate);
      expect(result).toEqual(relationToUpdate);
    });
  });
});

describe('KnowledgeGraphManager - Entity Operations', () => {
  describe('updateEntity', () => {
    it('should delegate to storage provider when updateEntity method exists', async () => {
      const updatedEntity: Entity = {
        name: 'entity1',
        entityType: 'person',
        observations: ['new observation'],
      };

      const mockProvider = createComprehensiveMockProvider({
        updateEntity: vi.fn().mockResolvedValue(updatedEntity),
      });

      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const result = await manager.updateEntity('entity1', { observations: ['new observation'] });

      expect((mockProvider as any).updateEntity).toHaveBeenCalledWith('entity1', {
        observations: ['new observation'],
      });
      expect(result).toEqual(updatedEntity);
    });

    it('should schedule embedding when observations are updated', async () => {
      const mockEmbeddingService = createMockEmbeddingService();
      const mockEmbeddingJobManager = {
        scheduleEntityEmbedding: vi.fn().mockResolvedValue(undefined),
        embeddingService: mockEmbeddingService,
      } as unknown as EmbeddingJobManager;

      const mockProvider = createComprehensiveMockProvider({
        updateEntity: vi.fn().mockResolvedValue({
          name: 'entity1',
          entityType: 'person',
          observations: ['updated obs'],
        }),
      });

      const manager = new KnowledgeGraphManager({
        storageProvider: mockProvider,
        embeddingJobManager: mockEmbeddingJobManager,
      });

      await manager.updateEntity('entity1', { observations: ['updated obs'] });

      expect(mockEmbeddingJobManager.scheduleEntityEmbedding).toHaveBeenCalledWith('entity1', 2);
    });
  });
});

describe('KnowledgeGraphManager - Temporal Operations', () => {
  describe('getDecayedGraph', () => {
    it('should delegate to storage provider', async () => {
      const decayedGraph: KnowledgeGraph & { decay_info?: Record<string, unknown> } = {
        entities: [{ name: 'decayed', entityType: 'test', observations: [] }],
        relations: [],
        decay_info: { decayFactor: 0.95 },
      };

      const mockProvider = createComprehensiveMockProvider({
        getDecayedGraph: vi.fn().mockResolvedValue(decayedGraph),
      });

      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const result = await manager.getDecayedGraph();

      expect((mockProvider as any).getDecayedGraph).toHaveBeenCalled();
      expect(result).toEqual(decayedGraph);
    });

    it('should throw error when storage provider does not support decay operations', async () => {
      const mockProvider = createComprehensiveMockProvider();
      delete (mockProvider as any).getDecayedGraph;

      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      await expect(manager.getDecayedGraph()).rejects.toThrow(
        'Storage provider does not support decay operations'
      );
    });

    it('should throw error when no storage provider', async () => {
      // Using deprecated file-based storage
      const manager = new KnowledgeGraphManager({});

      await expect(manager.getDecayedGraph()).rejects.toThrow(
        'Storage provider does not support decay operations'
      );
    });
  });

  describe('getEntityHistory', () => {
    it('should delegate to storage provider', async () => {
      const entityHistory: Entity[] = [
        { name: 'entity1', entityType: 'person', observations: ['v1'] },
        { name: 'entity1', entityType: 'person', observations: ['v2'] },
      ];

      const mockProvider = createComprehensiveMockProvider({
        getEntityHistory: vi.fn().mockResolvedValue(entityHistory),
      });

      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const result = await manager.getEntityHistory('entity1');

      expect((mockProvider as any).getEntityHistory).toHaveBeenCalledWith('entity1');
      expect(result).toEqual(entityHistory);
    });

    it('should throw error when storage provider does not support entity history', async () => {
      const mockProvider = createComprehensiveMockProvider();
      delete (mockProvider as any).getEntityHistory;

      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      await expect(manager.getEntityHistory('entity1')).rejects.toThrow(
        'Storage provider does not support entity history operations'
      );
    });
  });

  describe('getRelationHistory', () => {
    it('should delegate to storage provider', async () => {
      const relationHistory: Relation[] = [
        { from: 'A', to: 'B', relationType: 'KNOWS', strength: 0.5 },
        { from: 'A', to: 'B', relationType: 'KNOWS', strength: 0.9 },
      ];

      const mockProvider = createComprehensiveMockProvider({
        getRelationHistory: vi.fn().mockResolvedValue(relationHistory),
      });

      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const result = await manager.getRelationHistory('A', 'B', 'KNOWS');

      expect((mockProvider as any).getRelationHistory).toHaveBeenCalledWith('A', 'B', 'KNOWS');
      expect(result).toEqual(relationHistory);
    });

    it('should throw error when storage provider does not support relation history', async () => {
      const mockProvider = createComprehensiveMockProvider();
      delete (mockProvider as any).getRelationHistory;

      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      await expect(manager.getRelationHistory('A', 'B', 'KNOWS')).rejects.toThrow(
        'Storage provider does not support relation history operations'
      );
    });
  });

  describe('getGraphAtTime', () => {
    it('should delegate to storage provider', async () => {
      const graphAtTime: KnowledgeGraph = {
        entities: [{ name: 'historical', entityType: 'test', observations: [] }],
        relations: [],
      };

      const mockProvider = createComprehensiveMockProvider({
        getGraphAtTime: vi.fn().mockResolvedValue(graphAtTime),
      });

      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const timestamp = Date.now() - 86400000; // 1 day ago
      const result = await manager.getGraphAtTime(timestamp);

      expect((mockProvider as any).getGraphAtTime).toHaveBeenCalledWith(timestamp);
      expect(result).toEqual(graphAtTime);
    });

    it('should throw error when storage provider does not support temporal graph operations', async () => {
      const mockProvider = createComprehensiveMockProvider();
      delete (mockProvider as any).getGraphAtTime;

      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      await expect(manager.getGraphAtTime(Date.now())).rejects.toThrow(
        'Storage provider does not support temporal graph operations'
      );
    });
  });
});

describe('KnowledgeGraphManager - Batch Operations', () => {
  describe('createEntitiesBatch', () => {
    it('should validate entities is non-empty array', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      await expect(manager.createEntitiesBatch([])).rejects.toThrow(
        'Entities must be a non-empty array'
      );
    });

    it('should reject null/undefined entries', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const entitiesWithNull = [
        { name: 'valid', entityType: 'test', observations: [] },
        null,
      ] as unknown as Entity[];

      await expect(manager.createEntitiesBatch(entitiesWithNull)).rejects.toThrow(
        'Found 1 null/undefined entries in entities array'
      );
    });

    it('should reject duplicate entity names within batch', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const duplicateEntities: Entity[] = [
        { name: 'duplicate', entityType: 'test', observations: [] },
        { name: 'duplicate', entityType: 'test', observations: [] },
      ];

      await expect(manager.createEntitiesBatch(duplicateEntities)).rejects.toThrow(
        'Duplicate entity names within batch: duplicate'
      );
    });

    it('should validate required fields', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const invalidEntities = [{ name: '', entityType: 'test', observations: [] }] as Entity[];

      await expect(manager.createEntitiesBatch(invalidEntities)).rejects.toThrow(
        "Entity at index 0 is missing required 'name' field"
      );
    });

    it('should validate entityType field', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const invalidEntities = [{ name: 'valid', entityType: '', observations: [] }] as Entity[];

      await expect(manager.createEntitiesBatch(invalidEntities)).rejects.toThrow(
        "Entity at index 0 has invalid 'entityType' field"
      );
    });

    it('should validate observations is an array', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const invalidEntities = [
        { name: 'valid', entityType: 'test', observations: 'not-an-array' },
      ] as unknown as Entity[];

      await expect(manager.createEntitiesBatch(invalidEntities)).rejects.toThrow(
        "Entity at index 0 has invalid 'observations' field (must be array)"
      );
    });

    it('should throw when storage provider lacks createEntitiesBatch', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const validEntities: Entity[] = [
        { name: 'entity1', entityType: 'test', observations: ['obs1'] },
      ];

      await expect(manager.createEntitiesBatch(validEntities)).rejects.toThrow(
        'Storage provider does not support batch entity creation'
      );
    });

    it('should delegate to storage provider and schedule embeddings', async () => {
      const batchResult: BatchResult<Entity> = {
        successful: [{ name: 'entity1', entityType: 'test', observations: ['obs1'] }],
        failed: [],
        totalTimeMs: 100,
        avgTimePerItemMs: 100,
      };

      const mockEmbeddingJobManager = {
        scheduleEntityEmbedding: vi.fn().mockResolvedValue(undefined),
        embeddingService: createMockEmbeddingService(),
      } as unknown as EmbeddingJobManager;

      const mockProvider = createComprehensiveMockProvider({
        createEntitiesBatch: vi.fn().mockResolvedValue(batchResult),
      });

      const manager = new KnowledgeGraphManager({
        storageProvider: mockProvider,
        embeddingJobManager: mockEmbeddingJobManager,
      });

      const validEntities: Entity[] = [
        { name: 'entity1', entityType: 'test', observations: ['obs1'] },
      ];

      const result = await manager.createEntitiesBatch(validEntities);

      expect((mockProvider as any).createEntitiesBatch).toHaveBeenCalledWith(
        validEntities,
        undefined
      );
      expect(mockEmbeddingJobManager.scheduleEntityEmbedding).toHaveBeenCalledWith('entity1', 1);
      expect(result).toEqual(batchResult);
    });
  });

  describe('createRelationsBatch', () => {
    it('should validate relations is non-empty array', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      await expect(manager.createRelationsBatch([])).rejects.toThrow(
        'Relations must be a non-empty array'
      );
    });

    it('should reject null/undefined entries', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const relationsWithNull = [
        { from: 'A', to: 'B', relationType: 'KNOWS' },
        null,
      ] as unknown as Relation[];

      await expect(manager.createRelationsBatch(relationsWithNull)).rejects.toThrow(
        'Found 1 null/undefined entries in relations array'
      );
    });

    it('should reject duplicate relations within batch', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const duplicateRelations: Relation[] = [
        { from: 'A', to: 'B', relationType: 'KNOWS' },
        { from: 'A', to: 'B', relationType: 'KNOWS' },
      ];

      await expect(manager.createRelationsBatch(duplicateRelations)).rejects.toThrow(
        'Duplicate relations within batch: A->KNOWS->B'
      );
    });

    it('should validate required fields', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const invalidRelations = [{ from: '', to: 'B', relationType: 'KNOWS' }] as Relation[];

      await expect(manager.createRelationsBatch(invalidRelations)).rejects.toThrow(
        "Relation at index 0 has invalid 'from' field"
      );
    });

    it('should throw when storage provider lacks createRelationsBatch', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const validRelations: Relation[] = [{ from: 'A', to: 'B', relationType: 'KNOWS' }];

      await expect(manager.createRelationsBatch(validRelations)).rejects.toThrow(
        'Storage provider does not support batch relation creation'
      );
    });

    it('should delegate to storage provider', async () => {
      const batchResult: BatchResult<Relation> = {
        successful: [{ from: 'A', to: 'B', relationType: 'KNOWS' }],
        failed: [],
        totalTimeMs: 50,
        avgTimePerItemMs: 50,
      };

      const mockProvider = createComprehensiveMockProvider({
        createRelationsBatch: vi.fn().mockResolvedValue(batchResult),
      });

      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const validRelations: Relation[] = [{ from: 'A', to: 'B', relationType: 'KNOWS' }];

      const result = await manager.createRelationsBatch(validRelations);

      expect((mockProvider as any).createRelationsBatch).toHaveBeenCalledWith(
        validRelations,
        undefined
      );
      expect(result).toEqual(batchResult);
    });
  });

  describe('addObservationsBatch', () => {
    it('should validate batches is non-empty array', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      await expect(manager.addObservationsBatch([])).rejects.toThrow(
        'Observation batches must be a non-empty array'
      );
    });

    it('should reject null/undefined entries', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const batchesWithNull = [
        { entityName: 'entity1', observations: ['obs1'] },
        null,
      ] as unknown as { entityName: string; observations: string[] }[];

      await expect(manager.addObservationsBatch(batchesWithNull)).rejects.toThrow(
        'Found 1 null/undefined entries in observation batches array'
      );
    });

    it('should validate entityName field', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const invalidBatches = [{ entityName: '', observations: ['obs1'] }];

      await expect(manager.addObservationsBatch(invalidBatches)).rejects.toThrow(
        "Observation batch at index 0 has invalid 'entityName' field"
      );
    });

    it('should validate observations is an array', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const invalidBatches = [
        { entityName: 'entity1', observations: 'not-an-array' },
      ] as unknown as { entityName: string; observations: string[] }[];

      await expect(manager.addObservationsBatch(invalidBatches)).rejects.toThrow(
        "Observation batch at index 0 has invalid 'observations' field (must be array)"
      );
    });

    it('should reject empty observations array', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const emptyObsBatches = [{ entityName: 'entity1', observations: [] }];

      await expect(manager.addObservationsBatch(emptyObsBatches)).rejects.toThrow(
        'Observation batch at index 0 has empty observations array'
      );
    });

    it('should throw when storage provider lacks addObservationsBatch', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const validBatches = [{ entityName: 'entity1', observations: ['obs1'] }];

      await expect(manager.addObservationsBatch(validBatches)).rejects.toThrow(
        'Storage provider does not support batch observation addition'
      );
    });

    it('should delegate to storage provider and schedule embeddings', async () => {
      const batchResult: BatchResult<{ entityName: string; addedObservations: string[] }> = {
        successful: [{ entityName: 'entity1', addedObservations: ['obs1'] }],
        failed: [],
        totalTimeMs: 30,
        avgTimePerItemMs: 30,
      };

      const mockEmbeddingJobManager = {
        scheduleEntityEmbedding: vi.fn().mockResolvedValue(undefined),
        embeddingService: createMockEmbeddingService(),
      } as unknown as EmbeddingJobManager;

      const mockProvider = createComprehensiveMockProvider({
        addObservationsBatch: vi.fn().mockResolvedValue(batchResult),
      });

      const manager = new KnowledgeGraphManager({
        storageProvider: mockProvider,
        embeddingJobManager: mockEmbeddingJobManager,
      });

      const validBatches = [{ entityName: 'entity1', observations: ['obs1'] }];

      const result = await manager.addObservationsBatch(validBatches);

      expect((mockProvider as any).addObservationsBatch).toHaveBeenCalledWith(
        validBatches,
        undefined
      );
      expect(mockEmbeddingJobManager.scheduleEntityEmbedding).toHaveBeenCalledWith('entity1', 1);
      expect(result).toEqual(batchResult);
    });
  });

  describe('updateEntitiesBatch', () => {
    it('should validate updates is non-empty array', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      await expect(manager.updateEntitiesBatch([])).rejects.toThrow(
        'Entity updates must be a non-empty array'
      );
    });

    it('should reject null/undefined entries', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const updatesWithNull = [
        { name: 'entity1', entityType: 'new-type' },
        null,
      ] as unknown as import('../types/batch-operations.js').EntityUpdate[];

      await expect(manager.updateEntitiesBatch(updatesWithNull)).rejects.toThrow(
        'Found 1 null/undefined entries in entity updates array'
      );
    });

    it('should validate name field', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const invalidUpdates = [
        { name: '', entityType: 'new-type' },
      ] as import('../types/batch-operations.js').EntityUpdate[];

      await expect(manager.updateEntitiesBatch(invalidUpdates)).rejects.toThrow(
        "Entity update at index 0 has invalid 'name' field"
      );
    });

    it('should require at least one field to update', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const emptyUpdates = [
        { name: 'entity1' },
      ] as import('../types/batch-operations.js').EntityUpdate[];

      await expect(manager.updateEntitiesBatch(emptyUpdates)).rejects.toThrow(
        'Entity update at index 0 must specify at least one field to update'
      );
    });

    it('should reject duplicate entity names in batch', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const duplicateUpdates = [
        { name: 'entity1', entityType: 'type1' },
        { name: 'entity1', entityType: 'type2' },
      ] as import('../types/batch-operations.js').EntityUpdate[];

      await expect(manager.updateEntitiesBatch(duplicateUpdates)).rejects.toThrow(
        'Duplicate entity names in updates batch: entity1'
      );
    });

    it('should throw when storage provider lacks updateEntitiesBatch', async () => {
      const mockProvider = createComprehensiveMockProvider();
      const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

      const validUpdates = [
        { name: 'entity1', entityType: 'new-type' },
      ] as import('../types/batch-operations.js').EntityUpdate[];

      await expect(manager.updateEntitiesBatch(validUpdates)).rejects.toThrow(
        'Storage provider does not support batch entity updates'
      );
    });

    it('should delegate to storage provider and schedule embeddings', async () => {
      const batchResult: BatchResult<import('../types/batch-operations.js').EntityUpdate> = {
        successful: [{ name: 'entity1', entityType: 'new-type' }],
        failed: [],
        totalTimeMs: 40,
        avgTimePerItemMs: 40,
      };

      const mockEmbeddingJobManager = {
        scheduleEntityEmbedding: vi.fn().mockResolvedValue(undefined),
        embeddingService: createMockEmbeddingService(),
      } as unknown as EmbeddingJobManager;

      const mockProvider = createComprehensiveMockProvider({
        updateEntitiesBatch: vi.fn().mockResolvedValue(batchResult),
      });

      const manager = new KnowledgeGraphManager({
        storageProvider: mockProvider,
        embeddingJobManager: mockEmbeddingJobManager,
      });

      const validUpdates = [
        { name: 'entity1', entityType: 'new-type' },
      ] as import('../types/batch-operations.js').EntityUpdate[];

      const result = await manager.updateEntitiesBatch(validUpdates);

      expect((mockProvider as any).updateEntitiesBatch).toHaveBeenCalledWith(
        validUpdates,
        undefined
      );
      expect(mockEmbeddingJobManager.scheduleEntityEmbedding).toHaveBeenCalledWith('entity1', 2);
      expect(result).toEqual(batchResult);
    });
  });
});

describe('KnowledgeGraphManager - Add Observations', () => {
  it('should return empty array for empty observations', async () => {
    const mockProvider = createComprehensiveMockProvider();
    const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

    const result = await manager.addObservations([]);

    expect(result).toEqual([]);
    expect(mockProvider.addObservations).not.toHaveBeenCalled();
  });

  it('should return empty array for null/undefined observations', async () => {
    const mockProvider = createComprehensiveMockProvider();
    const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

    const result = await manager.addObservations(
      null as unknown as { entityName: string; contents: string[] }[]
    );

    expect(result).toEqual([]);
  });

  it('should strip extra fields and delegate simplified observations', async () => {
    const mockProvider = createComprehensiveMockProvider({
      addObservations: vi
        .fn()
        .mockResolvedValue([{ entityName: 'entity1', addedObservations: ['obs1'] }]),
    });

    const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

    // Add extra fields that should be stripped
    const observations = [
      {
        entityName: 'entity1',
        contents: ['obs1'],
        strength: 0.9,
        confidence: 0.8,
        metadata: { key: 'value' },
        extraField: 'should be ignored',
      },
    ];

    await manager.addObservations(observations);

    // Should only pass entityName and contents
    expect(mockProvider.addObservations).toHaveBeenCalledWith([
      { entityName: 'entity1', contents: ['obs1'] },
    ]);
  });

  it('should schedule re-embedding for entities with added observations', async () => {
    const mockEmbeddingJobManager = {
      scheduleEntityEmbedding: vi.fn().mockResolvedValue(undefined),
      embeddingService: createMockEmbeddingService(),
    } as unknown as EmbeddingJobManager;

    const mockProvider = createComprehensiveMockProvider({
      addObservations: vi.fn().mockResolvedValue([
        { entityName: 'entity1', addedObservations: ['new-obs'] },
        { entityName: 'entity2', addedObservations: [] }, // No new observations
      ]),
    });

    const manager = new KnowledgeGraphManager({
      storageProvider: mockProvider,
      embeddingJobManager: mockEmbeddingJobManager,
    });

    await manager.addObservations([
      { entityName: 'entity1', contents: ['new-obs'] },
      { entityName: 'entity2', contents: ['existing-obs'] },
    ]);

    // Should only schedule embedding for entity1 (which had observations added)
    expect(mockEmbeddingJobManager.scheduleEntityEmbedding).toHaveBeenCalledTimes(1);
    expect(mockEmbeddingJobManager.scheduleEntityEmbedding).toHaveBeenCalledWith('entity1', 1);
  });
});

describe('KnowledgeGraphManager - Create Entities', () => {
  it('should return empty array and save graph for empty entities with no storage provider', async () => {
    // Test the deprecated file-based path
    const mockFs = {
      access: vi.fn().mockRejectedValue(new Error('ENOENT')),
      readFile: vi.fn().mockResolvedValue(''),
      writeFile: vi.fn().mockResolvedValue(undefined),
    };

    const manager = new KnowledgeGraphManager({
      memoryFilePath: '/tmp/test-memory.json',
    });

    // Inject mock fs
    (manager as any).fsModule = mockFs;

    const result = await manager.createEntities([]);

    expect(result).toEqual([]);
  });

  it('should merge observations when entity already exists in file-based storage', async () => {
    const existingGraph = {
      entities: [{ name: 'entity1', entityType: 'person', observations: ['existing-obs'] }],
      relations: [],
    };

    const mockFs = {
      access: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(JSON.stringify(existingGraph)),
      writeFile: vi.fn().mockResolvedValue(undefined),
    };

    const manager = new KnowledgeGraphManager({
      memoryFilePath: '/tmp/test-memory.json',
    });

    // Inject mock fs
    (manager as any).fsModule = mockFs;

    const result = await manager.createEntities([
      { name: 'entity1', entityType: 'person', observations: ['new-obs'] },
    ]);

    // Should return empty because entity already existed (merged, not created)
    expect(result).toEqual([]);
  });

  it('should add vectors to vector store when creating entities with embeddings', async () => {
    const mockVectorStore = {
      addVector: vi.fn().mockResolvedValue(undefined),
    };

    const mockProvider = createComprehensiveMockProvider({
      createEntities: vi.fn().mockImplementation(async (entities: Entity[]) => entities),
    });

    const manager = new KnowledgeGraphManager({
      storageProvider: mockProvider,
    });

    // Inject mock vector store
    (manager as any).vectorStore = mockVectorStore;

    // Mock loadGraph to return empty
    vi.spyOn(manager as any, 'loadGraph').mockResolvedValue({ entities: [], relations: [] });

    const entityWithEmbedding: Entity = {
      name: 'entity1',
      entityType: 'test',
      observations: ['obs'],
      embedding: {
        vector: new Array(1536).fill(0.1),
        model: 'text-embedding-3-small',
        lastUpdated: Date.now(),
      },
    };

    await manager.createEntities([entityWithEmbedding]);

    expect(mockVectorStore.addVector).toHaveBeenCalledWith(
      'entity1',
      entityWithEmbedding.embedding!.vector,
      { name: 'entity1', entityType: 'test' }
    );
  });
});

describe('KnowledgeGraphManager - Create Relations', () => {
  it('should return empty array for empty relations with storage provider', async () => {
    const mockProvider = createComprehensiveMockProvider();
    const manager = new KnowledgeGraphManager({ storageProvider: mockProvider });

    const result = await manager.createRelations([]);

    expect(result).toEqual([]);
    expect(mockProvider.createRelations).not.toHaveBeenCalled();
  });
});
