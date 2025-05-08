/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Neo4jStorageProvider } from '../../neo4j/Neo4jStorageProvider';
import { Neo4jConnectionManager } from '../../neo4j/Neo4jConnectionManager';
import { Neo4jSchemaManager } from '../../neo4j/Neo4jSchemaManager';
import { Neo4jConfig } from '../../neo4j/Neo4jConfig';
import { KnowledgeGraph, Entity } from '../../../KnowledgeGraphManager';
import { Relation } from '../../../types/relation';

// Mock neo4j driver
vi.mock('neo4j-driver', () => {
  const mockDriverFn = vi.fn();

  // Mock Integer class implementation
  class Integer {
    low: number;
    high: number;

    constructor(low: number, high: number = 0) {
      this.low = low;
      this.high = high;
    }

    toNumber(): number {
      return this.low;
    }

    toString(): string {
      return String(this.low);
    }
  }

  // Mock int function
  const mockInt = (value: number): Integer => {
    return new Integer(value);
  };

  return {
    default: {
      auth: {
        basic: vi.fn().mockReturnValue('mock-auth'),
      },
      driver: mockDriverFn,
      int: mockInt,
      types: {
        Integer,
      },
    },
  };
});

// Mock the Neo4jConnectionManager
vi.mock('../../neo4j/Neo4jConnectionManager', () => {
  return {
    Neo4jConnectionManager: vi.fn().mockImplementation(() => {
      return {
        getSession: vi.fn().mockResolvedValue({
          beginTransaction: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({
              records: [
                {
                  get: vi.fn().mockImplementation((key) => {
                    if (key === 'e') {
                      return {
                        properties: {
                          id: 'test-id',
                          name: 'test-entity',
                          entityType: 'test',
                          observations: JSON.stringify(['test observation']),
                          version: 1,
                          createdAt: 1234567890,
                          updatedAt: 1234567890,
                          validFrom: 1234567890,
                          validTo: null,
                        },
                      };
                    } else if (key === 'r') {
                      return {
                        properties: {
                          id: 'relation-id',
                          relationType: 'test-relation',
                          strength: 0.5,
                          confidence: 0.8,
                          metadata: null,
                          version: 1,
                          createdAt: 1234567890,
                          updatedAt: 1234567890,
                          validFrom: 1234567890,
                          validTo: null,
                        },
                      };
                    } else if (key === 'from') {
                      return {
                        properties: {
                          name: 'entity1',
                          id: 'from-id',
                        },
                      };
                    } else if (key === 'to') {
                      return {
                        properties: {
                          name: 'entity2',
                          id: 'to-id',
                        },
                      };
                    } else if (key === 'fromName') {
                      return 'entity1';
                    } else if (key === 'toName') {
                      return 'entity2';
                    } else if (key === 'score') {
                      return 0.95;
                    } else if (key === 'outgoing') {
                      // Return an empty array by default, or add mock outgoing relationships
                      return [
                        {
                          rel: {
                            properties: {
                              id: 'out-rel-id',
                              relationType: 'test-relation',
                              strength: 0.5,
                              confidence: 0.8,
                              metadata: null,
                              version: 1,
                              createdAt: 1234567890,
                            },
                          },
                          to: {
                            properties: {
                              id: 'to-id',
                              name: 'entity2',
                            },
                          },
                        },
                      ];
                    } else if (key === 'incoming') {
                      // Return an empty array by default, or add mock incoming relationships
                      return [
                        {
                          rel: {
                            properties: {
                              id: 'in-rel-id',
                              relationType: 'test-relation',
                              strength: 0.5,
                              confidence: 0.8,
                              metadata: null,
                              version: 1,
                              createdAt: 1234567890,
                            },
                          },
                          from: {
                            properties: {
                              id: 'from-id',
                              name: 'entity1',
                            },
                          },
                        },
                      ];
                    }
                    return null;
                  }),
                },
              ],
            }),
            commit: vi.fn().mockResolvedValue(undefined),
            rollback: vi.fn().mockResolvedValue(undefined),
          }),
          close: vi.fn().mockResolvedValue(undefined),
        }),
        executeQuery: vi.fn().mockImplementation(() => {
          return {
            records: [
              {
                get: vi.fn().mockImplementation((key) => {
                  if (key === 'e') {
                    return {
                      properties: {
                        id: 'test-id',
                        name: 'test-entity',
                        entityType: 'test',
                        observations: JSON.stringify(['test observation']),
                        version: 1,
                        createdAt: 1234567890,
                        updatedAt: 1234567890,
                        validFrom: 1234567890,
                        validTo: null,
                      },
                    };
                  } else if (key === 'r') {
                    return {
                      properties: {
                        id: 'relation-id',
                        relationType: 'test-relation',
                        strength: 0.5,
                        confidence: 0.8,
                        metadata: null,
                        version: 1,
                        createdAt: 1234567890,
                        updatedAt: 1234567890,
                        validFrom: 1234567890,
                        validTo: null,
                      },
                    };
                  } else if (key === 'from') {
                    return {
                      properties: {
                        name: 'entity1',
                        id: 'from-id',
                      },
                    };
                  } else if (key === 'to') {
                    return {
                      properties: {
                        name: 'entity2',
                        id: 'to-id',
                      },
                    };
                  } else if (key === 'fromName') {
                    return 'entity1';
                  } else if (key === 'toName') {
                    return 'entity2';
                  } else if (key === 'score') {
                    return 0.95;
                  } else if (key === 'outgoing') {
                    // Return an empty array by default, or add mock outgoing relationships
                    return [
                      {
                        rel: {
                          properties: {
                            id: 'out-rel-id',
                            relationType: 'test-relation',
                            strength: 0.5,
                            confidence: 0.8,
                            metadata: null,
                            version: 1,
                            createdAt: 1234567890,
                          },
                        },
                        to: {
                          properties: {
                            id: 'to-id',
                            name: 'entity2',
                          },
                        },
                      },
                    ];
                  } else if (key === 'incoming') {
                    // Return an empty array by default, or add mock incoming relationships
                    return [
                      {
                        rel: {
                          properties: {
                            id: 'in-rel-id',
                            relationType: 'test-relation',
                            strength: 0.5,
                            confidence: 0.8,
                            metadata: null,
                            version: 1,
                            createdAt: 1234567890,
                          },
                        },
                        from: {
                          properties: {
                            id: 'from-id',
                            name: 'entity1',
                          },
                        },
                      },
                    ];
                  }
                  return null;
                }),
              },
            ],
          };
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

// Mock the Neo4jSchemaManager
vi.mock('../../neo4j/Neo4jSchemaManager', () => {
  return {
    Neo4jSchemaManager: vi.fn().mockImplementation(() => {
      return {
        initializeSchema: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

describe('Neo4jStorageProvider', () => {
  let storageProvider: Neo4jStorageProvider;
  let mockConfig: Neo4jConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      uri: 'bolt://localhost:7687',
      username: 'neo4j',
      password: 'memento_password',
      database: 'neo4j',
      vectorIndexName: 'entity_embeddings',
      vectorDimensions: 1536,
      similarityFunction: 'cosine',
    };

    storageProvider = new Neo4jStorageProvider({ config: mockConfig });
  });

  afterEach(async () => {
    if (storageProvider && typeof storageProvider.close === 'function') {
      await storageProvider.close();
    }
  });

  // Basic tests for the StorageProvider interface methods

  describe('loadGraph', () => {
    it('should load the graph from Neo4j', async () => {
      const graph = await storageProvider.loadGraph();

      // Should have called the correct Cypher query
      expect(storageProvider.getConnectionManager().executeQuery).toHaveBeenCalled();

      // Should return a valid graph
      expect(graph).toBeDefined();
      expect(graph.entities).toBeDefined();
      expect(graph.relations).toBeDefined();
    });
  });

  describe('saveGraph', () => {
    it('should save the graph to Neo4j', async () => {
      const mockGraph: KnowledgeGraph = {
        entities: [
          {
            name: 'test-entity',
            entityType: 'test',
            observations: ['test observation'],
          },
        ],
        relations: [],
      };

      await storageProvider.saveGraph(mockGraph);

      // Should have called the correct Cypher query
      expect(storageProvider.getConnectionManager().getSession).toHaveBeenCalled();
    });
  });

  describe('searchNodes', () => {
    it('should search for nodes matching a query', async () => {
      const result = await storageProvider.searchNodes('test');

      // Should have called the correct Cypher query
      expect(storageProvider.getConnectionManager().executeQuery).toHaveBeenCalled();

      // Should return a valid graph
      expect(result).toBeDefined();
      expect(result.entities).toBeDefined();
    });
  });

  describe('openNodes', () => {
    it('should open nodes by name', async () => {
      const result = await storageProvider.openNodes(['test-entity']);

      // Should have called the correct Cypher query
      expect(storageProvider.getConnectionManager().executeQuery).toHaveBeenCalled();

      // Should return a valid graph
      expect(result).toBeDefined();
      expect(result.entities).toBeDefined();
    });
  });

  describe('createEntities', () => {
    it('should create entities in Neo4j', async () => {
      const entities: Entity[] = [
        {
          name: 'test-entity',
          entityType: 'test',
          observations: ['test observation'],
        },
      ];

      const result = await storageProvider.createEntities(entities);

      // Should have called the correct Cypher query
      expect(storageProvider.getConnectionManager().getSession).toHaveBeenCalled();

      // Should return created entities with metadata
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test-entity');
      // Check the entity has an ID property (we can't assert exact value as it's dynamic)
      expect(result[0]).toHaveProperty('id');
    });
  });

  describe('createRelations', () => {
    it('should create relations in Neo4j', async () => {
      const relations: Relation[] = [
        {
          from: 'entity1',
          to: 'entity2',
          relationType: 'test-relation',
        },
      ];

      const result = await storageProvider.createRelations(relations);

      // Should have called the correct Cypher query
      expect(storageProvider.getConnectionManager().getSession).toHaveBeenCalled();

      // Should return created relations with metadata
      expect(result).toHaveLength(1);
      expect(result[0].from).toBe('entity1');
      expect(result[0].to).toBe('entity2');
      // Check the relation has the properties we expect from Neo4j
      expect(result[0]).toHaveProperty('relationType', 'test-relation');
    });
  });

  describe('addObservations', () => {
    it('should add observations to entities', async () => {
      const observations = [
        {
          entityName: 'test-entity',
          contents: ['new observation'],
        },
      ];

      const result = await storageProvider.addObservations(observations);

      // Should have called the correct Cypher query
      expect(storageProvider.getConnectionManager().getSession).toHaveBeenCalled();

      // Should return added observations
      expect(result).toHaveLength(1);
      expect(result[0].entityName).toBe('test-entity');
      expect(result[0].addedObservations).toBeDefined();
    });
  });

  describe('deleteEntities', () => {
    it('should delete entities and their relations', async () => {
      await storageProvider.deleteEntities(['test-entity']);

      // Should have called the correct Cypher query
      expect(storageProvider.getConnectionManager().getSession).toHaveBeenCalled();
    });
  });

  describe('deleteObservations', () => {
    it('should delete observations from entities', async () => {
      const deletions = [
        {
          entityName: 'test-entity',
          observations: ['test observation'],
        },
      ];

      await storageProvider.deleteObservations(deletions);

      // Should have called the correct Cypher query
      expect(storageProvider.getConnectionManager().getSession).toHaveBeenCalled();
    });
  });

  describe('deleteRelations', () => {
    it('should delete relations from the graph', async () => {
      const relations: Relation[] = [
        {
          from: 'entity1',
          to: 'entity2',
          relationType: 'test-relation',
        },
      ];

      await storageProvider.deleteRelations(relations);

      // Should have called the correct Cypher query
      expect(storageProvider.getConnectionManager().getSession).toHaveBeenCalled();
    });
  });

  describe('getEntity', () => {
    it('should retrieve an entity by name', async () => {
      const entity = await storageProvider.getEntity('test-entity');

      // Should have called the correct Cypher query
      expect(storageProvider.getConnectionManager().executeQuery).toHaveBeenCalled();

      // Should return the entity
      expect(entity).toBeDefined();
      expect(entity?.name).toBe('test-entity');
    });
  });

  // Optional methods tests

  describe('getRelation', () => {
    it('should retrieve a relation by source, target, and type', async () => {
      const relation = await storageProvider.getRelation('entity1', 'entity2', 'test-relation');

      // Should have called the correct Cypher query
      expect(storageProvider.getConnectionManager().executeQuery).toHaveBeenCalled();

      // Should return the relation
      expect(relation).toBeDefined();
    });
  });

  describe('updateRelation', () => {
    it('should update an existing relation', async () => {
      const relation: Relation = {
        from: 'entity1',
        to: 'entity2',
        relationType: 'test-relation',
        strength: 0.8,
      };

      await storageProvider.updateRelation(relation);

      // Should have called the correct Cypher query
      expect(storageProvider.getConnectionManager().getSession).toHaveBeenCalled();
    });
  });
});
