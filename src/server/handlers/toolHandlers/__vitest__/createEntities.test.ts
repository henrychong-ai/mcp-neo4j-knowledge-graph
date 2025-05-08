import { describe, it, expect, vi } from 'vitest';
import { handleCreateEntities } from '../createEntities.js';

describe('handleCreateEntities', () => {
  it('should call createEntities with the correct arguments', async () => {
    // Arrange
    const mockCreateEntities = vi.fn().mockResolvedValue([
      { id: '1', name: 'Entity1' },
      { id: '2', name: 'Entity2' },
    ]);

    const mockKnowledgeGraphManager = {
      createEntities: mockCreateEntities,
    };

    const args = {
      entities: [
        { name: 'Entity1', entityType: 'Person', observations: ['Observation 1'] },
        { name: 'Entity2', entityType: 'Thing', observations: ['Observation 2'] },
      ],
    };

    // Act
    const result = await handleCreateEntities(args, mockKnowledgeGraphManager);

    // Assert
    expect(mockCreateEntities).toHaveBeenCalledWith(args.entities);
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual([
      { id: '1', name: 'Entity1' },
      { id: '2', name: 'Entity2' },
    ]);
  });
});
