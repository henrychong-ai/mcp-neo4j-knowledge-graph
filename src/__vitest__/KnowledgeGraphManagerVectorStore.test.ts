import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KnowledgeGraphManager } from '../KnowledgeGraphManager.js';
import { VectorStore } from '../types/vector-store.js';
import { EntityEmbedding } from '../types/entity-embedding.js';

// Create mocks before vi.mock calls
const createVectorStoreMock = () => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  addVector: vi.fn().mockResolvedValue(undefined),
  removeVector: vi.fn().mockResolvedValue(undefined),
  search: vi.fn().mockResolvedValue([
    { id: 'Entity1', similarity: 0.95, metadata: { entityType: 'Person' } },
    { id: 'Entity2', similarity: 0.85, metadata: { entityType: 'Place' } },
  ]),
});

// Mock VectorStoreFactory
vi.mock('../storage/VectorStoreFactory.js', () => {
  return {
    VectorStoreFactory: {
      createVectorStore: vi.fn().mockImplementation(() => {
        return Promise.resolve(vectorStoreMock);
      }),
    },
  };
});

// Mock storage provider
const createMockStorageProvider = () => ({
  getEntity: vi.fn().mockImplementation((name) => {
    return Promise.resolve({
      name,
      entityType: 'Test',
      observations: ['Test observation'],
      embedding: {
        vector: Array(1536)
          .fill(0)
          .map((_, i) => i / 1536),
        model: 'test-model',
        lastUpdated: Date.now(),
      },
    });
  }),
  openNodes: vi.fn().mockResolvedValue({
    entities: [
      {
        name: 'Entity1',
        entityType: 'Person',
        observations: ['Person observation'],
      },
      {
        name: 'Entity2',
        entityType: 'Place',
        observations: ['Place observation'],
      },
    ],
    relations: [],
  }),
  loadGraph: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
  saveGraph: vi.fn().mockResolvedValue(undefined),
  createEntities: vi.fn().mockImplementation((entities) => Promise.resolve(entities)),
  createRelations: vi.fn().mockResolvedValue([]),
  updateEntityEmbedding: vi.fn().mockResolvedValue(undefined),
  deleteEntities: vi.fn().mockResolvedValue(undefined),
  deleteObservations: vi.fn().mockResolvedValue(undefined),
  deleteRelations: vi.fn().mockResolvedValue(undefined),
  searchNodes: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
  addObservations: vi.fn().mockImplementation((observations) => {
    return Promise.resolve(
      observations.map((obs) => ({
        entityName: obs.entityName,
        addedObservations: obs.contents,
      }))
    );
  }),
});

// Mock embedding service
const createMockEmbeddingService = () => ({
  generateEmbedding: vi.fn().mockResolvedValue(
    Array(1536)
      .fill(0)
      .map((_, i) => i / 1536)
  ),
  getModelInfo: vi.fn().mockReturnValue({ dimensions: 1536, name: 'test-model' }),
});

// Mock embedding job manager
const createMockEmbeddingJobManager = (embeddingService: any) => ({
  scheduleEntityEmbedding: vi.fn().mockResolvedValue('job-id'),
  processJobs: vi.fn().mockResolvedValue({ processed: 1, successful: 1, failed: 0 }),
  embeddingService: embeddingService,
});

// Global instance of the mock vector store
let vectorStoreMock: ReturnType<typeof createVectorStoreMock>;

// Import the factory after mocking it
import { VectorStoreFactory } from '../storage/VectorStoreFactory.js';

describe('KnowledgeGraphManager with VectorStore', () => {
  let manager: KnowledgeGraphManager;
  let mockStorageProvider: ReturnType<typeof createMockStorageProvider>;
  let mockEmbeddingService: ReturnType<typeof createMockEmbeddingService>;
  let mockEmbeddingJobManager: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create fresh mocks for each test
    vectorStoreMock = createVectorStoreMock();
    mockStorageProvider = createMockStorageProvider();
    mockEmbeddingService = createMockEmbeddingService();
    mockEmbeddingJobManager = createMockEmbeddingJobManager(mockEmbeddingService);

    // Create manager with options
    manager = new KnowledgeGraphManager({
      storageProvider: mockStorageProvider,
      embeddingJobManager: mockEmbeddingJobManager,
      vectorStoreOptions: {
        type: 'chroma',
        collectionName: 'test_collection',
      },
    });
  });

  it('should initialize vector store using factory', async () => {
    // Verify the factory was called with correct options
    expect(VectorStoreFactory.createVectorStore).toHaveBeenCalledWith({
      type: 'chroma',
      collectionName: 'test_collection',
      initializeImmediately: true,
    });
  });

  it('should use vector store for semantic search', async () => {
    // Setup mock embedding
    const mockEmbedding = Array(1536)
      .fill(0)
      .map((_, i) => i / 1536);
    mockEmbeddingService.generateEmbedding.mockResolvedValue(mockEmbedding);

    // Perform search
    const results = await manager.findSimilarEntities('test query', { limit: 5, threshold: 0.8 });

    // Verify embedding was generated
    expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith('test query');

    // Verify vector store search was used
    expect(vectorStoreMock.search).toHaveBeenCalledWith(mockEmbedding, {
      limit: 5,
      minSimilarity: 0.8,
    });

    // Verify results are properly formatted
    expect(results).toEqual([
      { name: 'Entity1', score: 0.95 },
      { name: 'Entity2', score: 0.85 },
    ]);
  });

  it('should add entity embeddings to vector store when created', async () => {
    // Create an entity with embedding
    const entity = {
      name: 'TestEntity',
      entityType: 'Test',
      observations: ['Test observation'],
      embedding: {
        vector: Array(1536)
          .fill(0)
          .map((_, i) => i / 1536),
        model: 'test-model',
        lastUpdated: Date.now(),
      },
    };

    // Trigger entity creation
    await manager.createEntities([entity]);

    // Verify embedding was added to vector store
    expect(vectorStoreMock.addVector).toHaveBeenCalledWith('TestEntity', entity.embedding.vector, {
      entityType: 'Test',
      name: 'TestEntity',
    });
  });

  it('should update vector store when entity embedding changes', async () => {
    // Setup
    const entityName = 'TestEntity';
    const embedding: EntityEmbedding = {
      vector: Array(1536)
        .fill(0)
        .map((_, i) => i / 1536),
      model: 'test-model',
      lastUpdated: Date.now(),
    };

    // Call the update method
    await (manager as any).updateEntityEmbedding(entityName, embedding);

    // Verify vector store was updated
    expect(vectorStoreMock.addVector).toHaveBeenCalledWith(
      entityName,
      embedding.vector,
      expect.objectContaining({ name: entityName })
    );

    // Verify storage provider was also updated
    expect(mockStorageProvider.updateEntityEmbedding).toHaveBeenCalledWith(entityName, embedding);
  });

  it('should remove vectors from store when entities are deleted', async () => {
    // Call delete method
    await manager.deleteEntities(['Entity1', 'Entity2']);

    // Verify vectors were removed
    expect(vectorStoreMock.removeVector).toHaveBeenCalledWith('Entity1');
    expect(vectorStoreMock.removeVector).toHaveBeenCalledWith('Entity2');

    // Verify storage provider was also called
    expect(mockStorageProvider.deleteEntities).toHaveBeenCalledWith(['Entity1', 'Entity2']);
  });
});
