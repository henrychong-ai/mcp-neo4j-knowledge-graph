// import path from 'path';
import { type EntitySizeConfigOverrides, getEntitySizeConfig } from './config/entitySize.js';
import type { EmbeddingJobManager } from './embeddings/EmbeddingJobManager.js';
import { prepareEntityText } from './embeddings/entityText.js';
import {
  type EntitySizeReport,
  estimateEntitySize,
  estimateFromCharCount,
  RESTRUCTURE_HINT,
} from './maintenance/EntitySizeService.js';
import { RerankerService } from './retrieval/RerankerService.js';
import type { EntitySizeScanRow, StorageProvider } from './storage/StorageProvider.js';
import {
  VectorStoreFactory,
  type VectorStoreFactoryOptions,
} from './storage/VectorStoreFactory.js';
import type { EntityEmbedding } from './types/entity-embedding.js';
import type { Relation } from './types/relation.js';
import type { VectorStore } from './types/vector-store.js';
import { logger } from './utils/logger.js';

// Extended storage provider interfaces for optional methods
interface StorageProviderWithSearchVectors extends StorageProvider {
  searchVectors(
    embedding: number[],
    limit: number,
    threshold: number
  ): Promise<{ name: string; score: number }[]>;
}

interface StorageProviderWithSemanticSearch extends StorageProvider {
  semanticSearch(query: string, options: Record<string, unknown>): Promise<KnowledgeGraph>;
}

// This interface doesn't extend StorageProvider because the return types are incompatible
interface StorageProviderWithUpdateRelation {
  updateRelation(relation: Relation): Promise<Relation>;
}

// Type guard functions
function hasSearchVectors(provider: StorageProvider): provider is StorageProviderWithSearchVectors {
  return (
    'searchVectors' in provider &&
    typeof (provider as StorageProviderWithSearchVectors).searchVectors === 'function'
  );
}

function hasSemanticSearch(
  provider: StorageProvider
): provider is StorageProviderWithSemanticSearch {
  return (
    'semanticSearch' in provider &&
    typeof (provider as StorageProviderWithSemanticSearch).semanticSearch === 'function'
  );
}

// Check if a provider has an updateRelation method that returns a Relation
function hasUpdateRelation(provider: StorageProvider): boolean {
  return (
    'updateRelation' in provider &&
    typeof (provider as unknown as StorageProviderWithUpdateRelation).updateRelation === 'function'
  );
}

// Domain is a user-defined string for namespace scoping
// Users can define their own domain values (e.g., 'medical', 'work', 'personal')
export type Domain = string;

// We are storing our memory using entities, relations, and observations in a graph structure
export interface Entity {
  name: string;
  entityType: string;
  domain?: Domain | null; // Optional domain for namespace scoping (null = uncategorized)
  observations: string[];
  embedding?: EntityEmbedding;
}

// Re-export the Relation interface for backward compatibility
export { Relation } from './types/relation.js';
export type { SemanticSearchOptions } from './types/entity-embedding.js';

// Export the KnowledgeGraph shape
export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
  total?: number;
  timeTaken?: number;
  diagnostics?: Record<string, unknown>;
}

// Re-export search types
export interface SearchResult {
  entity: Entity;
  score: number;
  matches?: {
    field: string;
    score: number;
    textMatches?: {
      start: number;
      end: number;
      text: string;
    }[];
  }[];
  explanation?: unknown;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  facets?: Record<
    string,
    {
      counts: Record<string, number>;
    }
  >;
  timeTaken: number;
}

/** Options for {@link KnowledgeGraphManager.flagOversizedEntities}. */
export interface FlagOversizedOptions extends EntitySizeConfigOverrides {
  /** When true, include OK entities in the result (default: only WARN/CRITICAL). */
  includeOk?: boolean;
}

/** Result of {@link KnowledgeGraphManager.flagOversizedEntities}. */
export interface FlagOversizedResult {
  /** Assumed MCP output cap (tokens) the sizes are measured against. */
  assumedCap: number;
  warnRatio: number;
  criticalRatio: number;
  /** Number of entities scanned/ranked. */
  scanned: number;
  flaggedCount: number;
  criticalCount: number;
  warnCount: number;
  /** Ranked size reports (largest first), filtered per includeOk. */
  entities: EntitySizeReport[];
  restructureHint: string;
  /** Set when a degraded path was taken (e.g. in-memory fallback). */
  note?: string;
  /** Set when the operation failed (fail-open — never throws). */
  error?: string;
}

interface KnowledgeGraphManagerOptions {
  storageProvider?: StorageProvider;
  embeddingJobManager?: EmbeddingJobManager;
  vectorStoreOptions?: VectorStoreFactoryOptions;
  /** When false, skip queueing embedding jobs locally. See README "Embedding Pipeline Topology". */
  writeEmbeddingsLocally?: boolean;
  /** Optional cross-encoder reranker for semantic search (additive, fail-open). */
  reranker?: RerankerService;
}

// The KnowledgeGraphManager class contains all operations to interact with the knowledge graph
export class KnowledgeGraphManager {
  private storageProvider?: StorageProvider;
  private embeddingJobManager?: EmbeddingJobManager;
  private vectorStore?: VectorStore;
  private writeEmbeddingsLocally: boolean;
  private reranker?: RerankerService;
  /** Once-per-process latch so the keyword-only fallback warn does not spam logs. */
  private static keywordFallbackWarned = false;

  constructor(options?: KnowledgeGraphManagerOptions) {
    this.storageProvider = options?.storageProvider;
    this.embeddingJobManager = options?.embeddingJobManager;
    this.writeEmbeddingsLocally = options?.writeEmbeddingsLocally ?? true;
    this.reranker = options?.reranker;

    // If no storage provider is given, log a deprecation warning
    if (!this.storageProvider) {
      logger.warn(
        'WARNING: No storage provider specified. Operations will fail without a StorageProvider implementation.'
      );
    }

    // Initialize vector store if options provided
    if (options?.vectorStoreOptions) {
      this.initializeVectorStore(options.vectorStoreOptions).catch(error => {
        logger.error('Failed to initialize vector store during construction', error);
      });
    }
  }

  private async queueEmbeddings(names: string[], priority: number): Promise<void> {
    if (!this.embeddingJobManager || !this.writeEmbeddingsLocally) return;
    for (const name of names) {
      await this.embeddingJobManager.scheduleEntityEmbedding(name, priority);
    }
  }

  /**
   * Initialize the vector store with the given options
   *
   * @param options - Options for the vector store
   */
  private async initializeVectorStore(options: VectorStoreFactoryOptions): Promise<void> {
    try {
      // Set the initialize immediately flag to true
      const factoryOptions = {
        ...options,
        initializeImmediately: true,
      };

      // Create and initialize the vector store
      this.vectorStore = await VectorStoreFactory.createVectorStore(factoryOptions);
      logger.info('Vector store initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize vector store', error);
      throw error;
    }
  }

  /**
   * Ensure vector store is initialized
   *
   * @returns Promise that resolves when the vector store is initialized
   */
  private async ensureVectorStore(): Promise<VectorStore> {
    if (!this.vectorStore) {
      // If vectorStore is not yet initialized but we have options from the storage provider,
      // try to initialize it
      if (this.storageProvider && 'vectorStoreOptions' in this.storageProvider) {
        await this.initializeVectorStore(
          (this.storageProvider as unknown as { vectorStoreOptions: VectorStoreFactoryOptions })
            .vectorStoreOptions
        );

        // If still undefined after initialization attempt, throw error
        if (!this.vectorStore) {
          throw new Error('Failed to initialize vector store');
        }
      } else {
        throw new Error('Vector store is not initialized and no options are available');
      }
    }

    return this.vectorStore;
  }

  /**
   * Update an entity's embedding in both the storage provider and vector store
   *
   * @param entityName - Name of the entity
   * @param embedding - The embedding to store
   * @private
   */
  private async updateEntityEmbedding(
    entityName: string,
    embedding: EntityEmbedding
  ): Promise<void> {
    // First, ensure we have the entity data
    if (!this.storageProvider || typeof this.storageProvider.getEntity !== 'function') {
      throw new Error('Storage provider is required to update entity embeddings');
    }

    const entity = await this.storageProvider.getEntity(entityName);
    if (!entity) {
      throw new Error(`Entity ${entityName} not found`);
    }

    // Update the storage provider
    if (this.storageProvider && typeof this.storageProvider.updateEntityEmbedding === 'function') {
      await this.storageProvider.updateEntityEmbedding(entityName, embedding);
    }

    // Update the vector store - ensure it's initialized first
    try {
      const vectorStore = await this.ensureVectorStore();

      // Add metadata for filtering
      const metadata = {
        name: entityName,
        entityType: entity.entityType,
      };

      await vectorStore.addVector(entityName, embedding.vector, metadata);
      logger.debug(`Updated vector for entity ${entityName} in vector store`);
    } catch (error) {
      logger.error(`Failed to update vector for entity ${entityName}`, error);
      throw error;
    }
  }

  /**
   * Load the knowledge graph from storage
   * @private
   */
  private async loadGraph(): Promise<KnowledgeGraph> {
    if (!this.storageProvider) {
      throw new Error('Storage provider is required to load graph');
    }
    return this.storageProvider.loadGraph();
  }

  /**
   * Save the knowledge graph to storage
   * @private
   */
  private async saveGraph(graph: KnowledgeGraph): Promise<void> {
    if (!this.storageProvider) {
      throw new Error('Storage provider is required to save graph');
    }
    return this.storageProvider.saveGraph(graph);
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    // If no entities to create, return empty array early
    if (!entities || entities.length === 0) {
      return [];
    }

    if (!this.storageProvider) {
      throw new Error('Storage provider is required to create entities');
    }

    // Use storage provider for creating entities
    const createdEntities = await this.storageProvider.createEntities(entities);

    // Add entities with existing embeddings to vector store
    for (const entity of createdEntities) {
      if (entity.embedding?.vector) {
        try {
          const vectorStore = await this.ensureVectorStore().catch(() => {});
          if (vectorStore) {
            // Add metadata for filtering
            const metadata = {
              name: entity.name,
              entityType: entity.entityType,
            };

            await vectorStore.addVector(entity.name, entity.embedding.vector, metadata);
            logger.debug(`Added vector for entity ${entity.name} to vector store`);
          }
        } catch (error) {
          logger.error(`Failed to add vector for entity ${entity.name} to vector store`, error);
          // Continue with scheduling embedding job
        }
      }
    }

    // Schedule embedding jobs if manager is provided
    await this.queueEmbeddings(
      createdEntities.map(e => e.name),
      1
    );

    return createdEntities;
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    if (!relations || relations.length === 0) {
      return [];
    }

    if (!this.storageProvider) {
      throw new Error('Storage provider is required to create relations');
    }

    // Use storage provider for creating relations
    const createdRelations = await this.storageProvider.createRelations(relations);
    return createdRelations;
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    if (!entityNames || entityNames.length === 0) {
      return;
    }

    if (!this.storageProvider) {
      throw new Error('Storage provider is required to delete entities');
    }

    // Use storage provider for deleting entities
    await this.storageProvider.deleteEntities(entityNames);

    // Remove entities from vector store if available
    try {
      // Ensure vector store is available
      const vectorStore = await this.ensureVectorStore().catch(() => {});

      if (vectorStore) {
        for (const entityName of entityNames) {
          try {
            await vectorStore.removeVector(entityName);
            logger.debug(`Removed vector for entity ${entityName} from vector store`);
          } catch (error) {
            logger.error(`Failed to remove vector for entity ${entityName}`, error);
            // Don't throw here, continue with the next entity
          }
        }
      }
    } catch (error) {
      logger.error('Failed to remove vectors from vector store', error);
      // Continue even if vector store operations fail
    }
  }

  async deleteObservations(
    deletions: { entityName: string; observations: string[] }[]
  ): Promise<void> {
    if (!deletions || deletions.length === 0) {
      return;
    }

    if (!this.storageProvider) {
      throw new Error('Storage provider is required to delete observations');
    }

    // Use storage provider for deleting observations
    await this.storageProvider.deleteObservations(deletions);

    // Schedule re-embedding for affected entities if manager is provided
    await this.queueEmbeddings(
      deletions.map(d => d.entityName),
      1
    );
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    if (!relations || relations.length === 0) {
      return;
    }

    if (!this.storageProvider) {
      throw new Error('Storage provider is required to delete relations');
    }

    // Use storage provider for deleting relations
    await this.storageProvider.deleteRelations(relations);
  }

  async searchNodes(
    query: string,
    options: { domain?: string; includeNullDomain?: boolean } = {}
  ): Promise<KnowledgeGraph> {
    if (!this.storageProvider) {
      throw new Error('Storage provider is required to search nodes');
    }
    return this.storageProvider.searchNodes(query, options);
  }

  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    if (!this.storageProvider) {
      throw new Error('Storage provider is required to open nodes');
    }
    return this.storageProvider.openNodes(names);
  }

  /**
   * Flag entities whose serialized size approaches or exceeds the MCP
   * `open_nodes` output cap, so they can be restructured before they become
   * unretrievable. Ranks candidates cheaply in the storage layer (cap-immune),
   * then refines the top-N precisely by hydrating the real entities — the cap
   * applies only to tool RESPONSES, not to this internal hydration, so even
   * already-CRITICAL entities load safely here.
   *
   * Fail-open: any error is captured into the `error` field; this never throws.
   *
   * @param options Threshold overrides plus includeOk
   * @returns Ranked, classified size reports for the largest entities
   */
  async flagOversizedEntities(options?: FlagOversizedOptions): Promise<FlagOversizedResult> {
    const cfg = getEntitySizeConfig(options);
    const includeOk = options?.includeOk ?? false;

    const base = {
      assumedCap: cfg.maxTokens,
      warnRatio: cfg.warnRatio,
      criticalRatio: cfg.criticalRatio,
      restructureHint: RESTRUCTURE_HINT,
    };

    try {
      if (!this.storageProvider) {
        throw new Error('Storage provider is required to flag oversized entities');
      }

      // 1. Rank candidates cheaply in the storage layer (cap-immune projection).
      let rows: EntitySizeScanRow[];
      let note: string | undefined;
      if (typeof this.storageProvider.scanEntitySizes === 'function') {
        rows = await this.storageProvider.scanEntitySizes(cfg.scanLimit);
      } else {
        // Fallback for providers without a native scan (e.g. tests / non-Neo4j):
        // size in memory. Only reached when scanEntitySizes is absent.
        const graph = await this.storageProvider.loadGraph();
        rows = graph.entities
          .map(e => {
            const obs = e.observations ?? [];
            const obsChars = obs.reduce((s, o) => s + (o ?? '').length + 6, 0);
            return {
              name: e.name,
              entityType: e.entityType ?? '',
              obsChars,
              obsCount: obs.length,
              relCount: 0,
              approxChars: obsChars + 200,
            };
          })
          .sort((a, b) => b.approxChars - a.approxChars)
          .slice(0, cfg.scanLimit);
        note = 'storage provider has no scanEntitySizes(); used in-memory fallback';
      }

      const scanned = rows.length;

      // 2. Refine the candidates precisely by hydrating the real entities.
      const names = rows.map(r => r.name);
      const entityByName = new Map<string, Entity>();
      if (names.length > 0) {
        try {
          const graph = await this.storageProvider.openNodes(names);
          for (const e of graph.entities) {
            entityByName.set(e.name, e);
          }
        } catch (err) {
          logger.warn(
            'flagOversizedEntities: refine openNodes failed, using approximate sizes',
            err
          );
        }
      }

      const reports: EntitySizeReport[] = rows.map(row => {
        const entity = entityByName.get(row.name);
        return entity ? estimateEntitySize(entity, cfg) : estimateFromCharCount(row, cfg);
      });
      reports.sort((a, b) => b.estTokens - a.estTokens);

      const flagged = reports.filter(r => r.state !== 'OK');

      return {
        ...base,
        scanned,
        flaggedCount: flagged.length,
        criticalCount: flagged.filter(r => r.state === 'CRITICAL').length,
        warnCount: flagged.filter(r => r.state === 'WARN').length,
        entities: includeOk ? reports : flagged,
        ...(note ? { note } : {}),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('flagOversizedEntities failed', error);
      return {
        ...base,
        scanned: 0,
        flaggedCount: 0,
        criticalCount: 0,
        warnCount: 0,
        entities: [],
        error: message,
      };
    }
  }

  /**
   * Add observations to entities
   * @param observations Array of observation objects
   * @returns Promise resolving to array of added observations
   */
  async addObservations(
    observations: {
      entityName: string;
      contents: string[];
      // Additional parameters that may be present in the MCP schema but ignored by storage providers
      strength?: number;
      confidence?: number;
      metadata?: Record<string, unknown>;
      [key: string]: unknown; // Allow any other properties
    }[]
  ): Promise<{ entityName: string; addedObservations: string[] }[]> {
    if (!observations || observations.length === 0) {
      return [];
    }

    if (!this.storageProvider) {
      throw new Error('Storage provider is required to add observations');
    }

    // Extract only the fields needed by storage providers
    // Keep the simplified format for compatibility with existing storage providers
    const simplifiedObservations = observations.map(obs => ({
      entityName: obs.entityName,
      contents: obs.contents,
    }));

    // Use storage provider for adding observations
    const results = await this.storageProvider.addObservations(simplifiedObservations);

    // Schedule re-embedding for affected entities if manager is provided
    await this.queueEmbeddings(
      results.filter(r => r.addedObservations.length > 0).map(r => r.entityName),
      1
    );

    return results;
  }

  /**
   * Find entities that are semantically similar to the query
   * @param query The query text to search for
   * @param options Search options including limit and threshold
   * @returns Promise resolving to an array of matches with scores
   */
  async findSimilarEntities(
    query: string,
    options: { limit?: number; threshold?: number } = {}
  ): Promise<{ name: string; score: number }[]> {
    if (!this.embeddingJobManager) {
      throw new Error('Embedding job manager is required for semantic search');
    }

    const embeddingService = this.embeddingJobManager.embeddingService;
    if (!embeddingService) {
      throw new Error('Embedding service not available');
    }

    // Generate embedding for the query
    const embedding = await embeddingService.generateEmbedding(query);

    // If we have a vector store, use it directly
    try {
      // Ensure vector store is available
      const vectorStore = await this.ensureVectorStore().catch(() => {});

      if (vectorStore) {
        // ?? (not ||) so an explicit limit/threshold of 0 is honoured (v2.7.0)
        const limit = options.limit ?? 10;
        const minSimilarity = options.threshold ?? 0.7;

        // Search the vector store
        const results = await vectorStore.search(embedding, {
          limit,
          minSimilarity,
        });

        // Convert to the expected format
        return results.map(result => ({
          name: result.id.toString(),
          score: result.similarity,
        }));
      }
    } catch (error) {
      logger.error('Failed to search vector store', error);
      // Fall through to other methods
    }

    // If we have a vector search method in the storage provider, use it
    if (this.storageProvider && hasSearchVectors(this.storageProvider)) {
      return this.storageProvider.searchVectors(
        embedding,
        options.limit ?? 10,
        options.threshold ?? 0.7
      );
    }

    // Otherwise, return an empty result
    return [];
  }

  /**
   * Read the entire knowledge graph
   *
   * This is an alias for loadGraph() for backward compatibility
   * @returns The knowledge graph
   */
  async readGraph(): Promise<KnowledgeGraph> {
    return this.loadGraph();
  }

  /**
   * Search the knowledge graph with various options
   *
   * @param query The search query string
   * @param options Search options
   * @returns Promise resolving to a knowledge graph with search results
   */
  async search(
    query: string,
    options: {
      semanticSearch?: boolean;
      hybridSearch?: boolean;
      limit?: number;
      threshold?: number;
      minSimilarity?: number;
      entityTypes?: string[];
      facets?: string[];
      offset?: number;
      domain?: string;
      includeNullDomain?: boolean;
    } = {}
  ): Promise<KnowledgeGraph> {
    // If hybridSearch is true, always set semanticSearch to true as well
    if (options.hybridSearch) {
      options = { ...options, semanticSearch: true };
    }

    // v2.7.0: normalise an explicit limit once at the entry point — fractional
    // values floor, negatives clamp to 0 (explicit "no results"), and non-finite
    // values (NaN/Infinity) fall back to the defaults as if no limit were given.
    if (options.limit !== undefined) {
      const normalisedLimit = Number.isFinite(options.limit)
        ? Math.max(0, Math.floor(options.limit))
        : undefined;
      if (normalisedLimit !== options.limit) {
        options = { ...options, limit: normalisedLimit };
      }
    }

    // Check if semantic search is requested
    if (options.semanticSearch || options.hybridSearch) {
      // Check if we have a storage provider with semanticSearch method
      if (this.storageProvider && hasSemanticSearch(this.storageProvider)) {
        try {
          // Generate query vector if we have an embedding service
          if (this.embeddingJobManager) {
            const embeddingService = this.embeddingJobManager.embeddingService;
            if (embeddingService) {
              // Recall/return counts (v2.7.0): recall a fixed default of 10 unless the
              // caller sets an explicit limit; when a reranker is configured and no limit
              // is given, return its topK (default 5) best candidates from that recall.
              const recallLimit = options.limit ?? 10;
              const returnCount =
                options.limit ?? (this.reranker?.enabled ? this.reranker.topK : 10);
              // An explicit limit of 0 is empty by construction — skip the billable
              // query-embedding call, the recall pipeline, and any rerank call entirely.
              if (returnCount === 0) {
                return { entities: [], relations: [], total: 0 };
              }
              const queryVector = await embeddingService.generateEmbedding(query);
              const recall = await this.storageProvider.semanticSearch(query, {
                ...options,
                limit: recallLimit,
                queryVector,
              });
              return await this.maybeRerank(query, recall, returnCount);
            }
          }

          // Fall back to text search if no embedding service
          const fallbackMessage =
            'Semantic search requested but no embedding service is available — falling back to keyword-only searchNodes. Configure EMBEDDING_API_KEY (or OPENAI_API_KEY) for semantic retrieval.';
          if (KnowledgeGraphManager.keywordFallbackWarned) {
            logger.debug(fallbackMessage);
          } else {
            KnowledgeGraphManager.keywordFallbackWarned = true;
            logger.warn(fallbackMessage);
          }
          return this.applyExplicitLimit(
            await this.storageProvider.searchNodes(query, this.keywordFallbackOptions(options)),
            options.limit
          );
        } catch (error) {
          logger.error('Provider semanticSearch failed, falling back to basic search', error);
          return this.applyExplicitLimit(
            await this.storageProvider.searchNodes(query, this.keywordFallbackOptions(options)),
            options.limit
          );
        }
      } else if (this.storageProvider) {
        // Fall back to searchNodes if semanticSearch is not available in the provider
        return this.applyExplicitLimit(
          await this.storageProvider.searchNodes(query, this.keywordFallbackOptions(options)),
          options.limit
        );
      }

      // If no storage provider or its semanticSearch is not available, try internal semantic search
      if (this.embeddingJobManager) {
        try {
          // Try to use semantic search
          const results = await this.semanticSearch(query, {
            hybridSearch: options.hybridSearch || false,
            // ?? (not ||) so an explicit limit/threshold of 0 is honoured (v2.7.0)
            limit: options.limit ?? 10,
            threshold: options.threshold ?? options.minSimilarity ?? 0.5,
            entityTypes: options.entityTypes || [],
            facets: options.facets || [],
            offset: options.offset || 0,
            domain: options.domain,
            includeNullDomain: options.includeNullDomain,
          });

          return results;
        } catch (error) {
          // Log error but fall back to basic search
          logger.error('Semantic search failed, falling back to basic search', error);

          // Explicitly call searchNodes if available in the provider
          if (this.storageProvider) {
            return this.applyExplicitLimit(
              await (this.storageProvider as StorageProvider).searchNodes(
                query,
                this.keywordFallbackOptions(options)
              ),
              options.limit
            );
          }
        }
      } else {
        logger.warn('Semantic search requested but no embedding capability available');
      }
    }

    // Use basic search
    return this.searchNodes(query, {
      domain: options.domain,
      includeNullDomain: options.includeNullDomain,
    });
  }

  /**
   * Build the option set forwarded to keyword-only `searchNodes` fallbacks (v2.7.1).
   * Forwards every option the keyword path can honour — `limit` (also enforced
   * post-hoc by applyExplicitLimit), `entityTypes`, and the domain filters — so
   * degraded mode keeps as much of the semantic_search contract as possible.
   */
  private keywordFallbackOptions(options: {
    limit?: number;
    entityTypes?: string[];
    domain?: string;
    includeNullDomain?: boolean;
  }): { limit?: number; entityTypes?: string[]; domain?: string; includeNullDomain?: boolean } {
    return {
      limit: options.limit,
      entityTypes: options.entityTypes,
      domain: options.domain,
      includeNullDomain: options.includeNullDomain,
    };
  }

  /**
   * Honour an explicit caller limit on a keyword-fallback result (v2.7.0).
   * No limit given → the graph passes through unchanged (keyword search keeps
   * its own result-size semantics); an explicit limit is enforced exactly,
   * matching the documented semantic_search contract even in degraded mode.
   */
  private applyExplicitLimit(graph: KnowledgeGraph, limit?: number): KnowledgeGraph {
    if (limit === undefined) {
      return graph;
    }
    return this.trimToReturnCount(graph, graph.entities ?? [], limit);
  }

  /**
   * Trim an ordered entity list to `returnCount` and rebuild the result around it.
   *
   * Recall order is meaningful as of v2.7.0: Neo4jStorageProvider.semanticSearch reorders
   * hydrated entities to match the ranked name list, so slicing recall preserves the
   * vector/hybrid ranking. Relations are filtered to the surviving entities and `total`
   * reflects the returned entity count so it can't overstate the trimmed result.
   *
   * @param recall - The recall result whose non-entity fields are preserved
   * @param ordered - The entities in final (rerank or recall) order
   * @param returnCount - Maximum number of entities to return
   * @returns The recall result rebuilt around the trimmed, ordered entities
   */
  private trimToReturnCount(
    recall: KnowledgeGraph,
    ordered: Entity[],
    returnCount: number
  ): KnowledgeGraph {
    const entities = ordered.slice(0, returnCount);
    const names = new Set(entities.map(entity => entity.name));
    return {
      ...recall,
      entities,
      relations: (recall.relations || []).filter(
        relation => names.has(relation.from) && names.has(relation.to)
      ),
      total: entities.length,
    };
  }

  /**
   * Order semantic-search results and trim them to `returnCount`.
   *
   * With a cross-encoder reranker (RerankerService) configured, entities are reordered
   * best-first by rerank score; if the rerank ordering covers fewer entities than
   * `returnCount` (e.g. an explicit limit above the RERANK_TOP_N scoring cap), the
   * unscored remainder is appended in recall order. Strictly additive and FAIL-OPEN: if
   * no reranker is configured, the candidate set is trivial (<=1), or the rerank call
   * errors/times out/returns garbage, the recall ordering is used instead (meaningful as
   * of v2.7.0 — the provider preserves rank order through entity hydration). Every path
   * returns at most `returnCount` entities, filters relations to the surviving entities,
   * and sets `total` to the returned entity count.
   *
   * @param query - The search query
   * @param recall - The vector/hybrid recall result to reorder
   * @param returnCount - Number of results to return after ordering and trimming
   * @returns The reranked (or, on any rerank failure, recall-ordered) knowledge graph
   */
  private async maybeRerank(
    query: string,
    recall: KnowledgeGraph,
    returnCount: number
  ): Promise<KnowledgeGraph> {
    const recallEntities = recall.entities ?? [];
    if (!this.reranker?.enabled || recallEntities.length <= 1) {
      return this.trimToReturnCount(recall, recallEntities, returnCount);
    }
    try {
      const passages = recallEntities.map(entity => prepareEntityText(entity));
      const order = await this.reranker.rerank(query, passages);
      const reordered = order
        .map(index => recallEntities[index])
        .filter((entity): entity is Entity => Boolean(entity));
      if (reordered.length === 0) {
        return this.trimToReturnCount(recall, recallEntities, returnCount);
      }
      // An explicit limit above the reranker's scoring cap (RERANK_TOP_N) leaves some
      // recall entities unscored — append them in recall order to honour the limit.
      if (reordered.length < returnCount) {
        const included = new Set(reordered.map(entity => entity.name));
        for (const entity of recallEntities) {
          if (reordered.length >= returnCount) break;
          if (!included.has(entity.name)) {
            included.add(entity.name);
            reordered.push(entity);
          }
        }
      }
      return this.trimToReturnCount(recall, reordered, returnCount);
    } catch (error) {
      logger.warn('Reranker failed; returning recall order trimmed to returnCount (fail-open)', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.trimToReturnCount(recall, recallEntities, returnCount);
    }
  }

  /**
   * Perform semantic search on the knowledge graph
   *
   * @param query The search query string
   * @param options Search options
   * @returns Promise resolving to a knowledge graph with semantic search results
   */
  private async semanticSearch(
    query: string,
    options: {
      hybridSearch?: boolean;
      limit?: number;
      threshold?: number;
      entityTypes?: string[];
      facets?: string[];
      offset?: number;
      domain?: string;
      includeNullDomain?: boolean;
    } = {}
  ): Promise<KnowledgeGraph> {
    // Find similar entities using vector similarity
    const similarEntities = await this.findSimilarEntities(query, {
      limit: options.limit || 10,
      threshold: options.threshold || 0.5,
    });

    if (similarEntities.length === 0) {
      return { entities: [], relations: [] };
    }

    // Get full entity details
    const entityNames = similarEntities.map(e => e.name);
    const graph = await this.openNodes(entityNames);

    // Add scores to entities for client use
    const scoredEntities = graph.entities.map(entity => {
      const matchScore = similarEntities.find(e => e.name === entity.name)?.score || 0;
      return {
        ...entity,
        score: matchScore,
      };
    });

    // Sort by score descending
    scoredEntities.sort((a, b) => {
      const scoreA = 'score' in a ? (a as Entity & { score: number }).score : 0;
      const scoreB = 'score' in b ? (b as Entity & { score: number }).score : 0;
      return scoreB - scoreA;
    });

    return {
      entities: scoredEntities,
      relations: graph.relations,
      total: similarEntities.length,
    };
  }

  /**
   * Get a specific relation by its from, to, and type identifiers
   *
   * @param from The name of the entity where the relation starts
   * @param to The name of the entity where the relation ends
   * @param relationType The type of the relation
   * @returns The relation or null if not found
   */
  async getRelation(from: string, to: string, relationType: string): Promise<Relation | null> {
    if (!this.storageProvider || typeof this.storageProvider.getRelation !== 'function') {
      throw new Error('Storage provider with getRelation method is required');
    }
    return this.storageProvider.getRelation(from, to, relationType);
  }

  /**
   * Update a relation with new properties
   *
   * @param relation The relation to update
   * @returns The updated relation
   */
  async updateRelation(relation: Relation): Promise<Relation> {
    if (!this.storageProvider || !hasUpdateRelation(this.storageProvider)) {
      throw new Error('Storage provider with updateRelation method is required');
    }

    // Cast to the extended interface to access the method
    const provider = this.storageProvider as unknown as StorageProviderWithUpdateRelation;
    return provider.updateRelation(relation);
  }

  /**
   * Update an entity with new properties
   *
   * @param entityName The name of the entity to update
   * @param updates Properties to update
   * @returns The updated entity
   */
  async updateEntity(entityName: string, updates: Partial<Entity>): Promise<Entity> {
    if (
      !this.storageProvider ||
      !('updateEntity' in this.storageProvider) ||
      typeof (
        this.storageProvider as {
          updateEntity?: (name: string, updates: Partial<Entity>) => Promise<Entity>;
        }
      ).updateEntity !== 'function'
    ) {
      throw new Error('Storage provider with updateEntity method is required');
    }

    const result = await (
      this.storageProvider as {
        updateEntity: (name: string, updates: Partial<Entity>) => Promise<Entity>;
      }
    ).updateEntity(entityName, updates);

    if (updates.observations) {
      await this.queueEmbeddings([entityName], 2);
    }

    return result;
  }

  /**
   * Get a version of the graph with confidences decayed based on time
   *
   * @returns Graph with decayed confidences
   */
  async getDecayedGraph(): Promise<KnowledgeGraph & { decay_info?: Record<string, unknown> }> {
    if (!this.storageProvider || typeof this.storageProvider.getDecayedGraph !== 'function') {
      throw new Error('Storage provider does not support decay operations');
    }

    return this.storageProvider.getDecayedGraph();
  }

  /**
   * Get the history of an entity
   *
   * @param entityName The name of the entity to retrieve history for
   * @returns Array of entity versions
   */
  async getEntityHistory(entityName: string): Promise<Entity[]> {
    if (!this.storageProvider || typeof this.storageProvider.getEntityHistory !== 'function') {
      throw new Error('Storage provider does not support entity history operations');
    }

    return this.storageProvider.getEntityHistory(entityName);
  }

  /**
   * Get the history of a relation
   *
   * @param from The name of the entity where the relation starts
   * @param to The name of the entity where the relation ends
   * @param relationType The type of the relation
   * @returns Array of relation versions
   */
  async getRelationHistory(from: string, to: string, relationType: string): Promise<Relation[]> {
    if (!this.storageProvider || typeof this.storageProvider.getRelationHistory !== 'function') {
      throw new Error('Storage provider does not support relation history operations');
    }

    return this.storageProvider.getRelationHistory(from, to, relationType);
  }

  /**
   * Get the state of the knowledge graph at a specific point in time
   *
   * @param timestamp The timestamp (in milliseconds since epoch) to query the graph at
   * @returns The knowledge graph as it existed at the specified time
   */
  async getGraphAtTime(timestamp: number): Promise<KnowledgeGraph> {
    if (!this.storageProvider || typeof this.storageProvider.getGraphAtTime !== 'function') {
      throw new Error('Storage provider does not support temporal graph operations');
    }

    return this.storageProvider.getGraphAtTime(timestamp);
  }

  /**
   * Create multiple entities in a single optimized batch operation
   *
   * @param entities Array of entities to create
   * @param config Optional batch configuration
   * @returns Batch result with successful and failed entities
   */
  async createEntitiesBatch(
    entities: Entity[],
    config?: import('./types/batch-operations.js').BatchConfig
  ): Promise<import('./types/batch-operations.js').BatchResult<Entity>> {
    // Validate entities
    if (!Array.isArray(entities) || entities.length === 0) {
      throw new Error('Entities must be a non-empty array');
    }

    // Check for null/undefined entries (UNWIND edge case #2)
    const nullCount = entities.filter(e => e == null).length;
    if (nullCount > 0) {
      throw new Error(`Found ${nullCount} null/undefined entries in entities array`);
    }

    // Check for duplicates within batch (UNWIND edge case #4)
    const names = new Set<string>();
    const duplicates: string[] = [];
    for (const [idx, entity] of entities.entries()) {
      if (!entity.name) {
        throw new Error(`Entity at index ${idx} is missing required 'name' field`);
      }
      if (names.has(entity.name)) {
        duplicates.push(entity.name);
      }
      names.add(entity.name);
    }

    if (duplicates.length > 0) {
      throw new Error(`Duplicate entity names within batch: ${duplicates.join(', ')}`);
    }

    // Validate required fields (UNWIND edge case #3)
    for (const [idx, entity] of entities.entries()) {
      if (!entity.name || typeof entity.name !== 'string') {
        throw new Error(`Entity at index ${idx} has invalid 'name' field`);
      }
      if (!entity.entityType || typeof entity.entityType !== 'string') {
        throw new Error(`Entity at index ${idx} has invalid 'entityType' field`);
      }
      if (!Array.isArray(entity.observations)) {
        throw new TypeError(
          `Entity at index ${idx} has invalid 'observations' field (must be array)`
        );
      }
    }

    // Call storage provider's batch method
    const createEntitiesBatch = (this.storageProvider as any).createEntitiesBatch;
    if (typeof createEntitiesBatch !== 'function') {
      throw new TypeError('Storage provider does not support batch entity creation');
    }

    const result = await createEntitiesBatch.call(this.storageProvider, entities, config);

    await this.queueEmbeddings(
      result.successful.map((e: { name: string }) => e.name),
      1
    );

    return result;
  }

  /**
   * Create multiple relations in a single optimized batch operation
   *
   * @param relations Array of relations to create
   * @param config Optional batch configuration
   * @returns Batch result with successful and failed relations
   */
  async createRelationsBatch(
    relations: Relation[],
    config?: import('./types/batch-operations.js').BatchConfig
  ): Promise<import('./types/batch-operations.js').BatchResult<Relation>> {
    // Validate relations
    if (!Array.isArray(relations) || relations.length === 0) {
      throw new Error('Relations must be a non-empty array');
    }

    // Check for null/undefined entries
    const nullCount = relations.filter(r => r == null).length;
    if (nullCount > 0) {
      throw new Error(`Found ${nullCount} null/undefined entries in relations array`);
    }

    // Check for duplicates within batch
    const relationKeys = new Set<string>();
    const duplicates: string[] = [];
    for (const [_idx, relation] of relations.entries()) {
      if (!relation.from || !relation.to || !relation.relationType) {
        continue; // Will be caught by field validation below
      }
      const key = `${relation.from}->${relation.relationType}->${relation.to}`;
      if (relationKeys.has(key)) {
        duplicates.push(key);
      }
      relationKeys.add(key);
    }

    if (duplicates.length > 0) {
      throw new Error(`Duplicate relations within batch: ${duplicates.join(', ')}`);
    }

    // Validate required fields
    for (const [idx, relation] of relations.entries()) {
      if (!relation.from || typeof relation.from !== 'string') {
        throw new Error(`Relation at index ${idx} has invalid 'from' field`);
      }
      if (!relation.to || typeof relation.to !== 'string') {
        throw new Error(`Relation at index ${idx} has invalid 'to' field`);
      }
      if (!relation.relationType || typeof relation.relationType !== 'string') {
        throw new Error(`Relation at index ${idx} has invalid 'relationType' field`);
      }
    }

    // Call storage provider's batch method
    const createRelationsBatch = (this.storageProvider as any).createRelationsBatch;
    if (typeof createRelationsBatch !== 'function') {
      throw new TypeError('Storage provider does not support batch relation creation');
    }

    return createRelationsBatch.call(this.storageProvider, relations, config);
  }

  /**
   * Add observations to multiple entities in a single optimized batch operation
   *
   * @param batches Array of observation batches
   * @param config Optional batch configuration
   * @returns Batch result with successful and failed batches
   */
  async addObservationsBatch(
    batches: { entityName: string; observations: string[] }[],
    config?: import('./types/batch-operations.js').BatchConfig
  ): Promise<import('./types/batch-operations.js').BatchResult<any>> {
    // Validate batches
    if (!Array.isArray(batches) || batches.length === 0) {
      throw new Error('Observation batches must be a non-empty array');
    }

    // Check for null/undefined entries
    const nullCount = batches.filter(b => b == null).length;
    if (nullCount > 0) {
      throw new Error(`Found ${nullCount} null/undefined entries in observation batches array`);
    }

    // Validate required fields
    for (const [idx, batch] of batches.entries()) {
      if (!batch.entityName || typeof batch.entityName !== 'string') {
        throw new Error(`Observation batch at index ${idx} has invalid 'entityName' field`);
      }
      if (!Array.isArray(batch.observations)) {
        throw new TypeError(
          `Observation batch at index ${idx} has invalid 'observations' field (must be array)`
        );
      }
      if (batch.observations.length === 0) {
        throw new Error(`Observation batch at index ${idx} has empty observations array`);
      }
    }

    // Call storage provider's batch method
    const addObservationsBatch = (this.storageProvider as any).addObservationsBatch;
    if (typeof addObservationsBatch !== 'function') {
      throw new TypeError('Storage provider does not support batch observation addition');
    }

    const result = await addObservationsBatch.call(this.storageProvider, batches, config);

    await this.queueEmbeddings(
      result.successful.map((b: { entityName: string }) => b.entityName),
      1
    );

    return result;
  }

  /**
   * Update multiple entities in a single optimized batch operation
   *
   * @param updates Array of entity updates
   * @param config Optional batch configuration
   * @returns Batch result with successful and failed updates
   */
  async updateEntitiesBatch(
    updates: import('./types/batch-operations.js').EntityUpdate[],
    config?: import('./types/batch-operations.js').BatchConfig
  ): Promise<
    import('./types/batch-operations.js').BatchResult<
      import('./types/batch-operations.js').EntityUpdate
    >
  > {
    // Validate updates
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new Error('Entity updates must be a non-empty array');
    }

    // Check for null/undefined entries
    const nullCount = updates.filter(u => u == null).length;
    if (nullCount > 0) {
      throw new Error(`Found ${nullCount} null/undefined entries in entity updates array`);
    }

    // Validate required fields
    for (const [idx, update] of updates.entries()) {
      if (!update.name || typeof update.name !== 'string') {
        throw new Error(`Entity update at index ${idx} has invalid 'name' field`);
      }
      if (
        !update.entityType &&
        !update.domain &&
        !update.addObservations &&
        !update.removeObservations
      ) {
        throw new Error(`Entity update at index ${idx} must specify at least one field to update`);
      }
    }

    // Check for duplicate entity names within batch
    const names = new Set<string>();
    const duplicates: string[] = [];
    for (const update of updates) {
      if (names.has(update.name)) {
        duplicates.push(update.name);
      }
      names.add(update.name);
    }

    if (duplicates.length > 0) {
      throw new Error(`Duplicate entity names in updates batch: ${duplicates.join(', ')}`);
    }

    // Call storage provider's batch method
    const updateEntitiesBatch = (this.storageProvider as any).updateEntitiesBatch;
    if (typeof updateEntitiesBatch !== 'function') {
      throw new TypeError('Storage provider does not support batch entity updates');
    }

    const result = await updateEntitiesBatch.call(this.storageProvider, updates, config);

    await this.queueEmbeddings(
      result.successful.map((e: { name: string }) => e.name),
      2
    );

    return result;
  }
}
