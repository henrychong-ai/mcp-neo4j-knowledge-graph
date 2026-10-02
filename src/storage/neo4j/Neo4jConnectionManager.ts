import type { Driver, QueryResult, Session } from 'neo4j-driver';
import neo4j from 'neo4j-driver';

import { getVersioningConfig } from '../../config/versioning.js';

import { type Neo4jConfig, type Neo4jConfigInput, resolveNeo4jConfig } from './Neo4jConfig.js';

/**
 * Options for configuring a Neo4j connection
 * @deprecated Use Neo4jConfig instead
 */
export interface Neo4jConnectionOptions {
  uri?: string;
  username?: string;
  password?: string;
  database?: string;
}

/**
 * Manages connections to a Neo4j database
 */
export class Neo4jConnectionManager {
  private driver: Driver;
  private readonly config: Neo4jConfig;

  /**
   * Creates a new Neo4j connection manager
   * @param config Connection configuration
   */
  constructor(config?: Neo4jConfigInput | Neo4jConnectionOptions) {
    // The deprecated options are a subset of the configuration keys, so both
    // forms merge the same way. An absent or undefined key keeps its default.
    this.config = resolveNeo4jConfig(config);

    this.driver = neo4j.driver(
      this.config.uri,
      neo4j.auth.basic(this.config.username, this.config.password),
      {}
    );
  }

  /**
   * Gets a Neo4j session for executing queries
   * @returns A Neo4j session
   */
  async getSession(): Promise<Session> {
    return this.driver.session({
      database: this.config.database,
    });
  }

  /**
   * Executes a Cypher query
   * @param query The Cypher query
   * @param parameters Query parameters
   * @returns Query result
   */
  async executeQuery(query: string, parameters: Record<string, unknown>): Promise<QueryResult> {
    const session = await this.getSession();
    try {
      // Auto-commit transactions get the same timeout as explicit ones: an
      // abandoned query otherwise holds its locks until the server kills it.
      return await session.run(query, parameters, {
        timeout: getVersioningConfig().txTimeoutMs,
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Closes the Neo4j driver connection
   */
  async close(): Promise<void> {
    await this.driver.close();
  }
}
