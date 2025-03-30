import { StorageProvider, SearchOptions } from '../StorageProvider.js';
import { KnowledgeGraph, Entity } from '../../KnowledgeGraphManager.js';
import { Relation } from '../../types/relation.js';
import { EntityEmbedding, SemanticSearchOptions } from '../../types/entity-embedding.js';
import { v4 as uuidv4 } from 'uuid';
import { Neo4jConnectionManager } from './Neo4jConnectionManager.js';
import { Neo4jConfig, DEFAULT_NEO4J_CONFIG } from './Neo4jConfig.js';
import { Neo4jSchemaManager } from './Neo4jSchemaManager.js';
import { logger } from '../../utils/logger.js';
import neo4j from 'neo4j-driver';
import { Neo4jVectorStore } from './Neo4jVectorStore.js';
import { EmbeddingServiceFactory } from '../../embeddings/EmbeddingServiceFactory.js';
import { EmbeddingService } from '../../embeddings/EmbeddingService.js';

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
 */
interface ExtendedRelation extends Relation {
  id?: string;
  version?: number;
  createdAt?: number;
  updatedAt?: number;
  validFrom?: number;
  validTo?: number | null;
  changedBy?: string | null;
}

/**
 * Interface for Neo4j node properties representing an entity
 */
interface EntityNode {
  id: string;
  name: string;
  entityType: string;
  observations: string; // JSON string of observations array
  version: number;
  createdAt: number;
  updatedAt: number;
  validFrom: number;
  validTo: number | null;
  changedBy: string | null;
  embedding?: number[]; // Vector embedding
}

/**
 * Interface for Neo4j relationship properties representing a relation
 */
interface RelationProperties {
  id: string;
  relationType: string;
  strength: number | null;
  confidence: number | null;
  metadata: string | null; // JSON string of metadata object
  version: number;
  createdAt: number;
  updatedAt: number;
  validFrom: number;
  validTo: number | null;
  changedBy: string | null;
}

/**
 * Extended SemanticSearchOptions with additional properties needed for Neo4j
 */
interface Neo4jSemanticSearchOptions extends SemanticSearchOptions {
  queryVector?: number[];
}

/**
 * Knowledge graph with optional diagnostics
 */
interface KnowledgeGraphWithDiagnostics extends KnowledgeGraph {
  diagnostics?: Record<string, any>;
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
  
  /**
   * Create a new Neo4jStorageProvider
   * @param options Configuration options
   */
  constructor(options?: Neo4jStorageProviderOptions) {
    // Set up configuration
    this.config = {
      ...DEFAULT_NEO4J_CONFIG,
      ...(options?.config || {})
    };
    
    // Configure decay settings
    this.decayConfig = {
      enabled: options?.decayConfig?.enabled ?? true,
      halfLifeDays: options?.decayConfig?.halfLifeDays ?? 30,
      minConfidence: options?.decayConfig?.minConfidence ?? 0.1
    };
    
    // Set up connection manager
    this.connectionManager = options?.connectionManager || 
      new Neo4jConnectionManager(this.config);
    
    // Set up schema manager
    this.schemaManager = new Neo4jSchemaManager(this.connectionManager, this.config, false);
    
    // Set up vector store
    this.vectorStore = new Neo4jVectorStore({
      connectionManager: this.connectionManager,
      indexName: this.config.vectorIndexName,
      dimensions: 1536,
      similarityFunction: 'cosine',
      entityNodeLabel: 'Entity'
    });
    
    logger.debug('Neo4jStorageProvider: Initializing embedding service');
    try {
      // Set up embedding service
      this.embeddingService = EmbeddingServiceFactory.createFromEnvironment();
      logger.debug('Neo4jStorageProvider: Embedding service initialized successfully', {
        provider: this.embeddingService.getProviderInfo().provider,
        model: this.embeddingService.getProviderInfo().model,
        dimensions: this.embeddingService.getProviderInfo().dimensions
      });
    } catch (error) {
      logger.error('Neo4jStorageProvider: Failed to initialize embedding service', error);
    }
    
    // Initialize the schema and vector store
    this.initializeSchema().catch(err => {
      logger.error('Failed to initialize Neo4j schema', err);
    });
  }
  
  /**
   * Get the connection manager (primarily for testing)
   */
  getConnectionManager(): Neo4jConnectionManager {
    return this.connectionManager;
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
    } catch (error) {
      logger.error('Failed to initialize Neo4j schema', error);
      throw error;
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
   * Convert a Neo4j node to an entity object
   * @param node Neo4j node properties
   * @returns Entity object
   */
  private nodeToEntity(node: Record<string, any>): ExtendedEntity {
    const observations = node.observations ? 
      JSON.parse(node.observations) : [];
    
    return {
      name: node.name,
      entityType: node.entityType,
      observations,
      id: node.id,
      version: node.version,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      validFrom: node.validFrom,
      validTo: node.validTo,
      changedBy: node.changedBy
    };
  }
  
  /**
   * Parse a Neo4j relationship into a relation object
   * @param rel Relationship properties
   * @param fromNode From node name
   * @param toNode To node name
   * @returns Relation object
   */
  private relationshipToRelation(
    rel: Record<string, any>,
    fromNode: string,
    toNode: string
  ): ExtendedRelation {
    const metadata = rel.metadata ? JSON.parse(rel.metadata) : null;
    
    return {
      id: rel.id,
      from: fromNode,
      to: toNode,
      relationType: rel.relationType,
      strength: rel.strength,
      confidence: rel.confidence,
      metadata,
      version: rel.version,
      createdAt: rel.createdAt,
      updatedAt: rel.updatedAt,
      validFrom: rel.validFrom,
      validTo: rel.validTo,
      changedBy: rel.changedBy
    };
  }
  
  /**
   * Load the complete knowledge graph from Neo4j
   */
  async loadGraph(): Promise<KnowledgeGraph> {
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
      
      // Return the complete graph
      return {
        entities,
        relations,
        total: entities.length,
        timeTaken
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
        const txc = session.beginTransaction();
        
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
              observations: JSON.stringify(entity.observations || []),
              version: extendedEntity.version || 1,
              createdAt: extendedEntity.createdAt || Date.now(),
              updatedAt: extendedEntity.updatedAt || Date.now(),
              validFrom: extendedEntity.validFrom || Date.now(),
              validTo: extendedEntity.validTo || null,
              changedBy: extendedEntity.changedBy || null
            };
            
            // Create entity
            await txc.run(`
              CREATE (e:Entity {
                id: $id,
                name: $name,
                entityType: $entityType,
                observations: $observations,
                version: $version,
                createdAt: $createdAt,
                updatedAt: $updatedAt,
                validFrom: $validFrom,
                validTo: $validTo,
                changedBy: $changedBy
              })
            `, params);
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
              changedBy: extendedRelation.changedBy || null
            };
            
            // Create relation
            await txc.run(`
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
            `, params);
          }
          
          // Commit transaction
          await txc.commit();
          logger.info(`Saved graph with ${graph.entities.length} entities and ${graph.relations.length} relations to Neo4j`);
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
    try {
      const startTime = Date.now();
      
      // Prepare search parameters
      const rawLimit = options.limit || 10;
      const parameters: Record<string, any> = {
        query: `(?i).*${query}.*`, // Case-insensitive regex pattern
        limit: neo4j.int(Math.floor(rawLimit))
      };
      
      // Add entity type filter if provided
      let entityTypeFilter = '';
      if (options.entityTypes && options.entityTypes.length > 0) {
        entityTypeFilter = 'AND e.entityType IN $entityTypes';
        parameters.entityTypes = options.entityTypes;
      }
      
      // Build the search query
      const searchQuery = `
        MATCH (e:Entity)
        WHERE (e.name =~ $query OR e.entityType =~ $query OR e.observations =~ $query)
        ${entityTypeFilter}
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
        
        const relationsResult = await this.connectionManager.executeQuery(
          relationsQuery, 
          { entityNames }
        );
        
        // Process relation results
        const relations = relationsResult.records.map(record => {
          const fromName = record.get('fromName');
          const toName = record.get('toName');
          const rel = record.get('r').properties;
          
          return this.relationshipToRelation(rel, fromName, toName);
        });
        
        const timeTaken = Date.now() - startTime;
        
        // Return the search results as a graph
        return {
          entities,
          relations,
          total: entities.length,
          timeTaken
        };
      }
      
      const timeTaken = Date.now() - startTime;
      
      // Return just the entities if no relations
      return {
        entities,
        relations: [],
        total: entities.length,
        timeTaken
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
    try {
      const startTime = Date.now();
      
      if (!names || names.length === 0) {
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
      const entityResult = await this.connectionManager.executeQuery(
        entityQuery, 
        { names }
      );
      
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
      const relationsResult = await this.connectionManager.executeQuery(
        relationsQuery, 
        { names }
      );
      
      // Process relation results
      const relations = relationsResult.records.map(record => {
        const fromName = record.get('fromName');
        const toName = record.get('toName');
        const rel = record.get('r').properties;
        
        return this.relationshipToRelation(rel, fromName, toName);
      });
      
      const timeTaken = Date.now() - startTime;
      
      // Return the entities and their relations
      return {
        entities,
        relations,
        total: entities.length,
        timeTaken
      };
    } catch (error) {
      logger.error('Error opening nodes in Neo4j', error);
      throw error;
    }
  }
  
  /**
   * Create new entities in the knowledge graph
   * @param entities Array of entities to create
   */
  async createEntities(entities: any[]): Promise<any[]> {
    try {
      if (!entities || entities.length === 0) {
        return [];
      }
      
      const session = await this.connectionManager.getSession();
      const createdEntities: any[] = [];
      
      try {
        // Begin transaction
        const txc = session.beginTransaction();
        
        try {
          for (const entity of entities) {
            // Generate temporal and identity metadata
            const now = Date.now();
            const entityId = uuidv4();
            
            // Add debug log for embedding generation attempts
            logger.debug(`Neo4jStorageProvider: Processing embeddings for entity "${entity.name}"`, {
              entityType: entity.entityType,
              hasEmbeddingService: !!this.embeddingService
            });
            
            // Generate embedding if embedding service is available
            let embedding = null;
            if (this.embeddingService) {
              try {
                // Prepare text for embedding
                const text = Array.isArray(entity.observations) ? entity.observations.join('\n') : '';
                
                // Generate embedding using the instance's embedding service
                embedding = await this.embeddingService.generateEmbedding(text);
                logger.info(`Generated embedding for entity: ${entity.name}`);
              } catch (error) {
                logger.error(`Failed to generate embedding for entity: ${entity.name}`, error);
                // Continue without embedding if generation fails
              }
            } else {
              logger.warn(`Neo4jStorageProvider: Skipping embedding for entity "${entity.name}" - No embedding service available`);
            }
            
            // Create entity with parameters
            const params = {
              id: entityId,
              name: entity.name,
              entityType: entity.entityType,
              observations: JSON.stringify(entity.observations || []),
              version: 1,
              createdAt: entity.createdAt || now,
              updatedAt: entity.updatedAt || now,
              validFrom: entity.validFrom || now,
              validTo: null,
              changedBy: entity.changedBy || null,
              embedding: embedding // Add embedding directly to entity
            };
            
            // Create entity query
            const createQuery = `
              CREATE (e:Entity {
                id: $id,
                name: $name,
                entityType: $entityType,
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
          
          // Commit transaction
          await txc.commit();
          
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
        const txc = session.beginTransaction();
        
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
              toName: relation.to
            });
            
            // If either entity doesn't exist, skip this relation
            if (checkResult.records.length === 0) {
              logger.warn(`Skipping relation creation: One or both entities not found (${relation.from} -> ${relation.to})`);
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
              changedBy: extendedRelation.changedBy || null
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
              
              const createdRelation = this.relationshipToRelation(
                rel, 
                fromNode.name, 
                toNode.name
              );
              
              createdRelations.push(createdRelation);
            }
          }
          
          // Commit transaction
          await txc.commit();
          
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
        const txc = session.beginTransaction();
        
        try {
          for (const obs of observations) {
            if (!obs.entityName || !obs.contents || obs.contents.length === 0) {
              continue;
            }
            
            // Step 1: Get the current entity and its relationships
            const getQuery = `
              MATCH (e:Entity {name: $name})
              WHERE e.validTo IS NULL
              OPTIONAL MATCH (e)-[r:RELATES_TO]->(to:Entity)
              WHERE r.validTo IS NULL
              OPTIONAL MATCH (from:Entity)-[r2:RELATES_TO]->(e)
              WHERE r2.validTo IS NULL
              RETURN e, collect(DISTINCT {rel: r, to: to}) as outgoing,
                        collect(DISTINCT {rel: r2, from: from}) as incoming
            `;
            
            const getResult = await txc.run(getQuery, { name: obs.entityName });
            
            if (getResult.records.length === 0) {
              logger.warn(`Entity not found: ${obs.entityName}`);
              continue;
            }
            
            // Get entity properties
            const currentNode = getResult.records[0].get('e').properties;
            const currentObservations = JSON.parse(currentNode.observations || '[]');
            const outgoingRels = getResult.records[0].get('outgoing');
            const incomingRels = getResult.records[0].get('incoming');
            
            // Step 2: Create a new version of the entity with updated observations
            const now = Date.now();
            const newVersion = (currentNode.version || 0) + 1;
            const newEntityId = uuidv4();
            
            // Filter out duplicates
            const newObservations = obs.contents.filter(
              content => !currentObservations.includes(content)
            );
            
            // Skip if no new observations
            if (newObservations.length === 0) {
              results.push({
                entityName: obs.entityName,
                addedObservations: []
              });
              continue;
            }
            
            // Combine observations
            const allObservations = [...currentObservations, ...newObservations];
            
            // Step 3: Mark the old entity and its relationships as invalid
            const invalidateQuery = `
              MATCH (e:Entity {id: $id})
              SET e.validTo = $now
              WITH e
              OPTIONAL MATCH (e)-[r:RELATES_TO]->()
              WHERE r.validTo IS NULL
              SET r.validTo = $now
              WITH e
              OPTIONAL MATCH ()-[r2:RELATES_TO]->(e)
              WHERE r2.validTo IS NULL
              SET r2.validTo = $now
            `;
            
            await txc.run(invalidateQuery, {
              id: currentNode.id,
              now
            });
            
            // Step 4: Create the new version
            const createQuery = `
              CREATE (e:Entity {
                id: $id,
                name: $name,
                entityType: $entityType,
                observations: $observations,
                version: $version,
                createdAt: $createdAt,
                updatedAt: $now,
                validFrom: $now,
                validTo: null,
                changedBy: $changedBy
              })
              RETURN e
            `;
            
            const createParams = {
              id: newEntityId,
              name: currentNode.name,
              entityType: currentNode.entityType,
              observations: JSON.stringify(allObservations),
              version: newVersion,
              createdAt: currentNode.createdAt,
              now,
              changedBy: null
            };
            
            await txc.run(createQuery, createParams);
            
            // Step 5: Recreate relationships for the new version
            for (const outRel of outgoingRels) {
              if (!outRel.rel || !outRel.to) continue;
              
              const relProps = outRel.rel.properties;
              const newRelId = uuidv4();
              
              const createOutRelQuery = `
                MATCH (from:Entity {id: $fromId})
                MATCH (to:Entity {id: $toId})
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
              
              await txc.run(createOutRelQuery, {
                fromId: newEntityId,
                toId: outRel.to.properties.id,
                id: newRelId,
                relationType: relProps.relationType,
                strength: relProps.strength !== undefined ? relProps.strength : 0.9,
                confidence: relProps.confidence !== undefined ? relProps.confidence : 0.95,
                metadata: relProps.metadata || null,
                version: relProps.version || 1,
                createdAt: relProps.createdAt || Date.now(),
                now,
                changedBy: null
              });
            }
            
            for (const inRel of incomingRels) {
              if (!inRel.rel || !inRel.from) continue;
              
              const relProps = inRel.rel.properties;
              const newRelId = uuidv4();
              
              const createInRelQuery = `
                MATCH (from:Entity {id: $fromId})
                MATCH (to:Entity {id: $toId})
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
              
              await txc.run(createInRelQuery, {
                fromId: inRel.from.properties.id,
                toId: newEntityId,
                id: newRelId,
                relationType: relProps.relationType,
                strength: relProps.strength !== undefined ? relProps.strength : 0.9,
                confidence: relProps.confidence !== undefined ? relProps.confidence : 0.95,
                metadata: relProps.metadata || null,
                version: relProps.version || 1,
                createdAt: relProps.createdAt || Date.now(),
                now,
                changedBy: null
              });
            }
            
            // Step 6: Add result to return array
            results.push({
              entityName: obs.entityName,
              addedObservations: newObservations
            });
          }
          
          // Commit transaction
          await txc.commit();
          
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
        const txc = session.beginTransaction();
        
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
        const txc = session.beginTransaction();
        
        try {
          for (const deletion of deletions) {
            if (!deletion.entityName || !deletion.observations || deletion.observations.length === 0) {
              continue;
            }
            
            // Step 1: Get the current entity
            const getQuery = `
              MATCH (e:Entity {name: $name})
              WHERE e.validTo IS NULL
              RETURN e
            `;
            
            const getResult = await txc.run(getQuery, { name: deletion.entityName });
            
            if (getResult.records.length === 0) {
              logger.warn(`Entity not found: ${deletion.entityName}`);
              continue;
            }
            
            // Get entity properties
            const currentNode = getResult.records[0].get('e').properties;
            const currentObservations = JSON.parse(currentNode.observations || '[]');
            
            // Step 2: Remove the observations
            const updatedObservations = currentObservations.filter(
              (obs: string) => !deletion.observations.includes(obs)
            );
            
            // Step 3: Create a new version of the entity with updated observations
            const now = Date.now();
            const newVersion = (currentNode.version || 0) + 1;
            const newEntityId = uuidv4();
            
            // Step 4: Mark the old entity as invalid
            const invalidateQuery = `
              MATCH (e:Entity {id: $id})
              SET e.validTo = $now
            `;
            
            await txc.run(invalidateQuery, {
              id: currentNode.id,
              now
            });
            
            // Step 5: Create the new version
            const createQuery = `
              CREATE (e:Entity {
                id: $id,
                name: $name,
                entityType: $entityType,
                observations: $observations,
                version: $version,
                createdAt: $createdAt,
                updatedAt: $now,
                validFrom: $now,
                validTo: null,
                changedBy: $changedBy
              })
              RETURN e
            `;
            
            const createParams = {
              id: newEntityId,
              name: currentNode.name,
              entityType: currentNode.entityType,
              observations: JSON.stringify(updatedObservations),
              version: newVersion,
              createdAt: currentNode.createdAt,
              now,
              changedBy: null
            };
            
            await txc.run(createQuery, createParams);
          }
          
          // Commit transaction
          await txc.commit();
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
        const txc = session.beginTransaction();
        
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
              relationType: relation.relationType
            });
          }
          
          // Commit transaction
          await txc.commit();
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
  async getEntity(entityName: string): Promise<any | null> {
    try {
      // Query for entity by name
      const query = `
        MATCH (e:Entity {name: $name})
        WHERE e.validTo IS NULL
        RETURN e
      `;
      
      // Execute query
      const result = await this.connectionManager.executeQuery(
        query,
        { name: entityName }
      );
      
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
      const result = await this.connectionManager.executeQuery(
        query,
        { 
          fromName: from,
          toName: to,
          relationType: type
        }
      );
      
      // Return null if no relation found
      if (result.records.length === 0) {
        return null;
      }
      
      // Convert relationship to relation
      const record = result.records[0];
      const rel = record.get('r').properties;
      const fromNode = record.get('from').properties;
      const toNode = record.get('to').properties;
      
      return this.relationshipToRelation(
        rel,
        fromNode.name,
        toNode.name
      );
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
        const txc = session.beginTransaction();
        
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
            relationType: relation.relationType
          });
          
          if (getResult.records.length === 0) {
            throw new Error(`Relation not found: ${relation.from} -> ${relation.to} (${relation.relationType})`);
          }
          
          // Get relation properties
          const currentRel = getResult.records[0].get('r').properties;
          
          // Step 2: Update the relation with temporal versioning
          const now = Date.now();
          const newVersion = (currentRel.version || 0) + 1;
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
            now
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
            strength: relation.strength !== undefined ? relation.strength : currentRel.strength,
            confidence: relation.confidence !== undefined ? relation.confidence : currentRel.confidence,
            metadata: relation.metadata ? JSON.stringify(relation.metadata) : currentRel.metadata,
            version: newVersion,
            createdAt: currentRel.createdAt,
            now,
            changedBy: extendedRelation.changedBy || null
          };
          
          await txc.run(createQuery, createParams);
          
          // Commit transaction
          await txc.commit();
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
  async getEntityHistory(entityName: string): Promise<any[]> {
    try {
      // Query for entity history
      const query = `
        MATCH (e:Entity {name: $name})
        RETURN e
        ORDER BY e.validFrom ASC
      `;
      
      // Execute query
      const result = await this.connectionManager.executeQuery(
        query,
        { name: entityName }
      );
      
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
      const result = await this.connectionManager.executeQuery(
        query,
        {
          fromName: from,
          toName: to,
          relationType
        }
      );
      
      // Return empty array if no history found
      if (result.records.length === 0) {
        return [];
      }
      
      // Convert relationships to relations
      return result.records.map(record => {
        const rel = record.get('r').properties;
        const fromNode = record.get('from').properties;
        const toNode = record.get('to').properties;
        
        return this.relationshipToRelation(
          rel,
          fromNode.name,
          toNode.name
        );
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
      const entityResult = await this.connectionManager.executeQuery(
        entityQuery,
        { timestamp }
      );
      
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
      const relationResult = await this.connectionManager.executeQuery(
        relationQuery,
        { timestamp }
      );
      
      // Convert relationships to relations
      const relations = relationResult.records.map(record => {
        const rel = record.get('r').properties;
        const fromName = record.get('fromName');
        const toName = record.get('toName');
        
        return this.relationshipToRelation(
          rel,
          fromName,
          toName
        );
      });
      
      const timeTaken = Date.now() - startTime;
      
      // Return the graph state at the timestamp
      return {
        entities,
        relations,
        total: entities.length,
        timeTaken
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
        return this.loadGraph();
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
        const relation = this.relationshipToRelation(
          rel,
          fromName,
          toName
        );
        
        // Apply decay if confidence is present
        if (relation.confidence !== null && relation.confidence !== undefined) {
          const extendedRelation = relation as ExtendedRelation;
          const ageDiff = startTime - (extendedRelation.validFrom || extendedRelation.createdAt || startTime);
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
            decayFactor
          }
        }
      };
    } catch (error) {
      logger.error('Error getting decayed graph from Neo4j', error);
      throw error;
    }
  }
  
  /**
   * Store or update the embedding vector for an entity
   * @param entityName The name of the entity to update
   * @param embedding The embedding data to store
   */
  async updateEntityEmbedding(entityName: string, embedding: EntityEmbedding): Promise<void> {
    try {
      // Verify that the entity exists
      const entity = await this.getEntity(entityName);
      if (!entity) {
        throw new Error(`Entity ${entityName} not found`);
      }
      
      const session = await this.connectionManager.getSession();
      
      try {
        // Begin transaction
        const txc = session.beginTransaction();
        
        try {
          // Update the entity with the embedding
          const updateQuery = `
            MATCH (e:Entity {name: $name})
            WHERE e.validTo IS NULL
            SET e.embedding = $embedding,
                e.updatedAt = $now
            RETURN e
          `;
          
          await txc.run(updateQuery, {
            name: entityName,
            embedding: embedding.vector,
            now: Date.now()
          });
          
          // Commit transaction
          await txc.commit();
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
        // Query to get the entity with its embedding
        const query = `
          MATCH (e:Entity {name: $name})
          WHERE e.validTo IS NULL
          RETURN e.embedding AS embedding
        `;
        
        const result = await session.run(query, { name: entityName });
        
        if (result.records.length === 0 || !result.records[0].get('embedding')) {
          logger.debug(`No embedding found for entity: ${entityName}`);
          return null;
        }
        
        const embeddingVector = result.records[0].get('embedding');
        
        // Return the embedding in the expected format
        return {
          vector: embeddingVector,
          model: 'unknown', // We don't store the model info in Neo4j
          lastUpdated: entity.updatedAt || Date.now()
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
  async findSimilarEntities(queryVector: number[], limit: number = 10): Promise<any[]> {
    try {
      // Direct vector search implementation using the approach proven to work in our test script
      logger.debug(`Neo4jStorageProvider: Using direct vector search with ${limit} limit`);
      
      const session = await this.connectionManager.getSession();
      
      try {
        const result = await session.run(`
          CALL db.index.vector.queryNodes(
            'entity_embeddings', 
            $limit, 
            $embedding
          )
          YIELD node, score
          RETURN node.name AS name, node.entityType AS entityType, score
          ORDER BY score DESC
        `, {
          limit: neo4j.int(Math.floor(limit)),
          embedding: queryVector
        });
        
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
                score
              };
            }
            return null;
          });
          
          const entities = (await Promise.all(entityPromises)).filter(Boolean);
          
          // Return only valid entities
          return entities
            .filter(entity => entity && entity.validTo === null)
            .slice(0, limit);
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
    try {
      // Create diagnostics object for debugging
      const diagnostics: Record<string, any> = {
        query,
        startTime: Date.now(),
        stepsTaken: []
      };
      
      // Log start of semantic search
      diagnostics.stepsTaken.push({
        step: "start", 
        timestamp: Date.now(),
        options: {
          query,
          hybridSearch: options.hybridSearch,
          hasQueryVector: !!options.queryVector,
          limit: options.limit,
          entityTypes: options.entityTypes,
          minSimilarity: options.minSimilarity
        }
      });
      
      // Enhanced logging for semantic search
      logger.debug('Neo4jStorageProvider: Starting semantic search', {
        query,
        hybridSearch: options.hybridSearch,
        hasQueryVector: !!options.queryVector,
        limit: options.limit,
        entityTypes: options.entityTypes
      });
      
      // Ensure vector store is initialized
      if (!this.vectorStore['initialized']) {
        logger.info('Neo4jStorageProvider: Vector store not initialized, initializing now');
        diagnostics.stepsTaken.push({
          step: "vectorStoreInitialization", 
          timestamp: Date.now(),
          status: "started"
        });
        
        try {
          await this.vectorStore.initialize();
          logger.info('Neo4jStorageProvider: Vector store initialized successfully for semantic search');
          diagnostics.stepsTaken.push({
            step: "vectorStoreInitialization", 
            timestamp: Date.now(),
            status: "success"
          });
        } catch (initError) {
          logger.error('Neo4jStorageProvider: Failed to initialize vector store for semantic search', initError);
          diagnostics.stepsTaken.push({
            step: "vectorStoreInitialization", 
            timestamp: Date.now(),
            status: "error",
            error: initError instanceof Error ? initError.message : String(initError)
          });
          // We'll continue but might fail if the vector operations are called
        }
      }
      
      // If no embedding service, log a warning
      if (!this.embeddingService) {
        logger.warn('Neo4jStorageProvider: No embedding service available for semantic search');
        diagnostics.stepsTaken.push({
          step: "embeddingServiceCheck", 
          timestamp: Date.now(),
          status: "unavailable"
        });
      } else {
        diagnostics.stepsTaken.push({
          step: "embeddingServiceCheck", 
          timestamp: Date.now(),
          status: "available",
          model: this.embeddingService.getProviderInfo().model,
          dimensions: this.embeddingService.getProviderInfo().dimensions
        });
      }
      
      // Generate query vector if not provided and embedding service is available
      if (!options.queryVector && this.embeddingService) {
        try {
          logger.debug('Neo4jStorageProvider: Generating query vector for semantic search');
          diagnostics.stepsTaken.push({
            step: "generateQueryEmbedding", 
            timestamp: Date.now(),
            status: "started"
          });
          
          options.queryVector = await this.embeddingService.generateEmbedding(query);
          
          diagnostics.stepsTaken.push({
            step: "generateQueryEmbedding", 
            timestamp: Date.now(),
            status: "success",
            vectorLength: options.queryVector.length,
            sampleValues: options.queryVector.slice(0, 3)
          });
          
          logger.debug('Neo4jStorageProvider: Query vector generated successfully', {
            vectorLength: options.queryVector.length
          });
        } catch (embedError) {
          diagnostics.stepsTaken.push({
            step: "generateQueryEmbedding", 
            timestamp: Date.now(),
            status: "error",
            error: embedError instanceof Error ? embedError.message : String(embedError)
          });
          
          logger.error('Neo4jStorageProvider: Failed to generate query vector for semantic search', embedError);
        }
      } else if (options.queryVector) {
        diagnostics.stepsTaken.push({
          step: "searchMethod", 
          timestamp: Date.now(),
          method: "vectorOnly"
        });
        
        const searchLimit = Math.floor(options.limit || 10);
        const minSimilarity = options.minSimilarity || 0.6;
        
        diagnostics.stepsTaken.push({
          step: "vectorSearch", 
          timestamp: Date.now(),
          status: "started",
          limit: searchLimit,
          minSimilarity
        });
        
        // DIRECT VECTOR SEARCH IMPLEMENTATION
        // Instead of using findSimilarEntities - which isn't working in the MCP context
        // we'll directly use the working technique from our test script
        try {
          const session = await this.connectionManager.getSession();
          
          try {
            const vectorResult = await session.run(`
              CALL db.index.vector.queryNodes(
                'entity_embeddings', 
                $limit, 
                $embedding
              )
              YIELD node, score
              WHERE score >= $minScore
              RETURN node.name AS name, node.entityType AS entityType, score
              ORDER BY score DESC
            `, {
              limit: neo4j.int(searchLimit),
              embedding: options.queryVector,
              minScore: minSimilarity
            });
            
            const foundResults = vectorResult.records.length;
            logger.debug(`Neo4jStorageProvider: Direct vector search found ${foundResults} results`);
            
            if (foundResults > 0) {
              // Convert to EntityData objects
              const entityPromises = vectorResult.records.map(async record => {
                const entityName = record.get('name');
                return this.getEntity(entityName);
              });
              
              const entities = (await Promise.all(entityPromises)).filter(Boolean);
              
              diagnostics.stepsTaken.push({
                step: "vectorSearch", 
                timestamp: Date.now(),
                status: "completed",
                resultsCount: entities.length
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
              
              // Get related relations
              const entityNames = entities.map(e => e.name);
              const finalGraph = await this.openNodes(entityNames);
              
              diagnostics.endTime = Date.now();
              diagnostics.totalTimeTaken = diagnostics.endTime - diagnostics.startTime;
              
              // Only include diagnostics if DEBUG is enabled
              if (process.env.DEBUG === 'true') {
                return {
                  ...finalGraph,
                  diagnostics
                };
              }
              
              return finalGraph;
            } else {
              // No results from vector search
              diagnostics.stepsTaken.push({
                step: "vectorSearch", 
                timestamp: Date.now(),
                status: "completed",
                resultsCount: 0
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
          } catch (error) {
            logger.error(`Neo4jStorageProvider: Direct vector search error: ${error instanceof Error ? error.message : String(error)}`);
            diagnostics.stepsTaken.push({
              step: "vectorSearch", 
              timestamp: Date.now(),
              status: "error",
              error: error instanceof Error ? error.message : String(error)
            });
          } finally {
            await session.close();
          }
        } catch (error) {
          logger.error(`Neo4jStorageProvider: Direct vector search session error: ${error instanceof Error ? error.message : String(error)}`);
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
          step: "filterResults", 
          timestamp: Date.now(),
          status: "completed",
          filteredResultsCount: filteredResults.length
        });
        
        // If no results, return empty graph
        if (filteredResults.length === 0) {
          diagnostics.stepsTaken.push({
            step: "finalResult", 
            timestamp: Date.now(),
            status: "empty"
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
          step: "openNodes", 
          timestamp: Date.now(),
          status: "started",
          entityNames
        });
        
        const finalGraph = await this.openNodes(entityNames);
        
        diagnostics.stepsTaken.push({
          step: "openNodes", 
          timestamp: Date.now(),
          status: "completed",
          entitiesCount: finalGraph.entities.length,
          relationsCount: finalGraph.relations.length
        });
        
        diagnostics.endTime = Date.now();
        diagnostics.totalTimeTaken = diagnostics.endTime - diagnostics.startTime;
        
        // Only include diagnostics if DEBUG is enabled
        if (process.env.DEBUG === 'true') {
          return {
            ...finalGraph,
            diagnostics
          };
        }
        
        return finalGraph;
      }
      
      // If no query vector provided, fall back to text search
      diagnostics.stepsTaken.push({
        step: "searchMethod", 
        timestamp: Date.now(),
        method: "textOnly",
        reason: "No query vector available"
      });
      
      const textSearchLimit = Math.floor(options.limit || 10);
      
      diagnostics.stepsTaken.push({
        step: "textSearch", 
        timestamp: Date.now(),
        status: "started",
        limit: textSearchLimit
      });
      
      const textResults = await this.searchNodes(query, { ...options, limit: textSearchLimit });
      
      diagnostics.stepsTaken.push({
        step: "textSearch", 
        timestamp: Date.now(),
        status: "completed",
        resultsCount: textResults.entities.length,
        timeTaken: textResults.timeTaken
      });
      
      diagnostics.endTime = Date.now();
      diagnostics.totalTimeTaken = diagnostics.endTime - diagnostics.startTime;
      
      // Only include diagnostics if DEBUG is enabled
      if (process.env.DEBUG === 'true') {
        return {
          ...textResults,
          diagnostics
        };
      }
      
      return textResults;
    } catch (error) {
      logger.error('Error performing semantic search in Neo4j', error);
      throw error;
    }
  }

  /**
   * Helper function to get entity text for embedding
   */
  private getEntityTextForEmbedding(entity: Entity): string {
    // Combine entity name, type, and observations into a single text
    const name = entity.name || '';
    const type = entity.entityType || '';
    const observations = Array.isArray(entity.observations) ? entity.observations.join('\n') : '';
    
    return `${name} - ${type}\n${observations}`;
  }

  /**
   * Direct diagnostic method to check Neo4j vector embeddings
   * Bypasses all abstractions to query the database directly
   */
  async diagnoseVectorSearch(): Promise<any> {
    try {
      // First, make sure vector store is initialized
      if (!this.vectorStore['initialized']) {
        try {
          await this.vectorStore.initialize();
        } catch (err) {
          // Continue even if initialization fails
        }
      }
      
      // Check if we can access the diagnostic method
      if (typeof (this.vectorStore as any).diagnosticGetEntityEmbeddings === 'function') {
        return await (this.vectorStore as any).diagnosticGetEntityEmbeddings();
      } else {
        return {
          error: "Diagnostic method not available",
          vectorStoreType: this.vectorStore.constructor.name
        };
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
} 