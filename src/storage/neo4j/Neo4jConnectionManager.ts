import type { Driver, Session } from 'neo4j-driver';
import neo4j from 'neo4j-driver';
import type { Neo4jConfig } from './Neo4jConfig.js';
import { DEFAULT_NEO4J_CONFIG } from './Neo4jConfig.js';

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
  constructor(config?: Partial<Neo4jConfig> | Neo4jConnectionOptions) {
    // Handle deprecated options
    if (config && 'uri' in config) {
      this.config = {
        ...DEFAULT_NEO4J_CONFIG,
        ...config,
      };
    } else {
      this.config = {
        ...DEFAULT_NEO4J_CONFIG,
        ...config,
      };
    }

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
  async executeQuery(query: string, parameters: Record<string, any>): Promise<neo4j.QueryResult> {
    const session = await this.getSession();
    try {
      return await session.run(query, parameters);
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
