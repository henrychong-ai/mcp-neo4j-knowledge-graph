import { LRUCache } from 'lru-cache';
import neo4j, { isInt, type Transaction } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';

import { getVersioningConfig, REPAIR_COMMAND_HINT } from '../../config/versioning.js';
import type { EmbeddingService } from '../../embeddings/EmbeddingService.js';
import { EmbeddingServiceFactory } from '../../embeddings/EmbeddingServiceFactory.js';
import type { KnowledgeGraph, Entity } from '../../KnowledgeGraphManager.js';
import { PrometheusMetrics } from '../../metrics/PrometheusMetrics.js';
import { HybridRetriever, type HybridSearchConfig } from '../../retrieval/index.js';
import type {
  BatchConfig,
  BatchResult,
  ObservationBatch,
  EntityUpdate,
} from '../../types/batch-operations.js';
import type { EntityEmbedding, SemanticSearchOptions } from '../../types/entity-embedding.js';
import type { Relation } from '../../types/relation.js';
import { logger } from '../../utils/logger.js';
import type { StorageProvider, SearchOptions, EntitySizeScanRow } from '../StorageProvider.js';

import { DEFAULT_NEO4J_CONFIG, type Neo4jConfig } from './Neo4jConfig.js';
import { Neo4jConnectionManager } from './Neo4jConnectionManager.js';
import { Neo4jSchemaManager } from './Neo4jSchemaManager.js';
import { Neo4jVectorStore } from './Neo4jVectorStore.js';

/**
 * Configuration options for Neo4j storage provider
 */
export interface Neo4jStorageProviderOptions {
  /**
   * Neo4j connection configuration
   */
  config?: Partial<Neo4jConfig>;

  /**
   * Pre-configured connection manager (optional)
   */
  connectionManager?: Neo4jConnectionManager;

  /**
   * Configuration for temporal confidence decay
   */
  decayConfig?: {
    /**
     * Whether confidence decay is enabled
     */
    enabled: boolean;

    /**
     * Number of days for confidence to decay by half (default: 30)
     */
    halfLifeDays?: number;

    /**
     * Minimum confidence threshold below which confidence won't decay (default: 0.1)
     */
    minConfidence?: number;
  };
}

/**
 * Extended Entity interface with additional properties needed for Neo4j
 */
interface ExtendedEntity extends Entity {
  id?: string;
  version?: number;
  createdAt?: number;
  updatedAt?: number;
  validFrom?: number;
  validTo?: number | null;
  changedBy?: string | null;
}

/**
 * Extended Relation interface with additional properties needed for Neo4j
 * Note: This doesn't extend Relation to avoid type conflicts with strength/confidence
 */
interface ExtendedRelation {
  id?: string;
  from: string;
  to: string;
  relationType: string;
  version?: number;
  createdAt?: number;
  updatedAt?: number;
  validFrom?: number;
  validTo?: number | null;
  changedBy?: string | null;
  strength?: number | null | undefined;
  confidence?: number | null | undefined;
  metadata?: Record<string, unknown> | null;
}

// These interfaces are used for documentation purposes to understand the Neo4j data model

/**
 * Extended SemanticSearchOptions with additional properties needed for Neo4j
 */
interface Neo4jSemanticSearchOptions extends SemanticSearchOptions {
  queryVector?: number[];
  hybridConfig?: Partial<HybridSearchConfig>;
  enableHybridRetrieval?: boolean;
}

/**
 * Knowledge graph with optional diagnostics
 */
interface KnowledgeGraphWithDiagnostics extends KnowledgeGraph {
  diagnostics?: Record<string, unknown>;
}

/**
 * Transaction configuration accepted by `session.beginTransaction()`.
 *
 * Declared locally because `neo4j-driver`'s top-level entry point re-exports
 * `Transaction` but not `TransactionConfig`.
 */
interface Neo4jTransactionConfig {
  /** Server-side transaction timeout in milliseconds. */
  timeout: number;
}

/**
 * Snapshot of the live entity version that a versioning operation supersedes.
 */
export interface CurrentEntityVersion {
  /** Version UUID. `null` for legacy pre-temporal nodes. */
  id: string | null;
  name: string;
  entityType: string;
  domain: string | null;
  observations: string[];
  version: number;
  createdAt: number;
  validFrom: number;
}

/**
 * Fields written onto the version being created. Anything omitted is inherited
 * from the live version being superseded.
 */
export interface NextEntityFields {
  observations?: string[];
  entityType?: string;
  domain?: string | null;
  changedBy?: string | null;
  /** When provided, written onto the new version; otherwise left NULL. */
  embedding?: number[] | null;
}

/**
 * One entity to version, keyed by name.
 */
export interface EntityVersionInput {
  /** Entity name — the versioning key (NOT a version id). */
  name: string;
  /**
   * Derives the new version's fields from the current live version.
   * Return `null` to leave the entity untouched (no new version created).
   */
  apply: (current: CurrentEntityVersion) => NextEntityFields | null;
}

/**
 * A successfully versioned entity.
 */
export interface VersionedEntity {
  name: string;
  /** Id of the version that was created. */
  newId: string;
  /** Ids of every live version that was closed (usually one). */
  previousIds: string[];
  version: number;
  /** Version-boundary timestamp shared by every entity in the same call. */
  now: number;
  current: CurrentEntityVersion;
  next: NextEntityFields;
  /** Raw property map of the created node, ready for `nodeToEntity`. */
  properties: Record<string, unknown>;
}

/**
 * Result of one `versionEntities` call.
 */
export interface VersionEntitiesOutcome {
  /** Entities that received a new version. */
  versioned: VersionedEntity[];
  /** Entities whose `apply` returned null — nothing to do. */
  skipped: string[];
  /** Names with no live version in the graph. */
  notFound: string[];
  /**
   * Legacy pre-temporal entities (no `id` property). The caller decides how to
   * mutate these in place; the helper never versions them.
   */
  legacy: { current: CurrentEntityVersion; next: NextEntityFields }[];
  /** Number of relationship copies MERGEd onto the new versions. */
  relationshipsCopied: number;
}

/** Internal: a live-version row as returned by the fetch query. */
interface LiveVersionRow {
  id: string | null;
  entityType: string | null;
  domain: string | null;
  observations: unknown;
  version: unknown;
  createdAt: unknown;
  validFrom: unknown;
}

/** Internal: one relationship copy to MERGE onto a new version. */
interface RelationshipCopyRow {
  newId: string;
  otherName: string;
  relId: string;
  props: Record<string, unknown>;
}

/**
 * A storage provider that uses Neo4j to store the knowledge graph
 */
export class Neo4jStorageProvider implements StorageProvider {
  private connectionManager: Neo4jConnectionManager;
  private schemaManager: Neo4jSchemaManager;
  private readonly config: Neo4jConfig;
  private readonly decayConfig: {
    enabled: boolean;
    halfLifeDays: number;
    minConfidence: number;
  };

  private vectorStore: Neo4jVectorStore;
  private embeddingService: EmbeddingService | null = null;
  private searchCache: LRUCache<string, KnowledgeGraphWithDiagnostics>;

  /**
   * Transaction configuration applied to EVERY transaction this provider opens.
   *
   * Without a timeout an abandoned transaction holds its write locks until the
   * server kills the connection — which, on a server with no
   * `db.transaction.timeout` configured, is never. Resolved once at
   * construction from `NEO4J_TX_TIMEOUT_MS` (default 60000 ms).
   */
  private readonly txConfig: Neo4jTransactionConfig;

  /**
   * Maximum live relationships one entity version may carry before the
   * versioning helper refuses to copy them. From `NEO4J_MAX_LIVE_RELATIONSHIPS`.
   */
  private readonly maxLiveRelationships: number;

  /**
   * Create a new Neo4jStorageProvider
   * @param options Configuration options
   */
  constructor(options?: Neo4jStorageProviderOptions) {
    // Set up configuration
    this.config = {
      ...DEFAULT_NEO4J_CONFIG,
      ...options?.config,
    };

    // Resolve versioning safety limits once — every transaction and every
    // versioning pre-flight check reads them from here.
    const versioningConfig = getVersioningConfig();
    this.txConfig = Object.freeze({ timeout: versioningConfig.txTimeoutMs });
    this.maxLiveRelationships = versioningConfig.maxLiveRelationships;

    // Configure decay settings
    this.decayConfig = {
      enabled: options?.decayConfig?.enabled ?? true,
      halfLifeDays: options?.decayConfig?.halfLifeDays ?? 30,
      minConfidence: options?.decayConfig?.minConfidence ?? 0.1,
    };

    // Set up connection manager
    this.connectionManager = options?.connectionManager || new Neo4jConnectionManager(this.config);

    // Set up schema manager
    this.schemaManager = new Neo4jSchemaManager(this.connectionManager, this.config, false);

    // Set up vector store — dimensions MUST follow the configured index dimension
    // (was hardcoded 1536, which would create a wrong-sized index on non-1536 deployments)
    this.vectorStore = new Neo4jVectorStore({
      connectionManager: this.connectionManager,
      indexName: this.config.vectorIndexName,
      dimensions: this.config.vectorDimensions,
      similarityFunction: 'cosine',
      entityNodeLabel: 'Entity',
    });

    logger.debug('Neo4jStorageProvider: Initializing embedding service');
    try {
      // Set up embedding service — same provider/production gates as index.ts, so the
      // storage provider's DIRECT write paths (createEntities/createEntitiesBatch)
      // can never generate random/mock vectors when no real provider is configured.
      if (!EmbeddingServiceFactory.hasEmbeddingProvider()) {
        logger.info(
          'Neo4jStorageProvider: no embedding provider configured — entity writes will persist with NULL embeddings'
        );
      } else {
        const service = EmbeddingServiceFactory.createFromEnvironment();
        if (!EmbeddingServiceFactory.shouldWriteEmbeddings(service)) {
          logger.error(
            'Neo4jStorageProvider: refusing random/mock embedding service under NODE_ENV=production — ' +
              'entity writes will persist with NULL embeddings'
          );
        } else {
          this.embeddingService = service;
          logger.debug('Neo4jStorageProvider: Embedding service initialized successfully', {
            provider: this.embeddingService.getProviderInfo().provider,
            model: this.embeddingService.getProviderInfo().model,
            dimensions: this.embeddingService.getProviderInfo().dimensions,
          });
        }
      }
    } catch (error) {
      logger.error('Neo4jStorageProvider: Failed to initialize embedding service', error);
    }

    // Initialize LRU cache for semantic search query results
    this.searchCache = new LRUCache<string, KnowledgeGraphWithDiagnostics>({
      max: 500, // Cache up to 500 unique queries
      ttl: 1000 * 60 * 5, // 5 minute TTL for cache entries
      maxSize: 10_000, // Maximum 10K entities across all cached results
      sizeCalculation: graph => {
        // Guard against undefined entities/relations
        const entityCount = Array.isArray(graph.entities) ? graph.entities.length : 0;
        const relationCount = Array.isArray(graph.relations) ? graph.relations.length : 0;
        return entityCount + relationCount;
      },
    });
    logger.debug('Neo4jStorageProvider: Search result cache initialized', {
      maxQueries: 500,
      ttlMinutes: 5,
      maxEntities: 10_000,
    });

    // Initialize the schema and vector store
    this.initializeSchema().catch(error => {
      logger.error('Failed to initialize Neo4j schema', error);
    });
  }

  /**
   * Get the connection manager (primarily for testing)
   */
  getConnectionManager(): Neo4jConnectionManager {
    return this.connectionManager;
  }

  /**
   * Generate a cache key for semantic search queries
   * Includes all parameters that affect search results
   */
  private generateCacheKey(
    query: string,
    options: SearchOptions & Neo4jSemanticSearchOptions = {}
  ): string {
    // Create a copy to avoid mutating caller's array
    const entityTypes = options.entityTypes ? [...options.entityTypes].sort() : [];

    // Serialize hybrid config if present
    const hybridConfigKey = options.hybridConfig ? JSON.stringify(options.hybridConfig) : '';

    // Hash query vector if present (vectors are large, hash them)
    const vectorKey = options.queryVector
      ? `v:${options.queryVector.length}:${options.queryVector.slice(0, 3).join(',')}`
      : '';

    const parts = [
      query,
      String(options.limit ?? 10),
      String(options.minSimilarity ?? 0),
      entityTypes.join(','),
      String(options.hybridSearch || false),
      String(options.semanticWeight || 0.6),
      String(options.enableHybridRetrieval !== false),
      hybridConfigKey,
      vectorKey,
      options.domain || 'all',
      // includeNullDomain changes the Cypher filter (`AND node.domain IS NULL`) —
      // omitting it from the key aliased null-domain and all-domain results.
      String(options.includeNullDomain ?? false),
    ];
    return parts.join(':');
  }

  /**
   * Reorder a graph's entities to match a ranked name list.
   *
   * openNodes() hydration does not guarantee result order, so the ranked
   * ordering produced by vector/hybrid search must be re-applied before the
   * graph is cached or returned — callers (KnowledgeGraphManager.maybeRerank)
   * rely on recall order being meaningful. Entities whose name is missing
   * from the ranked list are placed last, preserving their relative order
   * (Array.prototype.sort is stable).
   */
  private reorderEntitiesByRank(graph: KnowledgeGraph, rankedNames: string[]): KnowledgeGraph {
    const rankIndex = new Map(rankedNames.map((name, index) => [name, index]));
    const entities = [...graph.entities].sort(
      (a, b) =>
        (rankIndex.get(a.name) ?? Number.MAX_SAFE_INTEGER) -
        (rankIndex.get(b.name) ?? Number.MAX_SAFE_INTEGER)
    );
    return { ...graph, entities };
  }

  /**
   * Initialize Neo4j schema
   */
  private async initializeSchema(): Promise<void> {
    try {
      await this.schemaManager.initializeSchema(false);
      logger.info('Neo4j schema initialized successfully');

      // Initialize vector store after schema is ready
      try {
        await this.vectorStore.initialize();
        logger.info('Neo4j vector store initialized successfully');
      } catch (vectorError) {
        logger.error('Failed to initialize Neo4j vector store', vectorError);
        // Continue even if vector store initialization fails
      }
    } catch (schemaError) {
      logger.error('Failed to initialize Neo4j schema', schemaError);
      throw schemaError;
    }
  }

  /**
   * Close Neo4j connections
   */
  async close(): Promise<void> {
    try {
      await this.connectionManager.close();
      logger.debug('Neo4j connections closed');
    } catch (error) {
      logger.error('Error closing Neo4j connections', error);
    }
  }

  /**
   * Safely convert Neo4j Integer objects to JavaScript numbers
   * @param value Value from Neo4j that might be an Integer object
   * @returns Converted number, or null/undefined if input was null/undefined
   */
  private convertNeo4jInt(value: unknown): number | null | undefined {
    if (value === null) return null;
    if (value === undefined) return undefined;
    if (isInt(value)) return value.toNumber();
    return Number(value);
  }

  /**
   * Convert a Neo4j node to an entity object
   * @param node Neo4j node properties
   * @returns Entity object
   */
  private nodeToEntity(node: Record<string, unknown>): ExtendedEntity {
    // Handle observations - Neo4j can return as string (JSON) or array
    let observations: string[];
    if (typeof node.observations === 'string') {
      observations = JSON.parse(node.observations);
    } else if (Array.isArray(node.observations)) {
      observations = node.observations;
    } else {
      observations = [];
    }

    return {
      name: node.name as string,
      entityType: node.entityType as string,
      domain: node.domain as string | null | undefined,
      observations,
      id: node.id as string | undefined,
      version: this.convertNeo4jInt(node.version) as number | undefined,
      createdAt: this.convertNeo4jInt(node.createdAt) as number | undefined,
      updatedAt: this.convertNeo4jInt(node.updatedAt) as number | undefined,
      validFrom: this.convertNeo4jInt(node.validFrom) as number | undefined,
      validTo: this.convertNeo4jInt(node.validTo),
      changedBy: node.changedBy as string | null | undefined,
    };
  }

  /**
   * Parse a Neo4j relationship into a relation object
   * @param rel Relationship properties
   * @param fromNode From node name
   * @param toNode To node name
   * @returns Relation object
   */
  /**
   * Parse a Neo4j relationship into a relation object
   * @param rel Relationship properties
   * @param fromNode From node name
   * @param toNode To node name
   * @returns Relation object
   */
  private relationshipToRelation(
    rel: Record<string, unknown>,
    fromNode: string,
    toNode: string
  ): Relation {
    // Extract timestamps from the Neo4j relation for metadata
    // Convert Neo4j Integer objects to numbers
    const now = Date.now();
    const createdAt = this.convertNeo4jInt(rel.createdAt) || now;
    const updatedAt = this.convertNeo4jInt(rel.updatedAt) || now;

    // Create metadata with required fields
    const metadata = {
      createdAt,
      updatedAt,
    };

    // Try to merge any additional metadata from the relation
    if (typeof rel.metadata === 'string' && rel.metadata) {
      try {
        const parsedMetadata = JSON.parse(rel.metadata);
        Object.assign(metadata, parsedMetadata);
      } catch {
        logger.warn(`Failed to parse metadata for relation from ${fromNode} to ${toNode}`);
      }
    }

    // Create a standard Relation object with proper type handling
    // Convert Neo4j Integer objects for strength and confidence
    const strength = this.convertNeo4jInt(rel.strength);
    const confidence = this.convertNeo4jInt(rel.confidence);

    return {
      from: fromNode,
      to: toNode,
      relationType: rel.relationType as string,
      // Convert null to undefined for compatibility with Relation interface
      strength: strength === null ? undefined : strength!,
      confidence: confidence === null ? undefined : confidence!,
      metadata,
    };
  }

  /**
   * Load the complete knowledge graph from Neo4j
   */
  async loadGraph(): Promise<KnowledgeGraph> {
    // Start Prometheus metrics timer
    const metrics = PrometheusMetrics.getInstance();
    const endTimer = metrics.startQueryTimer('loadGraph');

    try {
      const startTime = Date.now();

      // Load entities query
      const entityQuery = `
        MATCH (e:Entity)
        WHERE e.validTo IS NULL
        RETURN e
      `;

      // Execute query to get all current entities
      const entityResult = await this.connectionManager.executeQuery(entityQuery, {});

      // Process entity results
      const entities = entityResult.records.map(record => {
        const node = record.get('e').properties;
        return this.nodeToEntity(node);
      });

      // Load relations query
      const relationQuery = `
        MATCH (from:Entity)-[r:RELATES_TO]->(to:Entity)
        WHERE r.validTo IS NULL
        RETURN from.name AS fromName, to.name AS toName, r
      `;

      // Execute query to get all current relations
      const relationResult = await this.connectionManager.executeQuery(relationQuery, {});

      // Process relation results
      const relations = relationResult.records.map(record => {
        const fromName = record.get('fromName');
        const toName = record.get('toName');
        const rel = record.get('r').properties;

        return this.relationshipToRelation(rel, fromName, toName);
      });

      const timeTaken = Date.now() - startTime;

      // Record metrics (cache status 'disabled' until cache is implemented)
      endTimer('disabled');

      // Return the complete graph
      return {
        entities,
        relations,
        total: entities.length,
        timeTaken,
      };
    } catch (error) {
      logger.error('Error loading graph from Neo4j', error);
      throw error;
    }
  }

  /**
   * Save a complete knowledge graph to Neo4j (warning: this will overwrite existing data)
   * @param graph The knowledge graph to save
   */
  async saveGraph(graph: KnowledgeGraph): Promise<void> {
    try {
      // Start a new session
      const session = await this.connectionManager.getSession();

      try {
        // Begin transaction
        const txc = session.beginTransaction(this.txConfig);

        try {
          // Delete all existing data
          await txc.run('MATCH (n) DETACH DELETE n', {});

          // Process entities
          for (const entity of graph.entities) {
            const extendedEntity = entity as ExtendedEntity;
            const params = {
              id: extendedEntity.id || uuidv4(),
              name: entity.name,
              entityType: entity.entityType,
              domain: (entity as any).domain || null,
              observations: JSON.stringify(entity.observations || []),
              version: extendedEntity.version || 1,
              createdAt: extendedEntity.createdAt || Date.now(),
              updatedAt: extendedEntity.updatedAt || Date.now(),
              validFrom: extendedEntity.validFrom || Date.now(),
              validTo: extendedEntity.validTo || null,
              changedBy: extendedEntity.changedBy || null,
            };

            // Create entity
            await txc.run(
              `
              CREATE (e:Entity {
                id: $id,
                name: $name,
                entityType: $entityType,
                domain: $domain,
                observations: $observations,
                version: $version,
                createdAt: $createdAt,
                updatedAt: $updatedAt,
                validFrom: $validFrom,
                validTo: $validTo,
                changedBy: $changedBy
              })
            `,
              params
            );
          }

          // Process relations
          for (const relation of graph.relations) {
            const extendedRelation = relation as ExtendedRelation;
            const params = {
              id: extendedRelation.id || uuidv4(),
              fromName: relation.from,
              toName: relation.to,
              relationType: relation.relationType,
              strength: relation.strength || null,
              confidence: relation.confidence || null,
              metadata: relation.metadata ? JSON.stringify(relation.metadata) : null,
              version: extendedRelation.version || 1,
              createdAt: extendedRelation.createdAt || Date.now(),
              updatedAt: extendedRelation.updatedAt || Date.now(),
              validFrom: extendedRelation.validFrom || Date.now(),
              validTo: extendedRelation.validTo || null,
              changedBy: extendedRelation.changedBy || null,
            };

            // Create relation
            await txc.run(
              `
              MATCH (from:Entity {name: $fromName})
              MATCH (to:Entity {name: $toName})
              CREATE (from)-[r:RELATES_TO {
                id: $id,
                relationType: $relationType,
                strength: $strength,
                confidence: $confidence,
                metadata: $metadata,
                version: $version,
                createdAt: $createdAt,
                updatedAt: $updatedAt,
                validFrom: $validFrom,
                validTo: $validTo,
                changedBy: $changedBy
              }]->(to)
            `,
              params
            );
          }

          // Commit transaction
          await txc.commit();
          logger.info(
            `Saved graph with ${graph.entities.length} entities and ${graph.relations.length} relations to Neo4j`
          );
        } catch (error) {
          // Rollback on error
          await txc.rollback();
          throw error;
        }
      } finally {
        // Close session
        await session.close();
      }
    } catch (error) {
      logger.error('Error saving graph to Neo4j', error);
      throw error;
    }
  }

  /**
   * Search for nodes in the graph that match the query
   * @param query The search query string
   * @param options Optional search parameters
   */
  async searchNodes(query: string, options: SearchOptions = {}): Promise<KnowledgeGraph> {
    // Start Prometheus metrics timer
    const metrics = PrometheusMetrics.getInstance();
    const endTimer = metrics.startQueryTimer('searchNodes');

    try {
      const startTime = Date.now();

      // Prepare search parameters — ?? (not ||) so an explicit limit of 0 is honoured.
      // Direct callers: a NaN limit now yields LIMIT 0 (empty result) instead of the
      // old falsy-collapse to 10; KnowledgeGraphManager normalises non-finite limits
      // to undefined before they reach this method.
      const rawLimit = options.limit ?? 10;
      const parameters: Record<string, unknown> = {
        query: `(?i).*${query}.*`, // Case-insensitive regex pattern
        limit: neo4j.int(Math.floor(rawLimit)),
      };

      // Add entity type filter if provided
      let entityTypeFilter = '';
      if (options.entityTypes && options.entityTypes.length > 0) {
        entityTypeFilter = 'AND e.entityType IN $entityTypes';
        parameters.entityTypes = options.entityTypes;
      }

      // Add domain filter if provided
      let domainFilter = '';
      if (options.includeNullDomain) {
        // Filter to only entities with null domain (uncategorized)
        domainFilter = 'AND e.domain IS NULL';
      } else if (options.domain) {
        domainFilter = 'AND e.domain = $domain';
        parameters.domain = options.domain;
      }

      // Build the search query
      const searchQuery = `
        MATCH (e:Entity)
        WHERE (e.name =~ $query OR e.entityType =~ $query OR e.observations =~ $query)
        ${entityTypeFilter}
        ${domainFilter}
        AND e.validTo IS NULL
        RETURN e
        LIMIT $limit
      `;

      // Execute the search
      const result = await this.connectionManager.executeQuery(searchQuery, parameters);

      // Process entity results
      const entities = result.records.map(record => {
        const node = record.get('e').properties;
        return this.nodeToEntity(node);
      });

      // Get relations between found entities
      const entityNames = entities.map(e => e.name);
      if (entityNames.length > 0) {
        const relationsQuery = `
          MATCH (from:Entity)-[r:RELATES_TO]->(to:Entity)
          WHERE from.name IN $entityNames
          AND to.name IN $entityNames
          AND r.validTo IS NULL
          RETURN from.name AS fromName, to.name AS toName, r
        `;

        const relationsResult = await this.connectionManager.executeQuery(relationsQuery, {
          entityNames,
        });

        // Process relation results
        const relations = relationsResult.records.map(record => {
          const fromName = record.get('fromName');
          const toName = record.get('toName');
          const rel = record.get('r').properties;

          return this.relationshipToRelation(rel, fromName, toName);
        });

        const timeTaken = Date.now() - startTime;

        // Record metrics (cache status 'disabled' until cache is implemented)
        endTimer('disabled');

        // Return the search results as a graph
        return {
          entities,
          relations,
          total: entities.length,
          timeTaken,
        };
      }

      const timeTaken = Date.now() - startTime;

      // Record metrics (cache status 'disabled' until cache is implemented)
      endTimer('disabled');

      // Return just the entities if no relations
      return {
        entities,
        relations: [],
        total: entities.length,
        timeTaken,
      };
    } catch (error) {
      logger.error('Error searching nodes in Neo4j', error);
      throw error;
    }
  }

  /**
   * Open specific nodes by their exact names
   * @param names Array of node names to open
   */
  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    // Start Prometheus metrics timer
    const metrics = PrometheusMetrics.getInstance();
    const endTimer = metrics.startQueryTimer('openNodes');

    try {
      const startTime = Date.now();

      if (!names || names.length === 0) {
        endTimer('disabled');
        return { entities: [], relations: [] };
      }

      // Query for entities by name
      const entityQuery = `
        MATCH (e:Entity)
        WHERE e.name IN $names
        AND e.validTo IS NULL
        RETURN e
      `;

      // Execute query to get entities
      const entityResult = await this.connectionManager.executeQuery(entityQuery, { names });

      // Process entity results
      const entities = entityResult.records.map(record => {
        const node = record.get('e').properties;
        return this.nodeToEntity(node);
      });

      // Get relations between the specified entities
      const relationsQuery = `
        MATCH (from:Entity)-[r:RELATES_TO]->(to:Entity)
        WHERE from.name IN $names
        AND to.name IN $names
        AND r.validTo IS NULL
        RETURN from.name AS fromName, to.name AS toName, r
      `;

      // Execute query to get relations
      const relationsResult = await this.connectionManager.executeQuery(relationsQuery, { names });

      // Process relation results
      const relations = relationsResult.records.map(record => {
        const fromName = record.get('fromName');
        const toName = record.get('toName');
        const rel = record.get('r').properties;

        return this.relationshipToRelation(rel, fromName, toName);
      });

      const timeTaken = Date.now() - startTime;

      // Record metrics (cache status 'disabled' until cache is implemented)
      endTimer('disabled');

      // Return the entities and their relations
      return {
        entities,
        relations,
        total: entities.length,
        timeTaken,
      };
    } catch (error) {
      logger.error('Error opening nodes in Neo4j', error);
      throw error;
    }
  }

  /**
   * Scan current entities ranked by approximate serialized size, largest first.
   *
   * Size is computed entirely in Cypher and only a compact projection is
   * returned (name, type, char/observation/relation counts) — never full
   * entities — so this scan can never itself breach the MCP output cap it
   * exists to police. Observations may be stored as a JSON string or a list;
   * both forms are handled via valueType() (Neo4j 5.13+).
   *
   * @param limit Maximum number of (largest) entities to return
   * @returns Ranked size rows, largest approxChars first
   */
  async scanEntitySizes(limit: number): Promise<EntitySizeScanRow[]> {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50;

    // obsChars: characters contributed by observations, deliberately biased HIGH
    //   so a many-short-observation entity (whose real open_nodes JSON carries
    //   large per-line indentation overhead) is not ranked below the top-N and
    //   missed. String form => its JSON length + ~10 chars/element for the
    //   pretty-print indentation the raw string omits; list form => sum of
    //   element lengths + ~12 chars/element (8-space indent + quotes + comma).
    //   coalesce guards a null element (which would null the whole rank, and
    //   Neo4j sorts nulls FIRST, spuriously promoting it). obsCount is the
    //   element count for both forms (string form approximated via split).
    // approxChars: obsChars + a fixed structural/metadata overhead + a small
    //   per-relation term. Only used for RANKING; precise sizing is refined
    //   against the real entity for the returned top-N.
    const query = `
      MATCH (e:Entity)
      WHERE e.validTo IS NULL
      WITH e,
        CASE
          WHEN e.observations IS NULL THEN 0
          WHEN valueType(e.observations) STARTS WITH 'STRING'
            THEN size(e.observations) + (size(split(e.observations, '","')) * 10)
          WHEN valueType(e.observations) STARTS WITH 'LIST'
            THEN reduce(s = 0, o IN e.observations | s + size(coalesce(toString(o), '')) + 12)
          ELSE 0
        END AS obsChars,
        CASE
          WHEN e.observations IS NULL THEN 0
          WHEN valueType(e.observations) STARTS WITH 'LIST' THEN size(e.observations)
          WHEN valueType(e.observations) STARTS WITH 'STRING' THEN size(split(e.observations, '","'))
          ELSE 0
        END AS obsCount
      OPTIONAL MATCH (e)-[r:RELATES_TO]-(:Entity)
      WHERE r.validTo IS NULL
      WITH e, obsChars, obsCount, count(DISTINCT r) AS relCount
      RETURN
        e.name AS name,
        e.entityType AS entityType,
        obsChars AS obsChars,
        obsCount AS obsCount,
        relCount AS relCount,
        (obsChars + 200 + relCount * 8) AS approxChars
      ORDER BY approxChars DESC
      LIMIT toInteger($limit)
    `;

    const result = await this.connectionManager.executeQuery(query, { limit: safeLimit });

    return result.records.map(record => {
      const toNum = (value: unknown): number => Number(this.convertNeo4jInt(value) ?? 0);
      return {
        name: record.get('name') as string,
        entityType: (record.get('entityType') as string) ?? '',
        approxChars: toNum(record.get('approxChars')),
        obsChars: toNum(record.get('obsChars')),
        obsCount: toNum(record.get('obsCount')),
        relCount: toNum(record.get('relCount')),
      };
    });
  }

  // -------------------------------------------------------------------------
  // Temporal versioning
  //
  // Every write path that supersedes an existing entity version funnels through
  // `versionEntities`. Before v2.9.0 each path carried its own copy of the
  // close-old / create-new / recreate-relationships dance, and they disagreed
  // in ways that corrupted the graph (see CHANGELOG 2.9.0):
  //
  //   - relationship copies used CREATE, so a batch containing BOTH ends of a
  //     relationship copied it twice (once as A's outgoing, once as B's
  //     incoming) and the count doubled on every joint batch;
  //   - some paths opened a new live version without closing the previous one,
  //     leaving several `validTo IS NULL` versions per name (the composite
  //     `(name, validTo)` constraint does not catch this — Neo4j exempts rows
  //     with a NULL in the constrained property set);
  //   - `deleteObservations` versioned the node but neither closed nor copied
  //     its relationships, stranding live edges on a stale version.
  // -------------------------------------------------------------------------

  /**
   * Pre-flight circuit breaker run before any relationship is loaded.
   *
   * Versioning an entity has to read every live relationship of the version it
   * supersedes into transaction memory. Past a few thousand edges that alone
   * exhausts `db.memory.transaction.max` and every write on the database starts
   * failing. Counting first is cheap (a streaming aggregate, nothing is
   * materialised) and turns an opaque out-of-memory failure into an actionable
   * error naming the entity and the repair command.
   *
   * @param txc Open transaction
   * @param names Entity names about to be versioned
   * @throws Error when any name exceeds `NEO4J_MAX_LIVE_RELATIONSHIPS`
   */
  private async assertLiveRelationshipBudget(txc: Transaction, names: string[]): Promise<void> {
    if (names.length === 0) {
      return;
    }

    const result = await txc.run(
      `
      UNWIND $names AS name
      MATCH (e:Entity {name: name})
      WHERE e.validTo IS NULL
      OPTIONAL MATCH (e)-[r:RELATES_TO]-()
      WHERE r.validTo IS NULL
      RETURN name AS name, count(r) AS relCount
      `,
      { names }
    );

    for (const record of result.records) {
      const count = Number(this.convertNeo4jInt(record.get('relCount')) ?? 0);
      if (count > this.maxLiveRelationships) {
        const name = record.get('name') as string;
        throw new Error(
          `Refusing to version entity "${name}": it has ${count} live relationships, above the ` +
            `NEO4J_MAX_LIVE_RELATIONSHIPS limit of ${this.maxLiveRelationships}. Copying them ` +
            `would exhaust the Neo4j transaction memory budget — ${REPAIR_COMMAND_HINT}.`
        );
      }
    }
  }

  /**
   * Normalise one raw live-version row into a {@link CurrentEntityVersion}.
   */
  private toCurrentEntityVersion(name: string, row: LiveVersionRow): CurrentEntityVersion {
    let observations: string[];
    if (typeof row.observations === 'string') {
      try {
        observations = JSON.parse(row.observations) as string[];
      } catch {
        observations = [];
      }
    } else if (Array.isArray(row.observations)) {
      observations = row.observations as string[];
    } else {
      observations = [];
    }

    return {
      id: row.id ?? null,
      name,
      entityType: row.entityType ?? '',
      domain: row.domain ?? null,
      observations,
      version: Number(this.convertNeo4jInt(row.version) ?? 0),
      createdAt: Number(this.convertNeo4jInt(row.createdAt) ?? 0),
      validFrom: Number(this.convertNeo4jInt(row.validFrom) ?? 0),
    };
  }

  /**
   * Create a new temporal version of one or more existing entities, carrying
   * their live relationships onto the new version.
   *
   * Invariants this method upholds, which callers must not reimplement:
   *
   * 1. **Every** live version of a name is closed, not just the one whose id
   *    happened to be read first. A name left with two `validTo IS NULL` rows
   *    fans out every later relationship copy across both of them.
   * 2. Relationship copies use `MERGE ... {id: rel.id}` keyed on the logical
   *    relation id, so copying the same relationship twice in one call (which
   *    happens whenever both of its endpoints are versioned together) is a
   *    no-op the second time.
   * 3. Copies attach to the counterpart's single newest **live** version,
   *    resolved after the new versions exist, so a live edge is never left
   *    pointing at a stale version.
   *
   * @param txc Open transaction — the caller owns commit/rollback
   * @param inputs Entities to version, keyed by name (duplicates are folded)
   * @returns What was versioned, skipped, missing, or left to the legacy path
   */
  private async versionEntities(
    txc: Transaction,
    inputs: EntityVersionInput[]
  ): Promise<VersionEntitiesOutcome> {
    const outcome: VersionEntitiesOutcome = {
      versioned: [],
      skipped: [],
      notFound: [],
      legacy: [],
      relationshipsCopied: 0,
    };

    if (inputs.length === 0) {
      return outcome;
    }

    // Fold duplicate names so one call never produces two live versions of the
    // same entity — the exact failure mode this helper exists to prevent.
    const inputsByName = new Map<string, EntityVersionInput[]>();
    for (const input of inputs) {
      const existing = inputsByName.get(input.name);
      if (existing) {
        existing.push(input);
      } else {
        inputsByName.set(input.name, [input]);
      }
    }
    const names = [...inputsByName.keys()];

    // Step 0: refuse before loading anything if a target is already oversized.
    await this.assertLiveRelationshipBudget(txc, names);

    // Step 1: read EVERY live version of each name (not just one).
    const fetchResult = await txc.run(
      `
      UNWIND $names AS name
      MATCH (e:Entity {name: name})
      WHERE e.validTo IS NULL
      RETURN name AS name, collect({
        id: e.id,
        entityType: e.entityType,
        domain: e.domain,
        observations: e.observations,
        version: e.version,
        createdAt: e.createdAt,
        validFrom: e.validFrom
      }) AS versions
      `,
      { names }
    );

    const liveByName = new Map<string, LiveVersionRow[]>();
    for (const record of fetchResult.records) {
      const name = record.get('name') as string | null;
      if (typeof name === 'string') {
        liveByName.set(name, (record.get('versions') as LiveVersionRow[]) ?? []);
      }
    }

    // A single boundary timestamp for the whole call keeps validTo/validFrom
    // pairs aligned across every entity versioned together.
    const now = Date.now();

    interface PendingUpdate {
      name: string;
      newId: string;
      oldIds: string[];
      version: number;
      createdAt: number;
      entityType: string;
      domain: string | null;
      observations: string;
      changedBy: string | null;
      embedding: number[] | null;
      now: number;
      current: CurrentEntityVersion;
      next: NextEntityFields;
    }
    const updates: PendingUpdate[] = [];

    for (const [name, nameInputs] of inputsByName) {
      const rows = liveByName.get(name);
      if (!rows || rows.length === 0) {
        outcome.notFound.push(name);
        continue;
      }

      // Newest live version wins as the property source; all of them get closed.
      const sorted = [...rows].sort(
        (a, b) =>
          Number(this.convertNeo4jInt(b.validFrom) ?? 0) -
          Number(this.convertNeo4jInt(a.validFrom) ?? 0)
      );
      const current = this.toCurrentEntityVersion(name, sorted[0]);

      // Apply each caller mutation in order, feeding the previous result back so
      // repeated inputs for one name compose into a single new version.
      let working = current;
      const next: NextEntityFields = {};
      let changed = false;
      for (const input of nameInputs) {
        const produced = input.apply(working);
        if (!produced) {
          continue;
        }
        changed = true;
        Object.assign(next, produced);
        working = {
          ...working,
          observations: produced.observations ?? working.observations,
          entityType: produced.entityType ?? working.entityType,
          domain: produced.domain === undefined ? working.domain : produced.domain,
        };
      }

      if (!changed) {
        outcome.skipped.push(name);
        continue;
      }

      // Legacy pre-temporal nodes have no id and cannot be versioned; hand them
      // back so the caller can apply its own in-place update.
      if (!current.id) {
        outcome.legacy.push({ current, next });
        continue;
      }

      const maxVersion = rows.reduce(
        (max, row) => Math.max(max, Number(this.convertNeo4jInt(row.version) ?? 0)),
        0
      );

      updates.push({
        name,
        newId: uuidv4(),
        oldIds: rows.map(row => row.id).filter((id): id is string => typeof id === 'string'),
        version: maxVersion + 1,
        createdAt: current.createdAt,
        entityType: next.entityType ?? current.entityType,
        domain: next.domain === undefined ? current.domain : next.domain,
        // Observations are stored as a JSON string throughout: `searchNodes`
        // regex-matches `e.observations`, which silently matches nothing
        // against a Neo4j list.
        observations: JSON.stringify(next.observations ?? current.observations),
        changedBy: next.changedBy ?? null,
        embedding: next.embedding ?? null,
        now,
        current,
        next,
      });
    }

    if (updates.length === 0) {
      return outcome;
    }

    // Step 2: read live relationships one row per relationship. Never collect()
    // a whole group — a 39k-edge group blows the transaction memory cap.
    const versionRows = updates.flatMap(update =>
      update.oldIds.map(oldId => ({ newId: update.newId, oldId }))
    );

    const relationshipProjection = `{
      relationType: r.relationType,
      strength: r.strength,
      confidence: r.confidence,
      metadata: r.metadata,
      version: r.version,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      validFrom: r.validFrom,
      changedBy: r.changedBy
    }`;

    const outgoingResult = await txc.run(
      `
      UNWIND $rows AS row
      MATCH (e:Entity {id: row.oldId})
      MATCH (e)-[r:RELATES_TO]->(other:Entity)
      WHERE r.validTo IS NULL
      RETURN row.newId AS newId, other.name AS otherName, r.id AS relId,
             ${relationshipProjection} AS props
      `,
      { rows: versionRows }
    );

    const incomingResult = await txc.run(
      `
      UNWIND $rows AS row
      MATCH (e:Entity {id: row.oldId})
      MATCH (other:Entity)-[r:RELATES_TO]->(e)
      WHERE r.validTo IS NULL
      RETURN row.newId AS newId, other.name AS otherName, r.id AS relId,
             ${relationshipProjection} AS props
      `,
      { rows: versionRows }
    );

    const toCopyRows = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      records: any[]
    ): RelationshipCopyRow[] => {
      const seen = new Set<string>();
      const copies: RelationshipCopyRow[] = [];
      for (const record of records) {
        const newId = record.get('newId') as string | null;
        const otherName = record.get('otherName') as string | null;
        if (!newId || !otherName) {
          continue;
        }
        // MERGE cannot key on a null property, and legacy rows may lack an id.
        const relId = (record.get('relId') as string | null) ?? uuidv4();
        const key = `${newId}|${relId}|${otherName}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        copies.push({
          newId,
          otherName,
          relId,
          props: (record.get('props') as Record<string, unknown>) ?? {},
        });
      }
      return copies;
    };

    const outgoingCopies = toCopyRows(outgoingResult.records);
    const incomingCopies = toCopyRows(incomingResult.records);

    // Step 3: close every live version of each name AND its live relationships.
    // Rows are flattened to scalars in JS so `DISTINCT` never has to compare a
    // map value.
    await txc.run(
      `
      UNWIND $rows AS row
      MATCH (e:Entity {id: row.oldId})
      SET e.validTo = row.now
      WITH DISTINCT e, row.now AS closedAt
      OPTIONAL MATCH (e)-[r:RELATES_TO]->()
      WHERE r.validTo IS NULL
      SET r.validTo = closedAt
      WITH DISTINCT e, closedAt
      OPTIONAL MATCH ()-[r2:RELATES_TO]->(e)
      WHERE r2.validTo IS NULL
      SET r2.validTo = closedAt
      `,
      {
        rows: updates.flatMap(update => update.oldIds.map(oldId => ({ oldId, now: update.now }))),
      }
    );

    // Step 4: create the new versions.
    await txc.run(
      `
      UNWIND $updates AS upd
      CREATE (e:Entity {
        id: upd.newId,
        name: upd.name,
        entityType: upd.entityType,
        domain: upd.domain,
        observations: upd.observations,
        version: upd.version,
        createdAt: upd.createdAt,
        updatedAt: upd.now,
        validFrom: upd.now,
        validTo: null,
        changedBy: upd.changedBy,
        embedding: upd.embedding
      })
      `,
      {
        updates: updates.map(update => ({
          newId: update.newId,
          name: update.name,
          entityType: update.entityType,
          domain: update.domain,
          observations: update.observations,
          version: update.version,
          createdAt: update.createdAt,
          changedBy: update.changedBy,
          embedding: update.embedding,
          now: update.now,
        })),
      }
    );

    // Step 5: resolve each counterpart's single newest LIVE version. Done after
    // step 4 so counterparts versioned in this same call resolve to their new
    // version, and a counterpart with no live version is simply dropped rather
    // than re-attached to a stale one.
    const counterpartNames = [
      ...new Set([...outgoingCopies, ...incomingCopies].map(copy => copy.otherName)),
    ];
    const liveIdByName = new Map<string, string>();
    if (counterpartNames.length > 0) {
      const resolved = await txc.run(
        `
        UNWIND $names AS name
        MATCH (e:Entity {name: name})
        WHERE e.validTo IS NULL
        WITH name, e ORDER BY coalesce(e.validFrom, 0) DESC
        RETURN name AS name, collect(e.id)[0] AS id
        `,
        { names: counterpartNames }
      );
      for (const record of resolved.records) {
        const name = record.get('name') as string | null;
        const id = record.get('id') as string | null;
        if (name && id) {
          liveIdByName.set(name, id);
        }
      }
    }

    // Step 6: MERGE the copies onto the new versions. MERGE on {id} makes the
    // second copy of a relationship whose BOTH ends were versioned a no-op.
    const outgoingRows = outgoingCopies
      .map(copy => ({ ...copy, otherId: liveIdByName.get(copy.otherName) }))
      .filter((copy): copy is RelationshipCopyRow & { otherId: string } => Boolean(copy.otherId));
    const incomingRows = incomingCopies
      .map(copy => ({ ...copy, otherId: liveIdByName.get(copy.otherName) }))
      .filter((copy): copy is RelationshipCopyRow & { otherId: string } => Boolean(copy.otherId));

    if (outgoingRows.length > 0) {
      await txc.run(
        `
        UNWIND $rows AS row
        MATCH (newE:Entity {id: row.newId})
        MATCH (other:Entity {id: row.otherId})
        MERGE (newE)-[r:RELATES_TO {id: row.relId}]->(other)
        ON CREATE SET r += row.props
        `,
        { rows: outgoingRows }
      );
    }

    if (incomingRows.length > 0) {
      await txc.run(
        `
        UNWIND $rows AS row
        MATCH (newE:Entity {id: row.newId})
        MATCH (other:Entity {id: row.otherId})
        MERGE (other)-[r:RELATES_TO {id: row.relId}]->(newE)
        ON CREATE SET r += row.props
        `,
        { rows: incomingRows }
      );
    }

    outcome.relationshipsCopied = outgoingRows.length + incomingRows.length;
    for (const update of updates) {
      outcome.versioned.push({
        name: update.name,
        newId: update.newId,
        previousIds: update.oldIds,
        version: update.version,
        now: update.now,
        current: update.current,
        next: update.next,
        properties: {
          id: update.newId,
          name: update.name,
          entityType: update.entityType,
          domain: update.domain,
          observations: update.observations,
          version: update.version,
          createdAt: update.createdAt,
          updatedAt: update.now,
          validFrom: update.now,
          validTo: null,
          changedBy: update.changedBy,
        },
      });
    }

    return outcome;
  }

  /**
   * Create new entities in the knowledge graph
   * @param entities Array of entities to create
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async createEntities(entities: any[]): Promise<any[]> {
    try {
      if (!entities || entities.length === 0) {
        return [];
      }

      const session = await this.connectionManager.getSession();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createdEntities: any[] = [];

      try {
        // Begin transaction
        const txc = session.beginTransaction(this.txConfig);

        try {
          // A name that already has a live version must be VERSIONED, not
          // CREATEd again: the composite (name, validTo) constraint does not
          // reject a second row with validTo NULL, so an unconditional CREATE
          // silently leaves two live versions of the same entity.
          const existingResult = await txc.run(
            `
            UNWIND $names AS name
            MATCH (e:Entity {name: name})
            WHERE e.validTo IS NULL
            RETURN DISTINCT name AS name
            `,
            { names: entities.map(entity => entity.name) }
          );
          const existingNames = new Set(
            existingResult.records
              .map(record => record.get('name') as string | null)
              .filter((name): name is string => typeof name === 'string')
          );
          const upserts: EntityVersionInput[] = [];

          for (const entity of entities) {
            // Generate temporal and identity metadata
            const now = Date.now();
            const entityId = uuidv4();

            // Add debug log for embedding generation attempts
            logger.debug(
              `Neo4jStorageProvider: Processing embeddings for entity "${entity.name}"`,
              {
                entityType: entity.entityType,
                hasEmbeddingService: !!this.embeddingService,
              }
            );

            // Generate embedding if embedding service is available
            let embedding = null;
            if (this.embeddingService) {
              try {
                // Prepare text for embedding
                const text = Array.isArray(entity.observations)
                  ? entity.observations.join('\n')
                  : '';

                // Generate embedding using the instance's embedding service
                embedding = await this.embeddingService.generateEmbedding(text);
                // Wrong-dimension vectors must never be persisted — throw into the
                // catch below so the entity is still created, with embedding=NULL.
                this.assertEmbeddingDimension(embedding);
                logger.info(`Generated embedding for entity: ${entity.name}`);
              } catch (error) {
                logger.error(`Failed to generate embedding for entity: ${entity.name}`, error);
                // Continue without embedding if generation fails
                embedding = null;
              }
            } else {
              logger.warn(
                `Neo4jStorageProvider: Skipping embedding for entity "${entity.name}" - No embedding service available`
              );
            }

            if (existingNames.has(entity.name)) {
              // Upsert: supersede the live version through the shared helper so
              // the old version is closed and its relationships carried over.
              upserts.push({
                name: entity.name,
                apply: () => ({
                  observations: Array.isArray(entity.observations) ? entity.observations : [],
                  entityType: entity.entityType,
                  domain: entity.domain || null,
                  changedBy: entity.changedBy || null,
                  embedding,
                }),
              });
              continue;
            }

            // Create entity with parameters
            const params = {
              id: entityId,
              name: entity.name,
              entityType: entity.entityType,
              domain: entity.domain || null,
              observations: JSON.stringify(entity.observations || []),
              version: 1,
              createdAt: entity.createdAt || now,
              updatedAt: entity.updatedAt || now,
              validFrom: entity.validFrom || now,
              validTo: null,
              changedBy: entity.changedBy || null,
              embedding: embedding, // Add embedding directly to entity
            };

            // Create entity query
            const createQuery = `
              CREATE (e:Entity {
                id: $id,
                name: $name,
                entityType: $entityType,
                domain: $domain,
                observations: $observations,
                version: $version,
                createdAt: $createdAt,
                updatedAt: $updatedAt,
                validFrom: $validFrom,
                validTo: $validTo,
                changedBy: $changedBy,
                embedding: $embedding
              })
              RETURN e
            `;

            // Execute query
            const result = await txc.run(createQuery, params);

            // Get created entity from result
            if (result.records.length > 0) {
              const node = result.records[0].get('e').properties;
              const createdEntity = this.nodeToEntity(node);
              createdEntities.push(createdEntity);
              logger.info(`Created entity with embedding: ${entity.name}`);
            }
          }

          if (upserts.length > 0) {
            const outcome = await this.versionEntities(txc, upserts);
            for (const versioned of outcome.versioned) {
              createdEntities.push(this.nodeToEntity(versioned.properties));
              logger.info(
                `Superseded live version of entity: ${versioned.name} (v${versioned.version})`
              );
            }
          }

          // Commit transaction
          await txc.commit();

          // Clear search cache after creating entities
          this.searchCache.clear();
          logger.debug('Neo4jStorageProvider: Cleared search cache after creating entities');

          return createdEntities;
        } catch (error) {
          // Rollback on error
          await txc.rollback();
          throw error;
        }
      } finally {
        // Close session
        await session.close();
      }
    } catch (error) {
      logger.error('Error creating entities in Neo4j', error);
      throw error;
    }
  }

  /**
   * Create new relations between entities
   * @param relations Array of relations to create
   */
  async createRelations(relations: Relation[]): Promise<Relation[]> {
    try {
      if (!relations || relations.length === 0) {
        return [];
      }

      const session = await this.connectionManager.getSession();
      const createdRelations: Relation[] = [];

      try {
        // Begin transaction
        const txc = session.beginTransaction(this.txConfig);

        try {
          for (const relation of relations) {
            // Generate temporal and identity metadata
            const now = Date.now();
            const relationId = uuidv4();

            // Check if entities exist
            const checkQuery = `
              MATCH (from:Entity {name: $fromName})
              MATCH (to:Entity {name: $toName})
              RETURN from, to
            `;

            const checkResult = await txc.run(checkQuery, {
              fromName: relation.from,
              toName: relation.to,
            });

            // If either entity doesn't exist, skip this relation
            if (checkResult.records.length === 0) {
              logger.warn(
                `Skipping relation creation: One or both entities not found (${relation.from} -> ${relation.to})`
              );
              continue;
            }

            // Create relation with parameters
            const extendedRelation = relation as ExtendedRelation;
            const params = {
              id: relationId,
              fromName: relation.from,
              toName: relation.to,
              relationType: relation.relationType,
              strength: relation.strength || null,
              confidence: relation.confidence || null,
              metadata: relation.metadata ? JSON.stringify(relation.metadata) : null,
              version: 1,
              createdAt: extendedRelation.createdAt || now,
              updatedAt: extendedRelation.updatedAt || now,
              validFrom: extendedRelation.validFrom || now,
              validTo: null,
              changedBy: extendedRelation.changedBy || null,
            };

            // Create relation query
            const createQuery = `
              MATCH (from:Entity {name: $fromName})
              MATCH (to:Entity {name: $toName})
              CREATE (from)-[r:RELATES_TO {
                id: $id,
                relationType: $relationType,
                strength: $strength,
                confidence: $confidence,
                metadata: $metadata,
                version: $version,
                createdAt: $createdAt,
                updatedAt: $updatedAt,
                validFrom: $validFrom,
                validTo: $validTo,
                changedBy: $changedBy
              }]->(to)
              RETURN r, from, to
            `;

            // Execute query
            const result = await txc.run(createQuery, params);

            // Get created relation from result
            if (result.records.length > 0) {
              const record = result.records[0];
              const rel = record.get('r').properties;
              const fromNode = record.get('from').properties;
              const toNode = record.get('to').properties;

              const createdRelation = this.relationshipToRelation(rel, fromNode.name, toNode.name);

              createdRelations.push(createdRelation);
            }
          }

          // Commit transaction
          await txc.commit();

          // Clear search cache after creating relations
          this.searchCache.clear();
          logger.debug('Neo4jStorageProvider: Cleared search cache after creating relations');

          return createdRelations;
        } catch (error) {
          // Rollback on error
          await txc.rollback();
          throw error;
        }
      } finally {
        // Close session
        await session.close();
      }
    } catch (error) {
      logger.error('Error creating relations in Neo4j', error);
      throw error;
    }
  }

  /**
   * Add observations to entities
   * @param observations Array of objects with entity name and observation contents
   */
  async addObservations(
    observations: { entityName: string; contents: string[] }[]
  ): Promise<{ entityName: string; addedObservations: string[] }[]> {
    try {
      if (!observations || observations.length === 0) {
        return [];
      }

      const session = await this.connectionManager.getSession();
      const results: { entityName: string; addedObservations: string[] }[] = [];

      try {
        // Begin transaction
        const txc = session.beginTransaction(this.txConfig);

        try {
          // One shared versioning pass for the whole call. `apply` records what
          // was genuinely new per entity so the return shape is unchanged.
          const addedByName = new Map<string, string[]>();
          const inputs: EntityVersionInput[] = [];

          for (const obs of observations) {
            if (!obs.entityName || !obs.contents || obs.contents.length === 0) {
              continue;
            }
            inputs.push({
              name: obs.entityName,
              apply: current => {
                const fresh = obs.contents.filter(
                  content => !current.observations.includes(content)
                );
                addedByName.set(obs.entityName, [
                  ...(addedByName.get(obs.entityName) ?? []),
                  ...fresh,
                ]);
                if (fresh.length === 0) {
                  return null;
                }
                return { observations: [...current.observations, ...fresh] };
              },
            });
          }

          const outcome = await this.versionEntities(txc, inputs);

          // Legacy pre-temporal entities keep their in-place update path.
          for (const { current, next } of outcome.legacy) {
            await txc.run(
              `
              MATCH (e:Entity {name: $name})
              SET e.observations = $observations
              RETURN e
              `,
              {
                name: current.name,
                observations: next.observations ?? current.observations,
              }
            );
          }

          for (const name of outcome.notFound) {
            logger.warn(`Entity not found: ${name}`);
          }

          const handled = new Set<string>([
            ...outcome.versioned.map(entity => entity.name),
            ...outcome.skipped,
            ...outcome.legacy.map(entry => entry.current.name),
          ]);
          const reported = new Set<string>();
          for (const obs of observations) {
            if (!handled.has(obs.entityName) || reported.has(obs.entityName)) {
              continue;
            }
            reported.add(obs.entityName);
            results.push({
              entityName: obs.entityName,
              addedObservations: addedByName.get(obs.entityName) ?? [],
            });
          }

          // Commit transaction
          await txc.commit();

          // Clear search cache after adding observations
          this.searchCache.clear();
          logger.debug('Neo4jStorageProvider: Cleared search cache after adding observations');

          return results;
        } catch (error) {
          // Rollback on error
          await txc.rollback();
          throw error;
        }
      } finally {
        // Close session
        await session.close();
      }
    } catch (error) {
      logger.error('Error adding observations in Neo4j', error);
      throw error;
    }
  }

  /**
   * Delete entities and their relations
   * @param entityNames Array of entity names to delete
   */
  async deleteEntities(entityNames: string[]): Promise<void> {
    try {
      if (!entityNames || entityNames.length === 0) {
        return;
      }

      const session = await this.connectionManager.getSession();

      try {
        // Begin transaction
        const txc = session.beginTransaction(this.txConfig);

        try {
          // Delete entities and their relations
          const deleteQuery = `
            MATCH (e:Entity)
            WHERE e.name IN $names
            DETACH DELETE e
          `;

          await txc.run(deleteQuery, { names: entityNames });

          // Commit transaction
          await txc.commit();

          // Clear search cache after deleting entities
          this.searchCache.clear();
          logger.debug('Neo4jStorageProvider: Cleared search cache after deleting entities');
        } catch (error) {
          // Rollback on error
          await txc.rollback();
          throw error;
        }
      } finally {
        // Close session
        await session.close();
      }
    } catch (error) {
      logger.error('Error deleting entities in Neo4j', error);
      throw error;
    }
  }

  /**
   * Delete observations from entities
   * @param deletions Array of objects with entity name and observations to delete
   */
  async deleteObservations(
    deletions: { entityName: string; observations: string[] }[]
  ): Promise<void> {
    try {
      if (!deletions || deletions.length === 0) {
        return;
      }

      const session = await this.connectionManager.getSession();

      try {
        // Begin transaction
        const txc = session.beginTransaction(this.txConfig);

        try {
          const inputs: EntityVersionInput[] = [];

          for (const deletion of deletions) {
            if (
              !deletion.entityName ||
              !deletion.observations ||
              deletion.observations.length === 0
            ) {
              continue;
            }
            inputs.push({
              name: deletion.entityName,
              apply: current => ({
                observations: current.observations.filter(
                  (obs: string) => !deletion.observations.includes(obs)
                ),
              }),
            });
          }

          // Before v2.9.0 this path versioned the node but neither closed nor
          // copied its relationships, stranding every live edge on the stale
          // version. The shared helper does both.
          const outcome = await this.versionEntities(txc, inputs);

          // Legacy pre-temporal entities keep their in-place update path.
          for (const { current, next } of outcome.legacy) {
            await txc.run(
              `
              MATCH (e:Entity {name: $name})
              SET e.observations = $observations
              RETURN e
              `,
              {
                name: current.name,
                observations: next.observations ?? current.observations,
              }
            );
          }

          for (const name of outcome.notFound) {
            logger.warn(`Entity not found: ${name}`);
          }

          // Commit transaction
          await txc.commit();

          // Clear search cache after deleting observations
          this.searchCache.clear();
          logger.debug('Neo4jStorageProvider: Cleared search cache after deleting observations');
        } catch (error) {
          // Rollback on error
          await txc.rollback();
          throw error;
        }
      } finally {
        // Close session
        await session.close();
      }
    } catch (error) {
      logger.error('Error deleting observations in Neo4j', error);
      throw error;
    }
  }

  /**
   * Delete relations from the graph
   * @param relations Array of relations to delete
   */
  async deleteRelations(relations: Relation[]): Promise<void> {
    try {
      if (!relations || relations.length === 0) {
        return;
      }

      const session = await this.connectionManager.getSession();

      try {
        // Begin transaction
        const txc = session.beginTransaction(this.txConfig);

        try {
          for (const relation of relations) {
            // Delete relation query
            const deleteQuery = `
              MATCH (from:Entity {name: $fromName})-[r:RELATES_TO]->(to:Entity {name: $toName})
              WHERE r.relationType = $relationType
              DELETE r
            `;

            await txc.run(deleteQuery, {
              fromName: relation.from,
              toName: relation.to,
              relationType: relation.relationType,
            });
          }

          // Commit transaction
          await txc.commit();

          // Clear search cache after deleting relations
          this.searchCache.clear();
          logger.debug('Neo4jStorageProvider: Cleared search cache after deleting relations');
        } catch (error) {
          // Rollback on error
          await txc.rollback();
          throw error;
        }
      } finally {
        // Close session
        await session.close();
      }
    } catch (error) {
      logger.error('Error deleting relations in Neo4j', error);
      throw error;
    }
  }

  /**
   * Get an entity by name
   * @param entityName Name of the entity to retrieve
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getEntity(entityName: string): Promise<any | null> {
    try {
      // Query for entity by name
      const query = `
        MATCH (e:Entity {name: $name})
        WHERE e.validTo IS NULL
        RETURN e
      `;

      // Execute query
      const result = await this.connectionManager.executeQuery(query, { name: entityName });

      // Return null if no entity found
      if (result.records.length === 0) {
        return null;
      }

      // Convert node to entity
      const node = result.records[0].get('e').properties;
      return this.nodeToEntity(node);
    } catch (error) {
      logger.error(`Error retrieving entity ${entityName} from Neo4j`, error);
      throw error;
    }
  }

  /**
   * Get all relations for a specific entity (both incoming and outgoing)
   * @param entityName Name of the entity
   * @returns Array of relations connected to the entity
   */
  private async getEntityRelations(entityName: string): Promise<Relation[]> {
    try {
      const query = `
        MATCH (e:Entity {name: $entityName})
        WHERE e.validTo IS NULL
        OPTIONAL MATCH (e)-[r1:RELATES_TO]->(other1:Entity)
        WHERE r1.validTo IS NULL AND other1.validTo IS NULL
        OPTIONAL MATCH (other2:Entity)-[r2:RELATES_TO]->(e)
        WHERE r2.validTo IS NULL AND other2.validTo IS NULL
        WITH e,
             COLLECT(DISTINCT {rel: r1, from: e.name, to: other1.name}) AS outgoing,
             COLLECT(DISTINCT {rel: r2, from: other2.name, to: e.name}) AS incoming
        UNWIND (outgoing + incoming) AS relData
        RETURN relData.rel AS r, relData.from AS fromName, relData.to AS toName
      `;

      const result = await this.connectionManager.executeQuery(query, { entityName });

      const relations: Relation[] = [];
      for (const record of result.records) {
        const rel = record.get('r');
        if (rel?.properties) {
          const fromName = record.get('fromName');
          const toName = record.get('toName');
          relations.push(this.relationshipToRelation(rel.properties, fromName, toName));
        }
      }

      return relations;
    } catch (error) {
      logger.error(`Error retrieving relations for entity ${entityName}`, error);
      return []; // Return empty array on error to allow hybrid retrieval to continue
    }
  }

  /**
   * Get all entities in the knowledge graph
   * @returns Array of all entities
   */
  private async getAllEntities(): Promise<Entity[]> {
    try {
      const query = `
        MATCH (e:Entity)
        WHERE e.validTo IS NULL
        RETURN e
        LIMIT 10000
      `;

      const result = await this.connectionManager.executeQuery(query, {});

      const entities: Entity[] = [];
      for (const record of result.records) {
        const node = record.get('e').properties;
        entities.push(this.nodeToEntity(node));
      }

      return entities;
    } catch (error) {
      logger.error('Error retrieving all entities', error);
      return []; // Return empty array on error
    }
  }

  /**
   * Get all relations in the knowledge graph
   * @returns Array of all relations
   */
  private async getAllRelations(): Promise<Relation[]> {
    try {
      const query = `
        MATCH (from:Entity)-[r:RELATES_TO]->(to:Entity)
        WHERE r.validTo IS NULL
          AND from.validTo IS NULL
          AND to.validTo IS NULL
        RETURN r, from.name AS fromName, to.name AS toName
        LIMIT 10000
      `;

      const result = await this.connectionManager.executeQuery(query, {});

      const relations: Relation[] = [];
      for (const record of result.records) {
        const rel = record.get('r').properties;
        const fromName = record.get('fromName');
        const toName = record.get('toName');
        relations.push(this.relationshipToRelation(rel, fromName, toName));
      }

      return relations;
    } catch (error) {
      logger.error('Error retrieving all relations', error);
      return []; // Return empty array on error
    }
  }

  /**
   * Get a specific relation by its source, target, and type
   * @param from Source entity name
   * @param to Target entity name
   * @param type Relation type
   */
  async getRelation(from: string, to: string, type: string): Promise<Relation | null> {
    try {
      // Query for relation
      const query = `
        MATCH (from:Entity {name: $fromName})-[r:RELATES_TO]->(to:Entity {name: $toName})
        WHERE r.relationType = $relationType
        AND r.validTo IS NULL
        RETURN r, from, to
      `;

      // Execute query
      const result = await this.connectionManager.executeQuery(query, {
        fromName: from,
        toName: to,
        relationType: type,
      });

      // Return null if no relation found
      if (result.records.length === 0) {
        return null;
      }

      // Convert relationship to relation
      const record = result.records[0];
      const rel = record.get('r').properties;
      const fromNode = record.get('from').properties;
      const toNode = record.get('to').properties;

      return this.relationshipToRelation(rel, fromNode.name, toNode.name);
    } catch (error) {
      logger.error(`Error retrieving relation from Neo4j`, error);
      throw error;
    }
  }

  /**
   * Update an existing relation with new properties
   * @param relation The relation with updated properties
   */
  async updateRelation(relation: Relation): Promise<void> {
    try {
      const session = await this.connectionManager.getSession();

      try {
        // Begin transaction
        const txc = session.beginTransaction(this.txConfig);

        try {
          // Step 1: Get the current relation
          const getQuery = `
            MATCH (from:Entity {name: $fromName})-[r:RELATES_TO]->(to:Entity {name: $toName})
            WHERE r.relationType = $relationType
            AND r.validTo IS NULL
            RETURN r
          `;

          const getResult = await txc.run(getQuery, {
            fromName: relation.from,
            toName: relation.to,
            relationType: relation.relationType,
          });

          if (getResult.records.length === 0) {
            throw new Error(
              `Relation not found: ${relation.from} -> ${relation.to} (${relation.relationType})`
            );
          }

          // Get relation properties
          const currentRel = getResult.records[0].get('r').properties;

          // Step 2: Update the relation with temporal versioning
          const now = Date.now();
          const newVersion = (currentRel.version ? Number(currentRel.version) : 0) + 1; // Convert BigInt to Number
          const newRelationId = uuidv4();

          // Step 3: Mark the old relation as invalid
          const invalidateQuery = `
            MATCH (from:Entity {name: $fromName})-[r:RELATES_TO {id: $id}]->(to:Entity {name: $toName})
            SET r.validTo = $now
          `;

          await txc.run(invalidateQuery, {
            fromName: relation.from,
            toName: relation.to,
            id: currentRel.id,
            now,
          });

          // Step 4: Create the new version of the relation
          const createQuery = `
            MATCH (from:Entity {name: $fromName})
            MATCH (to:Entity {name: $toName})
            CREATE (from)-[r:RELATES_TO {
              id: $id,
              relationType: $relationType,
              strength: $strength,
              confidence: $confidence,
              metadata: $metadata,
              version: $version,
              createdAt: $createdAt,
              updatedAt: $now,
              validFrom: $now,
              validTo: null,
              changedBy: $changedBy
            }]->(to)
          `;

          const extendedRelation = relation as ExtendedRelation;
          const createParams = {
            id: newRelationId,
            fromName: relation.from,
            toName: relation.to,
            relationType: relation.relationType,
            strength: relation.strength === undefined ? currentRel.strength : relation.strength,
            confidence:
              relation.confidence === undefined ? currentRel.confidence : relation.confidence,
            metadata: relation.metadata ? JSON.stringify(relation.metadata) : currentRel.metadata,
            version: newVersion,
            createdAt: currentRel.createdAt,
            now,
            changedBy: extendedRelation.changedBy || null,
          };

          await txc.run(createQuery, createParams);

          // Commit transaction
          await txc.commit();

          // Clear search cache after updating relation
          this.searchCache.clear();
          logger.debug('Neo4jStorageProvider: Cleared search cache after updating relation');
        } catch (error) {
          // Rollback on error
          await txc.rollback();
          throw error;
        }
      } finally {
        // Close session
        await session.close();
      }
    } catch (error) {
      logger.error('Error updating relation in Neo4j', error);
      throw error;
    }
  }

  /**
   * Get the history of all versions of an entity
   * @param entityName The name of the entity to retrieve history for
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getEntityHistory(entityName: string): Promise<any[]> {
    try {
      // Query for entity history
      const query = `
        MATCH (e:Entity {name: $name})
        RETURN e
        ORDER BY e.validFrom ASC
      `;

      // Execute query
      const result = await this.connectionManager.executeQuery(query, { name: entityName });

      // Return empty array if no history found
      if (result.records.length === 0) {
        return [];
      }

      // Convert nodes to entities
      return result.records.map(record => {
        const node = record.get('e').properties;
        return this.nodeToEntity(node);
      });
    } catch (error) {
      logger.error(`Error retrieving history for entity ${entityName} from Neo4j`, error);
      throw error;
    }
  }

  /**
   * Get the history of all versions of a relation
   * @param from Source entity name
   * @param to Target entity name
   * @param relationType Type of the relation
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getRelationHistory(from: string, to: string, relationType: string): Promise<any[]> {
    try {
      // Query for relation history
      const query = `
        MATCH (from:Entity {name: $fromName})-[r:RELATES_TO]->(to:Entity {name: $toName})
        WHERE r.relationType = $relationType
        RETURN r, from, to
        ORDER BY r.validFrom ASC
      `;

      // Execute query
      const result = await this.connectionManager.executeQuery(query, {
        fromName: from,
        toName: to,
        relationType,
      });

      // Return empty array if no history found
      if (result.records.length === 0) {
        return [];
      }

      // Convert relationships to relations
      return result.records.map(record => {
        const rel = record.get('r').properties;
        const fromNode = record.get('from').properties;
        const toNode = record.get('to').properties;

        return this.relationshipToRelation(rel, fromNode.name, toNode.name);
      });
    } catch (error) {
      logger.error(`Error retrieving relation history from Neo4j`, error);
      throw error;
    }
  }

  /**
   * Get the state of the knowledge graph at a specific point in time
   * @param timestamp The timestamp to get the graph state at
   */
  async getGraphAtTime(timestamp: number): Promise<KnowledgeGraph> {
    try {
      const startTime = Date.now();

      // Query for entities valid at timestamp
      const entityQuery = `
        MATCH (e:Entity)
        WHERE e.validFrom <= $timestamp
        AND (e.validTo IS NULL OR e.validTo > $timestamp)
        RETURN e
      `;

      // Execute entity query
      const entityResult = await this.connectionManager.executeQuery(entityQuery, { timestamp });

      // Convert nodes to entities
      const entities = entityResult.records.map(record => {
        const node = record.get('e').properties;
        return this.nodeToEntity(node);
      });

      // Query for relations valid at timestamp
      const relationQuery = `
        MATCH (from:Entity)-[r:RELATES_TO]->(to:Entity)
        WHERE r.validFrom <= $timestamp
        AND (r.validTo IS NULL OR r.validTo > $timestamp)
        RETURN r, from.name AS fromName, to.name AS toName
      `;

      // Execute relation query
      const relationResult = await this.connectionManager.executeQuery(relationQuery, {
        timestamp,
      });

      // Convert relationships to relations
      const relations = relationResult.records.map(record => {
        const rel = record.get('r').properties;
        const fromName = record.get('fromName');
        const toName = record.get('toName');

        return this.relationshipToRelation(rel, fromName, toName);
      });

      const timeTaken = Date.now() - startTime;

      // Return the graph state at the timestamp
      return {
        entities,
        relations,
        total: entities.length,
        timeTaken,
      };
    } catch (error) {
      logger.error(`Error retrieving graph state at timestamp ${timestamp} from Neo4j`, error);
      throw error;
    }
  }

  /**
   * Get the current knowledge graph with confidence decay applied to relations
   * based on their age and the configured decay settings
   */
  async getDecayedGraph(): Promise<KnowledgeGraph> {
    try {
      // If decay is not enabled, just return the regular graph
      if (!this.decayConfig.enabled) {
        return await this.loadGraph();
      }

      const startTime = Date.now();

      // Load entities
      const entityQuery = `
        MATCH (e:Entity)
        WHERE e.validTo IS NULL
        RETURN e
      `;

      const entityResult = await this.connectionManager.executeQuery(entityQuery, {});

      const entities = entityResult.records.map(record => {
        const node = record.get('e').properties;
        return this.nodeToEntity(node);
      });

      // Calculate decay factor
      const halfLifeMs = this.decayConfig.halfLifeDays * 24 * 60 * 60 * 1000;
      const decayFactor = Math.log(0.5) / halfLifeMs;

      // Load relations and apply decay
      const relationQuery = `
        MATCH (from:Entity)-[r:RELATES_TO]->(to:Entity)
        WHERE r.validTo IS NULL
        RETURN r, from.name AS fromName, to.name AS toName
      `;

      const relationResult = await this.connectionManager.executeQuery(relationQuery, {});

      const relations = relationResult.records.map(record => {
        const rel = record.get('r').properties;
        const fromName = record.get('fromName');
        const toName = record.get('toName');

        // Create base relation
        const relation = this.relationshipToRelation(rel, fromName, toName);

        // Apply decay if confidence is present
        if (relation.confidence !== null && relation.confidence !== undefined) {
          const extendedRelation = relation as ExtendedRelation;
          // Convert BigInt timestamps to Number before arithmetic
          const validFrom = extendedRelation.validFrom ? Number(extendedRelation.validFrom) : null;
          const createdAt = extendedRelation.createdAt ? Number(extendedRelation.createdAt) : null;
          const ageTimestamp = validFrom || createdAt || startTime;
          const ageDiff = startTime - ageTimestamp;
          let decayedConfidence = relation.confidence * Math.exp(decayFactor * ageDiff);

          // Don't let confidence decay below minimum
          if (decayedConfidence < this.decayConfig.minConfidence) {
            decayedConfidence = this.decayConfig.minConfidence;
          }

          relation.confidence = decayedConfidence;
        }

        return relation;
      });

      const timeTaken = Date.now() - startTime;

      // Return the graph with decayed confidence values
      return {
        entities,
        relations,
        total: entities.length,
        timeTaken,
        diagnostics: {
          decay_info: {
            enabled: this.decayConfig.enabled,
            halfLifeDays: this.decayConfig.halfLifeDays,
            minConfidence: this.decayConfig.minConfidence,
            decayFactor,
          },
        },
      };
    } catch (error) {
      logger.error('Error getting decayed graph from Neo4j', error);
      throw error;
    }
  }

  /**
   * Return the names of currently-valid entities that have no embedding.
   *
   * Direct Cypher predicate (`e.embedding IS NULL`) so the database does the
   * filtering instead of materialising every entity into memory and inspecting
   * a stripped-down JS object — `loadGraph()` discards the `embedding` field
   * via `nodeToEntity`, so consumers that filtered on `entity.embedding` were
   * always seeing 100% of entities as "missing". This method is the right
   * primitive for `EmbeddingJobManager.scheduleIncrementalRegeneration`.
   *
   * @returns Array of entity names that need an embedding job scheduled.
   */
  async getEntityNamesMissingEmbeddings(): Promise<string[]> {
    const result = await this.connectionManager.executeQuery(
      `
      MATCH (e:Entity)
      WHERE e.validTo IS NULL AND e.embedding IS NULL
      RETURN e.name AS name
      `,
      {}
    );
    return result.records.map(r => String(r.get('name')));
  }

  /**
   * Guard: reject embedding vectors whose length does not match the configured
   * vector index dimension (`NEO4J_VECTOR_DIMENSIONS`). A mismatched write —
   * e.g. a 1536-dim vector into a 1024-dim index — can never be indexed and
   * silently corrupts semantic search. Throwing turns silent corruption into a
   * loud failed job. Inert when `vectorDimensions` is unset.
   *
   * @param vector The embedding vector about to be persisted
   */
  private assertEmbeddingDimension(vector: number[]): void {
    const expected = this.config.vectorDimensions;
    // Number.isFinite (not truthiness): parseInt of a malformed env value yields
    // NaN, which is falsy and would otherwise silently disable the guard.
    if (
      typeof expected === 'number' &&
      Number.isFinite(expected) &&
      expected > 0 &&
      Array.isArray(vector) &&
      vector.length !== expected
    ) {
      throw new Error(
        `Embedding dimension mismatch: got ${vector.length}, vector index expects ${expected} ` +
          `(NEO4J_VECTOR_DIMENSIONS). Ensure EMBEDDING_MODEL's native output dimension and ` +
          `EMBEDDING_DIMENSIONS both match the index — refusing to write a corrupt vector.`
      );
    }
  }

  /**
   * Store or update the embedding vector for an entity
   * @param entityName The name of the entity to update
   * @param embedding The embedding data to store
   */
  async updateEntityEmbedding(entityName: string, embedding: EntityEmbedding): Promise<void> {
    try {
      this.assertEmbeddingDimension(embedding.vector);

      // Verify that the entity exists
      const entity = await this.getEntity(entityName);
      if (!entity) {
        throw new Error(`Entity ${entityName} not found`);
      }

      const session = await this.connectionManager.getSession();

      try {
        // Begin transaction
        const txc = session.beginTransaction(this.txConfig);

        try {
          // Update the entity with the embedding + provenance metadata.
          // `embeddingModel` lets future drift detection use a clean predicate;
          // `embeddingGeneratedAt` enables staleness detection.
          const now = Date.now();
          const updateQuery = `
            MATCH (e:Entity {name: $name})
            WHERE e.validTo IS NULL
            SET e.embedding = $embedding,
                e.embeddingModel = $model,
                e.embeddingGeneratedAt = $generatedAt,
                e.updatedAt = $now
            RETURN e
          `;

          await txc.run(updateQuery, {
            name: entityName,
            embedding: embedding.vector,
            model: embedding.model,
            generatedAt: embedding.lastUpdated ?? now,
            now,
          });

          // Commit transaction
          await txc.commit();

          // Clear search cache after updating entity embedding
          this.searchCache.clear();
          logger.debug(
            'Neo4jStorageProvider: Cleared search cache after updating entity embedding'
          );
        } catch (error) {
          // Rollback on error
          await txc.rollback();
          throw error;
        }
      } finally {
        // Close session
        await session.close();
      }
    } catch (error) {
      logger.error(`Error updating embedding for entity ${entityName} in Neo4j`, error);
      throw error;
    }
  }

  /**
   * Get the embedding vector for an entity
   * @param entityName The name of the entity
   * @returns Promise resolving to the EntityEmbedding or null if not found
   */
  async getEntityEmbedding(entityName: string): Promise<EntityEmbedding | null> {
    try {
      // Verify that the entity exists
      const entity = await this.getEntity(entityName);
      if (!entity) {
        logger.debug(`Entity not found when retrieving embedding: ${entityName}`);
        return null;
      }

      const session = await this.connectionManager.getSession();

      try {
        // Query to get the entity with its embedding + provenance metadata
        const query = `
          MATCH (e:Entity {name: $name})
          WHERE e.validTo IS NULL
          RETURN e.embedding AS embedding,
                 e.embeddingModel AS model,
                 e.embeddingGeneratedAt AS generatedAt
        `;

        const result = await session.run(query, { name: entityName });

        if (result.records.length === 0 || !result.records[0].get('embedding')) {
          logger.debug(`No embedding found for entity: ${entityName}`);
          return null;
        }

        const record = result.records[0];
        const generatedAtRaw = record.get('generatedAt');

        return {
          vector: record.get('embedding'),
          // 'unknown' fallback for entities written before v2.3.1 (which did not stamp model)
          model: record.get('model') ?? 'unknown',
          lastUpdated:
            generatedAtRaw != null ? Number(generatedAtRaw) : entity.updatedAt || Date.now(),
        };
      } finally {
        await session.close();
      }
    } catch (error) {
      logger.error(`Error retrieving embedding for entity ${entityName} from Neo4j`, error);
      return null;
    }
  }

  /**
   * Find entities similar to a query vector
   * @param queryVector The vector to compare against
   * @param limit Maximum number of results to return
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async findSimilarEntities(queryVector: number[], limit = 10): Promise<any[]> {
    try {
      // Direct vector search implementation using the approach proven to work in our test script
      logger.debug(`Neo4jStorageProvider: Using direct vector search with ${limit} limit`);

      const session = await this.connectionManager.getSession();

      try {
        const result = await session.run(
          `
          CALL db.index.vector.queryNodes(
            'entity_embeddings',
            $limit,
            $embedding
          )
          YIELD node, score
          RETURN node.name AS name, node.entityType AS entityType, score
          ORDER BY score DESC
        `,
          {
            limit: neo4j.int(Math.floor(limit)),
            embedding: queryVector,
          }
        );

        const foundResults = result.records.length;
        logger.debug(`Neo4jStorageProvider: Direct vector search found ${foundResults} results`);

        if (foundResults > 0) {
          // Convert to entity objects
          const entityPromises = result.records.map(async record => {
            const entityName = record.get('name');
            const score = record.get('score');
            const entity = await this.getEntity(entityName);
            if (entity) {
              return {
                ...entity,
                score,
              };
            }
            return null;
          });

          const entities = (await Promise.all(entityPromises)).filter(Boolean);

          // Return only valid entities
          return entities.filter(entity => entity?.validTo === null).slice(0, limit);
        }

        logger.debug('Neo4jStorageProvider: No results from vector search');
        return [];
      } finally {
        await session.close();
      }
    } catch (error) {
      logger.error('Error finding similar entities in Neo4j', error);
      return [];
    }
  }

  /**
   * Search for entities using semantic search
   * @param query The search query text
   * @param options Search options including semantic search parameters
   */
  async semanticSearch(
    query: string,
    options: SearchOptions & Neo4jSemanticSearchOptions = {}
  ): Promise<KnowledgeGraphWithDiagnostics> {
    // Start Prometheus metrics timer
    const metrics = PrometheusMetrics.getInstance();
    const endTimer = metrics.startQueryTimer('semanticSearch');

    try {
      // Check if caching is enabled (default: true)
      const useCaching = options.useCache !== false;

      // Generate cache key for this query
      const cacheKey = useCaching ? this.generateCacheKey(query, options) : '';

      // Check cache first if caching enabled
      if (useCaching) {
        const cachedResult = this.searchCache.get(cacheKey);
        if (cachedResult) {
          logger.debug('Neo4jStorageProvider: Cache hit for semantic search', {
            query,
            cacheKey,
            entitiesCount: cachedResult.entities.length,
          });
          return cachedResult;
        }

        logger.debug('Neo4jStorageProvider: Cache miss for semantic search', {
          query,
          cacheKey,
        });
      }

      // Create diagnostics object for debugging
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const diagnostics: Record<string, any> = {
        query,
        startTime: Date.now(),
        stepsTaken: [],
        cacheKey,
        cacheHit: false,
      };

      // Log start of semantic search
      diagnostics.stepsTaken.push({
        step: 'start',
        timestamp: Date.now(),
        options: {
          query,
          hybridSearch: options.hybridSearch,
          hasQueryVector: !!options.queryVector,
          limit: options.limit,
          entityTypes: options.entityTypes,
          minSimilarity: options.minSimilarity,
        },
      });

      // Enhanced logging for semantic search
      logger.debug('Neo4jStorageProvider: Starting semantic search', {
        query,
        hybridSearch: options.hybridSearch,
        hasQueryVector: !!options.queryVector,
        limit: options.limit,
        entityTypes: options.entityTypes,
      });

      // Ensure vector store is initialized
      if (!this.vectorStore.initialized) {
        logger.info('Neo4jStorageProvider: Vector store not initialized, initializing now');
        diagnostics.stepsTaken.push({
          step: 'vectorStoreInitialization',
          timestamp: Date.now(),
          status: 'started',
        });

        try {
          await this.vectorStore.initialize();
          logger.info(
            'Neo4jStorageProvider: Vector store initialized successfully for semantic search'
          );
          diagnostics.stepsTaken.push({
            step: 'vectorStoreInitialization',
            timestamp: Date.now(),
            status: 'success',
          });
        } catch (initError) {
          logger.error(
            'Neo4jStorageProvider: Failed to initialize vector store for semantic search',
            initError
          );
          diagnostics.stepsTaken.push({
            step: 'vectorStoreInitialization',
            timestamp: Date.now(),
            status: 'error',
            error: initError instanceof Error ? initError.message : String(initError),
          });
          // We'll continue but might fail if the vector operations are called
        }
      }

      // If no embedding service, log a warning
      if (this.embeddingService) {
        diagnostics.stepsTaken.push({
          step: 'embeddingServiceCheck',
          timestamp: Date.now(),
          status: 'available',
          model: this.embeddingService.getProviderInfo().model,
          dimensions: this.embeddingService.getProviderInfo().dimensions,
        });
      } else {
        logger.warn('Neo4jStorageProvider: No embedding service available for semantic search');
        diagnostics.stepsTaken.push({
          step: 'embeddingServiceCheck',
          timestamp: Date.now(),
          status: 'unavailable',
        });
      }

      // Generate query vector if not provided and embedding service is available
      if (!options.queryVector && this.embeddingService) {
        try {
          logger.debug('Neo4jStorageProvider: Generating query vector for semantic search');
          diagnostics.stepsTaken.push({
            step: 'generateQueryEmbedding',
            timestamp: Date.now(),
            status: 'started',
          });

          options.queryVector = await this.embeddingService.generateEmbedding(query);

          diagnostics.stepsTaken.push({
            step: 'generateQueryEmbedding',
            timestamp: Date.now(),
            status: 'success',
            vectorLength: options.queryVector.length,
            sampleValues: options.queryVector.slice(0, 3),
          });

          logger.debug('Neo4jStorageProvider: Query vector generated successfully', {
            vectorLength: options.queryVector.length,
          });
        } catch (embedError) {
          diagnostics.stepsTaken.push({
            step: 'generateQueryEmbedding',
            timestamp: Date.now(),
            status: 'error',
            error: embedError instanceof Error ? embedError.message : String(embedError),
          });

          logger.error(
            'Neo4jStorageProvider: Failed to generate query vector for semantic search',
            embedError
          );
        }
      }

      if (options.queryVector) {
        diagnostics.stepsTaken.push({
          step: 'searchMethod',
          timestamp: Date.now(),
          method: 'vectorOnly',
        });

        // ?? (not ||) so an explicit limit of 0 stays 0 instead of widening to 10
        const searchLimit = Math.floor(options.limit ?? 10);
        // Default 0 (no similarity floor) — `??` so an explicit 0 is honoured
        const minSimilarity = options.minSimilarity ?? 0;

        diagnostics.stepsTaken.push({
          step: 'vectorSearch',
          timestamp: Date.now(),
          status: 'started',
          limit: searchLimit,
          minSimilarity,
        });

        // DIRECT VECTOR SEARCH IMPLEMENTATION
        // Instead of using findSimilarEntities - which isn't working in the MCP context
        // we'll directly use the working technique from our test script
        try {
          const session = await this.connectionManager.getSession();

          try {
            // Build domain filter if provided
            let domainFilter = '';
            if (options.includeNullDomain) {
              domainFilter = 'AND node.domain IS NULL';
            } else if (options.domain) {
              domainFilter = 'AND node.domain = $domain';
            }
            const queryParams: Record<string, unknown> = {
              limit: neo4j.int(searchLimit),
              embedding: options.queryVector,
              minScore: minSimilarity,
            };
            if (options.domain && !options.includeNullDomain) {
              queryParams.domain = options.domain;
            }

            const vectorResult = await session.run(
              `
              CALL db.index.vector.queryNodes(
                'entity_embeddings',
                $limit,
                $embedding
              )
              YIELD node, score
              WHERE score >= $minScore ${domainFilter}
              RETURN node.name AS name, node.entityType AS entityType, score
              ORDER BY score DESC
            `,
              queryParams
            );

            const foundResults = vectorResult.records.length;
            logger.debug(
              `Neo4jStorageProvider: Direct vector search found ${foundResults} results`
            );

            if (foundResults > 0) {
              // Convert to EntityData objects with similarity scores
              const vectorSearchResults = vectorResult.records.map(record => ({
                id: record.get('name'),
                similarity: record.get('score'),
                metadata: {
                  entityType: record.get('entityType'),
                  searchMethod: 'vector',
                },
              }));

              const entityPromises = vectorSearchResults.map(async result => {
                return this.getEntity(result.id as string);
              });

              const entities = (await Promise.all(entityPromises)).filter(Boolean);

              diagnostics.stepsTaken.push({
                step: 'vectorSearch',
                timestamp: Date.now(),
                status: 'completed',
                resultsCount: entities.length,
              });

              // If no entities found after filtering, return empty result
              if (entities.length === 0) {
                diagnostics.endTime = Date.now();
                diagnostics.totalTimeTaken = diagnostics.endTime - diagnostics.startTime;

                // Only include diagnostics if DEBUG is enabled
                const result: KnowledgeGraphWithDiagnostics = { entities: [], relations: [] };
                if (process.env.DEBUG === 'true') {
                  result.diagnostics = diagnostics;
                }

                return result;
              }

              // Check if hybrid retrieval is enabled (defaults to true for hybridSearch)
              const enableHybridRetrieval =
                options.enableHybridRetrieval !== false &&
                (options.hybridSearch === true || options.hybridSearch === undefined);

              let _finalEntities = entities;
              let finalEntityNames = entities.map(e => e.name);

              if (enableHybridRetrieval) {
                diagnostics.stepsTaken.push({
                  step: 'hybridReranking',
                  timestamp: Date.now(),
                  status: 'started',
                });

                try {
                  // Get all relations for the entities
                  const relationsMap = new Map<string, Relation[]>();
                  for (const entity of entities) {
                    const entityRelations = await this.getEntityRelations(entity.name);
                    relationsMap.set(entity.name, entityRelations);
                  }

                  // Get all entities and relations for graph analysis
                  const allEntitiesResult = await this.getAllEntities();
                  const allRelationsResult = await this.getAllRelations();

                  // Initialize hybrid retriever
                  const hybridRetriever = new HybridRetriever({
                    config: {
                      ...options.hybridConfig,
                      enableScoreDebug: process.env.DEBUG === 'true',
                    },
                  });

                  // Rerank results
                  const hybridResults = await hybridRetriever.rerank(
                    vectorSearchResults,
                    entities,
                    relationsMap,
                    query,
                    options.queryVector,
                    allEntitiesResult,
                    allRelationsResult
                  );

                  // Extract reranked entities (finalEntities used for potential future expansion)
                  _finalEntities = hybridResults.map(r => r.entity);
                  finalEntityNames = hybridResults.map(r => r.entity.name);

                  // Add hybrid scores to diagnostics if debug mode
                  if (process.env.DEBUG === 'true') {
                    diagnostics.hybridScores = hybridResults.map(r => ({
                      entityName: r.entity.name,
                      scores: r.scores,
                      explanation: r.scores.explanation,
                    }));
                  }

                  diagnostics.stepsTaken.push({
                    step: 'hybridReranking',
                    timestamp: Date.now(),
                    status: 'completed',
                    rerankedCount: hybridResults.length,
                  });

                  logger.debug(
                    `Neo4jStorageProvider: Hybrid reranking completed with ${hybridResults.length} results`
                  );
                } catch (error) {
                  logger.error(
                    `Neo4jStorageProvider: Hybrid reranking failed, falling back to vector-only results`,
                    error
                  );
                  diagnostics.stepsTaken.push({
                    step: 'hybridReranking',
                    timestamp: Date.now(),
                    status: 'error',
                    error: error instanceof Error ? error.message : String(error),
                  });
                  // Continue with original vector results on error
                }
              }

              // Get related relations for final entities, re-applying the
              // ranked order (openNodes does not preserve it) before caching
              const finalGraph = this.reorderEntitiesByRank(
                await this.openNodes(finalEntityNames),
                finalEntityNames
              );

              diagnostics.endTime = Date.now();
              diagnostics.totalTimeTaken = diagnostics.endTime - diagnostics.startTime;

              // Prepare result and cache it
              const result: KnowledgeGraphWithDiagnostics =
                process.env.DEBUG === 'true' ? { ...finalGraph, diagnostics } : finalGraph;

              // Cache the result if caching enabled
              if (useCaching) {
                this.searchCache.set(cacheKey, result);
                logger.debug('Neo4jStorageProvider: Cached semantic search result', {
                  cacheKey,
                  entitiesCount: result.entities.length,
                  relationsCount: result.relations.length,
                });
              }

              return result;
            } else {
              // No results from vector search
              diagnostics.stepsTaken.push({
                step: 'vectorSearch',
                timestamp: Date.now(),
                status: 'completed',
                resultsCount: 0,
              });

              diagnostics.endTime = Date.now();
              diagnostics.totalTimeTaken = diagnostics.endTime - diagnostics.startTime;

              // Only include diagnostics if DEBUG is enabled
              const result: KnowledgeGraphWithDiagnostics = { entities: [], relations: [] };
              if (process.env.DEBUG === 'true') {
                result.diagnostics = diagnostics;
              }

              // Cache the empty result if caching enabled
              if (useCaching) {
                this.searchCache.set(cacheKey, result);
              }

              return result;
            }
          } catch (error) {
            logger.error(
              `Neo4jStorageProvider: Direct vector search error: ${error instanceof Error ? error.message : String(error)}`
            );
            diagnostics.stepsTaken.push({
              step: 'vectorSearch',
              timestamp: Date.now(),
              status: 'error',
              error: error instanceof Error ? error.message : String(error),
            });
          } finally {
            await session.close();
          }
        } catch (error) {
          logger.error(
            `Neo4jStorageProvider: Direct vector search session error: ${error instanceof Error ? error.message : String(error)}`
          );
        }

        // If we get here, the direct approach failed, fall back to original implementation
        const results = await this.findSimilarEntities(
          options.queryVector,
          searchLimit * 2 // findSimilarEntities will handle neo4j.int conversion
        );

        // Filter by min similarity and entity types
        const filteredResults = results
          .filter(result => result.score >= minSimilarity)
          .filter(result => {
            if (!options.entityTypes || options.entityTypes.length === 0) {
              return true;
            }
            return options.entityTypes.includes(result.entityType);
          })
          .slice(0, searchLimit);

        diagnostics.stepsTaken.push({
          step: 'filterResults',
          timestamp: Date.now(),
          status: 'completed',
          filteredResultsCount: filteredResults.length,
        });

        // If no results, return empty graph
        if (filteredResults.length === 0) {
          diagnostics.stepsTaken.push({
            step: 'finalResult',
            timestamp: Date.now(),
            status: 'empty',
          });

          diagnostics.endTime = Date.now();
          diagnostics.totalTimeTaken = diagnostics.endTime - diagnostics.startTime;

          // Only include diagnostics if DEBUG is enabled
          const result: KnowledgeGraphWithDiagnostics = { entities: [], relations: [] };
          if (process.env.DEBUG === 'true') {
            result.diagnostics = diagnostics;
          }

          return result;
        }

        // Get the entities and relations
        const entityNames = filteredResults.map(r => r.name);

        diagnostics.stepsTaken.push({
          step: 'openNodes',
          timestamp: Date.now(),
          status: 'started',
          entityNames,
        });

        // Hydrate, then re-apply the ranked order (openNodes does not
        // preserve it) before caching
        const finalGraph = this.reorderEntitiesByRank(
          await this.openNodes(entityNames),
          entityNames
        );

        diagnostics.stepsTaken.push({
          step: 'openNodes',
          timestamp: Date.now(),
          status: 'completed',
          entitiesCount: finalGraph.entities.length,
          relationsCount: finalGraph.relations.length,
        });

        diagnostics.endTime = Date.now();
        diagnostics.totalTimeTaken = diagnostics.endTime - diagnostics.startTime;

        // Prepare result and cache it
        const result: KnowledgeGraphWithDiagnostics =
          process.env.DEBUG === 'true' ? { ...finalGraph, diagnostics } : finalGraph;

        // Cache the result if caching enabled
        if (useCaching) {
          this.searchCache.set(cacheKey, result);
        }

        return result;
      }

      // If no query vector provided, fall back to text search
      diagnostics.stepsTaken.push({
        step: 'searchMethod',
        timestamp: Date.now(),
        method: 'textOnly',
        reason: 'No query vector available',
      });

      const textSearchLimit = Math.floor(options.limit ?? 10);

      diagnostics.stepsTaken.push({
        step: 'textSearch',
        timestamp: Date.now(),
        status: 'started',
        limit: textSearchLimit,
      });

      const textResults = await this.searchNodes(query, { ...options, limit: textSearchLimit });

      diagnostics.stepsTaken.push({
        step: 'textSearch',
        timestamp: Date.now(),
        status: 'completed',
        resultsCount: textResults.entities.length,
        timeTaken: textResults.timeTaken,
      });

      diagnostics.endTime = Date.now();
      diagnostics.totalTimeTaken = diagnostics.endTime - diagnostics.startTime;

      // Prepare result and cache it
      const result: KnowledgeGraphWithDiagnostics =
        process.env.DEBUG === 'true' ? { ...textResults, diagnostics } : textResults;

      // Cache the text search fallback result if caching enabled
      if (useCaching) {
        this.searchCache.set(cacheKey, result);
      }

      return result;
    } catch (error) {
      logger.error('Error performing semantic search in Neo4j', error);
      throw error;
    } finally {
      // Record metrics (cache status 'disabled' until cache is implemented)
      endTimer('disabled');
    }
  }

  /**
   * Direct diagnostic method to check Neo4j vector embeddings
   * Bypasses all abstractions to query the database directly
   */
  async diagnoseVectorSearch(): Promise<Record<string, unknown>> {
    try {
      // First, make sure vector store is initialized
      if (!this.vectorStore.initialized) {
        try {
          await this.vectorStore.initialize();
        } catch {
          // Continue even if initialization fails
        }
      }

      // Check if we can access the diagnostic method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof (this.vectorStore as any).diagnosticGetEntityEmbeddings === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (this.vectorStore as any).diagnosticGetEntityEmbeddings();
      } else {
        return {
          error: 'Diagnostic method not available',
          vectorStoreType: this.vectorStore.constructor.name,
        };
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Optimized batch creation of entities using bulk operations
   * Uses UNWIND for efficient bulk inserts and parallel embedding generation
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async createEntitiesBatch(entities: any[], config?: BatchConfig): Promise<BatchResult<any>> {
    const startTime = Date.now();
    const maxBatchSize = config?.maxBatchSize || 100;
    const _enableParallel = config?.enableParallel !== false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const successful: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const failed: { item: any; error: string }[] = [];

    try {
      // Split into chunks based on maxBatchSize
      const chunks = [];
      for (let i = 0; i < entities.length; i += maxBatchSize) {
        chunks.push(entities.slice(i, i + maxBatchSize));
      }

      for (const chunk of chunks) {
        // Generate embeddings if service available (parallel processing controlled by Promise.all)
        const entitiesWithEmbeddings = await Promise.all(
          chunk.map(async entity => {
            let embedding = null;
            if (this.embeddingService) {
              try {
                const text = Array.isArray(entity.observations)
                  ? entity.observations.join('\n')
                  : '';
                embedding = await this.embeddingService.generateEmbedding(text);
                // Same write-path dimension guard as createEntities: a mismatched
                // vector throws into the catch and the entity persists with NULL.
                this.assertEmbeddingDimension(embedding);
              } catch (error) {
                logger.warn(`Failed to generate embedding for entity: ${entity.name}`, error);
                embedding = null;
              }
            }

            const now = Date.now();
            return {
              id: uuidv4(),
              name: entity.name,
              entityType: entity.entityType,
              domain: entity.domain || null,
              observations: JSON.stringify(entity.observations || []),
              version: 1,
              createdAt: entity.createdAt || now,
              updatedAt: entity.updatedAt || now,
              validFrom: entity.validFrom || now,
              validTo: null,
              changedBy: entity.changedBy || null,
              embedding: embedding,
            };
          })
        );

        // Use UNWIND for bulk insert
        const session = await this.connectionManager.getSession();
        try {
          const txc = session.beginTransaction(this.txConfig);

          try {
            // Names that already have a live version must be VERSIONED, not
            // CREATEd again — the composite (name, validTo) constraint does not
            // reject a second row whose validTo is NULL, so an unconditional
            // CREATE silently leaves two live versions of the same entity.
            const existingResult = await txc.run(
              `
              UNWIND $names AS name
              MATCH (e:Entity {name: name})
              WHERE e.validTo IS NULL
              RETURN DISTINCT name AS name
              `,
              { names: entitiesWithEmbeddings.map(entity => entity.name) }
            );
            const existingNames = new Set(
              existingResult.records
                .map(record => record.get('name') as string | null)
                .filter((name): name is string => typeof name === 'string')
            );

            const fresh = entitiesWithEmbeddings.filter(entity => !existingNames.has(entity.name));
            const upserts = entitiesWithEmbeddings.filter(entity => existingNames.has(entity.name));

            if (fresh.length > 0) {
              const query = `
              UNWIND $entities AS entity
              CREATE (e:Entity {
                id: entity.id,
                name: entity.name,
                entityType: entity.entityType,
                domain: entity.domain,
                observations: entity.observations,
                version: entity.version,
                createdAt: entity.createdAt,
                updatedAt: entity.updatedAt,
                validFrom: entity.validFrom,
                validTo: entity.validTo,
                changedBy: entity.changedBy,
                embedding: entity.embedding
              })
              RETURN e
            `;

              await txc.run(query, { entities: fresh });
            }

            if (upserts.length > 0) {
              await this.versionEntities(
                txc,
                upserts.map(entity => ({
                  name: entity.name,
                  apply: () => ({
                    observations: JSON.parse(entity.observations) as string[],
                    entityType: entity.entityType,
                    domain: entity.domain,
                    changedBy: entity.changedBy,
                    embedding: entity.embedding,
                  }),
                }))
              );
            }

            await txc.commit();

            successful.push(...chunk);

            // Report progress if callback provided
            if (config?.onProgress) {
              config.onProgress({
                total: entities.length,
                completed: successful.length,
                failed: failed.length,
                percentage: (successful.length / entities.length) * 100,
              });
            }
          } catch (error) {
            await txc.rollback();
            // Add all items in chunk to failed
            for (const entity of chunk) {
              failed.push({
                item: entity,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        } finally {
          await session.close();
        }
      }

      // Clear search cache after creating entities
      this.searchCache.clear();

      const totalTimeMs = Date.now() - startTime;
      return {
        successful,
        failed,
        totalTimeMs,
        avgTimePerItemMs: totalTimeMs / entities.length,
      };
    } catch (error) {
      logger.error('Error in createEntitiesBatch', error);
      throw error;
    }
  }

  /**
   * Optimized batch creation of relations using bulk operations
   */
  async createRelationsBatch(
    relations: Relation[],
    config?: BatchConfig
  ): Promise<BatchResult<Relation>> {
    const startTime = Date.now();
    const maxBatchSize = config?.maxBatchSize || 100;
    const successful: Relation[] = [];
    const failed: { item: Relation; error: string }[] = [];

    try {
      const chunks = [];
      for (let i = 0; i < relations.length; i += maxBatchSize) {
        chunks.push(relations.slice(i, i + maxBatchSize));
      }

      for (const chunk of chunks) {
        const session = await this.connectionManager.getSession();
        try {
          const txc = session.beginTransaction(this.txConfig);

          try {
            const now = Date.now();
            const relationsWithMetadata = chunk.map(rel => ({
              id: uuidv4(),
              from: rel.from,
              to: rel.to,
              relationType: rel.relationType,
              strength: rel.strength ?? null,
              confidence: rel.confidence ?? null,
              metadata: rel.metadata ? JSON.stringify(rel.metadata) : null,
              version: 1,
              createdAt: now,
              updatedAt: now,
              validFrom: now,
              validTo: null,
              changedBy: null,
            }));

            const query = `
              UNWIND $relations AS rel
              MATCH (from:Entity {name: rel.from})
              WHERE from.validTo IS NULL
              MATCH (to:Entity {name: rel.to})
              WHERE to.validTo IS NULL
              CREATE (from)-[r:RELATES_TO {
                id: rel.id,
                relationType: rel.relationType,
                strength: rel.strength,
                confidence: rel.confidence,
                metadata: rel.metadata,
                version: rel.version,
                createdAt: rel.createdAt,
                updatedAt: rel.updatedAt,
                validFrom: rel.validFrom,
                validTo: rel.validTo,
                changedBy: rel.changedBy
              }]->(to)
              RETURN r
            `;

            await txc.run(query, { relations: relationsWithMetadata });
            await txc.commit();

            successful.push(...chunk);

            if (config?.onProgress) {
              config.onProgress({
                total: relations.length,
                completed: successful.length,
                failed: failed.length,
                percentage: (successful.length / relations.length) * 100,
              });
            }
          } catch (error) {
            await txc.rollback();
            for (const rel of chunk) {
              failed.push({
                item: rel,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        } finally {
          await session.close();
        }
      }

      this.searchCache.clear();

      const totalTimeMs = Date.now() - startTime;
      return {
        successful,
        failed,
        totalTimeMs,
        avgTimePerItemMs: totalTimeMs / relations.length,
      };
    } catch (error) {
      logger.error('Error in createRelationsBatch', error);
      throw error;
    }
  }

  /**
   * Optimized batch addition of observations to entities
   */
  async addObservationsBatch(
    batches: ObservationBatch[],
    config?: BatchConfig
  ): Promise<BatchResult<ObservationBatch>> {
    const startTime = Date.now();
    const successful: ObservationBatch[] = [];
    const failed: { item: ObservationBatch; error: string }[] = [];
    const maxBatchSize = config?.maxBatchSize || 100;

    try {
      // Split into chunks
      const chunks = [];
      for (let i = 0; i < batches.length; i += maxBatchSize) {
        chunks.push(batches.slice(i, i + maxBatchSize));
      }

      for (const chunk of chunks) {
        const session = await this.connectionManager.getSession();
        try {
          const txc = session.beginTransaction(this.txConfig);

          try {
            const inputs: EntityVersionInput[] = [];
            for (const batch of chunk) {
              inputs.push({
                name: batch.entityName,
                apply: current => {
                  const fresh = (batch.observations ?? []).filter(
                    obs => !current.observations.includes(obs)
                  );
                  if (fresh.length === 0) {
                    return null;
                  }
                  return { observations: [...current.observations, ...fresh] };
                },
              });
            }

            // Before v2.9.0 this method copied relationships with CREATE, once
            // as the source's outgoing edge and once as the target's incoming
            // edge. A chunk holding BOTH ends of a relationship therefore
            // doubled it, and doubled again on every subsequent joint batch.
            // The shared helper MERGEs on the relation id, so the second copy
            // is a no-op.
            const outcome = await this.versionEntities(txc, inputs);

            // Legacy pre-temporal entities keep their in-place update path.
            for (const { current, next } of outcome.legacy) {
              await txc.run(
                `
                MATCH (e:Entity {name: $name})
                SET e.observations = $observations
                RETURN e
                `,
                {
                  name: current.name,
                  observations: next.observations ?? current.observations,
                }
              );
            }

            const resolved = new Map<string, 'ok' | 'notFound'>();
            for (const name of outcome.notFound) {
              resolved.set(name, 'notFound');
            }
            for (const name of outcome.skipped) {
              resolved.set(name, 'ok');
            }
            for (const entity of outcome.versioned) {
              resolved.set(entity.name, 'ok');
            }
            for (const entry of outcome.legacy) {
              resolved.set(entry.current.name, 'ok');
            }

            for (const batch of chunk) {
              if (resolved.get(batch.entityName) === 'ok') {
                successful.push(batch);
              } else {
                failed.push({
                  item: batch,
                  error: `Entity not found: ${batch.entityName}`,
                });
              }
            }

            await txc.commit();

            if (config?.onProgress) {
              config.onProgress({
                total: batches.length,
                completed: successful.length,
                failed: failed.length,
                percentage: (successful.length / batches.length) * 100,
              });
            }
          } catch (error) {
            await txc.rollback();
            throw error;
          }
        } finally {
          await session.close();
        }
      }

      const totalTimeMs = Date.now() - startTime;
      return {
        successful,
        failed,
        totalTimeMs,
        avgTimePerItemMs: totalTimeMs / (successful.length + failed.length),
      };
    } catch (error) {
      logger.error('Error in addObservationsBatch', error);
      throw error;
    }
  }

  /**
   * Optimized batch update of entities
   */
  async updateEntitiesBatch(
    updates: EntityUpdate[],
    config?: BatchConfig
  ): Promise<BatchResult<EntityUpdate>> {
    const startTime = Date.now();
    const successful: EntityUpdate[] = [];
    const failed: { item: EntityUpdate; error: string }[] = [];

    try {
      // One versioning pass per entity, covering entityType, domain, and
      // observation additions together. Before v2.9.0 entityType and domain
      // changes were applied with an in-place SET on the live version — no new
      // version, no temporal history, and no relationship carry-over — while
      // observation additions went through a separate addObservationsBatch
      // call. Folding all three into one versionEntities call yields exactly
      // one new version per entity per call, with its relationships intact.
      const maxBatchSize = config?.maxBatchSize || 100;
      const versionable = updates.filter(
        update =>
          Boolean(update.entityType) ||
          update.domain !== undefined ||
          (update.addObservations !== undefined && update.addObservations.length > 0)
      );

      const chunks: EntityUpdate[][] = [];
      for (let i = 0; i < versionable.length; i += maxBatchSize) {
        chunks.push(versionable.slice(i, i + maxBatchSize));
      }

      for (const chunk of chunks) {
        const session = await this.connectionManager.getSession();
        try {
          const txc = session.beginTransaction(this.txConfig);

          try {
            const inputs: EntityVersionInput[] = chunk.map(update => ({
              name: update.name,
              apply: current => {
                const next: NextEntityFields = {};
                if (update.entityType) {
                  next.entityType = update.entityType;
                }
                if (update.domain !== undefined) {
                  next.domain = update.domain;
                }
                if (update.addObservations !== undefined && update.addObservations.length > 0) {
                  const fresh = update.addObservations.filter(
                    obs => !current.observations.includes(obs)
                  );
                  if (fresh.length > 0) {
                    next.observations = [...current.observations, ...fresh];
                  }
                }
                return Object.keys(next).length > 0 ? next : null;
              },
            }));

            const outcome = await this.versionEntities(txc, inputs);

            // Legacy pre-temporal entities keep their in-place update path.
            for (const { current, next } of outcome.legacy) {
              await txc.run(
                `
                MATCH (e:Entity {name: $name})
                SET e.entityType = coalesce($entityType, e.entityType),
                    e.domain = $domain,
                    e.observations = $observations,
                    e.updatedAt = $now
                RETURN e
                `,
                {
                  name: current.name,
                  entityType: next.entityType ?? null,
                  domain: next.domain === undefined ? current.domain : next.domain,
                  observations: next.observations ?? current.observations,
                  now: Date.now(),
                }
              );
            }

            await txc.commit();

            for (const name of outcome.notFound) {
              const update = chunk.find(item => item.name === name);
              if (update) {
                failed.push({ item: update, error: `Entity not found: ${name}` });
              }
            }
          } catch (error) {
            await txc.rollback();
            for (const update of chunk) {
              failed.push({
                item: update,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        } finally {
          await session.close();
        }
      }

      // Process observation removals individually (less common operation)
      for (const update of updates) {
        try {
          if (update.removeObservations && update.removeObservations.length > 0) {
            await this.deleteObservations([
              {
                entityName: update.name,
                observations: update.removeObservations,
              },
            ]);
          }

          // Only add to successful if not already in failed
          if (!failed.find(f => f.item.name === update.name)) {
            successful.push(update);
          }

          if (config?.onProgress) {
            config.onProgress({
              total: updates.length,
              completed: successful.length,
              failed: failed.length,
              percentage: (successful.length / updates.length) * 100,
            });
          }
        } catch (error) {
          failed.push({
            item: update,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Mark remaining updates as successful if not in failed
      for (const update of updates) {
        if (
          !failed.find(f => f.item.name === update.name) &&
          !successful.find(s => s.name === update.name)
        ) {
          successful.push(update);
        }
      }

      this.searchCache.clear();

      const totalTimeMs = Date.now() - startTime;
      return {
        successful,
        failed,
        totalTimeMs,
        avgTimePerItemMs: totalTimeMs / updates.length,
      };
    } catch (error) {
      logger.error('Error in updateEntitiesBatch', error);
      throw error;
    }
  }
}
