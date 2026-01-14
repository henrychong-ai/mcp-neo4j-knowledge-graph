/**
 * Centralized mock factories for test utilities
 * Provides consistent mocking patterns across all test files
 */
/* eslint-disable unicorn/no-useless-undefined */
import { vi } from 'vitest';

/**
 * Mock Integer class matching neo4j-driver's Integer type
 * Neo4j returns BigInt values that need special handling
 */
export class MockInteger {
  low: number;
  high: number;

  constructor(low: number, high = 0) {
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

/**
 * Create a mock integer (matches neo4j-driver int function)
 */
export function mockInt(value: number): MockInteger {
  return new MockInteger(value);
}

/**
 * Check if value is a MockInteger
 */
export function mockIsInt(value: unknown): value is MockInteger {
  return value instanceof MockInteger;
}

/**
 * Default Neo4j driver mock configuration
 */
export function createNeo4jDriverMock() {
  const mockDriverFn = vi.fn();

  return {
    default: {
      auth: {
        basic: vi.fn().mockReturnValue('mock-auth'),
      },
      driver: mockDriverFn,
      int: mockInt,
      types: {
        Integer: MockInteger,
      },
    },
    isInt: mockIsInt,
  };
}

/**
 * Create a mock Neo4j record with configurable responses
 */
export function createMockRecord(responses: Record<string, unknown> = {}): {
  get: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn().mockImplementation((key: string) => {
      return responses[key] ?? null;
    }),
  };
}

/**
 * Create a mock Neo4j transaction
 */
export function createMockTransaction(
  options: {
    records?: { get: ReturnType<typeof vi.fn> }[];
    shouldFail?: boolean;
    failureError?: Error;
  } = {}
) {
  const { records = [], shouldFail = false, failureError } = options;

  const run = shouldFail
    ? vi.fn().mockRejectedValue(failureError ?? new Error('Transaction failed'))
    : vi.fn().mockResolvedValue({ records });

  return {
    run,
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Create a mock Neo4j session
 */
export function createMockSession(transaction?: ReturnType<typeof createMockTransaction>) {
  const tx = transaction ?? createMockTransaction();

  return {
    beginTransaction: vi.fn().mockReturnValue(tx),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Create a mock Neo4jConnectionManager
 */
export function createMockConnectionManager(
  options: {
    session?: ReturnType<typeof createMockSession>;
    executeQueryResult?: { records: { get: ReturnType<typeof vi.fn> }[] };
  } = {}
) {
  const session = options.session ?? createMockSession();
  const executeQueryResult = options.executeQueryResult ?? { records: [] };

  return {
    getSession: vi.fn().mockResolvedValue(session),
    executeQuery: vi.fn().mockResolvedValue(executeQueryResult),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Create a mock KnowledgeGraphManager with all required methods
 */
export function createMockKnowledgeGraphManager(overrides: Record<string, unknown> = {}) {
  return {
    // Graph operations
    readGraph: vi.fn().mockResolvedValue({ entities: [], relations: [] }),

    // Entity operations
    createEntities: vi.fn().mockResolvedValue({ success: true }),
    createEntitiesBatch: vi
      .fn()
      .mockResolvedValue({ successful: [], failed: [], totalTimeMs: 0, avgTimePerItemMs: 0 }),
    deleteEntities: vi.fn().mockResolvedValue(undefined),
    getEntityHistory: vi.fn().mockResolvedValue([]),

    // Relation operations
    createRelations: vi.fn().mockResolvedValue({ success: true }),
    createRelationsBatch: vi
      .fn()
      .mockResolvedValue({ successful: [], failed: [], totalTimeMs: 0, avgTimePerItemMs: 0 }),
    deleteRelations: vi.fn().mockResolvedValue(undefined),
    getRelation: vi
      .fn()
      .mockResolvedValue({ from: 'Entity1', to: 'Entity2', relationType: 'KNOWS' }),
    updateRelation: vi.fn().mockResolvedValue(undefined),
    getRelationHistory: vi.fn().mockResolvedValue([]),

    // Observation operations
    addObservations: vi.fn().mockResolvedValue({ success: true }),
    addObservationsBatch: vi
      .fn()
      .mockResolvedValue({ successful: [], failed: [], totalTimeMs: 0, avgTimePerItemMs: 0 }),
    deleteObservations: vi.fn().mockResolvedValue(undefined),

    // Search operations
    searchNodes: vi.fn().mockResolvedValue([]),
    openNodes: vi.fn().mockResolvedValue([]),
    semanticSearch: vi.fn().mockResolvedValue([]),

    // Entity updates
    updateEntitiesBatch: vi
      .fn()
      .mockResolvedValue({ successful: [], failed: [], totalTimeMs: 0, avgTimePerItemMs: 0 }),

    // Embedding operations
    getEntityEmbedding: vi.fn().mockResolvedValue(null),

    // Temporal operations
    getGraphAtTime: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    getDecayedGraph: vi.fn().mockResolvedValue({ entities: [], relations: [] }),

    // Apply overrides
    ...overrides,
  };
}

/**
 * Create a mock EmbeddingService
 */
export function createMockEmbeddingService(overrides: Record<string, unknown> = {}) {
  return {
    generateEmbedding: vi.fn().mockResolvedValue({
      vector: new Array(1536).fill(0).map(() => Math.random()),
      model: 'text-embedding-3-small',
      lastUpdated: Date.now(),
    }),
    generateEmbeddings: vi.fn().mockResolvedValue([]),
    isAvailable: vi.fn().mockReturnValue(true),
    ...overrides,
  };
}

/**
 * Create a mock VectorStore
 */
export function createMockVectorStore(overrides: Record<string, unknown> = {}) {
  return {
    storeEmbedding: vi.fn().mockResolvedValue(undefined),
    getEmbedding: vi.fn().mockResolvedValue(null),
    searchSimilar: vi.fn().mockResolvedValue([]),
    deleteEmbedding: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Create entity properties for Neo4j record mock
 */
export function createEntityProperties(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: 'test-entity-id',
    name: 'test-entity',
    entityType: 'test-type',
    domain: null,
    observations: JSON.stringify(['test observation']),
    version: 1,
    createdAt: now,
    updatedAt: now,
    validFrom: now,
    validTo: null,
    ...overrides,
  };
}

/**
 * Create relation properties for Neo4j record mock
 */
export function createRelationProperties(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: 'test-relation-id',
    relationType: 'RELATES_TO',
    strength: 0.5,
    confidence: 0.8,
    metadata: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    validFrom: now,
    validTo: null,
    ...overrides,
  };
}
