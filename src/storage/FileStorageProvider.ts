import type { StorageProvider, SearchOptions } from './StorageProvider.js';
import * as fs from 'fs';
import type { KnowledgeGraph, Relation } from '../KnowledgeGraphManager.js';
import path from 'path';
import type { VectorStoreFactoryOptions } from './VectorStoreFactory.js';

interface FileStorageProviderOptions {
  memoryFilePath?: string;
  filePath?: string; // Alias for memoryFilePath for consistency with other providers
  vectorStoreOptions?: VectorStoreFactoryOptions;
}

/**
 * A storage provider that uses the file system to store the knowledge graph
 * @deprecated This storage provider is deprecated and will be removed in a future version.
 * Please migrate to SqliteStorageProvider.
 */
export class FileStorageProvider implements StorageProvider {
  private _fs: typeof fs;
  private filePath: string;
  private graph: KnowledgeGraph = { entities: [], relations: [] };
  private vectorStoreOptions?: VectorStoreFactoryOptions;

  /**
   * Create a new FileStorageProvider
   * @param options Configuration options for the file storage provider
   * @deprecated This storage provider is deprecated and will be removed in a future version.
   * Please migrate to SqliteStorageProvider.
   */
  constructor(options?: FileStorageProviderOptions) {
    // Only emit warning in test environments to avoid disrupting JSON-RPC protocol
    if (process.env.NODE_ENV === 'test') {
      // console.warn('WARNING: FileStorageProvider is deprecated and will be removed in a future version. Please migrate to SqliteStorageProvider.');
    }

    this._fs = fs;

    // Store vector store options for initialization
    this.vectorStoreOptions = options?.vectorStoreOptions;

    // Default to test-output directory during tests
    if (!options?.memoryFilePath && !options?.filePath) {
      const testOutputDir = path.join(process.cwd(), 'test-output', 'file-storage');
      if (!fs.existsSync(testOutputDir)) {
        fs.mkdirSync(testOutputDir, { recursive: true });
      }
      this.filePath = path.join(testOutputDir, 'memory.json');
    } else {
      this.filePath = options?.memoryFilePath || options?.filePath || '';
    }
    this.loadGraph();
  }

  /**
   * Set the fs module (for testing purposes)
   */
  setFs(fsModule: typeof fs): void {
    this._fs = fsModule;
  }

  /**
   * Load the entire knowledge graph from the file
   * @returns Promise resolving to the loaded KnowledgeGraph
   */
  async loadGraph(): Promise<KnowledgeGraph> {
    try {
      const content = await this._fs.promises.readFile(this.filePath, 'utf-8');
      this.graph = JSON.parse(content);
      return this.graph;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return empty graph
        return { entities: [], relations: [] };
      }
      throw new Error(`Error loading graph from ${this.filePath}: ${error.message}`);
    }
  }

  /**
   * Save the entire knowledge graph to the file
   * @param graph The KnowledgeGraph to save
   * @returns Promise that resolves when the save is complete
   */
  async saveGraph(graph: KnowledgeGraph): Promise<void> {
    await this._fs.promises.writeFile(this.filePath, JSON.stringify(graph, null, 2), 'utf-8');
  }

  /**
   * Search for nodes in the graph that match the query
   * @param query The search query string
   * @param options Optional search parameters
   * @returns Promise resolving to a KnowledgeGraph containing matching nodes
   */
  async searchNodes(query: string, options?: SearchOptions): Promise<KnowledgeGraph> {
    // Load the entire graph
    const graph = await this.loadGraph();

    // Apply default options
    const searchOptions = {
      limit: options?.limit ?? Number.MAX_SAFE_INTEGER,
      caseSensitive: options?.caseSensitive ?? false,
      entityTypes: options?.entityTypes ?? [],
    };

    // Filter entities that match the query
    let matchingEntities = graph.entities.filter((entity) => {
      // Check if entity matches the query
      const nameMatches = searchOptions.caseSensitive
        ? entity.name.includes(query)
        : entity.name.toLowerCase().includes(query.toLowerCase());

      const observationsMatch = entity.observations.some((obs) =>
        searchOptions.caseSensitive
          ? obs.includes(query)
          : obs.toLowerCase().includes(query.toLowerCase())
      );

      // Match if name or any observation contains the query
      return nameMatches || observationsMatch;
    });

    // Filter by entity type if specified
    if (searchOptions.entityTypes.length > 0) {
      matchingEntities = matchingEntities.filter((entity) =>
        searchOptions.entityTypes.includes(entity.entityType)
      );
    }

    // Apply limit
    matchingEntities = matchingEntities.slice(0, searchOptions.limit);

    // Get entity names for relation filtering
    const entityNames = new Set(matchingEntities.map((entity) => entity.name));

    // Filter relations that connect matching entities
    const matchingRelations = graph.relations.filter(
      (relation) => entityNames.has(relation.from) && entityNames.has(relation.to)
    );

    return {
      entities: matchingEntities,
      relations: matchingRelations,
    };
  }

  /**
   * Open specific nodes by their exact names
   * @param names Array of node names to open
   * @returns Promise resolving to a KnowledgeGraph containing the specified nodes
   */
  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    // Handle empty input array case
    if (names.length === 0) {
      return { entities: [], relations: [] };
    }

    // Load the entire graph
    const graph = await this.loadGraph();

    // Create a Set of names for faster lookups
    const nameSet = new Set(names);

    // Filter entities by name
    const filteredEntities = graph.entities.filter((entity) => nameSet.has(entity.name));

    // Create a Set of entity names that were found
    const foundEntityNames = new Set(filteredEntities.map((entity) => entity.name));

    // Filter relations to only include those between found entities
    const filteredRelations = graph.relations.filter(
      (relation) => foundEntityNames.has(relation.from) && foundEntityNames.has(relation.to)
    );

    return {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  }

  /**
   * Create new relations between entities
   * @param relations Array of relations to create
   * @returns Promise resolving to array of newly created relations
   */
  async createRelations(relations: Relation[]): Promise<Relation[]> {
    const graph = await this.loadGraph();

    const newRelations = relations.filter(
      (r) =>
        !graph.relations.some(
          (existingRelation) =>
            existingRelation.from === r.from &&
            existingRelation.to === r.to &&
            existingRelation.relationType === r.relationType
        )
    );

    // Always save the graph, even when no new relations are found
    // This ensures backward compatibility with existing tests
    await this.saveGraph({
      entities: graph.entities,
      relations: [...graph.relations, ...newRelations],
    });

    return newRelations;
  }

  /**
   * Add observations to entities
   * @param observations Array of observations to add
   * @returns Promise resolving to array of added observations
   */
  async addObservations(
    observations: { entityName: string; contents: string[] }[]
  ): Promise<{ entityName: string; addedObservations: string[] }[]> {
    if (!observations || observations.length === 0) {
      return [];
    }

    const graph = await this.loadGraph();

    // Process each observation request
    const results = observations.map((obs) => {
      const entity = graph.entities.find((e) => e.name === obs.entityName);

      if (!entity) {
        throw new Error(`Entity with name ${obs.entityName} not found`);
      }

      // Filter out observations that already exist
      const newObservations = obs.contents.filter(
        (content) => !entity.observations.includes(content)
      );

      // Add new observations to entity
      entity.observations.push(...newObservations);

      return {
        entityName: obs.entityName,
        addedObservations: newObservations,
      };
    });

    // Save the updated graph
    await this.saveGraph(graph);

    return results;
  }

  /**
   * Delete entities and their relations from the knowledge graph
   * @param entityNames Array of entity names to delete
   * @returns Promise that resolves when deletion is complete
   */
  async deleteEntities(entityNames: string[]): Promise<void> {
    if (!entityNames || entityNames.length === 0) {
      return;
    }

    const graph = await this.loadGraph();

    // Create a set for faster lookups
    const nameSet = new Set(entityNames);

    // Filter out entities that are in the delete list
    graph.entities = graph.entities.filter((e) => !nameSet.has(e.name));

    // Filter out relations that reference deleted entities
    graph.relations = graph.relations.filter((r) => !nameSet.has(r.from) && !nameSet.has(r.to));

    // Save the updated graph
    await this.saveGraph(graph);
  }

  /**
   * Delete specific observations from entities
   * @param deletions Array of objects with entity name and observations to delete
   * @returns Promise that resolves when deletion is complete
   */
  async deleteObservations(
    deletions: { entityName: string; observations: string[] }[]
  ): Promise<void> {
    if (!deletions || deletions.length === 0) {
      return;
    }

    const graph = await this.loadGraph();

    // Process each deletion request
    deletions.forEach((deletion) => {
      const entity = graph.entities.find((e) => e.name === deletion.entityName);
      if (entity) {
        // Filter out the observations that should be deleted
        entity.observations = entity.observations.filter(
          (obs) => !deletion.observations.includes(obs)
        );
      }
    });

    // Save the updated graph
    await this.saveGraph(graph);
  }

  /**
   * Delete relations from the graph
   * @param relations Array of relations to delete
   * @returns Promise that resolves when deletion is complete
   * @deprecated FileStorageProvider is deprecated. Use SqliteStorageProvider instead.
   */
  async deleteRelations(relations: Relation[]): Promise<void> {
    await this.loadGraph();

    for (const relation of relations) {
      this.graph.relations = this.graph.relations.filter(
        (r) =>
          !(
            r.from === relation.from &&
            r.to === relation.to &&
            r.relationType === relation.relationType
          )
      );
    }

    await this.saveGraph(this.graph);
  }

  /**
   * Get a specific relation by its identifying properties
   * @param from Source entity name
   * @param to Target entity name
   * @param relationType Type of relation
   * @returns Promise resolving to the relation or null if not found
   */
  async getRelation(from: string, to: string, relationType: string): Promise<Relation | null> {
    const graph = await this.loadGraph();

    const relation = graph.relations.find(
      (r) => r.from === from && r.to === to && r.relationType === relationType
    );

    return relation || null;
  }

  /**
   * Update an existing relation with new properties
   * @param relation The relation with updated properties (from, to, and relationType identify the relation)
   * @returns Promise that resolves when the update is complete
   * @throws Error if the relation doesn't exist
   */
  async updateRelation(relation: Relation): Promise<void> {
    const graph = await this.loadGraph();

    // Find the index of the relation to update
    const index = graph.relations.findIndex(
      (r) =>
        r.from === relation.from && r.to === relation.to && r.relationType === relation.relationType
    );

    if (index === -1) {
      throw new Error(
        `Relation from ${relation.from} to ${relation.to} of type ${relation.relationType} not found`
      );
    }

    // Update the relation with new properties, preserving any existing properties not specified
    graph.relations[index] = {
      ...graph.relations[index], // Keep existing properties
      ...relation, // Overwrite with new properties
    };

    // Save the updated graph
    await this.saveGraph(graph);
  }

  /**
   * Create new entities in the knowledge graph
   * @param entities Array of entities to create
   * @returns Promise resolving to the array of created entities with timestamps
   * @deprecated FileStorageProvider is deprecated. Use SqliteStorageProvider instead.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async createEntities(entities: any[]): Promise<any[]> {
    await this.loadGraph();

    const timestamp = Date.now();
    const createdEntities = [];

    for (const entity of entities) {
      // Check if entity already exists
      const exists = this.graph.entities.some((e) => e.name === entity.name);

      if (!exists) {
        // Add temporal metadata to match SqliteStorageProvider behavior
        const createdEntity = {
          ...entity,
          createdAt: timestamp,
          updatedAt: timestamp,
          validFrom: timestamp,
          validTo: null,
          version: 1,
          changedBy: null,
        };

        this.graph.entities.push(createdEntity);
        createdEntities.push(createdEntity);
      } else {
        // Entity already exists, just return the original
        createdEntities.push(entity);
      }
    }

    // Save the updated graph
    await this.saveGraph(this.graph);

    return createdEntities;
  }

  /**
   * Get an entity by name
   * @param entityName Name of the entity to retrieve
   * @returns Promise resolving to the entity or null if not found
   * @deprecated FileStorageProvider is deprecated. Use SqliteStorageProvider instead.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getEntity(entityName: string): Promise<any | null> {
    await this.loadGraph();

    const entity = this.graph.entities.find((e) => e.name === entityName);
    return entity || null;
  }
}
