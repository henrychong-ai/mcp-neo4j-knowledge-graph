import { describe, test, expect, vi } from 'vitest';
import { handleAddObservations } from '../addObservations.js';

describe('handleAddObservations', () => {
  test('should add observations and return results', async () => {
    // Arrange
    const args = {
      observations: [
        { entityName: 'Entity1', contents: ['New observation'] }
      ]
    };
    
    const mockResult = { success: true };
    const mockKnowledgeGraphManager = {
      addObservations: vi.fn().mockResolvedValue(mockResult)
    };
    
    // Act
    const response = await handleAddObservations(args, mockKnowledgeGraphManager);
    
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
    expect(response.content[0].type).toEqual('text');
    
    // Parse the JSON response
    const responseObj = JSON.parse(response.content[0].text);
    
    // Verify response contains correct result data
    expect(responseObj.result).toEqual(mockResult);
    
    // Verify debug information is present
    expect(responseObj.debug).toBeDefined();
    expect(responseObj.debug.timestamp).toBeDefined();
    expect(responseObj.debug.input_args).toBeDefined();
    expect(responseObj.debug.processed_observations).toBeInstanceOf(Array);
    expect(responseObj.debug.tool_version).toBeDefined();
  });
}); 