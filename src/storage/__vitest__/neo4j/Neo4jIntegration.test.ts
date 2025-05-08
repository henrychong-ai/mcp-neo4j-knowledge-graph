/**
 * @vitest-environment node
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { Neo4jConnectionManager } from '../../neo4j/Neo4jConnectionManager';
import { Neo4jSchemaManager } from '../../neo4j/Neo4jSchemaManager';

// Use regular describe - don't skip tests
// Check if we're running in integration test mode to log information
const isIntegrationTest = process.env.TEST_INTEGRATION === 'true';
if (!isIntegrationTest) {
  console.warn(
    'Running Neo4j integration tests outside of integration mode. Make sure Neo4j is available.'
  );
}

describe('Neo4j Integration Test', () => {
  let connectionManager: Neo4jConnectionManager;
  let schemaManager: Neo4jSchemaManager;

  beforeAll(() => {
    connectionManager = new Neo4jConnectionManager({
      uri: 'bolt://localhost:7687',
      username: 'neo4j',
      password: 'memento_password',
      database: 'neo4j',
    });
    schemaManager = new Neo4jSchemaManager(connectionManager);
  });

  afterAll(async () => {
    await connectionManager.close();
  });

  it('should connect to Neo4j database', async () => {
    const session = await connectionManager.getSession();
    const result = await session.run('RETURN 1 as value');
    await session.close();

    expect(result.records[0].get('value').toNumber()).toBe(1);
  });

  it('should execute schema operations', async () => {
    // Should not throw an exception
    await expect(schemaManager.createEntityConstraints()).resolves.not.toThrow();

    // Verify constraint exists
    const session = await connectionManager.getSession();
    const result = await session.run('SHOW CONSTRAINTS WHERE name = $name', {
      name: 'entity_name',
    });
    await session.close();

    expect(result.records.length).toBeGreaterThan(0);
  });

  it('should create vector index', async () => {
    // Create a test vector index
    await expect(
      schemaManager.createVectorIndex('test_vector_index', 'TestEntity', 'embedding', 128)
    ).resolves.not.toThrow();

    // Verify the index exists
    const exists = await schemaManager.vectorIndexExists('test_vector_index');
    expect(exists).toBe(true);
  });
});
