import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Neo4jSchemaManager } from '../../neo4j/Neo4jSchemaManager';
import { Neo4jConnectionManager } from '../../neo4j/Neo4jConnectionManager';

// Mock the Neo4jConnectionManager
vi.mock('../../neo4j/Neo4jConnectionManager', () => {
  const mockExecuteQuery = vi.fn().mockResolvedValue({ records: [] });
  return {
    Neo4jConnectionManager: vi.fn().mockImplementation(() => ({
      executeQuery: mockExecuteQuery,
      close: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

describe('Neo4jSchemaManager', () => {
  let schemaManager: Neo4jSchemaManager;
  let connectionManager: Neo4jConnectionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    connectionManager = new Neo4jConnectionManager();
    schemaManager = new Neo4jSchemaManager(connectionManager);
  });

  afterEach(async () => {
    if (schemaManager) {
      await schemaManager.close();
    }
  });

  it('should create a unique constraint on entities', async () => {
    await schemaManager.createEntityConstraints();

    expect(connectionManager.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('CREATE CONSTRAINT entity_name IF NOT EXISTS'),
      {}
    );
    expect(connectionManager.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('REQUIRE (e.name, e.validTo) IS UNIQUE'),
      {}
    );
  });

  it('should create a vector index for entity embeddings', async () => {
    await schemaManager.createVectorIndex('entity_embeddings', 'Entity', 'embedding', 1536);

    expect(connectionManager.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('CREATE VECTOR INDEX entity_embeddings IF NOT EXISTS'),
      {}
    );
    expect(connectionManager.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('vector.dimensions`: 1536'),
      {}
    );
  });

  it('should check if a vector index exists', async () => {
    (connectionManager.executeQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      records: [{ get: () => 'ONLINE' }],
    });

    const exists = await schemaManager.vectorIndexExists('entity_embeddings');

    expect(connectionManager.executeQuery).toHaveBeenCalledWith(
      'SHOW VECTOR INDEXES WHERE name = $indexName',
      { indexName: 'entity_embeddings' }
    );
    expect(exists).toBe(true);
  });

  it('should initialize the schema', async () => {
    await schemaManager.initializeSchema();

    expect(connectionManager.executeQuery).toHaveBeenCalledTimes(3);
  });
});
