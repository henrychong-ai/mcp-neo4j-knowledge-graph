import { describe, test, expect, vi } from 'vitest';
import { handleAddObservations } from '../addObservations.js';

describe('handleAddObservations', () => {
  test('should add observations and return results', async () => {
    // Arrange
    const args = {
      observations: [{ entityName: 'Entity1', contents: ['New observation'] }],
    };

    const mockResult = { success: true };
    const mockKnowledgeGraphManager = {
      addObservations: vi.fn().mockResolvedValue(mockResult),
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
        metadata: { source: 'API call' },
      },
    ]);

    // Verify content type is correct
    expect(response.content[0].type).toEqual('text');

    // Parse the JSON response
    const responseObj = JSON.parse(response.content[0].text);

    // Verify response contains correct result data
    expect(responseObj.success).toBe(true);
    expect(responseObj.count).toBe(1);
    expect(responseObj.result).toEqual(mockResult);
  });

  test('should throw error for invalid observations', async () => {
    // Arrange
    const args = {
      observations: 'not-an-array',
    };

    const mockKnowledgeGraphManager = {
      addObservations: vi.fn(),
    };

    // Act
    const response = await handleAddObservations(args, mockKnowledgeGraphManager);

    // Assert - should return error response
    const responseObj = JSON.parse(response.content[0].text);
    expect(responseObj.error).toBeDefined();
    expect(responseObj.error).toContain('must be an array');
  });
});
