/**
 * Test file for the callToolHandler module
 * Migrated from Jest to Vitest and converted to TypeScript
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { handleCallToolRequest } from '../callToolHandler.js';

// Define types for the knowledge graph manager
interface KnowledgeGraphManager {
  readGraph: ReturnType<typeof vi.fn>;
  createEntities: ReturnType<typeof vi.fn>;
  createRelations: ReturnType<typeof vi.fn>;
  addObservations: ReturnType<typeof vi.fn>;
  deleteEntities: ReturnType<typeof vi.fn>;
  deleteObservations: ReturnType<typeof vi.fn>;
  deleteRelations: ReturnType<typeof vi.fn>;
  getRelation: ReturnType<typeof vi.fn>;
  updateRelation: ReturnType<typeof vi.fn>;
  searchNodes: ReturnType<typeof vi.fn>;
  openNodes: ReturnType<typeof vi.fn>;
  getEntityHistory?: ReturnType<typeof vi.fn>;
}

// Instead of mocking the tool handler, we mock how it's used inside callToolHandler
// by mocking the original knowledge graph manager calls
describe('handleCallToolRequest', () => {
  let mockKnowledgeGraphManager: KnowledgeGraphManager;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create a mock KnowledgeGraphManager with all required methods
    mockKnowledgeGraphManager = {
      readGraph: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
      createEntities: vi.fn().mockResolvedValue({ success: true }),
      createRelations: vi.fn().mockResolvedValue({ success: true }),
      addObservations: vi.fn().mockResolvedValue({ success: true }),
      deleteEntities: vi.fn().mockResolvedValue(undefined),
      deleteObservations: vi.fn().mockResolvedValue(undefined),
      deleteRelations: vi.fn().mockResolvedValue(undefined),
      getRelation: vi
        .fn()
        .mockResolvedValue({ from: 'Entity1', to: 'Entity2', relationType: 'KNOWS' }),
      updateRelation: vi.fn().mockResolvedValue(undefined),
      searchNodes: vi.fn().mockResolvedValue([]),
      openNodes: vi.fn().mockResolvedValue([]),
    };
  });

  test('should throw an error if no arguments are provided', async () => {
    // Arrange
    const request = {
      params: {
        name: 'read_graph',
        arguments: undefined,
      },
    };

    // Act & Assert
    await expect(handleCallToolRequest(request, mockKnowledgeGraphManager)).rejects.toThrow(
      'No arguments provided for tool: read_graph'
    );
  });

  test('should throw an error for unknown tool', async () => {
    // Arrange
    const request = {
      params: {
        name: 'unknown_tool',
        arguments: {},
      },
    };

    // Act & Assert
    await expect(handleCallToolRequest(request, mockKnowledgeGraphManager)).rejects.toThrow(
      'Unknown tool: unknown_tool'
    );
  });

  test('should call readGraph and return formatted results for read_graph tool', async () => {
    // Arrange
    const request = {
      params: {
        name: 'read_graph',
        arguments: {},
      },
    };

    const graphData = { entities: [{ name: 'Entity1' }], relations: [] };
    mockKnowledgeGraphManager.readGraph.mockResolvedValue(graphData);

    // Act
    const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);

    // Assert
    expect(mockKnowledgeGraphManager.readGraph).toHaveBeenCalled();
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify(graphData, null, 2),
        },
      ],
    });
  });

  test('should call deleteEntities and return success message for delete_entities tool', async () => {
    // Arrange
    const entityNames = ['Entity1', 'Entity2'];
    const request = {
      params: {
        name: 'delete_entities',
        arguments: {
          entityNames,
        },
      },
    };

    // Act
    const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);

    // Assert
    expect(mockKnowledgeGraphManager.deleteEntities).toHaveBeenCalledWith(entityNames);
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Entities deleted successfully',
        },
      ],
    });
  });

  test('should call createRelations and return formatted results for create_relations tool', async () => {
    // Arrange
    const relations = [{ from: 'Entity1', to: 'Entity2', relationType: 'KNOWS' }];
    const request = {
      params: {
        name: 'create_relations',
        arguments: {
          relations,
        },
      },
    };

    const createResult = { success: true, count: 1 };
    mockKnowledgeGraphManager.createRelations.mockResolvedValue(createResult);

    // Act
    const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);

    // Assert
    expect(mockKnowledgeGraphManager.createRelations).toHaveBeenCalledWith(relations);
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify(createResult, null, 2),
        },
      ],
    });
  });

  test('should call addObservations and return formatted results for add_observations tool', async () => {
    // Arrange
    const observations = [{ entityName: 'Entity1', contents: ['New observation'] }];
    const request = {
      params: {
        name: 'add_observations',
        arguments: {
          observations,
        },
      },
    };

    const addResult = { success: true, count: 1 };
    mockKnowledgeGraphManager.addObservations.mockResolvedValue(addResult);

    // Act
    const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);

    // Assert
    expect(mockKnowledgeGraphManager.addObservations).toHaveBeenCalledWith([
      {
        entityName: 'Entity1',
        contents: ['New observation'],
        strength: 0.9,
        confidence: 0.95,
        metadata: { source: 'API call' },
      },
    ]);

    // Verify content type is correct
    expect(result.content[0].type).toEqual('text');

    // Parse the JSON response
    const responseObj = JSON.parse(result.content[0].text);

    // Verify response contains correct result data
    expect(responseObj.success).toBe(true);
    expect(responseObj.count).toBe(1);
    expect(responseObj.result).toEqual(addResult);
  });

  test('should call deleteObservations and return success message for delete_observations tool', async () => {
    // Arrange
    const deletions = [{ entityName: 'Entity1', observations: ['Observation to delete'] }];
    const request = {
      params: {
        name: 'delete_observations',
        arguments: {
          deletions,
        },
      },
    };

    // Act
    const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);

    // Assert
    expect(mockKnowledgeGraphManager.deleteObservations).toHaveBeenCalledWith(deletions);
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Observations deleted successfully',
        },
      ],
    });
  });

  test('should call deleteRelations and return success message for delete_relations tool', async () => {
    // Arrange
    const relations = [{ from: 'Entity1', to: 'Entity2', relationType: 'KNOWS' }];
    const request = {
      params: {
        name: 'delete_relations',
        arguments: {
          relations,
        },
      },
    };

    // Act
    const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);

    // Assert
    expect(mockKnowledgeGraphManager.deleteRelations).toHaveBeenCalledWith(relations);
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Relations deleted successfully',
        },
      ],
    });
  });

  test('should call getRelation and return formatted result for get_relation tool', async () => {
    // Arrange
    const relationArgs = {
      from: 'Entity1',
      to: 'Entity2',
      relationType: 'KNOWS',
    };
    const request = {
      params: {
        name: 'get_relation',
        arguments: relationArgs,
      },
    };

    const relation = {
      from: 'Entity1',
      to: 'Entity2',
      relationType: 'KNOWS',
      strength: 0.8,
    };
    mockKnowledgeGraphManager.getRelation.mockResolvedValue(relation);

    // Act
    const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);

    // Assert
    expect(mockKnowledgeGraphManager.getRelation).toHaveBeenCalledWith(
      relationArgs.from,
      relationArgs.to,
      relationArgs.relationType
    );
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify(relation, null, 2),
        },
      ],
    });
  });

  test('should handle case when relation is not found for get_relation tool', async () => {
    // Arrange
    const relationArgs = {
      from: 'Entity1',
      to: 'Entity2',
      relationType: 'KNOWS',
    };
    const request = {
      params: {
        name: 'get_relation',
        arguments: relationArgs,
      },
    };

    // Mock relation not found
    mockKnowledgeGraphManager.getRelation.mockResolvedValue(null);

    // Act
    const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);

    // Assert
    expect(mockKnowledgeGraphManager.getRelation).toHaveBeenCalledWith(
      relationArgs.from,
      relationArgs.to,
      relationArgs.relationType
    );
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: `Relation not found: ${relationArgs.from} -> ${relationArgs.relationType} -> ${relationArgs.to}`,
        },
      ],
    });
  });

  test('should call updateRelation and return success message for update_relation tool', async () => {
    // Arrange
    const relation = {
      from: 'Entity1',
      to: 'Entity2',
      relationType: 'KNOWS',
      strength: 0.9,
    };
    const request = {
      params: {
        name: 'update_relation',
        arguments: {
          relation,
        },
      },
    };

    // Act
    const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);

    // Assert
    expect(mockKnowledgeGraphManager.updateRelation).toHaveBeenCalledWith(relation);
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Relation updated successfully',
        },
      ],
    });
  });

  test('should call searchNodes and return formatted results for search_nodes tool', async () => {
    // Arrange
    const query = 'test query';
    const request = {
      params: {
        name: 'search_nodes',
        arguments: {
          query,
        },
      },
    };

    const searchResults = [{ name: 'Entity1', relevance: 0.9 }];
    mockKnowledgeGraphManager.searchNodes.mockResolvedValue(searchResults);

    // Act
    const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);

    // Assert
    expect(mockKnowledgeGraphManager.searchNodes).toHaveBeenCalledWith(query, {
      domain: undefined,
    });
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify(searchResults, null, 2),
        },
      ],
    });
  });

  test('should call openNodes and return formatted results for open_nodes tool', async () => {
    // Arrange
    const names = ['Entity1', 'Entity2'];
    const request = {
      params: {
        name: 'open_nodes',
        arguments: {
          names,
        },
      },
    };

    const openResults = [{ name: 'Entity1', observations: ['Observation 1'] }];
    mockKnowledgeGraphManager.openNodes.mockResolvedValue(openResults);

    // Act
    const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);

    // Assert
    expect(mockKnowledgeGraphManager.openNodes).toHaveBeenCalledWith(names);
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify(openResults, null, 2),
        },
      ],
    });
  });

  describe('temporal versioning tools', () => {
    test('should call getEntityHistory and return formatted results', async () => {
      // Arrange
      const request = {
        params: {
          name: 'get_entity_history',
          arguments: {
            entityName: 'Entity1',
          },
        },
      };

      const history = [
        { version: 1, name: 'Entity1', entityType: 'test', validFrom: 1700000000000 },
        { version: 2, name: 'Entity1', entityType: 'test', validFrom: 1700001000000 },
      ];
      mockKnowledgeGraphManager.getEntityHistory = vi.fn().mockResolvedValue(history);

      // Act
      const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);

      // Assert
      expect(mockKnowledgeGraphManager.getEntityHistory).toHaveBeenCalledWith('Entity1');
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify(history, null, 2),
          },
        ],
      });
    });

    test('should handle errors gracefully for get_entity_history', async () => {
      // Arrange
      const request = {
        params: {
          name: 'get_entity_history',
          arguments: {
            entityName: 'Entity1',
          },
        },
      };

      mockKnowledgeGraphManager.getEntityHistory = vi
        .fn()
        .mockRejectedValue(new Error('Database error'));

      // Act
      const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);

      // Assert
      expect(result.content[0].text).toContain('Error retrieving entity history: Database error');
    });

    test('should call getRelationHistory and return formatted results', async () => {
      // Arrange
      const request = {
        params: {
          name: 'get_relation_history',
          arguments: {
            from: 'Entity1',
            to: 'Entity2',
            relationType: 'KNOWS',
          },
        },
      };

      const history = [{ version: 1, from: 'Entity1', to: 'Entity2', relationType: 'KNOWS' }];
      (mockKnowledgeGraphManager as Record<string, ReturnType<typeof vi.fn>>).getRelationHistory =
        vi.fn().mockResolvedValue(history);

      // Act
      const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);

      // Assert
      expect(
        (mockKnowledgeGraphManager as Record<string, ReturnType<typeof vi.fn>>).getRelationHistory
      ).toHaveBeenCalledWith('Entity1', 'Entity2', 'KNOWS');
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify(history, null, 2),
          },
        ],
      });
    });

    test('should handle errors gracefully for get_relation_history', async () => {
      // Arrange
      const request = {
        params: {
          name: 'get_relation_history',
          arguments: {
            from: 'Entity1',
            to: 'Entity2',
            relationType: 'KNOWS',
          },
        },
      };

      (mockKnowledgeGraphManager as Record<string, ReturnType<typeof vi.fn>>).getRelationHistory =
        vi.fn().mockRejectedValue(new Error('Database error'));

      // Act
      const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);

      // Assert
      expect(result.content[0].text).toContain('Error retrieving relation history: Database error');
    });

    test('should call getGraphAtTime and return formatted results', async () => {
      // Arrange
      const request = {
        params: {
          name: 'get_graph_at_time',
          arguments: {
            timestamp: 1700000000000,
          },
        },
      };

      const graph = { entities: [{ name: 'Entity1' }], relations: [] };
      (mockKnowledgeGraphManager as Record<string, ReturnType<typeof vi.fn>>).getGraphAtTime = vi
        .fn()
        .mockResolvedValue(graph);

      // Act
      const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);

      // Assert
      expect(
        (mockKnowledgeGraphManager as Record<string, ReturnType<typeof vi.fn>>).getGraphAtTime
      ).toHaveBeenCalledWith(1700000000000);
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify(graph, null, 2),
          },
        ],
      });
    });

    test('should handle errors gracefully for get_graph_at_time', async () => {
      // Arrange
      const request = {
        params: {
          name: 'get_graph_at_time',
          arguments: {
            timestamp: 1700000000000,
          },
        },
      };

      (mockKnowledgeGraphManager as Record<string, ReturnType<typeof vi.fn>>).getGraphAtTime = vi
        .fn()
        .mockRejectedValue(new Error('Database error'));

      // Act
      const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);

      // Assert
      expect(result.content[0].text).toContain('Error retrieving graph at time: Database error');
    });

    test('should call getDecayedGraph without options', async () => {
      // Arrange
      const request = {
        params: {
          name: 'get_decayed_graph',
          arguments: {},
        },
      };

      const graph = { entities: [], relations: [] };
      (mockKnowledgeGraphManager as Record<string, ReturnType<typeof vi.fn>>).getDecayedGraph = vi
        .fn()
        .mockResolvedValue(graph);

      // Act
      const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);

      // Assert
      expect(
        (mockKnowledgeGraphManager as Record<string, ReturnType<typeof vi.fn>>).getDecayedGraph
      ).toHaveBeenCalledWith();
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify(graph, null, 2),
          },
        ],
      });
    });

    test('should call getDecayedGraph with reference_time option', async () => {
      // Arrange
      const request = {
        params: {
          name: 'get_decayed_graph',
          arguments: {
            reference_time: 1700000000000,
          },
        },
      };

      const graph = { entities: [], relations: [] };
      (mockKnowledgeGraphManager as Record<string, ReturnType<typeof vi.fn>>).getDecayedGraph = vi
        .fn()
        .mockResolvedValue(graph);

      // Act
      const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);

      // Assert
      expect(
        (mockKnowledgeGraphManager as Record<string, ReturnType<typeof vi.fn>>).getDecayedGraph
      ).toHaveBeenCalledWith({ referenceTime: 1700000000000 });
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify(graph, null, 2),
          },
        ],
      });
    });

    test('should call getDecayedGraph with decay_factor option', async () => {
      // Arrange
      const request = {
        params: {
          name: 'get_decayed_graph',
          arguments: {
            decay_factor: 0.5,
          },
        },
      };

      const graph = { entities: [], relations: [] };
      (mockKnowledgeGraphManager as Record<string, ReturnType<typeof vi.fn>>).getDecayedGraph = vi
        .fn()
        .mockResolvedValue(graph);

      // Act
      const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);

      // Assert
      expect(
        (mockKnowledgeGraphManager as Record<string, ReturnType<typeof vi.fn>>).getDecayedGraph
      ).toHaveBeenCalledWith({ decayFactor: 0.5 });
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify(graph, null, 2),
          },
        ],
      });
    });

    test('should call getDecayedGraph with both options', async () => {
      // Arrange
      const request = {
        params: {
          name: 'get_decayed_graph',
          arguments: {
            reference_time: 1700000000000,
            decay_factor: 0.5,
          },
        },
      };

      const graph = { entities: [], relations: [] };
      (mockKnowledgeGraphManager as Record<string, ReturnType<typeof vi.fn>>).getDecayedGraph = vi
        .fn()
        .mockResolvedValue(graph);

      // Act
      const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);

      // Assert
      expect(
        (mockKnowledgeGraphManager as Record<string, ReturnType<typeof vi.fn>>).getDecayedGraph
      ).toHaveBeenCalledWith({ referenceTime: 1700000000000, decayFactor: 0.5 });
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify(graph, null, 2),
          },
        ],
      });
    });

    test('should handle errors gracefully for get_decayed_graph', async () => {
      // Arrange
      const request = {
        params: {
          name: 'get_decayed_graph',
          arguments: {},
        },
      };

      (mockKnowledgeGraphManager as Record<string, ReturnType<typeof vi.fn>>).getDecayedGraph = vi
        .fn()
        .mockRejectedValue(new Error('Database error'));

      // Act
      const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);

      // Assert
      expect(result.content[0].text).toContain('Error retrieving decayed graph: Database error');
    });
  });

  describe('validation edge cases', () => {
    test('should throw error when request is null', async () => {
      await expect(handleCallToolRequest(null as never, mockKnowledgeGraphManager)).rejects.toThrow(
        'Invalid request: request is null or undefined'
      );
    });

    test('should throw error when params is missing', async () => {
      await expect(handleCallToolRequest({}, mockKnowledgeGraphManager)).rejects.toThrow(
        'Invalid request: missing params'
      );
    });

    test('should throw error when tool name is missing', async () => {
      await expect(
        handleCallToolRequest({ params: { arguments: {} } }, mockKnowledgeGraphManager)
      ).rejects.toThrow('Invalid request: missing tool name');
    });
  });
});
