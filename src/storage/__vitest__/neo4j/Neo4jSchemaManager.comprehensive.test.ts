/**
 * Comprehensive tests for Neo4jSchemaManager
 * Covers: all branches including error handling, version checks, and fallbacks
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Neo4jSchemaManager } from '../../neo4j/Neo4jSchemaManager.js';
import type { Neo4jConnectionManager } from '../../neo4j/Neo4jConnectionManager.js';

/**
 * Create a mock connection manager
 */
function createMockConnectionManager(
  options: {
    executeQueryResult?: {
      records: Array<{ toObject: () => Record<string, unknown>; get: (key: string) => unknown }>;
    };
    executeQueryError?: Error;
  } = {}
): Neo4jConnectionManager {
  const { executeQueryResult = { records: [] }, executeQueryError } = options;

  const executeQuery = executeQueryError
    ? vi.fn().mockRejectedValue(executeQueryError)
    : vi.fn().mockResolvedValue(executeQueryResult);

  return {
    executeQuery,
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as Neo4jConnectionManager;
}

describe('Neo4jSchemaManager - List Operations', () => {
  it('should list constraints', async () => {
    const mockRecords = [
      { toObject: () => ({ name: 'entity_name', type: 'UNIQUE' }) },
      { toObject: () => ({ name: 'other_constraint', type: 'NODE_KEY' }) },
    ];
    const connectionManager = createMockConnectionManager({
      executeQueryResult: { records: mockRecords as any },
    });
    const schemaManager = new Neo4jSchemaManager(connectionManager);

    const constraints = await schemaManager.listConstraints();

    expect(connectionManager.executeQuery).toHaveBeenCalledWith('SHOW CONSTRAINTS', {});
    expect(constraints).toHaveLength(2);
    expect(constraints[0]).toEqual({ name: 'entity_name', type: 'UNIQUE' });
  });

  it('should list indexes', async () => {
    const mockRecords = [{ toObject: () => ({ name: 'entity_embeddings', type: 'VECTOR' }) }];
    const connectionManager = createMockConnectionManager({
      executeQueryResult: { records: mockRecords as any },
    });
    const schemaManager = new Neo4jSchemaManager(connectionManager);

    const indexes = await schemaManager.listIndexes();

    expect(connectionManager.executeQuery).toHaveBeenCalledWith('SHOW INDEXES', {});
    expect(indexes).toHaveLength(1);
    expect(indexes[0]).toEqual({ name: 'entity_embeddings', type: 'VECTOR' });
  });
});

describe('Neo4jSchemaManager - Drop Operations', () => {
  it('should drop constraint if exists successfully', async () => {
    const connectionManager = createMockConnectionManager();
    const schemaManager = new Neo4jSchemaManager(connectionManager);

    const result = await schemaManager.dropConstraintIfExists('test_constraint');

    expect(connectionManager.executeQuery).toHaveBeenCalledWith(
      'DROP CONSTRAINT test_constraint IF EXISTS',
      {}
    );
    expect(result).toBe(true);
  });

  it('should return false when drop constraint fails', async () => {
    const connectionManager = createMockConnectionManager({
      executeQueryError: new Error('Constraint not found'),
    });
    const schemaManager = new Neo4jSchemaManager(connectionManager);

    const result = await schemaManager.dropConstraintIfExists('nonexistent');

    expect(result).toBe(false);
  });

  it('should drop index if exists successfully', async () => {
    const connectionManager = createMockConnectionManager();
    const schemaManager = new Neo4jSchemaManager(connectionManager);

    const result = await schemaManager.dropIndexIfExists('test_index');

    expect(connectionManager.executeQuery).toHaveBeenCalledWith(
      'DROP INDEX test_index IF EXISTS',
      {}
    );
    expect(result).toBe(true);
  });

  it('should return false when drop index fails', async () => {
    const connectionManager = createMockConnectionManager({
      executeQueryError: new Error('Index not found'),
    });
    const schemaManager = new Neo4jSchemaManager(connectionManager);

    const result = await schemaManager.dropIndexIfExists('nonexistent');

    expect(result).toBe(false);
  });
});

describe('Neo4jSchemaManager - Entity Constraints', () => {
  it('should create entity constraints with recreate=true', async () => {
    const connectionManager = createMockConnectionManager();
    const schemaManager = new Neo4jSchemaManager(connectionManager);

    await schemaManager.createEntityConstraints(true);

    // Should drop existing constraint when recreate=true
    expect(connectionManager.executeQuery).toHaveBeenCalledWith(
      'DROP CONSTRAINT entity_name IF EXISTS',
      {}
    );
    // Should create new constraint
    expect(connectionManager.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('CREATE CONSTRAINT entity_name IF NOT EXISTS'),
      {}
    );
  });

  it('should detect and warn about conflicting constraints', async () => {
    const mockConstraints = [
      {
        toObject: () => ({
          name: 'old_entity_constraint',
          labelsOrTypes: ['Entity'],
          properties: ['name'],
        }),
      },
    ];

    let callCount = 0;
    const connectionManager = {
      executeQuery: vi.fn().mockImplementation(() => {
        callCount++;
        // First call is SHOW CONSTRAINTS (listing)
        if (callCount === 1) {
          return Promise.resolve({ records: mockConstraints });
        }
        // Subsequent calls return empty records
        return Promise.resolve({ records: [] });
      }),
      close: vi.fn(),
    } as unknown as Neo4jConnectionManager;

    const schemaManager = new Neo4jSchemaManager(connectionManager);

    await schemaManager.createEntityConstraints(false);

    // Should still create the new constraint
    expect(connectionManager.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('CREATE CONSTRAINT entity_name IF NOT EXISTS'),
      {}
    );
  });

  it('should drop conflicting constraints when recreate=true', async () => {
    const mockConstraints = [
      {
        toObject: () => ({
          name: 'old_entity_constraint',
          labelsOrTypes: ['Entity'],
          properties: ['name'],
        }),
      },
    ];

    let callCount = 0;
    const connectionManager = {
      executeQuery: vi.fn().mockImplementation(() => {
        callCount++;
        // First call is SHOW CONSTRAINTS
        if (callCount === 1) {
          return Promise.resolve({ records: mockConstraints });
        }
        return Promise.resolve({ records: [] });
      }),
      close: vi.fn(),
    } as unknown as Neo4jConnectionManager;

    const schemaManager = new Neo4jSchemaManager(connectionManager);

    await schemaManager.createEntityConstraints(true);

    // Should drop the conflicting constraint
    expect(connectionManager.executeQuery).toHaveBeenCalledWith(
      'DROP CONSTRAINT old_entity_constraint IF EXISTS',
      {}
    );
    // Should also drop the main constraint
    expect(connectionManager.executeQuery).toHaveBeenCalledWith(
      'DROP CONSTRAINT entity_name IF EXISTS',
      {}
    );
  });

  it('should handle entityType field format for constraints', async () => {
    const mockConstraints = [
      {
        toObject: () => ({
          name: 'legacy_constraint',
          entityType: 'Entity', // Alternative field name
          properties: ['name'],
        }),
      },
    ];

    let callCount = 0;
    const connectionManager = {
      executeQuery: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ records: mockConstraints });
        }
        return Promise.resolve({ records: [] });
      }),
      close: vi.fn(),
    } as unknown as Neo4jConnectionManager;

    const schemaManager = new Neo4jSchemaManager(connectionManager);

    await schemaManager.createEntityConstraints(true);

    // Should recognize entityType field and drop conflicting constraint
    expect(connectionManager.executeQuery).toHaveBeenCalledWith(
      'DROP CONSTRAINT legacy_constraint IF EXISTS',
      {}
    );
  });
});

describe('Neo4jSchemaManager - Vector Index Operations', () => {
  it('should create vector index with custom similarity function', async () => {
    const connectionManager = createMockConnectionManager();
    const schemaManager = new Neo4jSchemaManager(connectionManager);

    await schemaManager.createVectorIndex(
      'test_index',
      'TestNode',
      'testProperty',
      512,
      'euclidean'
    );

    expect(connectionManager.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('CREATE VECTOR INDEX test_index IF NOT EXISTS'),
      {}
    );
    expect(connectionManager.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("'euclidean'"),
      {}
    );
  });

  it('should drop and recreate vector index when recreate=true', async () => {
    const connectionManager = createMockConnectionManager();
    const schemaManager = new Neo4jSchemaManager(connectionManager);

    await schemaManager.createVectorIndex(
      'test_index',
      'TestNode',
      'testProperty',
      512,
      'cosine',
      true
    );

    expect(connectionManager.executeQuery).toHaveBeenCalledWith(
      'DROP INDEX test_index IF EXISTS',
      {}
    );
  });

  it('should return false when vector index does not exist', async () => {
    const connectionManager = createMockConnectionManager({
      executeQueryResult: { records: [] },
    });
    const schemaManager = new Neo4jSchemaManager(connectionManager);

    const exists = await schemaManager.vectorIndexExists('nonexistent');

    expect(exists).toBe(false);
  });

  it('should return false when vector index exists but is not ONLINE', async () => {
    const mockRecords = [{ get: () => 'POPULATING' }];
    const connectionManager = createMockConnectionManager({
      executeQueryResult: { records: mockRecords as any },
    });
    const schemaManager = new Neo4jSchemaManager(connectionManager);

    const exists = await schemaManager.vectorIndexExists('test_index');

    expect(exists).toBe(false);
  });

  it('should use fallback query when primary vector index check fails', async () => {
    let callCount = 0;
    const connectionManager = {
      executeQuery: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call (SHOW VECTOR INDEXES) fails
          return Promise.reject(new Error('Syntax error'));
        }
        // Fallback query succeeds
        return Promise.resolve({
          records: [{ get: () => 'ONLINE' }],
        });
      }),
      close: vi.fn(),
    } as unknown as Neo4jConnectionManager;

    const schemaManager = new Neo4jSchemaManager(connectionManager);

    const exists = await schemaManager.vectorIndexExists('test_index');

    expect(exists).toBe(true);
    expect(connectionManager.executeQuery).toHaveBeenCalledWith(
      'SHOW INDEXES WHERE type = "VECTOR" AND name = $indexName',
      { indexName: 'test_index' }
    );
  });

  it('should return false when both primary and fallback queries fail', async () => {
    const connectionManager = {
      executeQuery: vi.fn().mockRejectedValue(new Error('Query failed')),
      close: vi.fn(),
    } as unknown as Neo4jConnectionManager;

    const schemaManager = new Neo4jSchemaManager(connectionManager);

    const exists = await schemaManager.vectorIndexExists('test_index');

    expect(exists).toBe(false);
  });

  it('should return false when fallback returns empty records', async () => {
    let callCount = 0;
    const connectionManager = {
      executeQuery: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Syntax error'));
        }
        // Fallback returns empty
        return Promise.resolve({ records: [] });
      }),
      close: vi.fn(),
    } as unknown as Neo4jConnectionManager;

    const schemaManager = new Neo4jSchemaManager(connectionManager);

    const exists = await schemaManager.vectorIndexExists('test_index');

    expect(exists).toBe(false);
  });

  it('should return false when fallback index is not ONLINE', async () => {
    let callCount = 0;
    const connectionManager = {
      executeQuery: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Syntax error'));
        }
        return Promise.resolve({
          records: [{ get: () => 'BUILDING' }],
        });
      }),
      close: vi.fn(),
    } as unknown as Neo4jConnectionManager;

    const schemaManager = new Neo4jSchemaManager(connectionManager);

    const exists = await schemaManager.vectorIndexExists('test_index');

    expect(exists).toBe(false);
  });
});

describe('Neo4jSchemaManager - Server Version', () => {
  it('should get server version successfully', async () => {
    const mockRecords = [{ get: (key: string) => (key === 'version' ? '5.15.0' : 'enterprise') }];
    const connectionManager = createMockConnectionManager({
      executeQueryResult: { records: mockRecords as any },
    });
    const schemaManager = new Neo4jSchemaManager(connectionManager);

    const { version, edition } = await schemaManager.getServerVersion();

    expect(version).toBe('5.15.0');
    expect(edition).toBe('enterprise');
  });

  it('should return unknown when no records returned', async () => {
    const connectionManager = createMockConnectionManager({
      executeQueryResult: { records: [] },
    });
    const schemaManager = new Neo4jSchemaManager(connectionManager);

    const { version, edition } = await schemaManager.getServerVersion();

    expect(version).toBe('unknown');
    expect(edition).toBe('unknown');
  });

  it('should return unknown when query fails', async () => {
    const connectionManager = createMockConnectionManager({
      executeQueryError: new Error('Query failed'),
    });
    const schemaManager = new Neo4jSchemaManager(connectionManager);

    const { version, edition } = await schemaManager.getServerVersion();

    expect(version).toBe('unknown');
    expect(edition).toBe('unknown');
  });

  it('should handle null version/edition fields', async () => {
    const mockRecords = [{ get: () => null }];
    const connectionManager = createMockConnectionManager({
      executeQueryResult: { records: mockRecords as any },
    });
    const schemaManager = new Neo4jSchemaManager(connectionManager);

    const { version, edition } = await schemaManager.getServerVersion();

    expect(version).toBe('unknown');
    expect(edition).toBe('unknown');
  });
});

describe('Neo4jSchemaManager - Initialize Schema', () => {
  it('should skip vector index for Community Edition', async () => {
    let callCount = 0;
    const connectionManager = {
      executeQuery: vi.fn().mockImplementation((query: string) => {
        callCount++;
        // Version query
        if (query.includes('dbms.components')) {
          return Promise.resolve({
            records: [{ get: (key: string) => (key === 'version' ? '5.15.0' : 'community') }],
          });
        }
        return Promise.resolve({ records: [] });
      }),
      close: vi.fn(),
    } as unknown as Neo4jConnectionManager;

    const schemaManager = new Neo4jSchemaManager(connectionManager);

    await schemaManager.initializeSchema();

    // Should NOT call CREATE VECTOR INDEX for community edition
    const createVectorCalls = (
      connectionManager.executeQuery as ReturnType<typeof vi.fn>
    ).mock.calls.filter((call) => call[0].includes('CREATE VECTOR INDEX'));
    expect(createVectorCalls).toHaveLength(0);
  });

  it('should skip vector index for Neo4j version < 5.11', async () => {
    const connectionManager = {
      executeQuery: vi.fn().mockImplementation((query: string) => {
        if (query.includes('dbms.components')) {
          return Promise.resolve({
            records: [{ get: (key: string) => (key === 'version' ? '5.10.0' : 'enterprise') }],
          });
        }
        return Promise.resolve({ records: [] });
      }),
      close: vi.fn(),
    } as unknown as Neo4jConnectionManager;

    const schemaManager = new Neo4jSchemaManager(connectionManager);

    await schemaManager.initializeSchema();

    // Should NOT call CREATE VECTOR INDEX for older versions
    const createVectorCalls = (
      connectionManager.executeQuery as ReturnType<typeof vi.fn>
    ).mock.calls.filter((call) => call[0].includes('CREATE VECTOR INDEX'));
    expect(createVectorCalls).toHaveLength(0);
  });

  it('should skip vector index for Neo4j version 5.11-5.12 (experimental)', async () => {
    const connectionManager = {
      executeQuery: vi.fn().mockImplementation((query: string) => {
        if (query.includes('dbms.components')) {
          return Promise.resolve({
            records: [{ get: (key: string) => (key === 'version' ? '5.12.0' : 'enterprise') }],
          });
        }
        return Promise.resolve({ records: [] });
      }),
      close: vi.fn(),
    } as unknown as Neo4jConnectionManager;

    const schemaManager = new Neo4jSchemaManager(connectionManager);

    await schemaManager.initializeSchema();

    // Should NOT call CREATE VECTOR INDEX for experimental versions
    const createVectorCalls = (
      connectionManager.executeQuery as ReturnType<typeof vi.fn>
    ).mock.calls.filter((call) => call[0].includes('CREATE VECTOR INDEX'));
    expect(createVectorCalls).toHaveLength(0);
  });

  it('should create vector index for Neo4j 5.13+ Enterprise', async () => {
    const connectionManager = {
      executeQuery: vi.fn().mockImplementation((query: string) => {
        if (query.includes('dbms.components')) {
          return Promise.resolve({
            records: [{ get: (key: string) => (key === 'version' ? '5.15.0' : 'enterprise') }],
          });
        }
        return Promise.resolve({ records: [] });
      }),
      close: vi.fn(),
    } as unknown as Neo4jConnectionManager;

    const schemaManager = new Neo4jSchemaManager(connectionManager);

    await schemaManager.initializeSchema();

    // Should call CREATE VECTOR INDEX for supported versions
    const createVectorCalls = (
      connectionManager.executeQuery as ReturnType<typeof vi.fn>
    ).mock.calls.filter((call) => call[0].includes('CREATE VECTOR INDEX'));
    expect(createVectorCalls).toHaveLength(1);
  });

  it('should attempt vector index creation with unknown version', async () => {
    const connectionManager = {
      executeQuery: vi.fn().mockImplementation((query: string) => {
        if (query.includes('dbms.components')) {
          return Promise.resolve({
            records: [{ get: (key: string) => (key === 'version' ? 'unknown' : 'enterprise') }],
          });
        }
        return Promise.resolve({ records: [] });
      }),
      close: vi.fn(),
    } as unknown as Neo4jConnectionManager;

    const schemaManager = new Neo4jSchemaManager(connectionManager);

    await schemaManager.initializeSchema();

    // Should still attempt to create vector index when version is unknown
    const createVectorCalls = (
      connectionManager.executeQuery as ReturnType<typeof vi.fn>
    ).mock.calls.filter((call) => call[0].includes('CREATE VECTOR INDEX'));
    expect(createVectorCalls).toHaveLength(1);
  });

  it('should handle vector index creation failure gracefully', async () => {
    let vectorIndexAttempted = false;
    const connectionManager = {
      executeQuery: vi.fn().mockImplementation((query: string) => {
        if (query.includes('dbms.components')) {
          return Promise.resolve({
            records: [{ get: (key: string) => (key === 'version' ? '5.15.0' : 'enterprise') }],
          });
        }
        if (query.includes('CREATE VECTOR INDEX')) {
          vectorIndexAttempted = true;
          return Promise.reject(new Error('Vector index creation failed'));
        }
        return Promise.resolve({ records: [] });
      }),
      close: vi.fn(),
    } as unknown as Neo4jConnectionManager;

    const schemaManager = new Neo4jSchemaManager(connectionManager);

    // Should not throw
    await expect(schemaManager.initializeSchema()).resolves.toBeUndefined();
    expect(vectorIndexAttempted).toBe(true);
  });

  it('should drop and recreate vector index when recreate=true', async () => {
    const connectionManager = {
      executeQuery: vi.fn().mockImplementation((query: string) => {
        if (query.includes('dbms.components')) {
          return Promise.resolve({
            records: [{ get: (key: string) => (key === 'version' ? '5.15.0' : 'enterprise') }],
          });
        }
        return Promise.resolve({ records: [] });
      }),
      close: vi.fn(),
    } as unknown as Neo4jConnectionManager;

    const schemaManager = new Neo4jSchemaManager(connectionManager);

    await schemaManager.initializeSchema(true);

    // Should drop the index before creating
    const dropCalls = (
      connectionManager.executeQuery as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      (call) => call[0].includes('DROP INDEX') && call[0].includes('entity_embeddings')
    );
    expect(dropCalls.length).toBeGreaterThan(0);
  });

  it('should skip vector index for Neo4j version < 5', async () => {
    const connectionManager = {
      executeQuery: vi.fn().mockImplementation((query: string) => {
        if (query.includes('dbms.components')) {
          return Promise.resolve({
            records: [{ get: (key: string) => (key === 'version' ? '4.4.0' : 'enterprise') }],
          });
        }
        return Promise.resolve({ records: [] });
      }),
      close: vi.fn(),
    } as unknown as Neo4jConnectionManager;

    const schemaManager = new Neo4jSchemaManager(connectionManager);

    await schemaManager.initializeSchema();

    // Should NOT call CREATE VECTOR INDEX for Neo4j 4.x
    const createVectorCalls = (
      connectionManager.executeQuery as ReturnType<typeof vi.fn>
    ).mock.calls.filter((call) => call[0].includes('CREATE VECTOR INDEX'));
    expect(createVectorCalls).toHaveLength(0);
  });
});

describe('Neo4jSchemaManager - Debug Mode', () => {
  it('should create manager with debug disabled', async () => {
    const connectionManager = createMockConnectionManager();
    // debug = false should suppress logging
    const schemaManager = new Neo4jSchemaManager(connectionManager, {}, false);

    await schemaManager.listConstraints();

    expect(connectionManager.executeQuery).toHaveBeenCalled();
  });
});

describe('Neo4jSchemaManager - Close', () => {
  it('should close connection manager', async () => {
    const connectionManager = createMockConnectionManager();
    const schemaManager = new Neo4jSchemaManager(connectionManager);

    await schemaManager.close();

    expect(connectionManager.close).toHaveBeenCalled();
  });
});
