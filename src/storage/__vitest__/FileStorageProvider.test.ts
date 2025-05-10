/**
 * Test file for the FileStorageProvider implementation
 * Migrated from Jest to Vitest and converted to TypeScript
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import path from 'path';
import { StorageProvider } from '../StorageProvider.js';
import { FileStorageProvider } from '../FileStorageProvider.js';
import { KnowledgeGraph } from '../../KnowledgeGraphManager.js';
import { SearchOptions } from '../StorageProvider.js';

// Mock fs module
vi.mock('fs', () => {
  return {
    default: {
      existsSync: vi.fn(),
      mkdirSync: vi.fn(),
      rmSync: vi.fn(),
      promises: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
      },
    },
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
    },
  };
});

// Import fs after mocking
import * as fs from 'fs';

// Test directory setup
const testDir = path.join(process.cwd(), 'test-output', 'file-provider');
const testFilePath = path.join(testDir, 'test-memory.json');

// Ensure test directory exists and is clean
beforeEach(() => {
  // Reset mock implementations
  vi.mocked(fs.existsSync).mockReturnValue(false);
  vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any);
  vi.mocked(fs.promises.readFile).mockResolvedValue(
    JSON.stringify({ entities: [], relations: [] })
  );
  vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined as any);

  // Mock directory check and creation
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
});

afterAll(() => {
  // Clean up test directory after all tests
  vi.mocked(fs.existsSync).mockReturnValue(true);
  vi.mocked(fs.rmSync).mockReturnValue(undefined as any);

  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

// Helper to create provider
const createProvider = (filePath?: string): FileStorageProvider => {
  return new FileStorageProvider({ memoryFilePath: filePath || testFilePath });
};

describe('FileStorageProvider interface', () => {
  it('should exist and implement the StorageProvider interface', () => {
    const provider = createProvider();
    expect(provider).toBeDefined();
    expect(provider).toBeInstanceOf(FileStorageProvider);
    expect((StorageProvider as any).isStorageProvider(provider)).toBe(true);
  });
});

describe('FileStorageProvider implementation', () => {
  let provider: FileStorageProvider;

  beforeEach(() => {
    provider = createProvider();
  });

  it('should implement saveGraph method that accepts a KnowledgeGraph', async () => {
    const testGraph: KnowledgeGraph = {
      entities: [{ name: 'TestEntity', entityType: 'test', observations: [] }],
      relations: [],
    };

    vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(testGraph));

    await provider.saveGraph(testGraph);

    expect(fs.promises.writeFile).toHaveBeenCalledWith(
      testFilePath,
      JSON.stringify(testGraph, null, 2),
      'utf-8'
    );
  });

  it('should implement searchNodes method that accepts a query string', async () => {
    const testGraph: KnowledgeGraph = {
      entities: [{ name: 'Entity1', entityType: 'test', observations: ['test observation'] }],
      relations: [],
    };

    vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(testGraph));

    const result = await provider.searchNodes('test');

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].name).toBe('Entity1');
  });

  it('should implement openNodes method that accepts an array of node names', async () => {
    const testGraph: KnowledgeGraph = {
      entities: [
        { name: 'Entity1', entityType: 'test', observations: [] },
        { name: 'Entity2', entityType: 'test', observations: [] },
      ],
      relations: [],
    };

    vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(testGraph));

    const result = await provider.openNodes(['Entity1']);

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].name).toBe('Entity1');
  });

  it('should implement createRelations method', async () => {
    const testGraph: KnowledgeGraph = {
      entities: [
        { name: 'Entity1', entityType: 'test', observations: [] },
        { name: 'Entity2', entityType: 'test', observations: [] },
      ],
      relations: [],
    };

    vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(testGraph));

    const newRelations = [{ from: 'Entity1', to: 'Entity2', relationType: 'test' }];

    const result = await provider.createRelations(newRelations);

    expect(result).toEqual(newRelations);
    expect(fs.promises.writeFile).toHaveBeenCalledWith(
      testFilePath,
      JSON.stringify(
        {
          entities: testGraph.entities,
          relations: newRelations,
        },
        null,
        2
      ),
      'utf-8'
    );
  });

  it('should not duplicate existing relations when creating relations', async () => {
    const testGraph: KnowledgeGraph = {
      entities: [
        { name: 'Entity1', entityType: 'test', observations: [] },
        { name: 'Entity2', entityType: 'test', observations: [] },
      ],
      relations: [{ from: 'Entity1', to: 'Entity2', relationType: 'test' }],
    };

    vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(testGraph));

    const newRelations = [{ from: 'Entity1', to: 'Entity2', relationType: 'test' }];

    const result = await provider.createRelations(newRelations);

    expect(result).toEqual([]);
    expect(fs.promises.writeFile).toHaveBeenCalledWith(
      testFilePath,
      JSON.stringify(testGraph, null, 2),
      'utf-8'
    );
  });
});

describe('FileStorageProvider file I/O', () => {
  let provider: FileStorageProvider;

  beforeEach(() => {
    provider = createProvider();
  });

  it('should load a knowledge graph from a file', async () => {
    const testGraph: KnowledgeGraph = {
      entities: [{ name: 'Entity1', entityType: 'test', observations: [] }],
      relations: [],
    };

    vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(testGraph));

    const loadedGraph = await provider.loadGraph();

    // Verify the loaded graph matches our test data
    expect(loadedGraph).toEqual(testGraph);
    expect(fs.promises.readFile).toHaveBeenCalledWith(testFilePath, 'utf-8');
  });

  it('should save a knowledge graph to a file', async () => {
    const graphToSave: KnowledgeGraph = {
      entities: [
        {
          name: 'Entity1',
          entityType: 'person',
          observations: ['Observation 1'],
        },
        {
          name: 'Entity2',
          entityType: 'location',
          observations: ['Observation 2'],
        },
      ],
      relations: [
        {
          from: 'Entity1',
          to: 'Entity2',
          relationType: 'located_at',
        },
      ],
    };

    await provider.saveGraph(graphToSave);

    // Verify writeFile was called with the correct parameters
    expect(fs.promises.writeFile).toHaveBeenCalledWith(
      testFilePath,
      JSON.stringify(graphToSave, null, 2),
      'utf-8'
    );
  });

  it('should search for nodes that match a query string', async () => {
    const testGraph: KnowledgeGraph = {
      entities: [
        { name: 'Entity1', entityType: 'test', observations: ['test observation'] },
        { name: 'Entity2', entityType: 'test', observations: ['other observation'] },
      ],
      relations: [],
    };

    vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(testGraph));

    const result = await provider.searchNodes('test');

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].name).toBe('Entity1');
  });

  it('should respect search options when searching nodes', async () => {
    const testGraph: KnowledgeGraph = {
      entities: [
        { name: 'Entity1', entityType: 'type1', observations: ['test'] },
        { name: 'Entity2', entityType: 'type2', observations: ['test'] },
      ],
      relations: [],
    };

    vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(testGraph));

    const options: SearchOptions = {
      entityTypes: ['type1'],
    };

    const result = await provider.searchNodes('test', options);

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].entityType).toBe('type1');
  });

  it('should open specific nodes by their exact names', async () => {
    const testGraph: KnowledgeGraph = {
      entities: [
        { name: 'Entity1', entityType: 'test', observations: [] },
        { name: 'Entity2', entityType: 'test', observations: [] },
      ],
      relations: [{ from: 'Entity1', to: 'Entity2', relationType: 'test' }],
    };

    vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(testGraph));

    const result = await provider.openNodes(['Entity1']);

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].name).toBe('Entity1');
    expect(result.relations).toHaveLength(0);
  });

  it('should return empty result when opening non-existent nodes', async () => {
    const testGraph: KnowledgeGraph = {
      entities: [{ name: 'Entity1', entityType: 'test', observations: [] }],
      relations: [],
    };

    vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(testGraph));

    const result = await provider.openNodes(['NonExistent']);

    expect(result.entities).toHaveLength(0);
    expect(result.relations).toHaveLength(0);
  });

  it('should handle empty input array when opening nodes', async () => {
    // Clear previous mock calls
    vi.mocked(fs.promises.readFile).mockClear();

    const result = await provider.openNodes([]);

    expect(result.entities).toHaveLength(0);
    expect(result.relations).toHaveLength(0);
    expect(fs.promises.readFile).not.toHaveBeenCalled();
  });
});
