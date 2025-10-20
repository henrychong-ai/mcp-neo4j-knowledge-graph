import type { Neo4jConnectionManager } from './Neo4jConnectionManager.js';
import { DEFAULT_NEO4J_CONFIG, type Neo4jConfig } from './Neo4jConfig.js';
import { logger } from '../../utils/logger.js';

/**
 * Manages Neo4j schema operations like creating constraints and indexes
 */
export class Neo4jSchemaManager {
  private connectionManager: Neo4jConnectionManager;
  private config: Neo4jConfig;
  private debug: boolean;

  /**
   * Creates a new Neo4j schema manager
   * @param connectionManager A Neo4j connection manager instance
   * @param config Neo4j configuration (optional)
   * @param debug Whether to enable debug logging (defaults to true)
   */
  constructor(
    connectionManager: Neo4jConnectionManager,
    config?: Partial<Neo4jConfig>,
    debug = true
  ) {
    this.connectionManager = connectionManager;
    this.config = {
      ...DEFAULT_NEO4J_CONFIG,
      ...config,
    };
    this.debug = debug;
  }

  /**
   * Log debug messages if debug mode is enabled
   * @param message Debug message to log
   */
  private log(message: string): void {
    if (this.debug) {
      logger.debug(`[Neo4jSchemaManager] ${message}`);
    }
  }

  /**
   * Lists all constraints in the database
   * @returns Array of constraint information
   */
  async listConstraints(): Promise<Record<string, unknown>[]> {
    this.log('Listing existing constraints...');
    const result = await this.connectionManager.executeQuery('SHOW CONSTRAINTS', {});
    const constraints = result.records.map((record) => record.toObject());
    this.log(`Found ${constraints.length} constraints`);
    return constraints;
  }

  /**
   * Lists all indexes in the database
   * @returns Array of index information
   */
  async listIndexes(): Promise<Record<string, unknown>[]> {
    this.log('Listing existing indexes...');
    const result = await this.connectionManager.executeQuery('SHOW INDEXES', {});
    const indexes = result.records.map((record) => record.toObject());
    this.log(`Found ${indexes.length} indexes`);
    return indexes;
  }

  /**
   * Drops a constraint if it exists
   * @param name Name of the constraint to drop
   */
  async dropConstraintIfExists(name: string): Promise<boolean> {
    this.log(`Dropping constraint ${name} if it exists...`);
    try {
      await this.connectionManager.executeQuery(`DROP CONSTRAINT ${name} IF EXISTS`, {});
      this.log(`Constraint ${name} dropped or didn't exist`);
      return true;
    } catch (error) {
      this.log(`Error dropping constraint ${name}: ${error}`);
      return false;
    }
  }

  /**
   * Drops an index if it exists
   * @param name Name of the index to drop
   */
  async dropIndexIfExists(name: string): Promise<boolean> {
    this.log(`Dropping index ${name} if it exists...`);
    try {
      await this.connectionManager.executeQuery(`DROP INDEX ${name} IF EXISTS`, {});
      this.log(`Index ${name} dropped or didn't exist`);
      return true;
    } catch (error) {
      this.log(`Error dropping index ${name}: ${error}`);
      return false;
    }
  }

  /**
   * Creates a unique constraint on entity names
   * @param recreate Whether to drop and recreate the constraint if it exists
   */
  async createEntityConstraints(recreate = false): Promise<void> {
    this.log('Creating entity name constraint...');

    const constraintName = 'entity_name';

    // Check for conflicting constraints on Entity nodes with 'name' property
    const allConstraints = await this.listConstraints();
    const entityConstraints = allConstraints.filter((c) => {
      // Neo4j returns either 'labelsOrTypes' or 'entityType' depending on version
      const label = c.labelsOrTypes || c.entityType;
      const properties = c.properties;

      return (
        (label === 'Entity' || (Array.isArray(label) && label.includes('Entity'))) &&
        Array.isArray(properties) &&
        properties.includes('name')
      );
    });

    // Warn about conflicting constraints
    let hasConflicts = false;
    for (const constraint of entityConstraints) {
      if (constraint.name !== constraintName) {
        hasConflicts = true;
        this.log(`⚠️  WARNING: Found conflicting Entity constraint: ${constraint.name}`);
        this.log(`   Properties: ${JSON.stringify(constraint.properties)}`);

        if (recreate) {
          this.log(`   Dropping conflicting constraint: ${constraint.name}`);
          await this.dropConstraintIfExists(constraint.name as string);
        } else {
          this.log(
            `   Run with recreate=true to automatically remove conflicting constraints`
          );
        }
      }
    }

    if (hasConflicts && !recreate) {
      this.log(
        '⚠️  Conflicting constraints detected. Use npm run neo4j:init with recreate=true to fix automatically.'
      );
    }

    if (recreate) {
      await this.dropConstraintIfExists(constraintName);
    }

    // Create a composite uniqueness constraint on name and validTo
    const query = `
      CREATE CONSTRAINT entity_name IF NOT EXISTS
      FOR (e:Entity)
      REQUIRE (e.name, e.validTo) IS UNIQUE
    `;

    await this.connectionManager.executeQuery(query, {});
    this.log('Entity name constraint created');

    // Verify the constraint was created
    const constraints = await this.listConstraints();
    const found = constraints.some((c) => c.name === constraintName);
    this.log(`Constraint verification: ${found ? 'FOUND' : 'NOT FOUND'}`);
  }

  /**
   * Creates a vector index for storing and querying embeddings
   *
   * @param indexName The name of the vector index
   * @param nodeLabel The label of the nodes to index
   * @param propertyName The property containing vector data
   * @param dimensions The number of dimensions in the vector
   * @param similarityFunction The similarity function to use (defaults to config value)
   * @param recreate Whether to drop and recreate the index if it exists
   */
  async createVectorIndex(
    indexName: string,
    nodeLabel: string,
    propertyName: string,
    dimensions: number,
    similarityFunction?: 'cosine' | 'euclidean',
    recreate = false
  ): Promise<void> {
    this.log(`Creating vector index ${indexName}...`);

    if (recreate) {
      await this.dropIndexIfExists(indexName);
    }

    const query = `
      CREATE VECTOR INDEX ${indexName} IF NOT EXISTS
      FOR (n:${nodeLabel})
      ON (n.${propertyName})
      OPTIONS {
        indexConfig: {
          \`vector.dimensions\`: ${dimensions},
          \`vector.similarity_function\`: '${similarityFunction || this.config.similarityFunction}'
        }
      }
    `;

    this.log(`Executing vector index creation query: ${query}`);
    await this.connectionManager.executeQuery(query, {});
    this.log(`Vector index ${indexName} creation query executed`);

    // Verify the index was created
    const exists = await this.vectorIndexExists(indexName);
    this.log(`Vector index verification: ${exists ? 'FOUND' : 'NOT FOUND'}`);
  }

  /**
   * Checks if a vector index exists and is ONLINE
   *
   * @param indexName The name of the vector index to check
   * @returns True if the index exists and is ONLINE, false otherwise
   */
  async vectorIndexExists(indexName: string): Promise<boolean> {
    this.log(`Checking if vector index ${indexName} exists and is ONLINE...`);
    try {
      const result = await this.connectionManager.executeQuery(
        'SHOW VECTOR INDEXES WHERE name = $indexName',
        { indexName }
      );

      if (result.records.length === 0) {
        this.log(`Vector index ${indexName} does not exist`);
        return false;
      }

      const state = result.records[0].get('state');
      const isOnline = state === 'ONLINE';

      this.log(`Vector index ${indexName} exists with state: ${state}`);

      if (!isOnline) {
        this.log(`Vector index ${indexName} exists but is not ONLINE (state: ${state})`);
      }

      return isOnline;
    } catch (error) {
      this.log(`Error checking vector index: ${error}`);
      // Try with a different syntax for Neo4j versions before 5.13
      try {
        const fallbackResult = await this.connectionManager.executeQuery(
          'SHOW INDEXES WHERE type = "VECTOR" AND name = $indexName',
          { indexName }
        );

        if (fallbackResult.records.length === 0) {
          this.log(`Vector index ${indexName} does not exist (fallback check)`);
          return false;
        }

        const state = fallbackResult.records[0].get('state');
        const isOnline = state === 'ONLINE';

        this.log(`Vector index ${indexName} exists with state: ${state} (fallback check)`);

        if (!isOnline) {
          this.log(
            `Vector index ${indexName} exists but is not ONLINE (state: ${state}) (fallback check)`
          );
        }

        return isOnline;
      } catch (fallbackError) {
        this.log(`Error in fallback check for vector index: ${fallbackError}`);
        return false;
      }
    }
  }

  /**
   * Gets the Neo4j server version and edition
   * @returns Object with version string (e.g., "5.13.0") and edition (e.g., "enterprise", "community")
   */
  async getServerVersion(): Promise<{ version: string; edition: string }> {
    try {
      this.log('Querying Neo4j server version and edition...');
      const result = await this.connectionManager.executeQuery(
        `CALL dbms.components() YIELD name, versions, edition
         WHERE name = 'Neo4j Kernel'
         RETURN versions[0] as version, edition`,
        {}
      );

      if (result.records.length === 0) {
        this.log('No Neo4j Kernel component found in dbms.components()');
        return { version: 'unknown', edition: 'unknown' };
      }

      const version = result.records[0].get('version') || 'unknown';
      const edition = result.records[0].get('edition') || 'unknown';
      this.log(`Neo4j server: ${version} (${edition})`);
      return { version, edition };
    } catch (error) {
      this.log(`Failed to query Neo4j version: ${error}`);
      return { version: 'unknown', edition: 'unknown' };
    }
  }

  /**
   * Initializes the schema by creating necessary constraints and indexes
   * @param recreate Whether to drop and recreate existing constraints and indexes
   */
  async initializeSchema(recreate = false): Promise<void> {
    this.log('Initializing Neo4j schema...');

    // Create constraints
    await this.createEntityConstraints(recreate);

    // Create vector index for entity embeddings
    // Note: Vector indexes require Neo4j Enterprise Edition and Neo4j 5.13+
    // Community Edition will log a warning but continue without vector index
    const indexName = this.config.vectorIndexName;
    const nodeLabel = 'Entity';
    const propertyName = 'embedding';
    const dimensions = this.config.vectorDimensions;
    const similarityFunction = this.config.similarityFunction;

    // Check Neo4j version and edition for vector index compatibility
    const { version, edition } = await this.getServerVersion();
    const versionParts = version.split('.');
    const major = parseInt(versionParts[0], 10);
    const minor = parseInt(versionParts[1], 10);

    // Check Enterprise Edition requirement first
    if (edition.toLowerCase() === 'community') {
      this.log('⚠️  Neo4j Community Edition detected');
      this.log('   Vector indexes require Neo4j Enterprise Edition');
      this.log('   Skipping vector index creation - embeddings will still be stored');
      this.log('   Semantic search will use fallback implementation without index optimization');
      this.log('Schema initialization complete');
      return;
    }

    // Determine if vector indexes are supported by this Neo4j version
    if (version === 'unknown' || isNaN(major) || isNaN(minor)) {
      this.log('⚠️  Unable to determine Neo4j version');
      this.log('   Attempting vector index creation (may fail on older versions)');
    } else if (major < 5 || (major === 5 && minor < 11)) {
      this.log(`⚠️  Neo4j version ${version} does not support vector indexes (requires 5.13+)`);
      this.log('   Skipping vector index creation - embeddings will still be stored');
      this.log('   Semantic search will use fallback implementation without index optimization');
      this.log('Schema initialization complete');
      return;
    } else if (major === 5 && minor >= 11 && minor < 13) {
      this.log(`⚠️  Neo4j version ${version} has experimental vector index support`);
      this.log('   Vector indexes are fully supported in Neo4j 5.13+');
      this.log('   Skipping vector index creation for stability - embeddings will still be stored');
      this.log('   Semantic search will use fallback implementation');
      this.log('Schema initialization complete');
      return;
    } else {
      this.log(`✓ Neo4j ${version} (${edition}) supports vector indexes`);
    }

    try {
      if (recreate) {
        await this.dropIndexIfExists(indexName);
      }

      const query = `
        CREATE VECTOR INDEX ${indexName} IF NOT EXISTS
        FOR (n:${nodeLabel})
        ON (n.${propertyName})
        OPTIONS {
          indexConfig: {
            \`vector.dimensions\`: ${dimensions},
            \`vector.similarity_function\`: '${similarityFunction}'
          }
        }
      `;

      await this.connectionManager.executeQuery(query, {});
      this.log('Vector index created successfully');
    } catch (vectorError) {
      // Vector indexes are only available in Neo4j Enterprise Edition
      // Community Edition will fail here, but we can still store embeddings
      logger.warn(
        'Failed to create vector index (likely Neo4j Community Edition). Embeddings will still be stored but semantic search will be slower.',
        vectorError
      );
      this.log(
        '⚠️  Vector index creation failed - continuing without index (embeddings will still work)'
      );
    }

    this.log('Schema initialization complete');
  }

  /**
   * Closes the connection manager
   */
  async close(): Promise<void> {
    this.log('Closing connection manager');
    await this.connectionManager.close();
  }
}
