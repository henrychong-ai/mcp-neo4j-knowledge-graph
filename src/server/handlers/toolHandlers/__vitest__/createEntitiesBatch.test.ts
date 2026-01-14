import { describe, it, expect, vi } from 'vitest';
import { handleCreateEntitiesBatch } from '../createEntitiesBatch.js';

describe('handleCreateEntitiesBatch', () => {
  it('should call createEntitiesBatch with the correct arguments', async () => {
    // Arrange
    const mockResult = {
      successful: [{ name: 'Entity1' }, { name: 'Entity2' }],
      failed: [],
      totalTimeMs: 100,
      avgTimePerItemMs: 50,
    };
    const mockCreateEntitiesBatch = vi.fn().mockResolvedValue(mockResult);

    const mockKnowledgeGraphManager = {
      createEntitiesBatch: mockCreateEntitiesBatch,
    };

    const args = {
      entities: [
        { name: 'Entity1', entityType: 'Person', observations: ['Observation 1'] },
        { name: 'Entity2', entityType: 'Thing', observations: ['Observation 2'] },
      ],
      config: { maxBatchSize: 50 },
    };

    // Act
    const result = await handleCreateEntitiesBatch(args, mockKnowledgeGraphManager);

    // Assert
    expect(mockCreateEntitiesBatch).toHaveBeenCalledWith(args.entities, args.config);
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
  });

  it('should handle batch without config parameter', async () => {
    // Arrange
    const mockResult = {
      successful: [{ name: 'Entity1' }],
      failed: [],
      totalTimeMs: 50,
      avgTimePerItemMs: 50,
    };
    const mockCreateEntitiesBatch = vi.fn().mockResolvedValue(mockResult);

    const mockKnowledgeGraphManager = {
      createEntitiesBatch: mockCreateEntitiesBatch,
    };

    const args = {
      entities: [{ name: 'Entity1', entityType: 'Person', observations: ['Test'] }],
    };

    // Act
    const result = await handleCreateEntitiesBatch(args, mockKnowledgeGraphManager);

    // Assert
    expect(mockCreateEntitiesBatch).toHaveBeenCalledWith(args.entities, undefined);
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
  });
});
