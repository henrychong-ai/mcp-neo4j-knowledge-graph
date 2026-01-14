import { describe, it, expect, vi } from 'vitest';
import { handleAddObservationsBatch } from '../addObservationsBatch.js';

describe('handleAddObservationsBatch', () => {
  it('should call addObservationsBatch with the correct arguments', async () => {
    // Arrange
    const mockResult = {
      successful: [
        { entityName: 'Entity1', addedObservations: ['New observation 1'] },
        { entityName: 'Entity2', addedObservations: ['New observation 2', 'New observation 3'] },
      ],
      failed: [],
      totalTimeMs: 120,
      avgTimePerItemMs: 60,
    };
    const mockAddObservationsBatch = vi.fn().mockResolvedValue(mockResult);

    const mockKnowledgeGraphManager = {
      addObservationsBatch: mockAddObservationsBatch,
    };

    const args = {
      observations: [
        { entityName: 'Entity1', contents: ['New observation 1'] },
        { entityName: 'Entity2', contents: ['New observation 2', 'New observation 3'] },
      ],
      config: { maxBatchSize: 100 },
    };

    // Act
    const result = await handleAddObservationsBatch(args, mockKnowledgeGraphManager);

    // Assert
    expect(mockAddObservationsBatch).toHaveBeenCalledWith(args.observations, args.config);
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
  });

  it('should handle batch without config parameter', async () => {
    // Arrange
    const mockResult = {
      successful: [{ entityName: 'TestEntity', addedObservations: ['Test observation'] }],
      failed: [],
      totalTimeMs: 25,
      avgTimePerItemMs: 25,
    };
    const mockAddObservationsBatch = vi.fn().mockResolvedValue(mockResult);

    const mockKnowledgeGraphManager = {
      addObservationsBatch: mockAddObservationsBatch,
    };

    const args = {
      observations: [{ entityName: 'TestEntity', contents: ['Test observation'] }],
    };

    // Act
    const result = await handleAddObservationsBatch(args, mockKnowledgeGraphManager);

    // Assert
    expect(mockAddObservationsBatch).toHaveBeenCalledWith(args.observations, undefined);
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
  });
});
