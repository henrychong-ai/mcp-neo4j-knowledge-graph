import type { KnowledgeGraph } from '../KnowledgeGraphManager.js';
import type { Relation } from '../types/relation.js';
import type { EntityEmbedding, SemanticSearchOptions } from '../types/entity-embedding.js';

/**
 * Options for searching nodes in the knowledge graph
 */
export interface SearchOptions {
  /**
   * Maximum number of results to return
   */
  limit?: number;

  /**
   * Whether the search should be case-sensitive
   */
  caseSensitive?: boolean;

  /**
   * Filter results by entity types
   */
  entityTypes?: string[];
}

/**
 * Interface for storage providers that can load and save knowledge graphs
 */
export interface StorageProvider {
  /**
   * Load a knowledge graph from storage
   * @returns Promise resolving to the loaded knowledge graph
   */
  loadGraph(): Promise<KnowledgeGraph>;

  /**
   * Save a knowledge graph to storage
   * @param graph The knowledge graph to save
   * @returns Promise that resolves when the save is complete
   */
  saveGraph(graph: KnowledgeGraph): Promise<void>;

  /**
   * Search for nodes in the graph that match the query
   * @param query The search query string
   * @param options Optional search parameters
   * @returns Promise resolving to a KnowledgeGraph containing matching nodes
   */
  searchNodes(query: string, options?: SearchOptions): Promise<KnowledgeGraph>;

  /**
   * Open specific nodes by their exact names
   * @param names Array of node names to open
   * @returns Promise resolving to a KnowledgeGraph containing the specified nodes
   */
  openNodes(names: string[]): Promise<KnowledgeGraph>;

  /**
   * Create new entities in the knowledge graph
   * @param entities Array of entities to create
   * @returns Promise resolving to array of newly created entities with temporal metadata
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createEntities(entities: any[]): Promise<any[]>;

  /**
   * Create new relations between entities
   * @param relations Array of relations to create
   * @returns Promise resolving to array of newly created relations
   */
  createRelations(relations: Relation[]): Promise<Relation[]>;

  /**
   * Add observations to entities
   * @param observations Array of objects with entity name and observation contents
   * @returns Promise resolving to array of objects with entity name and added observations
   */
  addObservations(
    observations: { entityName: string; contents: string[] }[]
  ): Promise<{ entityName: string; addedObservations: string[] }[]>;

  /**
   * Delete entities and their relations
   * @param entityNames Array of entity names to delete
   * @returns Promise that resolves when deletion is complete
   */
  deleteEntities(entityNames: string[]): Promise<void>;

  /**
   * Delete observations from entities
   * @param deletions Array of objects with entity name and observations to delete
   * @returns Promise that resolves when deletion is complete
   */
  deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void>;

  /**
   * Delete relations from the graph
   * @param relations Array of relations to delete
   * @returns Promise that resolves when deletion is complete
   */
  deleteRelations(relations: Relation[]): Promise<void>;

  /**
   * Get a specific relation by its source, target, and type
   * @param from Source entity name
   * @param to Target entity name
   * @param type Relation type
   * @returns Promise resolving to the relation or null if not found
   */
  getRelation?(from: string, to: string, type: string): Promise<Relation | null>;

  /**
   * Update an existing relation with new properties
   * @param relation The relation with updated properties
   * @returns Promise that resolves when the update is complete
   */
  updateRelation?(relation: Relation): Promise<void>;

  /**
   * Get the history of all versions of an entity
   * @param entityName The name of the entity to retrieve history for
   * @returns Promise resolving to an array of entity versions in chronological order
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getEntityHistory?(entityName: string): Promise<any[]>;

  /**
   * Get the history of all versions of a relation
   * @param from Source entity name
   * @param to Target entity name
   * @param relationType Type of the relation
   * @returns Promise resolving to an array of relation versions in chronological order
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getRelationHistory?(from: string, to: string, relationType: string): Promise<any[]>;

  /**
   * Get the state of the knowledge graph at a specific point in time
   * @param timestamp The timestamp to get the graph state at
   * @returns Promise resolving to the knowledge graph as it was at the specified time
   */
  getGraphAtTime?(timestamp: number): Promise<KnowledgeGraph>;

  /**
   * Get the current knowledge graph with confidence decay applied to relations
   * based on their age and the configured decay settings
   * @returns Promise resolving to the knowledge graph with decayed confidence values
   */
  getDecayedGraph?(): Promise<KnowledgeGraph>;

  /**
   * Store or update the embedding vector for an entity
   * @param entityName The name of the entity to update
   * @param embedding The embedding data to store
   * @returns Promise that resolves when the update is complete
   */
  updateEntityEmbedding?(entityName: string, embedding: EntityEmbedding): Promise<void>;

  /**
   * Find entities similar to a query vector
   * @param queryVector The vector to compare against
   * @param limit Maximum number of results to return
   * @returns Promise resolving to array of entities with similarity scores
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findSimilarEntities?(queryVector: number[], limit?: number): Promise<any[]>;

  /**
   * Search for entities using semantic search
   * @param query The search query text
   * @param options Search options including semantic search parameters
   * @returns Promise resolving to a KnowledgeGraph containing matching entities
   */
  semanticSearch?(
    query: string,
    options?: SearchOptions & SemanticSearchOptions
  ): Promise<KnowledgeGraph>;

  /**
   * Get an entity by name
   * @param entityName Name of the entity to retrieve
   * @returns Promise resolving to the entity or null if not found
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getEntity(entityName: string): Promise<any | null>;
}

// Add static methods to the StorageProvider interface for JavaScript tests
// This allows tests to access validation methods directly from the interface
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace StorageProvider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function isStorageProvider(obj: any): boolean {
    return StorageProviderValidator.isStorageProvider(obj);
  }
}

/**
 * Validator class for StorageProvider interface
 * This exists to ensure there's a concrete export for JavaScript tests
 */
export class StorageProviderValidator {
  // No implementation - this is just to ensure the symbol exists in the compiled JS
  // JavaScript tests will use this as a type reference
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static isStorageProvider(obj: any): boolean {
    const hasRequiredMethods =
      obj &&
      typeof obj.loadGraph === 'function' &&
      typeof obj.saveGraph === 'function' &&
      typeof obj.searchNodes === 'function' &&
      typeof obj.openNodes === 'function' &&
      typeof obj.createEntities === 'function' &&
      typeof obj.createRelations === 'function' &&
      typeof obj.addObservations === 'function' &&
      typeof obj.deleteEntities === 'function' &&
      typeof obj.deleteObservations === 'function' &&
      typeof obj.deleteRelations === 'function' &&
      typeof obj.getEntity === 'function';

    // Check that any optional methods, if present, are functions
    const optionalMethodsValid =
      (!obj.getRelation || typeof obj.getRelation === 'function') &&
      (!obj.updateRelation || typeof obj.updateRelation === 'function') &&
      (!obj.getEntityHistory || typeof obj.getEntityHistory === 'function') &&
      (!obj.getRelationHistory || typeof obj.getRelationHistory === 'function') &&
      (!obj.getGraphAtTime || typeof obj.getGraphAtTime === 'function') &&
      (!obj.getDecayedGraph || typeof obj.getDecayedGraph === 'function') &&
      (!obj.updateEntityEmbedding || typeof obj.updateEntityEmbedding === 'function') &&
      (!obj.findSimilarEntities || typeof obj.findSimilarEntities === 'function') &&
      (!obj.semanticSearch || typeof obj.semanticSearch === 'function');

    return hasRequiredMethods && optionalMethodsValid;
  }
}
