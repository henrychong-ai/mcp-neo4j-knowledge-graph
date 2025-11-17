/**
 * Neo4j Connection Manager for Dashboard API Routes
 * Singleton pattern to reuse driver instance across requests
 */

import neo4j, { Driver, Session } from 'neo4j-driver';

class Neo4jConnection {
  private static instance: Neo4jConnection;
  private driver: Driver;

  private constructor() {
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const username = process.env.NEO4J_USERNAME || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'memento_password';
    const database = process.env.NEO4J_DATABASE || 'neo4j';

    this.driver = neo4j.driver(uri, neo4j.auth.basic(username, password));

    // Store database for use in sessions
    (this.driver as any).database = database;
  }

  public static getInstance(): Neo4jConnection {
    if (!Neo4jConnection.instance) {
      Neo4jConnection.instance = new Neo4jConnection();
    }
    return Neo4jConnection.instance;
  }

  public getSession(): Session {
    const database = (this.driver as any).database || 'neo4j';
    return this.driver.session({ database });
  }

  public async close(): Promise<void> {
    await this.driver.close();
  }

  public getDriver(): Driver {
    return this.driver;
  }
}

// Export singleton instance getter
export function getNeo4jSession(): Session {
  return Neo4jConnection.getInstance().getSession();
}

export function getNeo4jDriver(): Driver {
  return Neo4jConnection.getInstance().getDriver();
}

/**
 * Helper to convert Neo4j Integer to JavaScript number
 */
export function toNumber(value: any): number {
  if (neo4j.isInt(value)) {
    return value.toNumber();
  }
  return Number(value) || 0;
}

/**
 * Helper to safely extract node properties
 */
export function extractNodeProperties(node: any): Record<string, any> {
  const props: Record<string, any> = {};
  for (const [key, value] of Object.entries(node.properties)) {
    if (neo4j.isInt(value)) {
      props[key] = (value as any).toNumber();
    } else if (Array.isArray(value)) {
      props[key] = value.map(v => neo4j.isInt(v) ? (v as any).toNumber() : v);
    } else {
      props[key] = value;
    }
  }
  return props;
}
