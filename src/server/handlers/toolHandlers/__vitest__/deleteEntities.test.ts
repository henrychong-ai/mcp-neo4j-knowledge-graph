import { describe, test, expect, vi } from 'vitest';
import { handleDeleteEntities } from '../deleteEntities.js';

describe('handleDeleteEntities', () => {
  test('should delete entities and return success message', async () => {
    // Arrange
    const args = {
      entityNames: ['Entity1', 'Entity2'],
    };

    const mockKnowledgeGraphManager = {
      deleteEntities: vi.fn().mockResolvedValue(undefined),
    };

    // Act
    const response = await handleDeleteEntities(args, mockKnowledgeGraphManager);

    // Assert
    expect(mockKnowledgeGraphManager.deleteEntities).toHaveBeenCalledWith(args.entityNames);
    expect(response).toEqual({
      content: [
        {
          type: 'text',
          text: 'Entities deleted successfully',
        },
      ],
    });
  });
});
