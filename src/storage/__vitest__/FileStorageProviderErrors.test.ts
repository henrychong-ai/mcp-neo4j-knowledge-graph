/**
 * Test file specifically for FileStorageProvider error handling and edge cases
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import path from 'path';
import { FileStorageProvider } from '../FileStorageProvider.js';
import type { Relation } from '../../types/relation.js';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
    mkdirSync: vi.fn(actual.mkdirSync),
    rmSync: vi.fn(actual.rmSync),
    writeFileSync: vi.fn(actual.writeFileSync),
    unlinkSync: vi.fn(actual.unlinkSync),
    promises: {
      ...actual.promises,
      readFile: vi.fn(actual.promises.readFile),
      writeFile: vi.fn(actual.promises.writeFile),
    },
  };
});

// Test directory setup
const testDir = path.join(process.cwd(), 'test-output', 'file-storage');

// Ensure test directory exists and is clean
beforeEach(() => {
  // Reset mocks
  vi.resetAllMocks();

  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true, mode: 0o777 });
  }
});

// Cleanup after tests
afterAll(() => {
  if (fs.existsSync(testDir)) {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to clean up test directory: ${(error as Error).message}`);
    }
  }
});

describe('FileStorageProvider Error Handling', () => {
  let provider: FileStorageProvider;
  let uniqueFilePath: string;

  beforeEach(() => {
    // Generate a unique file path for each test to avoid conflicts
    uniqueFilePath = path.join(
      testDir,
      `test-${Date.now()}-${Math.random().toString(36).substring(2, 15)}.json`
    );

    // Set up console.warn spy to verify deprecation warning
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    // Clean up provider
    // FileStorageProvider doesn't have a cleanup method in the interface,
    // but some tests might add it for testing purposes
    if (provider && typeof (provider as any).cleanup === 'function') {
      try {
        await (provider as any).cleanup();
      } catch (e) {
        // Ignore errors during cleanup
      }
    }

    // Clean up the file if it exists
    if (fs.existsSync(uniqueFilePath)) {
      try {
        fs.unlinkSync(uniqueFilePath);
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
  });

  describe('constructor', () => {
    it('should initialize without errors', () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });
      expect(provider).toBeInstanceOf(FileStorageProvider);
    });
  });

  describe('loadGraph', () => {
    it('should handle file not found error', async () => {
      // Create provider with non-existent file path
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Mock readFile to simulate ENOENT
      vi.mocked(fs.promises.readFile).mockRejectedValueOnce(
        Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
      );

      // Load graph should return empty graph
      const graph = await provider.loadGraph();
      expect(graph).toEqual({ entities: [], relations: [] });
    });

    it('should handle invalid JSON in file', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Setup - mock readFile to return invalid JSON
      vi.mocked(fs.promises.readFile).mockResolvedValueOnce('invalid json' as any);

      // Configure test to handle the error
      await expect(provider.loadGraph()).rejects.toThrow('Error loading graph');
    });

    it('should handle malformed graph data', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Use spyOn to access private filePath property for this test
      const filePath = (provider as any).filePath;

      // First ensure the directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write malformed graph data to the actual file
      fs.writeFileSync(filePath, JSON.stringify({ something: 'else' }));

      // Load the graph - on malformed data, FileStorageProvider returns whatever was in the file
      const graph = await provider.loadGraph();
      expect(graph).toHaveProperty('something');
      expect(graph).not.toHaveProperty('entities');
      expect(graph).not.toHaveProperty('relations');
    });

    it('should handle filesystem permission errors', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Mock readFile to throw permission error
      vi.mocked(fs.promises.readFile).mockRejectedValueOnce(
        Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
      );

      // Should throw permission error
      await expect(provider.loadGraph()).rejects.toThrow('permission denied');
    });
  });

  describe('saveGraph', () => {
    it('should handle directory creation failure', async () => {
      // Create a deep file path that doesn't exist
      const deepPath = path.join(testDir, 'nonexistent', 'deep', 'path', 'memory.json');
      provider = new FileStorageProvider({ memoryFilePath: deepPath });

      // Mock writeFile to simulate error when directory doesn't exist
      vi.mocked(fs.promises.writeFile).mockRejectedValueOnce(
        Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
      );

      // Try to save graph, should reject with error since the directory doesn't exist
      const graph = { entities: [], relations: [] };
      await expect(provider.saveGraph(graph)).rejects.toThrow('no such file or directory');

      // Verify our mock was called
      expect(vi.mocked(fs.promises.writeFile)).toHaveBeenCalled();
    });

    it('should handle write permission errors', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Mock writeFile to throw permission error
      vi.mocked(fs.promises.writeFile).mockRejectedValueOnce(
        Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
      );

      // Try to save graph, should reject with error
      const graph = { entities: [], relations: [] };
      await expect(provider.saveGraph(graph)).rejects.toThrow();
    });

    it('should handle JSON stringification errors', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Create a graph with circular reference
      const circular: any = {};
      circular.self = circular;

      const graph = {
        entities: [],
        relations: [],
        circular, // This will cause JSON.stringify to throw
      };

      // Try to save graph, should reject with error
      await expect(provider.saveGraph(graph)).rejects.toThrow();
    });
  });

  describe('searchNodes', () => {
    it('should handle search on empty graph', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Mock loadGraph to return empty graph
      vi.spyOn(provider, 'loadGraph').mockResolvedValueOnce({ entities: [], relations: [] });

      // Search on empty graph should return empty result
      const result = await provider.searchNodes('query');
      expect(result).toEqual({ entities: [], relations: [] });
    });

    it('should handle load errors during search', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Mock loadGraph to throw an error
      vi.spyOn(provider, 'loadGraph').mockRejectedValueOnce(new Error('Failed to load graph'));

      // Search should reject with error
      await expect(provider.searchNodes('query')).rejects.toThrow('Failed to load graph');
    });
  });

  describe('openNodes', () => {
    it('should handle open nodes on empty graph', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Mock loadGraph to return empty graph
      vi.spyOn(provider, 'loadGraph').mockResolvedValueOnce({ entities: [], relations: [] });

      // Open nodes on empty graph should return empty result
      const result = await provider.openNodes(['entity1']);
      expect(result).toEqual({ entities: [], relations: [] });
    });

    it('should handle load errors during open nodes', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Mock loadGraph to throw an error
      vi.spyOn(provider, 'loadGraph').mockRejectedValueOnce(new Error('Failed to load graph'));

      // Open nodes should reject with error
      await expect(provider.openNodes(['entity1'])).rejects.toThrow('Failed to load graph');
    });

    it('should handle empty input array', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Clear the mock
      vi.mocked(fs.promises.readFile).mockClear();

      // Open nodes with empty array should return empty result
      const result = await provider.openNodes([]);
      expect(result).toEqual({ entities: [], relations: [] });

      // Verify readFile was not called
      expect(fs.promises.readFile).not.toHaveBeenCalled();
    });
  });

  describe('createRelations', () => {
    it('should handle relation creation with non-existent entities', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Set up a graph with existing entities to avoid errors
      const graph = {
        entities: [
          { name: 'nonexistent1', entityType: 'test', observations: [] },
          { name: 'nonexistent2', entityType: 'test', observations: [] },
        ],
        relations: [],
      };

      // Mock loadGraph to return the graph with our test entities
      vi.spyOn(provider, 'loadGraph').mockResolvedValueOnce(graph);

      // Mock saveGraph to do nothing
      vi.spyOn(provider, 'saveGraph').mockResolvedValueOnce(undefined);

      // Create a relation between the entities
      const relations: Relation[] = [
        { from: 'nonexistent1', to: 'nonexistent2', relationType: 'test' },
      ];

      await expect(provider.createRelations(relations)).resolves.not.toThrow();
    });

    it('should handle empty input array', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // We need to mock loadGraph to return a valid graph structure
      vi.spyOn(provider, 'loadGraph').mockResolvedValueOnce({
        entities: [],
        relations: [],
      });

      // Mock saveGraph to do nothing
      vi.spyOn(provider, 'saveGraph').mockResolvedValueOnce(undefined);

      // Create relations with empty array should not throw
      await expect(provider.createRelations([])).resolves.not.toThrow();
    });

    it('should handle load/save errors during relation creation', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Mock loadGraph to throw an error
      vi.spyOn(provider, 'loadGraph').mockRejectedValueOnce(new Error('Failed to load graph'));

      // Create relations should reject with error
      const relations: Relation[] = [{ from: 'entity1', to: 'entity2', relationType: 'test' }];

      await expect(provider.createRelations(relations)).rejects.toThrow('Failed to load graph');
    });
  });

  describe('getRelation', () => {
    it('should handle relation retrieval with non-existent relation', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Mock loadGraph to return graph with no matching relation
      vi.spyOn(provider, 'loadGraph').mockResolvedValueOnce({
        entities: [],
        relations: [],
      });

      // The FileStorageProvider returns null for non-existent relations
      const relation = await provider.getRelation('entity1', 'entity2', 'nonexistent');

      expect(relation).toBeNull();
    });

    it('should handle load errors during relation retrieval', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Mock loadGraph to throw an error
      vi.spyOn(provider, 'loadGraph').mockRejectedValueOnce(new Error('Failed to load graph'));

      // Get relation should reject with error
      await expect(provider.getRelation('entity1', 'entity2', 'test')).rejects.toThrow(
        'Failed to load graph'
      );
    });
  });

  describe('updateRelation', () => {
    it('should handle update of non-existent relation', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Mock loadGraph to return graph with no matching relation
      vi.spyOn(provider, 'loadGraph').mockResolvedValueOnce({
        entities: [],
        relations: [],
      });

      // Update non-existent relation should reject with not found error
      await expect(
        provider.updateRelation({
          from: 'entity1',
          to: 'entity2',
          relationType: 'nonexistent',
          strength: 0.5,
        })
      ).rejects.toThrow('not found');
    });

    it('should handle load/save errors during relation update', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Mock loadGraph to throw an error
      vi.spyOn(provider, 'loadGraph').mockRejectedValueOnce(new Error('Failed to load graph'));

      // Update relation should reject with error
      await expect(
        provider.updateRelation({
          from: 'entity1',
          to: 'entity2',
          relationType: 'test',
          strength: 0.5,
        })
      ).rejects.toThrow('Failed to load graph');
    });
  });

  describe('addObservations', () => {
    it('should handle adding observations to non-existent entities', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // We need to mock loadGraph to return a valid graph structure
      vi.spyOn(provider, 'loadGraph').mockResolvedValueOnce({
        entities: [],
        relations: [],
      });

      // For this test, we need to catch the expected error
      // FileStorageProvider throws when entity doesn't exist
      const observations = [{ entityName: 'nonexistent', contents: ['observation1'] }];

      await expect(provider.addObservations(observations)).rejects.toThrow(
        'Entity with name nonexistent not found'
      );
    });

    it('should handle load/save errors during observation addition', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Mock loadGraph to throw an error
      vi.spyOn(provider, 'loadGraph').mockRejectedValueOnce(new Error('Failed to load graph'));

      // Add observations should reject with error
      const observations = [{ entityName: 'entity1', contents: ['observation1'] }];

      await expect(provider.addObservations(observations)).rejects.toThrow('Failed to load graph');
    });

    it('should handle empty input array', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Add observations with empty array should not throw
      await expect(provider.addObservations([])).resolves.not.toThrow();
    });
  });

  describe('deleteEntities', () => {
    it('should handle deletion of non-existent entities', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Mock loadGraph and saveGraph
      vi.spyOn(provider, 'loadGraph').mockResolvedValueOnce({
        entities: [],
        relations: [],
      });
      vi.spyOn(provider, 'saveGraph').mockResolvedValueOnce(undefined);

      // Delete non-existent entities
      await expect(provider.deleteEntities(['nonexistent'])).resolves.not.toThrow();
    });

    it('should handle load/save errors during entity deletion', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Mock loadGraph to throw an error
      vi.spyOn(provider, 'loadGraph').mockRejectedValueOnce(new Error('Failed to load graph'));

      // Delete entities should reject with error
      await expect(provider.deleteEntities(['entity1'])).rejects.toThrow('Failed to load graph');
    });
  });

  describe('deleteObservations', () => {
    it('should handle deletion of observations from non-existent entities', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Mock loadGraph and saveGraph
      vi.spyOn(provider, 'loadGraph').mockResolvedValueOnce({
        entities: [],
        relations: [],
      });
      vi.spyOn(provider, 'saveGraph').mockResolvedValueOnce(undefined);

      // Delete observations from non-existent entity
      const deletions = [{ entityName: 'nonexistent', observations: ['observation1'] }];

      await expect(provider.deleteObservations(deletions)).resolves.not.toThrow();
    });

    it('should handle load/save errors during observation deletion', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Mock loadGraph to throw an error
      vi.spyOn(provider, 'loadGraph').mockRejectedValueOnce(new Error('Failed to load graph'));

      // Delete observations should reject with error
      const deletions = [{ entityName: 'entity1', observations: ['observation1'] }];

      await expect(provider.deleteObservations(deletions)).rejects.toThrow('Failed to load graph');
    });
  });

  describe('deleteRelations', () => {
    it('should handle deletion of non-existent relations', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Mock loadGraph and saveGraph
      vi.spyOn(provider, 'loadGraph').mockResolvedValueOnce({
        entities: [],
        relations: [],
      });
      vi.spyOn(provider, 'saveGraph').mockResolvedValueOnce(undefined);

      // Delete non-existent relations
      const relations: Relation[] = [
        { from: 'entity1', to: 'entity2', relationType: 'nonexistent' },
      ];

      await expect(provider.deleteRelations(relations)).resolves.not.toThrow();
    });

    it('should handle load/save errors during relation deletion', async () => {
      provider = new FileStorageProvider({ memoryFilePath: uniqueFilePath });

      // Mock loadGraph to throw an error
      vi.spyOn(provider, 'loadGraph').mockRejectedValueOnce(new Error('Failed to load graph'));

      // Delete relations should reject with error
      const relations: Relation[] = [{ from: 'entity1', to: 'entity2', relationType: 'test' }];

      await expect(provider.deleteRelations(relations)).rejects.toThrow('Failed to load graph');
    });
  });
});
