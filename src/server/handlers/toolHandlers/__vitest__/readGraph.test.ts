import { describe, it, expect, vi } from 'vitest';
import { handleReadGraph } from '../readGraph.js';

describe('handleReadGraph', () => {
  it('should call readGraph and return the formatted result', async () => {
    // Arrange
    const mockGraph = {
      entities: [
        { id: '1', name: 'Entity1', type: 'Person' },
        { id: '2', name: 'Entity2', type: 'Thing' },
      ],
      relations: [{ id: '1', from: 'Entity1', to: 'Entity2', type: 'KNOWS' }],
    };

    const mockReadGraph = vi.fn().mockResolvedValue(mockGraph);

    const mockKnowledgeGraphManager = {
      readGraph: mockReadGraph,
    };

    // Act
    const result = await handleReadGraph({}, mockKnowledgeGraphManager);

    // Assert
    expect(mockReadGraph).toHaveBeenCalled();
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual(mockGraph);
  });
});
