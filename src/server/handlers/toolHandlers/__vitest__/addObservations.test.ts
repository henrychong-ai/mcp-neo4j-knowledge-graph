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
    
    expect(response).toEqual({
      content: [{ 
        type: 'text', 
        text: JSON.stringify(mockResult, null, 2) 
      }]
    });
  });
}); 