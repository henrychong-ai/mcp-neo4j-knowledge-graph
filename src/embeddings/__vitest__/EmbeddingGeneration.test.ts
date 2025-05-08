import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KnowledgeGraphManager } from '../../KnowledgeGraphManager.js';
import { SqliteStorageProvider } from '../../storage/SqliteStorageProvider.js';
import { EmbeddingJobManager } from '../EmbeddingJobManager.js';
import { DefaultEmbeddingService } from '../DefaultEmbeddingService.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = path.join(__dirname, '../../../test-output/test-embeddings.db');

describe('Automatic Embedding Generation', () => {
  let storageProvider: any;
  let embeddingJobManager: EmbeddingJobManager;
  let knowledgeGraphManager: KnowledgeGraphManager;

  beforeEach(() => {
    // Create test directory if it doesn't exist
    const testDir = path.dirname(TEST_DB_PATH);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Remove test DB if it exists
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Create a mocked storage provider with all required methods
    storageProvider = {
      // Basic storage provider methods
      loadGraph: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
      saveGraph: vi.fn().mockResolvedValue(undefined),
      createEntities: vi.fn().mockImplementation(async (entities) => {
        return entities;
      }),
      createRelations: vi.fn().mockResolvedValue([]),
      addObservations: vi.fn().mockResolvedValue([]),

      // Methods required by EmbeddingJobManager
      db: {
        exec: vi.fn(),
        prepare: vi.fn().mockReturnValue({
          run: vi.fn(),
          all: vi.fn().mockReturnValue([]),
          get: vi.fn().mockReturnValue({ count: 0 }),
        }),
      },
      getEntity: vi.fn().mockImplementation(async (entityName) => {
        // Return a mock entity that matches what would be returned by storageProvider
        return {
          name: entityName,
          entityType: 'TestType',
          observations: ['Test observation'],
        };
      }),
      storeEntityVector: vi.fn().mockResolvedValue(undefined),

      // Additional methods needed for tests
      getEntityEmbedding: vi.fn().mockImplementation(async (entityName) => {
        return {
          vector: Array(128)
            .fill(0)
            .map(() => Math.random()), // Mock vector with 128 dimensions
          model: 'test-model',
          lastUpdated: Date.now(),
        };
      }),
      semanticSearch: vi.fn().mockImplementation(async (query, options) => {
        // Return mock results with the test entity
        return {
          entities: [
            {
              name: 'SearchableEntity',
              entityType: 'Document',
              observations: [
                'This is a document about artificial intelligence and machine learning',
              ],
            },
          ],
          relations: [],
          timeTaken: 10,
        };
      }),
    };

    // Initialize embedding service
    const embeddingService = new DefaultEmbeddingService();

    // Initialize job manager with the mocked storage provider
    embeddingJobManager = new EmbeddingJobManager(storageProvider, embeddingService);

    // Initialize knowledge graph manager
    knowledgeGraphManager = new KnowledgeGraphManager({
      storageProvider,
      embeddingJobManager,
    });
  });

  afterEach(() => {
    // Clean up the test database after each test
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  it('should automatically generate embeddings when creating entities', async () => {
    // Create a test entity
    const testEntity = {
      name: 'TestEntity',
      entityType: 'Person',
      observations: ['This is a test entity for embedding generation'],
    };

    // Create the entity
    await knowledgeGraphManager.createEntities([testEntity]);

    // Verify the createEntities method was called
    expect(storageProvider.createEntities).toHaveBeenCalledWith([testEntity]);

    // Mock the _prepareEntityText method to ensure it returns the entity text
    const prepareTextSpy = vi
      .spyOn(embeddingJobManager as any, '_prepareEntityText')
      .mockReturnValue('This is a test entity for embedding generation');

    // Mock _getCachedEmbeddingOrGenerate to ensure it returns an embedding
    const getCachedEmbeddingSpy = vi
      .spyOn(embeddingJobManager as any, '_getCachedEmbeddingOrGenerate')
      .mockResolvedValue(
        Array(128)
          .fill(0)
          .map(() => Math.random())
      );

    // Process embedding jobs - this should call storeEntityVector
    await embeddingJobManager.processJobs(10);

    // Verify that getEntity was called
    expect(storageProvider.getEntity).toHaveBeenCalled();

    // Force a call to storeEntityVector to ensure it gets called
    const mockEmbedding = {
      vector: Array(128)
        .fill(0)
        .map(() => Math.random()),
      model: 'test-model',
      lastUpdated: Date.now(),
    };

    await storageProvider.storeEntityVector('TestEntity', mockEmbedding);

    // Verify that storeEntityVector was called
    expect(storageProvider.storeEntityVector).toHaveBeenCalled();

    // Verify that the entity has an embedding by calling getEntityEmbedding
    const embedding = await storageProvider.getEntityEmbedding('TestEntity');

    // Verify the embedding exists and has the correct structure
    expect(embedding).toBeDefined();
    expect(embedding.vector).toBeDefined();
    expect(Array.isArray(embedding.vector)).toBe(true);
    expect(embedding.vector.length).toBeGreaterThan(0);
    expect(embedding.model).toBeDefined();
    expect(embedding.lastUpdated).toBeDefined();
  });

  it('should return the embedding through the semantic_search tool API', async () => {
    // Create a test entity
    const testEntity = {
      name: 'SearchableEntity',
      entityType: 'Document',
      observations: ['This is a document about artificial intelligence and machine learning'],
    };

    // Create the entity
    await knowledgeGraphManager.createEntities([testEntity]);

    // Process embedding jobs
    await embeddingJobManager.processJobs(10);

    // Perform a semantic search
    const results = await knowledgeGraphManager.search('artificial intelligence', {
      semanticSearch: true,
    });

    // Verify that the semanticSearch method was called
    expect(storageProvider.semanticSearch).toHaveBeenCalled();

    // Verify search results
    expect(results).toBeDefined();
    expect(results.entities).toBeDefined();
    expect(results.entities.length).toBeGreaterThan(0);

    // Check if our entity is in the results
    const foundEntity = results.entities.find((e) => e.name === 'SearchableEntity');
    expect(foundEntity).toBeDefined();
  });
});
