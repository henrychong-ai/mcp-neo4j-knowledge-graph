/**
 * Configuration options for Neo4j
 */
export interface Neo4jConfig {
  /**
   * The Neo4j server URI (e.g., 'bolt://localhost:7687')
   */
  uri: string;

  /**
   * Username for authentication
   */
  username: string;

  /**
   * Password for authentication
   */
  password: string;

  /**
   * Neo4j database name
   */
  database: string;

  /**
   * Name of the vector index
   */
  vectorIndexName: string;

  /**
   * Dimensions for vector embeddings
   */
  vectorDimensions: number;

  /**
   * Similarity function to use for vector search
   */
  similarityFunction: 'cosine' | 'euclidean';
}

/**
 * Default Neo4j configuration
 */
export const DEFAULT_NEO4J_CONFIG: Neo4jConfig = {
  uri: 'bolt://localhost:7687',
  username: 'neo4j',
  password: 'memento_password',
  database: 'neo4j',
  vectorIndexName: 'entity_embeddings',
  vectorDimensions: 1536,
  similarityFunction: 'cosine',
};

/**
 * A Neo4j configuration as a caller may supply it: any subset of the keys, and
 * any of them explicitly `undefined`.
 */
export type Neo4jConfigInput = {
  [Key in keyof Neo4jConfig]?: Neo4jConfig[Key] | undefined;
};

/**
 * Merge a caller's configuration over the defaults.
 *
 * A key that is absent and a key whose value is `undefined` both keep the
 * default. A plain `{ ...DEFAULT_NEO4J_CONFIG, ...config }` does not: it copies
 * an explicit `undefined` over the default. Every other value is taken exactly
 * as a spread would take it, in the same key order.
 *
 * @param config Configuration supplied by the caller (optional)
 * @returns A new, complete configuration
 */
export function resolveNeo4jConfig(config?: Neo4jConfigInput): Neo4jConfig {
  const resolved: Record<string, unknown> = { ...DEFAULT_NEO4J_CONFIG };
  for (const [key, value] of Object.entries(config ?? {})) {
    if (value !== undefined) {
      resolved[key] = value;
    }
  }
  return resolved as unknown as Neo4jConfig;
}
