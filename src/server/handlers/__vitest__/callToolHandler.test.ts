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
      getRelation: vi.fn().mockResolvedValue({ from: 'Entity1', to: 'Entity2', relationType: 'KNOWS' }),
      updateRelation: vi.fn().mockResolvedValue(undefined),
      searchNodes: vi.fn().mockResolvedValue([]),
      openNodes: vi.fn().mockResolvedValue([])
    };
  });
  
  test('should throw an error if no arguments are provided', async () => {
    // Arrange
    const request = {
      params: {
        name: 'read_graph',
        arguments: undefined
      }
    };
    
    // Act & Assert
    await expect(
      handleCallToolRequest(request, mockKnowledgeGraphManager)
    ).rejects.toThrow('No arguments provided for tool: read_graph');
  });
  
  test('should throw an error for unknown tool', async () => {
    // Arrange
    const request = {
      params: {
        name: 'unknown_tool',
        arguments: {}
      }
    };
    
    // Act & Assert
    await expect(
      handleCallToolRequest(request, mockKnowledgeGraphManager)
    ).rejects.toThrow('Unknown tool: unknown_tool');
  });
  
  test('should call readGraph and return formatted results for read_graph tool', async () => {
    // Arrange
    const request = {
      params: {
        name: 'read_graph',
        arguments: {}
      }
    };
    
    const graphData = { entities: [{ name: 'Entity1' }], relations: [] };
    mockKnowledgeGraphManager.readGraph.mockResolvedValue(graphData);
    
    // Act
    const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);
    
    // Assert
    expect(mockKnowledgeGraphManager.readGraph).toHaveBeenCalled();
    expect(result).toEqual({
      content: [{ 
        type: 'text', 
        text: JSON.stringify(graphData, null, 2)
      }]
    });
  });
  
  test('should call deleteEntities and return success message for delete_entities tool', async () => {
    // Arrange
    const entityNames = ['Entity1', 'Entity2'];
    const request = {
      params: {
        name: 'delete_entities',
        arguments: {
          entityNames
        }
      }
    };
    
    // Act
    const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);
    
    // Assert
    expect(mockKnowledgeGraphManager.deleteEntities).toHaveBeenCalledWith(entityNames);
    expect(result).toEqual({
      content: [{ 
        type: 'text', 
        text: 'Entities deleted successfully'
      }]
    });
  });
  
  test('should call createRelations and return formatted results for create_relations tool', async () => {
    // Arrange
    const relations = [
      { from: 'Entity1', to: 'Entity2', relationType: 'KNOWS' }
    ];
    const request = {
      params: {
        name: 'create_relations',
        arguments: {
          relations
        }
      }
    };
    
    const createResult = { success: true, count: 1 };
    mockKnowledgeGraphManager.createRelations.mockResolvedValue(createResult);
    
    // Act
    const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);
    
    // Assert
    expect(mockKnowledgeGraphManager.createRelations).toHaveBeenCalledWith(relations);
    expect(result).toEqual({
      content: [{ 
        type: 'text', 
        text: JSON.stringify(createResult, null, 2)
      }]
    });
  });
  
  test('should call addObservations and return formatted results for add_observations tool', async () => {
    // Arrange
    const observations = [
      { entityName: 'Entity1', contents: ['New observation'] }
    ];
    const request = {
      params: {
        name: 'add_observations',
        arguments: {
          observations
        }
      }
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
        metadata: { source: "API call" }
      }
    ]);
    
    // Verify content type is correct
    expect(result.content[0].type).toEqual('text');
    
    // Parse the JSON response
    const responseObj = JSON.parse(result.content[0].text);
    
    // Verify response contains correct result data
    expect(responseObj.result).toEqual(addResult);
    
    // Verify debug information is present
    expect(responseObj.debug).toBeDefined();
    expect(responseObj.debug.timestamp).toBeDefined();
    expect(responseObj.debug.input_args).toBeDefined();
    expect(responseObj.debug.processed_observations).toBeInstanceOf(Array);
    expect(responseObj.debug.tool_version).toBeDefined();
  });
  
  test('should call deleteObservations and return success message for delete_observations tool', async () => {
    // Arrange
    const deletions = [
      { entityName: 'Entity1', observations: ['Observation to delete'] }
    ];
    const request = {
      params: {
        name: 'delete_observations',
        arguments: {
          deletions
        }
      }
    };
    
    // Act
    const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);
    
    // Assert
    expect(mockKnowledgeGraphManager.deleteObservations).toHaveBeenCalledWith(deletions);
    expect(result).toEqual({
      content: [{ 
        type: 'text', 
        text: 'Observations deleted successfully'
      }]
    });
  });
  
  test('should call deleteRelations and return success message for delete_relations tool', async () => {
    // Arrange
    const relations = [
      { from: 'Entity1', to: 'Entity2', relationType: 'KNOWS' }
    ];
    const request = {
      params: {
        name: 'delete_relations',
        arguments: {
          relations
        }
      }
    };
    
    // Act
    const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);
    
    // Assert
    expect(mockKnowledgeGraphManager.deleteRelations).toHaveBeenCalledWith(relations);
    expect(result).toEqual({
      content: [{ 
        type: 'text', 
        text: 'Relations deleted successfully'
      }]
    });
  });
  
  test('should call getRelation and return formatted result for get_relation tool', async () => {
    // Arrange
    const relationArgs = {
      from: 'Entity1',
      to: 'Entity2',
      relationType: 'KNOWS'
    };
    const request = {
      params: {
        name: 'get_relation',
        arguments: relationArgs
      }
    };
    
    const relation = {
      from: 'Entity1',
      to: 'Entity2',
      relationType: 'KNOWS',
      strength: 0.8
    };
    mockKnowledgeGraphManager.getRelation.mockResolvedValue(relation);
    
    // Act
    const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);
    
    // Assert
    expect(mockKnowledgeGraphManager.getRelation).toHaveBeenCalledWith(
      relationArgs.from, relationArgs.to, relationArgs.relationType
    );
    expect(result).toEqual({
      content: [{ 
        type: 'text', 
        text: JSON.stringify(relation, null, 2)
      }]
    });
  });
  
  test('should handle case when relation is not found for get_relation tool', async () => {
    // Arrange
    const relationArgs = {
      from: 'Entity1',
      to: 'Entity2',
      relationType: 'KNOWS'
    };
    const request = {
      params: {
        name: 'get_relation',
        arguments: relationArgs
      }
    };
    
    // Mock relation not found
    mockKnowledgeGraphManager.getRelation.mockResolvedValue(null);
    
    // Act
    const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);
    
    // Assert
    expect(mockKnowledgeGraphManager.getRelation).toHaveBeenCalledWith(
      relationArgs.from, relationArgs.to, relationArgs.relationType
    );
    expect(result).toEqual({
      content: [{ 
        type: 'text', 
        text: `Relation not found: ${relationArgs.from} -> ${relationArgs.relationType} -> ${relationArgs.to}`
      }]
    });
  });
  
  test('should call updateRelation and return success message for update_relation tool', async () => {
    // Arrange
    const relation = {
      from: 'Entity1',
      to: 'Entity2',
      relationType: 'KNOWS',
      strength: 0.9
    };
    const request = {
      params: {
        name: 'update_relation',
        arguments: {
          relation
        }
      }
    };
    
    // Act
    const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);
    
    // Assert
    expect(mockKnowledgeGraphManager.updateRelation).toHaveBeenCalledWith(relation);
    expect(result).toEqual({
      content: [{ 
        type: 'text', 
        text: 'Relation updated successfully'
      }]
    });
  });
  
  test('should call searchNodes and return formatted results for search_nodes tool', async () => {
    // Arrange
    const query = 'test query';
    const request = {
      params: {
        name: 'search_nodes',
        arguments: {
          query
        }
      }
    };
    
    const searchResults = [{ name: 'Entity1', relevance: 0.9 }];
    mockKnowledgeGraphManager.searchNodes.mockResolvedValue(searchResults);
    
    // Act
    const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);
    
    // Assert
    expect(mockKnowledgeGraphManager.searchNodes).toHaveBeenCalledWith(query);
    expect(result).toEqual({
      content: [{ 
        type: 'text', 
        text: JSON.stringify(searchResults, null, 2)
      }]
    });
  });
  
  test('should call openNodes and return formatted results for open_nodes tool', async () => {
    // Arrange
    const names = ['Entity1', 'Entity2'];
    const request = {
      params: {
        name: 'open_nodes',
        arguments: {
          names
        }
      }
    };
    
    const openResults = [
      { name: 'Entity1', observations: ['Observation 1'] }
    ];
    mockKnowledgeGraphManager.openNodes.mockResolvedValue(openResults);
    
    // Act
    const result = await handleCallToolRequest(request, mockKnowledgeGraphManager);
    
    // Assert
    expect(mockKnowledgeGraphManager.openNodes).toHaveBeenCalledWith(names);
    expect(result).toEqual({
      content: [{ 
        type: 'text', 
        text: JSON.stringify(openResults, null, 2)
      }]
    });
  });
}); 