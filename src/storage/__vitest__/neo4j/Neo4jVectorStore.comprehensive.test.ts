/**
 * Comprehensive tests for Neo4jVectorStore
 * Covers: constructor, initialization, vector operations, search, diagnostics
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Neo4jConnectionManager } from '../../neo4j/Neo4jConnectionManager.js';
import { Neo4jVectorStore } from '../../neo4j/Neo4jVectorStore.js';

// Mock the logger
vi.mock('../../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ============================================================================
// Test Utilities and Factories
// ============================================================================

interface MockTransaction {
  run: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
  rollback: ReturnType<typeof vi.fn>;
}

interface MockSession {
  run: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  beginTransaction: () => MockTransaction;
}

interface MockConnectionManager {
  getSession: ReturnType<typeof vi.fn>;
}

interface MockSchemaManager {
  vectorIndexExists: ReturnType<typeof vi.fn>;
  createVectorIndex: ReturnType<typeof vi.fn>;
}

function createMockTransaction(): MockTransaction {
  return {
    run: vi.fn().mockResolvedValue({ records: [] }),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockSession(transaction?: MockTransaction): MockSession {
  const tx = transaction || createMockTransaction();
  return {
    run: vi.fn().mockResolvedValue({ records: [] }),
    close: vi.fn().mockResolvedValue(undefined),
    beginTransaction: () => tx,
  };
}

function createMockConnectionManager(session?: MockSession): MockConnectionManager {
  return {
    getSession: vi.fn().mockResolvedValue(session || createMockSession()),
  };
}

function createValidVector(dimensions = 1536): number[] {
  return Array.from({ length: dimensions }, () => Math.random() * 0.1 + 0.01);
}

function createZeroVector(dimensions = 1536): number[] {
  return Array.from({ length: dimensions }, () => 0);
}

// ============================================================================
// Test Suites
// ============================================================================

describe('Neo4jVectorStore', () => {
  let connectionManager: MockConnectionManager;
  let session: MockSession;
  let transaction: MockTransaction;
  let vectorStore: Neo4jVectorStore;

  beforeEach(() => {
    vi.clearAllMocks();
    transaction = createMockTransaction();
    session = createMockSession(transaction);
    connectionManager = createMockConnectionManager(session);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Constructor Tests
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('should initialize with default options', () => {
      vectorStore = new Neo4jVectorStore({
        connectionManager: connectionManager as unknown as Neo4jConnectionManager,
      });

      expect(vectorStore.initialized).toBe(false);
    });

    it('should accept custom index name', () => {
      vectorStore = new Neo4jVectorStore({
        connectionManager: connectionManager as unknown as Neo4jConnectionManager,
        indexName: 'custom_index',
      });

      expect(vectorStore).toBeDefined();
    });

    it('should accept custom dimensions', () => {
      vectorStore = new Neo4jVectorStore({
        connectionManager: connectionManager as unknown as Neo4jConnectionManager,
        dimensions: 768,
      });

      expect(vectorStore).toBeDefined();
    });

    it('should accept custom similarity function', () => {
      vectorStore = new Neo4jVectorStore({
        connectionManager: connectionManager as unknown as Neo4jConnectionManager,
        similarityFunction: 'euclidean',
      });

      expect(vectorStore).toBeDefined();
    });

    it('should accept custom entity node label', () => {
      vectorStore = new Neo4jVectorStore({
        connectionManager: connectionManager as unknown as Neo4jConnectionManager,
        entityNodeLabel: 'CustomEntity',
      });

      expect(vectorStore).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Initialize Tests
  // --------------------------------------------------------------------------

  describe('initialize', () => {
    beforeEach(() => {
      vectorStore = new Neo4jVectorStore({
        connectionManager: connectionManager as unknown as Neo4jConnectionManager,
      });
    });

    it('should initialize successfully when index exists', async () => {
      // Mock schemaManager with existing index
      const mockSchemaManager = {
        vectorIndexExists: vi.fn().mockResolvedValue(true),
        createVectorIndex: vi.fn(),
      };
      (vectorStore as unknown as { schemaManager: MockSchemaManager }).schemaManager =
        mockSchemaManager;

      await vectorStore.initialize();

      expect(vectorStore.initialized).toBe(true);
      expect(mockSchemaManager.vectorIndexExists).toHaveBeenCalledWith('entity_embeddings');
      expect(mockSchemaManager.createVectorIndex).not.toHaveBeenCalled();
    });

    it('should create index when it does not exist', async () => {
      const mockSchemaManager = {
        vectorIndexExists: vi.fn().mockResolvedValue(false),
        createVectorIndex: vi.fn().mockResolvedValue(undefined),
      };
      (vectorStore as unknown as { schemaManager: MockSchemaManager }).schemaManager =
        mockSchemaManager;

      await vectorStore.initialize();

      expect(vectorStore.initialized).toBe(true);
      expect(mockSchemaManager.createVectorIndex).toHaveBeenCalledWith(
        'entity_embeddings',
        'Entity',
        'embedding',
        1536,
        'cosine'
      );
    });

    it('should handle schemaManager without vectorIndexExists method', async () => {
      (vectorStore as unknown as { schemaManager: Record<string, unknown> }).schemaManager = {};

      await vectorStore.initialize();

      expect(vectorStore.initialized).toBe(true);
    });

    it('should throw error when initialization fails', async () => {
      const mockSchemaManager = {
        vectorIndexExists: vi.fn().mockRejectedValue(new Error('Connection failed')),
        createVectorIndex: vi.fn(),
      };
      (vectorStore as unknown as { schemaManager: MockSchemaManager }).schemaManager =
        mockSchemaManager;

      await expect(vectorStore.initialize()).rejects.toThrow('Connection failed');
      expect(vectorStore.initialized).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // addVector Tests
  // --------------------------------------------------------------------------

  describe('addVector', () => {
    beforeEach(async () => {
      vectorStore = new Neo4jVectorStore({
        connectionManager: connectionManager as unknown as Neo4jConnectionManager,
      });
      vectorStore.initialized = true;
    });

    it('should add vector successfully', async () => {
      const vector = createValidVector();

      await vectorStore.addVector('entity1', vector);

      expect(transaction.run).toHaveBeenCalled();
      expect(transaction.commit).toHaveBeenCalled();
    });

    it('should add vector with metadata', async () => {
      const vector = createValidVector();
      const metadata = { key: 'value', num: 123 };

      await vectorStore.addVector('entity1', vector, metadata);

      // Should call run twice - once for vector, once for metadata
      expect(transaction.run).toHaveBeenCalledTimes(2);
      expect(transaction.commit).toHaveBeenCalled();
    });

    it('should not store empty metadata', async () => {
      const vector = createValidVector();

      await vectorStore.addVector('entity1', vector, {});

      // Should only call run once for vector
      expect(transaction.run).toHaveBeenCalledTimes(1);
    });

    it('should throw error for invalid vector dimensions', async () => {
      const wrongDimensionVector = createValidVector(768);

      await expect(vectorStore.addVector('entity1', wrongDimensionVector)).rejects.toThrow(
        'Invalid vector dimensions: expected 1536, got 768'
      );
    });

    it('should throw error when not initialized', async () => {
      vectorStore.initialized = false;

      await expect(vectorStore.addVector('entity1', createValidVector())).rejects.toThrow(
        'Neo4j vector store not initialized. Call initialize() first.'
      );
    });

    it('should rollback transaction on error', async () => {
      transaction.run.mockRejectedValueOnce(new Error('Query failed'));

      await expect(vectorStore.addVector('entity1', createValidVector())).rejects.toThrow(
        'Query failed'
      );
      expect(transaction.rollback).toHaveBeenCalled();
    });

    it('should handle numeric id', async () => {
      const vector = createValidVector();

      await vectorStore.addVector(123, vector);

      expect(transaction.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ id: '123' })
      );
    });
  });

  // --------------------------------------------------------------------------
  // removeVector Tests
  // --------------------------------------------------------------------------

  describe('removeVector', () => {
    beforeEach(() => {
      vectorStore = new Neo4jVectorStore({
        connectionManager: connectionManager as unknown as Neo4jConnectionManager,
      });
      vectorStore.initialized = true;
    });

    it('should remove vector successfully', async () => {
      await vectorStore.removeVector('entity1');

      expect(session.run).toHaveBeenCalledWith(expect.stringContaining('REMOVE e.embedding'), {
        id: 'entity1',
      });
      expect(session.close).toHaveBeenCalled();
    });

    it('should handle numeric id', async () => {
      await vectorStore.removeVector(456);

      expect(session.run).toHaveBeenCalledWith(expect.any(String), { id: '456' });
    });

    it('should throw error when not initialized', async () => {
      vectorStore.initialized = false;

      await expect(vectorStore.removeVector('entity1')).rejects.toThrow(
        'Neo4j vector store not initialized. Call initialize() first.'
      );
    });

    it('should throw error when query fails', async () => {
      session.run.mockRejectedValueOnce(new Error('Remove failed'));

      await expect(vectorStore.removeVector('entity1')).rejects.toThrow('Remove failed');
    });
  });

  // --------------------------------------------------------------------------
  // search Tests
  // --------------------------------------------------------------------------

  describe('search', () => {
    beforeEach(() => {
      vectorStore = new Neo4jVectorStore({
        connectionManager: connectionManager as unknown as Neo4jConnectionManager,
      });
      vectorStore.initialized = true;
    });

    it('should search with valid vector', async () => {
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, unknown> = {
              id: 'entity1',
              entityType: 'test',
              domain: null,
              similarity: 0.95,
            };
            return values[key];
          }),
        },
      ];
      session.run.mockResolvedValueOnce({ records: mockRecords });

      const results = await vectorStore.search(createValidVector());

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('entity1');
      expect(results[0].similarity).toBe(0.95);
      expect(results[0].metadata.searchMethod).toBe('vector');
    });

    it('should search with custom limit', async () => {
      session.run.mockResolvedValueOnce({ records: [] });

      await vectorStore.search(createValidVector(), { limit: 10 });

      expect(session.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ limit: expect.anything() })
      );
    });

    it('should search with minimum similarity', async () => {
      session.run.mockResolvedValueOnce({ records: [] });

      await vectorStore.search(createValidVector(), { minSimilarity: 0.8 });

      expect(session.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ minScore: 0.8 })
      );
    });

    it('should search with domain filter', async () => {
      session.run.mockResolvedValueOnce({ records: [] });

      await vectorStore.search(createValidVector(), { domain: 'medical' });

      expect(session.run).toHaveBeenCalledWith(
        expect.stringContaining('node.domain'),
        expect.objectContaining({ domain: 'medical' })
      );
    });

    it('should use fallback for invalid vector dimensions', async () => {
      // The search method catches errors internally and uses fallback
      const fallbackRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, unknown> = {
              id: 'fallback',
              entityType: 'test',
              domain: null,
              similarity: 0.5,
            };
            return values[key];
          }),
        },
      ];
      session.run.mockResolvedValueOnce({ records: fallbackRecords });

      const results = await vectorStore.search(createValidVector(768));

      // Should return fallback results instead of throwing
      expect(results).toHaveLength(1);
    });

    it('should use fallback for zero vectors', async () => {
      // Fallback query result
      const fallbackRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, unknown> = {
              id: 'fallback1',
              entityType: 'test',
              domain: null,
              similarity: 0.75,
            };
            return values[key];
          }),
        },
      ];
      session.run.mockResolvedValueOnce({ records: fallbackRecords });

      const results = await vectorStore.search(createZeroVector());

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('fallback1');
    });

    it('should use fallback when vector search returns no results', async () => {
      // First call returns no results (vector search)
      session.run.mockResolvedValueOnce({ records: [] });
      // Second call is fallback
      const fallbackRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, unknown> = {
              id: 'fallback2',
              entityType: 'test',
              domain: null,
              similarity: 0.5,
            };
            return values[key];
          }),
        },
      ];
      session.run.mockResolvedValueOnce({ records: fallbackRecords });

      const results = await vectorStore.search(createValidVector());

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('fallback2');
    });

    it('should use fallback when vector search throws error', async () => {
      session.run.mockRejectedValueOnce(new Error('Vector search failed'));
      const fallbackRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, unknown> = {
              id: 'fallback3',
              entityType: 'test',
              domain: null,
              similarity: 0.5,
            };
            return values[key];
          }),
        },
      ];
      session.run.mockResolvedValueOnce({ records: fallbackRecords });

      const results = await vectorStore.search(createValidVector());

      expect(results).toHaveLength(1);
    });

    it('should use fallback when not initialized', async () => {
      vectorStore.initialized = false;

      // The search method catches errors internally and uses fallback
      const fallbackRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, unknown> = {
              id: 'fallback',
              entityType: 'test',
              domain: null,
              similarity: 0.5,
            };
            return values[key];
          }),
        },
      ];
      session.run.mockResolvedValueOnce({ records: fallbackRecords });

      const results = await vectorStore.search(createValidVector());

      // Should return fallback results instead of throwing
      expect(results).toHaveLength(1);
    });

    it('should handle vector with infinite values', async () => {
      const invalidVector = createValidVector();
      invalidVector[0] = Infinity;

      // Should use fallback
      const fallbackRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, unknown> = {
              id: 'fallback4',
              entityType: 'test',
              domain: null,
              similarity: 0.5,
            };
            return values[key];
          }),
        },
      ];
      session.run.mockResolvedValueOnce({ records: fallbackRecords });

      const results = await vectorStore.search(invalidVector);

      expect(results).toHaveLength(1);
    });

    it('should return fallback results when outer try-catch triggers', async () => {
      vectorStore.initialized = true;
      // Make getSession throw to trigger outer catch
      connectionManager.getSession.mockRejectedValueOnce(new Error('Session failed'));

      // Fallback should still work
      connectionManager.getSession.mockResolvedValueOnce(session);
      const fallbackRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, unknown> = {
              id: 'fallback5',
              entityType: 'test',
              domain: null,
              similarity: 0.5,
            };
            return values[key];
          }),
        },
      ];
      session.run.mockResolvedValueOnce({ records: fallbackRecords });

      const results = await vectorStore.search(createValidVector());

      expect(results).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // diagnosticGetEntityEmbeddings Tests
  // --------------------------------------------------------------------------

  describe('diagnosticGetEntityEmbeddings', () => {
    beforeEach(() => {
      vectorStore = new Neo4jVectorStore({
        connectionManager: connectionManager as unknown as Neo4jConnectionManager,
      });
    });

    it('should return diagnostic information', async () => {
      // Mock count query
      session.run.mockResolvedValueOnce({
        records: [{ get: vi.fn().mockReturnValue({ toNumber: () => 100 }) }],
      });

      // Mock sample query
      session.run.mockResolvedValueOnce({
        records: [
          {
            get: vi.fn((key: string) => {
              const values: Record<string, unknown> = {
                'e.name': 'Entity1',
                'e.entityType': 'test',
                embeddingSize: 1536,
              };
              return values[key];
            }),
          },
        ],
      });

      // Mock index query
      session.run.mockResolvedValueOnce({
        records: [
          {
            get: vi.fn((key: string) => {
              const values: Record<string, unknown> = {
                name: 'entity_embeddings',
                state: 'ONLINE',
              };
              return values[key];
            }),
          },
        ],
      });

      // Mock type query
      session.run.mockResolvedValueOnce({
        records: [
          {
            get: vi.fn((key: string) => {
              const values: Record<string, unknown> = {
                'e.name': 'Entity1',
                embeddingType: 'FLOAT_ARRAY',
              };
              return values[key];
            }),
          },
        ],
      });

      // Mock vector query test
      session.run.mockResolvedValueOnce({
        records: [
          {
            get: vi.fn((key: string) => {
              const values: Record<string, unknown> = { 'node.name': 'TestEntity', score: 0.99 };
              return values[key];
            }),
          },
        ],
      });

      const result = await vectorStore.diagnosticGetEntityEmbeddings();

      expect(result.count).toBe(100);
      expect(result.samples).toHaveLength(1);
      expect(result.indexInfo.name).toBe('entity_embeddings');
      expect(result.embeddingType).toBe('FLOAT_ARRAY');
      expect(result.vectorQueryTest.success).toBe(true);
    });

    it('should handle missing index', async () => {
      session.run.mockResolvedValueOnce({
        records: [{ get: vi.fn().mockReturnValue({ toNumber: () => 0 }) }],
      });
      session.run.mockResolvedValueOnce({ records: [] });
      session.run.mockResolvedValueOnce({ records: [] }); // No index found
      session.run.mockResolvedValueOnce({ records: [] }); // No type info

      const result = await vectorStore.diagnosticGetEntityEmbeddings();

      expect(result.indexInfo.name).toBeNull();
      expect(result.indexInfo.state).toBeNull();
    });

    it('should handle type query error', async () => {
      session.run.mockResolvedValueOnce({
        records: [{ get: vi.fn().mockReturnValue({ toNumber: () => 10 }) }],
      });
      session.run.mockResolvedValueOnce({ records: [] });
      session.run.mockResolvedValueOnce({ records: [] });
      session.run.mockRejectedValueOnce(new Error('APOC not installed'));

      const result = await vectorStore.diagnosticGetEntityEmbeddings();

      expect(result.embeddingType).toContain('error');
    });

    it('should handle vector query test failure', async () => {
      session.run.mockResolvedValueOnce({
        records: [{ get: vi.fn().mockReturnValue({ toNumber: () => 10 }) }],
      });
      session.run.mockResolvedValueOnce({ records: [] });
      session.run.mockResolvedValueOnce({ records: [] });
      session.run.mockResolvedValueOnce({ records: [] });
      session.run.mockRejectedValueOnce(new Error('Vector index not available'));

      const result = await vectorStore.diagnosticGetEntityEmbeddings();

      expect(result.vectorQueryTest.success).toBe(false);
      expect(result.vectorQueryTest.error).toContain('Vector index not available');
    });

    it('should throw error when diagnostic query fails completely', async () => {
      connectionManager.getSession.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(vectorStore.diagnosticGetEntityEmbeddings()).rejects.toThrow(
        'Connection failed'
      );
    });
  });

  // --------------------------------------------------------------------------
  // Private Method Tests (via public behavior)
  // --------------------------------------------------------------------------

  describe('vector validation', () => {
    beforeEach(() => {
      vectorStore = new Neo4jVectorStore({
        connectionManager: connectionManager as unknown as Neo4jConnectionManager,
      });
      vectorStore.initialized = true;
    });

    it('should detect invalid vector with NaN values', async () => {
      const invalidVector = createValidVector();
      invalidVector[100] = NaN;

      const fallbackRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, unknown> = {
              id: 'fallback',
              entityType: 'test',
              domain: null,
              similarity: 0.5,
            };
            return values[key];
          }),
        },
      ];
      session.run.mockResolvedValueOnce({ records: fallbackRecords });

      const results = await vectorStore.search(invalidVector);

      // Should use fallback due to invalid vector
      expect(results[0].id).toBe('fallback');
    });

    it('should accept valid normalized vector', async () => {
      const normalizedVector = createValidVector();
      // Normalize the vector
      const magnitude = Math.sqrt(normalizedVector.reduce((sum, val) => sum + val * val, 0));
      const normalized = normalizedVector.map((v) => v / magnitude);

      const searchRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, unknown> = {
              id: 'entity1',
              entityType: 'test',
              domain: null,
              similarity: 0.98,
            };
            return values[key];
          }),
        },
      ];
      session.run.mockResolvedValueOnce({ records: searchRecords });

      const results = await vectorStore.search(normalized);

      expect(results[0].id).toBe('entity1');
    });
  });

  describe('custom dimensions', () => {
    it('should work with custom dimensions', async () => {
      vectorStore = new Neo4jVectorStore({
        connectionManager: connectionManager as unknown as Neo4jConnectionManager,
        dimensions: 768,
      });
      vectorStore.initialized = true;

      const vector = createValidVector(768);

      await vectorStore.addVector('entity1', vector);

      expect(transaction.run).toHaveBeenCalled();
    });

    it('should reject wrong dimensions for custom store', async () => {
      vectorStore = new Neo4jVectorStore({
        connectionManager: connectionManager as unknown as Neo4jConnectionManager,
        dimensions: 768,
      });
      vectorStore.initialized = true;

      await expect(vectorStore.addVector('entity1', createValidVector(1536))).rejects.toThrow(
        'Invalid vector dimensions: expected 768, got 1536'
      );
    });
  });
});
