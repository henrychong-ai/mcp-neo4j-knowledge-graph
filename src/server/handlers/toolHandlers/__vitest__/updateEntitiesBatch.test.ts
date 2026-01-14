import { describe, it, expect, vi } from 'vitest';
import { handleUpdateEntitiesBatch } from '../updateEntitiesBatch.js';

describe('handleUpdateEntitiesBatch', () => {
  it('should call updateEntitiesBatch with the correct arguments', async () => {
    // Arrange
    const mockResult = {
      successful: [
        { name: 'Entity1', addedObservations: ['New observation'] },
        { name: 'Entity2', removedObservations: ['Old observation'] },
      ],
      failed: [],
      totalTimeMs: 150,
      avgTimePerItemMs: 75,
    };
    const mockUpdateEntitiesBatch = vi.fn().mockResolvedValue(mockResult);

    const mockKnowledgeGraphManager = {
      updateEntitiesBatch: mockUpdateEntitiesBatch,
    };

    const args = {
      updates: [
        { name: 'Entity1', addObservations: ['New observation'] },
        { name: 'Entity2', removeObservations: ['Old observation'] },
      ],
      config: { enableParallel: true },
    };

    // Act
    const result = await handleUpdateEntitiesBatch(args, mockKnowledgeGraphManager);

    // Assert
    expect(mockUpdateEntitiesBatch).toHaveBeenCalledWith(args.updates, args.config);
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
  });

  it('should handle batch without config parameter', async () => {
    // Arrange
    const mockResult = {
      successful: [{ name: 'TestEntity', entityType: 'updated-type' }],
      failed: [],
      totalTimeMs: 40,
      avgTimePerItemMs: 40,
    };
    const mockUpdateEntitiesBatch = vi.fn().mockResolvedValue(mockResult);

    const mockKnowledgeGraphManager = {
      updateEntitiesBatch: mockUpdateEntitiesBatch,
    };

    const args = {
      updates: [{ name: 'TestEntity', entityType: 'updated-type' }],
    };

    // Act
    const result = await handleUpdateEntitiesBatch(args, mockKnowledgeGraphManager);

    // Assert
    expect(mockUpdateEntitiesBatch).toHaveBeenCalledWith(args.updates, undefined);
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
  });
});
