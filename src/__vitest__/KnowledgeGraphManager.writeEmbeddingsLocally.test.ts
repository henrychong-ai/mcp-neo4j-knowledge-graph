import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KnowledgeGraphManager, Entity } from '../KnowledgeGraphManager.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import type { EmbeddingJobManager } from '../embeddings/EmbeddingJobManager.js';

/**
 * Tests for the `writeEmbeddingsLocally` option (v2.3.0).
 *
 * All 7 entity-write paths route through the private `queueEmbeddings` helper,
 * which short-circuits when the option is false. We verify the helper's gating
 * behaviour via the two most-trafficked paths: `createEntities` (initial writes)
 * and `addObservations` (entity updates).
 */

const buildMockProvider = (): Partial<StorageProvider> => ({
  loadGraph: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
  saveGraph: vi.fn(),
  searchNodes: vi.fn().mockResolvedValue({ entities: [], relations: [], total: 0 }),
  openNodes: vi.fn().mockResolvedValue({ entities: [], relations: [], total: 0 }),
  createEntities: vi.fn().mockImplementation((entities: Entity[]) => Promise.resolve(entities)),
  createRelations: vi.fn().mockResolvedValue([]),
  addObservations: vi.fn().mockResolvedValue([{ entityName: 'e1', addedObservations: ['obs'] }]),
  deleteEntities: vi.fn().mockResolvedValue([{ entityName: 'e1' }]),
  deleteObservations: vi.fn(),
  deleteRelations: vi.fn(),
});

const buildMockJobManager = () => {
  const scheduleEntityEmbedding = vi.fn().mockResolvedValue('job-id');
  const manager: Partial<EmbeddingJobManager> = {
    scheduleEntityEmbedding,
    embeddingService: {
      generateEmbedding: vi.fn(),
      generateEmbeddings: vi.fn(),
      getModelInfo: () => ({ name: 'mock', dimensions: 1536 }),
    } as unknown as EmbeddingJobManager['embeddingService'],
  };
  return { manager: manager as EmbeddingJobManager, scheduleEntityEmbedding };
};

describe('KnowledgeGraphManager.writeEmbeddingsLocally', () => {
  let mockProvider: Partial<StorageProvider>;
  let scheduleEntityEmbedding: ReturnType<typeof vi.fn>;
  let jobManager: EmbeddingJobManager;

  beforeEach(() => {
    mockProvider = buildMockProvider();
    const built = buildMockJobManager();
    jobManager = built.manager;
    scheduleEntityEmbedding = built.scheduleEntityEmbedding;
  });

  it('defaults to true (legacy behavior preserved)', async () => {
    const manager = new KnowledgeGraphManager({
      storageProvider: mockProvider as StorageProvider,
      embeddingJobManager: jobManager,
    });

    await manager.createEntities([{ name: 'e1', entityType: 'test', observations: ['obs'] }]);

    expect(scheduleEntityEmbedding).toHaveBeenCalledTimes(1);
    expect(scheduleEntityEmbedding).toHaveBeenCalledWith('e1', 1);
  });

  it('still queues when explicitly set to true', async () => {
    const manager = new KnowledgeGraphManager({
      storageProvider: mockProvider as StorageProvider,
      embeddingJobManager: jobManager,
      writeEmbeddingsLocally: true,
    });

    await manager.createEntities([{ name: 'e1', entityType: 'test', observations: ['obs'] }]);

    expect(scheduleEntityEmbedding).toHaveBeenCalledTimes(1);
  });

  it('skips queueing on createEntities when set to false', async () => {
    const manager = new KnowledgeGraphManager({
      storageProvider: mockProvider as StorageProvider,
      embeddingJobManager: jobManager,
      writeEmbeddingsLocally: false,
    });

    const result = await manager.createEntities([
      { name: 'e1', entityType: 'test', observations: ['obs'] },
      { name: 'e2', entityType: 'test', observations: ['obs2'] },
    ]);

    // Entities still flow through to the storage provider
    expect(mockProvider.createEntities).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
    // But no embedding jobs are queued
    expect(scheduleEntityEmbedding).not.toHaveBeenCalled();
  });

  it('skips queueing on addObservations when set to false', async () => {
    const manager = new KnowledgeGraphManager({
      storageProvider: mockProvider as StorageProvider,
      embeddingJobManager: jobManager,
      writeEmbeddingsLocally: false,
    });

    await manager.addObservations([{ entityName: 'e1', contents: ['new obs'] }]);

    expect(mockProvider.addObservations).toHaveBeenCalledTimes(1);
    expect(scheduleEntityEmbedding).not.toHaveBeenCalled();
  });
});
