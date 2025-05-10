#!/usr/bin/env node

/**
 * Neo4j CLI Utility
 *
 * This script provides command-line utilities for managing Neo4j
 * operations for the Memento MCP project.
 */

import { Neo4jConnectionManager } from '../storage/neo4j/Neo4jConnectionManager.js';
import { Neo4jSchemaManager } from '../storage/neo4j/Neo4jSchemaManager.js';
import { DEFAULT_NEO4J_CONFIG, type Neo4jConfig } from '../storage/neo4j/Neo4jConfig.js';

// Factory types for dependency injection in testing
export type ConnectionManagerFactory = (config: Neo4jConfig) => Neo4jConnectionManager;
export type SchemaManagerFactory = (
  connectionManager: Neo4jConnectionManager,
  debug: boolean
) => Neo4jSchemaManager;

// Default factories that use the actual implementations
const defaultConnectionManagerFactory: ConnectionManagerFactory = (config) =>
  new Neo4jConnectionManager(config);
const defaultSchemaManagerFactory: SchemaManagerFactory = (connectionManager, debug) =>
  new Neo4jSchemaManager(connectionManager, undefined, debug);

/**
 * Parse command line arguments into a Neo4j configuration object
 *
 * @param argv Command line arguments array
 * @returns Object containing configuration and options
 */
export function parseArgs(argv: string[]): {
  config: Neo4jConfig;
  options: { debug: boolean; recreate: boolean };
} {
  const config = { ...DEFAULT_NEO4J_CONFIG };
  // Always enable debug by default - it provides useful information
  const options = { debug: true, recreate: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--uri' && i + 1 < argv.length) {
      config.uri = argv[++i];
    } else if (arg === '--username' && i + 1 < argv.length) {
      config.username = argv[++i];
    } else if (arg === '--password' && i + 1 < argv.length) {
      config.password = argv[++i];
    } else if (arg === '--database' && i + 1 < argv.length) {
      config.database = argv[++i];
    } else if (arg === '--vector-index' && i + 1 < argv.length) {
      config.vectorIndexName = argv[++i];
    } else if (arg === '--dimensions' && i + 1 < argv.length) {
      config.vectorDimensions = parseInt(argv[++i], 10);
    } else if (arg === '--similarity' && i + 1 < argv.length) {
      const similarity = argv[++i];
      if (similarity === 'cosine' || similarity === 'euclidean') {
        config.similarityFunction = similarity;
      }
    } else if (arg === '--no-debug') {
      // Option to disable debug if needed
      options.debug = false;
    } else if (arg === '--recreate') {
      options.recreate = true;
    }
  }

  return { config, options };
}

/**
 * Test the connection to Neo4j
 *
 * @param config Neo4j configuration
 * @param debug Enable debug mode
 * @param connectionManagerFactory Factory for creating connection managers (for testing)
 * @returns true if connection is successful, false otherwise
 */
export async function testConnection(
  config: Neo4jConfig,
  debug = true,
  connectionManagerFactory: ConnectionManagerFactory = defaultConnectionManagerFactory
): Promise<boolean> {
  console.log('Testing connection to Neo4j...');
  console.log(`  URI: ${config.uri}`);
  console.log(`  Username: ${config.username}`);
  console.log(`  Database: ${config.database}`);

  const connectionManager = connectionManagerFactory(config);

  try {
    if (debug) {
      console.log('Debug: Opening Neo4j session');
    }
    const session = await connectionManager.getSession();

    if (debug) {
      console.log('Debug: Running test query: RETURN 1 as value');
    }
    const result = await session.run('RETURN 1 as value');

    if (debug) {
      console.log(`Debug: Query result: ${JSON.stringify(result.records)}`);
    }

    await session.close();

    const value = result.records[0].get('value').toNumber();
    console.log('✓ Neo4j connection successful');
    return value === 1;
  } catch (error) {
    console.error('✗ Neo4j connection failed:');
    console.error(`  Error: ${(error as Error).message}`);
    if (debug) {
      console.error(`  Stack: ${(error as Error).stack}`);
    }
    return false;
  } finally {
    try {
      if (debug) {
        console.log('Debug: Closing Neo4j connection');
      }
      await connectionManager.close();
    } catch (closeError) {
      console.error('  Warning: Error while closing connection:');
      console.error(`  ${(closeError as Error).message}`);
    }
  }
}

/**
 * Initialize Neo4j schema
 *
 * @param config Neo4j configuration
 * @param debug Enable debug mode
 * @param recreate Force recreation of constraints and indexes
 * @param connectionManagerFactory Factory for creating connection managers (for testing)
 * @param schemaManagerFactory Factory for creating schema managers (for testing)
 */
export async function initializeSchema(
  config: Neo4jConfig,
  debug = true,
  recreate = false,
  connectionManagerFactory: ConnectionManagerFactory = defaultConnectionManagerFactory,
  schemaManagerFactory: SchemaManagerFactory = defaultSchemaManagerFactory
): Promise<void> {
  const connectionManager = connectionManagerFactory(config);
  const schemaManager = schemaManagerFactory(connectionManager, debug);

  try {
    console.log('Initializing Neo4j schema...');
    if (recreate) {
      console.log('Using recreate mode: will drop and recreate constraints and indexes');
    }

    // Display current constraints and indexes
    if (debug) {
      console.log('Listing current constraints and indexes...');
      const constraints = await schemaManager.listConstraints();
      console.log(`Found ${constraints.length} constraints`);

      const indexes = await schemaManager.listIndexes();
      console.log(`Found ${indexes.length} indexes`);
    }

    // Create entity constraints
    console.log('Creating entity constraints...');
    await schemaManager.createEntityConstraints(recreate);

    // Create vector index for entity embeddings
    console.log(`Creating vector index "${config.vectorIndexName}"...`);
    await schemaManager.createVectorIndex(
      config.vectorIndexName,
      'Entity',
      'embedding',
      config.vectorDimensions,
      config.similarityFunction,
      recreate
    );

    // Verify the schema was created
    if (debug) {
      console.log('Verifying schema was created...');
      const constraints = await schemaManager.listConstraints();
      console.log(`Found ${constraints.length} constraints after initialization`);

      const indexes = await schemaManager.listIndexes();
      console.log(`Found ${indexes.length} indexes after initialization`);

      // Check if our vector index exists
      const vectorIndexExists = await schemaManager.vectorIndexExists(config.vectorIndexName);
      console.log(`Vector index "${config.vectorIndexName}" exists: ${vectorIndexExists}`);
    }

    console.log('✓ Neo4j schema initialization complete');
  } catch (error) {
    console.error('✗ Neo4j schema initialization failed:');
    console.error(`  Error: ${(error as Error).message}`);
    if (debug) {
      console.error(`  Stack: ${(error as Error).stack}`);
    }
    throw error;
  } finally {
    await schemaManager.close();
  }
}

/**
 * Print help message
 */
export function printHelp(): void {
  console.log(`
Neo4j CLI Utility

Usage:
  neo4j-cli test [options]    - Test Neo4j connection
  neo4j-cli init [options]    - Initialize Neo4j schema
  neo4j-cli help              - Show this help message

Options:
  --uri <uri>              Neo4j server URI (default: ${DEFAULT_NEO4J_CONFIG.uri})
  --username <username>    Neo4j username (default: ${DEFAULT_NEO4J_CONFIG.username})
  --password <password>    Neo4j password (default: ${DEFAULT_NEO4J_CONFIG.password})
  --database <name>        Neo4j database name (default: ${DEFAULT_NEO4J_CONFIG.database})
  --vector-index <name>    Vector index name (default: ${DEFAULT_NEO4J_CONFIG.vectorIndexName})
  --dimensions <number>    Vector dimensions (default: ${DEFAULT_NEO4J_CONFIG.vectorDimensions})
  --similarity <function>  Similarity function (cosine|euclidean) (default: ${DEFAULT_NEO4J_CONFIG.similarityFunction})
  --no-debug               Disable detailed output (debug is ON by default)
  --recreate               Force recreation of constraints and indexes
  `);
}

/**
 * Main CLI function
 */
export async function main(): Promise<void> {
  console.log('Neo4j CLI Utility');
  console.log('=================');

  const command = process.argv[2];
  const args = process.argv.slice(3);
  console.log(`Command: ${command || 'none'}`);
  console.log(`Arguments: ${args.join(' ')}`);

  const { config, options } = parseArgs(args);
  console.log('Configuration:');
  console.log(JSON.stringify(config, null, 2));

  // Only mention debug mode if explicitly disabled
  if (!options.debug) {
    console.log('Debug mode: disabled');
  }

  if (options.recreate) {
    console.log('Recreate mode: enabled');
  }

  switch (command) {
    case 'test':
      await testConnection(config, options.debug);
      break;

    case 'init':
      const connected = await testConnection(config, options.debug);
      if (connected) {
        await initializeSchema(config, options.debug, options.recreate);
      } else {
        console.error('Cannot initialize schema: Connection test failed');
        process.exit(1);
      }
      break;

    case 'help':
    default:
      printHelp();
      if (command !== 'help') {
        console.error(`\nUnknown command: ${command}`);
        process.exit(1);
      }
      break;
  }
}

// Check if this file is being run directly
// This works in both ESM and CommonJS environments
const isMainModule = (): boolean => {
  try {
    // In ESM, import.meta.url is available
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    // Fallback to CommonJS approach
    return typeof require !== 'undefined' && require.main === module;
  }
};

// Run the main function if this script is executed directly
if (isMainModule()) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:');
      console.error(error);
      process.exit(1);
    });
}
