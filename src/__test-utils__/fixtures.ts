/**
 * Test fixtures providing consistent test data across all test files
 */
import type { Entity } from '../KnowledgeGraphManager.js';
import type { Relation } from '../types/relation.js';
import type { TemporalEntity } from '../types/temporalEntity.js';
import type { TemporalRelation } from '../types/temporalRelation.js';

// Base timestamp for consistent test data
const BASE_TIMESTAMP = 1_700_000_000_000;

/**
 * Sample entity fixtures
 */
export const testEntities = {
  basic: {
    name: 'test-entity',
    entityType: 'test-type',
    observations: ['Test observation 1', 'Test observation 2'],
  } as Entity,

  person: {
    name: 'John Doe',
    entityType: 'person',
    observations: ['Software engineer', 'Lives in Singapore'],
  } as Entity,

  organization: {
    name: 'Acme Corp',
    entityType: 'organization',
    observations: ['Technology company', 'Founded in 2020'],
  } as Entity,

  withDomain: {
    name: 'domain-entity',
    entityType: 'test-type',
    domain: 'medical',
    observations: ['Has domain set'],
  } as Entity,

  withEmbedding: {
    name: 'embedded-entity',
    entityType: 'test-type',
    observations: ['Has embedding'],
    embedding: {
      vector: new Array(1536).fill(0).map((_, i) => i / 1536),
      model: 'text-embedding-3-small',
      lastUpdated: BASE_TIMESTAMP,
    },
  } as Entity,
} as const;

/**
 * Sample relation fixtures
 */
export const testRelations = {
  basic: {
    from: 'entity1',
    to: 'entity2',
    relationType: 'RELATES_TO',
  } as Relation,

  withMetadata: {
    from: 'John Doe',
    to: 'Acme Corp',
    relationType: 'WORKS_AT',
    strength: 0.9,
    confidence: 0.95,
    metadata: {
      createdAt: BASE_TIMESTAMP,
      updatedAt: BASE_TIMESTAMP,
    },
  } as Relation,

  weak: {
    from: 'entity1',
    to: 'entity2',
    relationType: 'KNOWS',
    strength: 0.2,
    confidence: 0.5,
  } as Relation,
} as const;

/**
 * Sample temporal entity fixtures (with versioning metadata)
 */
export const testTemporalEntities = {
  current: {
    id: 'temporal-entity-id-1',
    name: 'temporal-entity',
    entityType: 'test-type',
    observations: ['Current version observation'],
    version: 2,
    createdAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP + 1000,
    validFrom: BASE_TIMESTAMP + 1000,
  } as TemporalEntity,

  historical: {
    id: 'temporal-entity-id-0',
    name: 'temporal-entity',
    entityType: 'test-type',
    observations: ['Historical observation'],
    version: 1,
    createdAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
    validFrom: BASE_TIMESTAMP,
    validTo: BASE_TIMESTAMP + 1000,
  } as TemporalEntity,
} as const;

/**
 * Sample temporal relation fixtures
 */
export const testTemporalRelations = {
  current: {
    id: 'temporal-relation-id-1',
    from: 'entity1',
    to: 'entity2',
    relationType: 'RELATES_TO',
    strength: 0.8,
    confidence: 0.9,
    version: 1,
    createdAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
    validFrom: BASE_TIMESTAMP,
  } as TemporalRelation,
} as const;

/**
 * Sample embedding fixtures
 */
export const testEmbeddings = {
  basic: {
    vector: new Array(1536).fill(0).map(() => Math.random() * 2 - 1),
    model: 'text-embedding-3-small',
    lastUpdated: BASE_TIMESTAMP,
  },

  zeros: {
    vector: new Array(1536).fill(0),
    model: 'text-embedding-3-small',
    lastUpdated: BASE_TIMESTAMP,
  },

  normalized: {
    vector: (() => {
      const v = new Array(1536).fill(0).map(() => Math.random());
      const magnitude = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
      return v.map((x) => x / magnitude);
    })(),
    model: 'text-embedding-3-small',
    lastUpdated: BASE_TIMESTAMP,
  },
} as const;

/**
 * Sample batch operation fixtures
 */
export const testBatches = {
  entities: [
    { name: 'batch-entity-1', entityType: 'test', observations: ['Observation 1'] },
    { name: 'batch-entity-2', entityType: 'test', observations: ['Observation 2'] },
    { name: 'batch-entity-3', entityType: 'test', observations: ['Observation 3'] },
  ],

  relations: [
    { from: 'entity1', to: 'entity2', relationType: 'RELATES_TO' },
    { from: 'entity2', to: 'entity3', relationType: 'RELATES_TO' },
    { from: 'entity3', to: 'entity1', relationType: 'RELATES_TO' },
  ],

  observations: [
    { entityName: 'entity1', contents: ['New observation 1', 'New observation 2'] },
    { entityName: 'entity2', contents: ['New observation 3'] },
  ],

  entityUpdates: [
    { name: 'entity1', addObservations: ['Added observation'] },
    { name: 'entity2', removeObservations: ['Old observation'] },
    { name: 'entity3', entityType: 'updated-type' },
  ],
} as const;

/**
 * Factory function to create test entities with custom properties
 */
export function createTestEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    name: `test-entity-${Date.now()}`,
    entityType: 'test-type',
    observations: ['Default observation'],
    ...overrides,
  };
}

/**
 * Factory function to create multiple test entities
 */
export function createTestEntities(count: number, baseOverrides: Partial<Entity> = {}): Entity[] {
  return Array.from({ length: count }, (_, i) =>
    createTestEntity({
      name: `test-entity-${i}`,
      observations: [`Observation for entity ${i}`],
      ...baseOverrides,
    })
  );
}

/**
 * Factory function to create test relations with custom properties
 */
export function createTestRelation(overrides: Partial<Relation> = {}): Relation {
  return {
    from: 'entity-from',
    to: 'entity-to',
    relationType: 'RELATES_TO',
    ...overrides,
  };
}

/**
 * Factory function to create test temporal entities
 */
export function createTestTemporalEntity(overrides: Partial<TemporalEntity> = {}): TemporalEntity {
  const now = Date.now();
  return {
    id: `temporal-${now}`,
    name: `temporal-entity-${now}`,
    entityType: 'test-type',
    observations: ['Default temporal observation'],
    version: 1,
    createdAt: now,
    updatedAt: now,
    validFrom: now,
    ...overrides,
  };
}

/**
 * MCP request fixtures for tool handler testing
 */
export const testMCPRequests = {
  readGraph: {
    params: {
      name: 'read_graph',
      arguments: {},
    },
  },

  createEntities: {
    params: {
      name: 'create_entities',
      arguments: {
        entities: [testEntities.basic],
      },
    },
  },

  createRelations: {
    params: {
      name: 'create_relations',
      arguments: {
        relations: [testRelations.basic],
      },
    },
  },

  addObservations: {
    params: {
      name: 'add_observations',
      arguments: {
        observations: [
          {
            entityName: 'test-entity',
            contents: ['New observation'],
          },
        ],
      },
    },
  },

  searchNodes: {
    params: {
      name: 'search_nodes',
      arguments: {
        query: 'test query',
      },
    },
  },

  semanticSearch: {
    params: {
      name: 'semantic_search',
      arguments: {
        query: 'semantic test query',
        limit: 10,
      },
    },
  },
} as const;
