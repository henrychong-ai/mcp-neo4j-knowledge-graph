import { describe, it, expect, vi } from 'vitest';
import { handleCreateRelationsBatch } from '../createRelationsBatch.js';

describe('handleCreateRelationsBatch', () => {
  it('should call createRelationsBatch with the correct arguments', async () => {
    // Arrange
    const mockResult = {
      successful: [
        { from: 'Entity1', to: 'Entity2', relationType: 'KNOWS' },
        { from: 'Entity2', to: 'Entity3', relationType: 'WORKS_WITH' },
      ],
      failed: [],
      totalTimeMs: 80,
      avgTimePerItemMs: 40,
    };
    const mockCreateRelationsBatch = vi.fn().mockResolvedValue(mockResult);

    const mockKnowledgeGraphManager = {
      createRelationsBatch: mockCreateRelationsBatch,
    };

    const args = {
      relations: [
        { from: 'Entity1', to: 'Entity2', relationType: 'KNOWS' },
        { from: 'Entity2', to: 'Entity3', relationType: 'WORKS_WITH' },
      ],
      config: { enableParallel: true },
    };

    // Act
    const result = await handleCreateRelationsBatch(args, mockKnowledgeGraphManager);

    // Assert
    expect(mockCreateRelationsBatch).toHaveBeenCalledWith(args.relations, args.config);
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
  });

  it('should handle batch without config parameter', async () => {
    // Arrange
    const mockResult = {
      successful: [{ from: 'A', to: 'B', relationType: 'RELATED' }],
      failed: [],
      totalTimeMs: 30,
      avgTimePerItemMs: 30,
    };
    const mockCreateRelationsBatch = vi.fn().mockResolvedValue(mockResult);

    const mockKnowledgeGraphManager = {
      createRelationsBatch: mockCreateRelationsBatch,
    };

    const args = {
      relations: [{ from: 'A', to: 'B', relationType: 'RELATED' }],
    };

    // Act
    const result = await handleCreateRelationsBatch(args, mockKnowledgeGraphManager);

    // Assert
    expect(mockCreateRelationsBatch).toHaveBeenCalledWith(args.relations, undefined);
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
  });
});
