/**
 * Comprehensive tests for callToolHandler
 * Covers: all tool cases including temporal, embedding, and diagnostic operations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCallToolRequest } from '../callToolHandler.js';

/**
 * Create a comprehensive mock KnowledgeGraphManager with all methods
 */
function createMockKnowledgeGraphManager(overrides: Record<string, unknown> = {}) {
  return {
    // Graph operations
    readGraph: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    createEntities: vi.fn().mockResolvedValue([]),
    createRelations: vi.fn().mockResolvedValue([]),

    // Delete operations
    deleteEntities: vi.fn().mockResolvedValue(undefined),
    deleteObservations: vi.fn().mockResolvedValue(undefined),
    deleteRelations: vi.fn().mockResolvedValue(undefined),

    // Search operations
    searchNodes: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    openNodes: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    search: vi.fn().mockResolvedValue({ entities: [], relations: [] }),

    // Observation operations
    addObservations: vi.fn().mockResolvedValue([]),

    // Relation operations
    getRelation: vi.fn().mockResolvedValue(null),
    updateRelation: vi.fn().mockResolvedValue(undefined),

    // Temporal operations
    getEntityHistory: vi.fn().mockResolvedValue([]),
    getRelationHistory: vi.fn().mockResolvedValue([]),
    getGraphAtTime: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    getDecayedGraph: vi.fn().mockResolvedValue({ entities: [], relations: [] }),

    // Batch operations
    createEntitiesBatch: vi.fn().mockResolvedValue({ successful: [], failed: [] }),
    createRelationsBatch: vi.fn().mockResolvedValue({ successful: [], failed: [] }),
    addObservationsBatch: vi.fn().mockResolvedValue({ successful: [], failed: [] }),
    updateEntitiesBatch: vi.fn().mockResolvedValue({ successful: [], failed: [] }),

    // Storage provider
    storageProvider: {
      getEntityEmbedding: vi.fn().mockResolvedValue(null),
      diagnoseVectorSearch: vi.fn().mockResolvedValue({ status: 'ok' }),
      getConnectionManager: vi.fn().mockReturnValue({}),
      countEntitiesWithEmbeddings: vi.fn().mockResolvedValue(0),
      storeEntityVector: vi.fn().mockResolvedValue(undefined),
    },

    // Embedding job manager
    embeddingJobManager: null,

    ...overrides,
  };
}

describe('callToolHandler - Delete Operations', () => {
  it('should handle delete_observations', async () => {
    const mockManager = createMockKnowledgeGraphManager();
    const deletions = [{ entityName: 'entity1', observations: ['obs1'] }];

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'delete_observations',
          arguments: { deletions },
        },
      },
      mockManager
    );

    expect(mockManager.deleteObservations).toHaveBeenCalledWith(deletions);
    expect(result.content[0].text).toBe('Observations deleted successfully');
  });

  it('should handle delete_relations', async () => {
    const mockManager = createMockKnowledgeGraphManager();
    const relations = [{ from: 'A', to: 'B', relationType: 'KNOWS' }];

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'delete_relations',
          arguments: { relations },
        },
      },
      mockManager
    );

    expect(mockManager.deleteRelations).toHaveBeenCalledWith(relations);
    expect(result.content[0].text).toBe('Relations deleted successfully');
  });
});

describe('callToolHandler - Get Relation Operations', () => {
  it('should handle get_relation when found', async () => {
    const mockRelation = { from: 'A', to: 'B', relationType: 'KNOWS', strength: 0.9 };
    const mockManager = createMockKnowledgeGraphManager({
      getRelation: vi.fn().mockResolvedValue(mockRelation),
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'get_relation',
          arguments: { from: 'A', to: 'B', relationType: 'KNOWS' },
        },
      },
      mockManager
    );

    expect(mockManager.getRelation).toHaveBeenCalledWith('A', 'B', 'KNOWS');
    expect(JSON.parse(result.content[0].text)).toEqual(mockRelation);
  });

  it('should handle get_relation when not found', async () => {
    const mockManager = createMockKnowledgeGraphManager({
      getRelation: vi.fn().mockResolvedValue(null),
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'get_relation',
          arguments: { from: 'A', to: 'B', relationType: 'KNOWS' },
        },
      },
      mockManager
    );

    expect(result.content[0].text).toBe('Relation not found: A -> KNOWS -> B');
  });

  it('should handle update_relation', async () => {
    const mockManager = createMockKnowledgeGraphManager();
    const relation = { from: 'A', to: 'B', relationType: 'KNOWS', strength: 0.95 };

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'update_relation',
          arguments: { relation },
        },
      },
      mockManager
    );

    expect(mockManager.updateRelation).toHaveBeenCalledWith(relation);
    expect(result.content[0].text).toBe('Relation updated successfully');
  });
});

describe('callToolHandler - Search Operations', () => {
  it('should handle search_nodes with domain filter', async () => {
    const mockResults = {
      entities: [{ name: 'entity1', entityType: 'test', observations: [] }],
      relations: [],
    };
    const mockManager = createMockKnowledgeGraphManager({
      searchNodes: vi.fn().mockResolvedValue(mockResults),
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'search_nodes',
          arguments: { query: 'test', domain: 'my-domain', include_null_domain: false },
        },
      },
      mockManager
    );

    expect(mockManager.searchNodes).toHaveBeenCalledWith('test', {
      domain: 'my-domain',
      includeNullDomain: false,
    });
    expect(JSON.parse(result.content[0].text)).toEqual(mockResults);
  });

  it('should handle open_nodes', async () => {
    const mockResults = {
      entities: [{ name: 'entity1', entityType: 'test', observations: [] }],
      relations: [],
    };
    const mockManager = createMockKnowledgeGraphManager({
      openNodes: vi.fn().mockResolvedValue(mockResults),
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'open_nodes',
          arguments: { names: ['entity1', 'entity2'] },
        },
      },
      mockManager
    );

    expect(mockManager.openNodes).toHaveBeenCalledWith(['entity1', 'entity2']);
    expect(JSON.parse(result.content[0].text)).toEqual(mockResults);
  });
});

describe('callToolHandler - Temporal Operations', () => {
  it('should handle get_entity_history', async () => {
    const mockHistory = [
      { name: 'entity1', entityType: 'test', observations: ['v1'], version: 1 },
      { name: 'entity1', entityType: 'test', observations: ['v2'], version: 2 },
    ];
    const mockManager = createMockKnowledgeGraphManager({
      getEntityHistory: vi.fn().mockResolvedValue(mockHistory),
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'get_entity_history',
          arguments: { entityName: 'entity1' },
        },
      },
      mockManager
    );

    expect(mockManager.getEntityHistory).toHaveBeenCalledWith('entity1');
    expect(JSON.parse(result.content[0].text)).toEqual(mockHistory);
  });

  it('should handle get_entity_history error', async () => {
    const mockManager = createMockKnowledgeGraphManager({
      getEntityHistory: vi.fn().mockRejectedValue(new Error('History not available')),
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'get_entity_history',
          arguments: { entityName: 'entity1' },
        },
      },
      mockManager
    );

    expect(result.content[0].text).toBe('Error retrieving entity history: History not available');
  });

  it('should handle get_relation_history', async () => {
    const mockHistory = [
      { from: 'A', to: 'B', relationType: 'KNOWS', strength: 0.5, version: 1 },
      { from: 'A', to: 'B', relationType: 'KNOWS', strength: 0.9, version: 2 },
    ];
    const mockManager = createMockKnowledgeGraphManager({
      getRelationHistory: vi.fn().mockResolvedValue(mockHistory),
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'get_relation_history',
          arguments: { from: 'A', to: 'B', relationType: 'KNOWS' },
        },
      },
      mockManager
    );

    expect(mockManager.getRelationHistory).toHaveBeenCalledWith('A', 'B', 'KNOWS');
    expect(JSON.parse(result.content[0].text)).toEqual(mockHistory);
  });

  it('should handle get_relation_history error', async () => {
    const mockManager = createMockKnowledgeGraphManager({
      getRelationHistory: vi.fn().mockRejectedValue(new Error('Relation history error')),
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'get_relation_history',
          arguments: { from: 'A', to: 'B', relationType: 'KNOWS' },
        },
      },
      mockManager
    );

    expect(result.content[0].text).toBe(
      'Error retrieving relation history: Relation history error'
    );
  });

  it('should handle get_graph_at_time', async () => {
    const mockGraph = {
      entities: [{ name: 'historical', entityType: 'test', observations: [] }],
      relations: [],
    };
    const mockManager = createMockKnowledgeGraphManager({
      getGraphAtTime: vi.fn().mockResolvedValue(mockGraph),
    });

    const timestamp = Date.now() - 86400000;
    const result = await handleCallToolRequest(
      {
        params: {
          name: 'get_graph_at_time',
          arguments: { timestamp },
        },
      },
      mockManager
    );

    expect(mockManager.getGraphAtTime).toHaveBeenCalledWith(timestamp);
    expect(JSON.parse(result.content[0].text)).toEqual(mockGraph);
  });

  it('should handle get_graph_at_time error', async () => {
    const mockManager = createMockKnowledgeGraphManager({
      getGraphAtTime: vi.fn().mockRejectedValue(new Error('Temporal query failed')),
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'get_graph_at_time',
          arguments: { timestamp: Date.now() },
        },
      },
      mockManager
    );

    expect(result.content[0].text).toBe('Error retrieving graph at time: Temporal query failed');
  });

  it('should handle get_decayed_graph without options', async () => {
    const mockGraph = { entities: [], relations: [], decay_info: { factor: 0.95 } };
    const mockManager = createMockKnowledgeGraphManager({
      getDecayedGraph: vi.fn().mockResolvedValue(mockGraph),
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'get_decayed_graph',
          arguments: {},
        },
      },
      mockManager
    );

    expect(mockManager.getDecayedGraph).toHaveBeenCalledWith();
    expect(JSON.parse(result.content[0].text)).toEqual(mockGraph);
  });

  it('should handle get_decayed_graph with options', async () => {
    const mockGraph = { entities: [], relations: [], decay_info: { factor: 0.8 } };
    const mockManager = createMockKnowledgeGraphManager({
      getDecayedGraph: vi.fn().mockResolvedValue(mockGraph),
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'get_decayed_graph',
          arguments: { reference_time: 1234567890000, decay_factor: 0.8 },
        },
      },
      mockManager
    );

    expect(mockManager.getDecayedGraph).toHaveBeenCalledWith({
      referenceTime: 1234567890000,
      decayFactor: 0.8,
    });
    expect(JSON.parse(result.content[0].text)).toEqual(mockGraph);
  });

  it('should handle get_decayed_graph error', async () => {
    const mockManager = createMockKnowledgeGraphManager({
      getDecayedGraph: vi.fn().mockRejectedValue(new Error('Decay operation failed')),
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'get_decayed_graph',
          arguments: {},
        },
      },
      mockManager
    );

    expect(result.content[0].text).toBe('Error retrieving decayed graph: Decay operation failed');
  });
});

describe('callToolHandler - Semantic Search Operations', () => {
  it('should handle semantic_search with default options', async () => {
    const mockResults = { entities: [], relations: [], total: 0 };
    const mockManager = createMockKnowledgeGraphManager({
      search: vi.fn().mockResolvedValue(mockResults),
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'semantic_search',
          arguments: { query: 'test query' },
        },
      },
      mockManager
    );

    expect(mockManager.search).toHaveBeenCalledWith(
      'test query',
      expect.objectContaining({
        semanticSearch: true,
        limit: 10,
        minSimilarity: 0.6,
      })
    );
    expect(JSON.parse(result.content[0].text)).toEqual(mockResults);
  });

  it('should handle semantic_search with hybrid config', async () => {
    const mockResults = { entities: [], relations: [], total: 0 };
    const mockManager = createMockKnowledgeGraphManager({
      search: vi.fn().mockResolvedValue(mockResults),
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'semantic_search',
          arguments: {
            query: 'test query',
            limit: 5,
            min_similarity: 0.8,
            hybrid_config: {
              vector_weight: 0.7,
              temporal_weight: 0.3,
              enable_score_debug: true,
            },
          },
        },
      },
      mockManager
    );

    expect(mockManager.search).toHaveBeenCalledWith(
      'test query',
      expect.objectContaining({
        limit: 5,
        minSimilarity: 0.8,
        hybridConfig: expect.objectContaining({
          vectorWeight: 0.7,
          temporalWeight: 0.3,
          enableScoreDebug: true,
        }),
      })
    );
  });

  it('should handle semantic_search error', async () => {
    const mockManager = createMockKnowledgeGraphManager({
      search: vi.fn().mockRejectedValue(new Error('Search failed')),
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'semantic_search',
          arguments: { query: 'test query' },
        },
      },
      mockManager
    );

    expect(result.content[0].text).toBe('Error performing semantic search: Search failed');
  });
});

describe('callToolHandler - Entity Embedding Operations', () => {
  it('should handle get_entity_embedding when found', async () => {
    const mockEmbedding = {
      vector: new Array(1536).fill(0.1),
      model: 'text-embedding-3-small',
      lastUpdated: Date.now(),
    };
    const mockManager = createMockKnowledgeGraphManager({
      openNodes: vi.fn().mockResolvedValue({
        entities: [{ name: 'entity1', entityType: 'test', observations: [] }],
        relations: [],
      }),
      storageProvider: {
        getEntityEmbedding: vi.fn().mockResolvedValue(mockEmbedding),
      },
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'get_entity_embedding',
          arguments: { entity_name: 'entity1' },
        },
      },
      mockManager
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.entityName).toBe('entity1');
    expect(parsed.dimensions).toBe(1536);
    expect(parsed.model).toBe('text-embedding-3-small');
  });

  it('should handle get_entity_embedding when entity not found', async () => {
    const mockManager = createMockKnowledgeGraphManager({
      openNodes: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'get_entity_embedding',
          arguments: { entity_name: 'nonexistent' },
        },
      },
      mockManager
    );

    expect(result.content[0].text).toBe('Entity not found: nonexistent');
  });

  it('should handle get_entity_embedding when no embedding found', async () => {
    const mockManager = createMockKnowledgeGraphManager({
      openNodes: vi.fn().mockResolvedValue({
        entities: [{ name: 'entity1', entityType: 'test', observations: [] }],
        relations: [],
      }),
      storageProvider: {
        getEntityEmbedding: vi.fn().mockResolvedValue(null),
      },
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'get_entity_embedding',
          arguments: { entity_name: 'entity1' },
        },
      },
      mockManager
    );

    expect(result.content[0].text).toBe('No embedding found for entity: entity1');
  });

  it('should handle get_entity_embedding when storage provider lacks method', async () => {
    const mockManager = createMockKnowledgeGraphManager({
      openNodes: vi.fn().mockResolvedValue({
        entities: [{ name: 'entity1', entityType: 'test', observations: [] }],
        relations: [],
      }),
      storageProvider: {
        // No getEntityEmbedding method
      },
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'get_entity_embedding',
          arguments: { entity_name: 'entity1' },
        },
      },
      mockManager
    );

    expect(result.content[0].text).toBe(
      'Embedding retrieval not supported by this storage provider'
    );
  });

  it('should handle get_entity_embedding error', async () => {
    const mockManager = createMockKnowledgeGraphManager({
      openNodes: vi.fn().mockRejectedValue(new Error('Storage error')),
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'get_entity_embedding',
          arguments: { entity_name: 'entity1' },
        },
      },
      mockManager
    );

    expect(result.content[0].text).toBe('Error retrieving entity embedding: Storage error');
  });
});

describe('callToolHandler - Force Generate Embedding', () => {
  it('should throw error when entity_name is missing', async () => {
    const mockManager = createMockKnowledgeGraphManager();

    await expect(
      handleCallToolRequest(
        {
          params: {
            name: 'force_generate_embedding',
            arguments: {},
          },
        },
        mockManager
      )
    ).rejects.toThrow('Missing required parameter: entity_name');
  });

  it('should return error when entity not found', async () => {
    const mockManager = createMockKnowledgeGraphManager({
      openNodes: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'force_generate_embedding',
          arguments: { entity_name: 'nonexistent' },
        },
      },
      mockManager
    );

    expect(result.content[0].text).toBe(
      'Failed to generate embedding: Entity not found: nonexistent'
    );
  });

  it('should return error when EmbeddingJobManager not initialized', async () => {
    const mockManager = createMockKnowledgeGraphManager({
      openNodes: vi.fn().mockResolvedValue({
        entities: [{ name: 'entity1', entityType: 'test', observations: [] }],
        relations: [],
      }),
      embeddingJobManager: null,
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'force_generate_embedding',
          arguments: { entity_name: 'entity1' },
        },
      },
      mockManager
    );

    expect(result.content[0].text).toBe(
      'Failed to generate embedding: EmbeddingJobManager not initialized'
    );
  });

  it('should return error when embedding service not available', async () => {
    const mockManager = createMockKnowledgeGraphManager({
      openNodes: vi.fn().mockResolvedValue({
        entities: [{ name: 'entity1', entityType: 'test', observations: [] }],
        relations: [],
      }),
      embeddingJobManager: {
        _prepareEntityText: vi.fn().mockReturnValue('entity text'),
        embeddingService: null,
      },
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'force_generate_embedding',
          arguments: { entity_name: 'entity1' },
        },
      },
      mockManager
    );

    expect(result.content[0].text).toBe(
      'Failed to generate embedding: Embedding service not available'
    );
  });

  it('should successfully generate embedding', async () => {
    const mockVector = new Array(1536).fill(0.1);
    const mockManager = createMockKnowledgeGraphManager({
      openNodes: vi.fn().mockResolvedValue({
        entities: [{ name: 'entity1', entityType: 'test', observations: ['obs1'], id: 'uuid-123' }],
        relations: [],
      }),
      embeddingJobManager: {
        _prepareEntityText: vi.fn().mockReturnValue('entity text'),
        embeddingService: {
          generateEmbedding: vi.fn().mockResolvedValue(mockVector),
          getModelInfo: vi.fn().mockReturnValue({ name: 'text-embedding-3-small' }),
        },
      },
      storageProvider: {
        storeEntityVector: vi.fn().mockResolvedValue(undefined),
      },
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'force_generate_embedding',
          arguments: { entity_name: 'entity1' },
        },
      },
      mockManager
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.entity).toBe('entity1');
    expect(parsed.vector_length).toBe(1536);
    expect(mockManager.storageProvider.storeEntityVector).toHaveBeenCalled();
  });
});

describe('callToolHandler - Debug Embedding Config', () => {
  it('should return diagnostic information', async () => {
    const mockManager = createMockKnowledgeGraphManager({
      embeddingJobManager: {
        embeddingService: {
          getModelInfo: vi.fn().mockReturnValue({ name: 'test-model' }),
        },
        getPendingJobs: vi.fn().mockReturnValue([]),
      },
      storageProvider: {
        getConnectionManager: vi.fn().mockReturnValue({}),
        countEntitiesWithEmbeddings: vi.fn().mockResolvedValue(100),
        vectorStore: {},
        embeddingService: {
          getProviderInfo: vi.fn().mockReturnValue({ provider: 'openai' }),
        },
      },
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'debug_embedding_config',
          arguments: {},
        },
      },
      mockManager
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty('storage_type');
    expect(parsed).toHaveProperty('openai_api_key_present');
    expect(parsed).toHaveProperty('embedding_model');
    expect(parsed).toHaveProperty('embedding_job_manager_initialized');
    expect(parsed.entities_with_embeddings).toBe(100);
  });

  it('should handle debug_embedding_config error gracefully', async () => {
    const mockManager = {
      embeddingJobManager: {
        embeddingService: {
          getModelInfo: vi.fn().mockImplementation(() => {
            throw new Error('Service error');
          }),
        },
      },
      storageProvider: {
        getConnectionManager: vi.fn().mockImplementation(() => {
          throw new Error('Connection error');
        }),
      },
    };

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'debug_embedding_config',
          arguments: {},
        },
      },
      mockManager
    );

    // Should still return a result, not throw
    expect(result.content[0].type).toBe('text');
  });
});

describe('callToolHandler - Diagnose Vector Search', () => {
  it('should call diagnoseVectorSearch when available', async () => {
    const mockDiagnostics = { status: 'ok', vectorIndexExists: true, entityCount: 100 };
    const mockManager = createMockKnowledgeGraphManager({
      storageProvider: {
        diagnoseVectorSearch: vi.fn().mockResolvedValue(mockDiagnostics),
      },
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'diagnose_vector_search',
          arguments: {},
        },
      },
      mockManager
    );

    expect(JSON.parse(result.content[0].text)).toEqual(mockDiagnostics);
  });

  it('should return error when diagnoseVectorSearch not available', async () => {
    const mockManager = createMockKnowledgeGraphManager({
      storageProvider: {
        // No diagnoseVectorSearch method
      },
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'diagnose_vector_search',
          arguments: {},
        },
      },
      mockManager
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe('Diagnostic method not available');
  });

  it('should handle missing storage provider', async () => {
    const mockManager = createMockKnowledgeGraphManager({
      storageProvider: null,
    });

    const result = await handleCallToolRequest(
      {
        params: {
          name: 'diagnose_vector_search',
          arguments: {},
        },
      },
      mockManager
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe('Diagnostic method not available');
    expect(parsed.storageType).toBe('unknown');
  });
});

describe('callToolHandler - Unknown Tool', () => {
  it('should throw error for unknown tool', async () => {
    const mockManager = createMockKnowledgeGraphManager();

    await expect(
      handleCallToolRequest(
        {
          params: {
            name: 'unknown_tool',
            arguments: {},
          },
        },
        mockManager
      )
    ).rejects.toThrow('Unknown tool: unknown_tool');
  });
});
