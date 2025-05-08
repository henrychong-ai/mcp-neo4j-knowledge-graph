import { describe, test, expect, vi } from 'vitest';
import { handleCreateRelations } from '../createRelations.js';

describe('handleCreateRelations', () => {
  test('should create relations and return results', async () => {
    // Arrange
    const args = {
      relations: [{ from: 'Entity1', to: 'Entity2', relationType: 'KNOWS' }],
    };

    const mockResult = { success: true };
    const mockKnowledgeGraphManager = {
      createRelations: vi.fn().mockResolvedValue(mockResult),
    };

    // Act
    const response = await handleCreateRelations(args, mockKnowledgeGraphManager);

    // Assert
    expect(mockKnowledgeGraphManager.createRelations).toHaveBeenCalledWith(args.relations);
    expect(response).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify(mockResult, null, 2),
        },
      ],
    });
  });
});
