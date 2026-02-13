/**
 * Stability tests for KnowledgeGraphManager
 * Covers: getRelation fallback, updateEntity with embedding scheduling,
 * batch validation edge cases, and createEntitiesBatch with embeddings
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  KnowledgeGraphManager,
  type Entity,
  type KnowledgeGraph,
} from '../KnowledgeGraphManager.js';
import type { Relation } from '../types/relation.js';
import type { StorageProvider } from '../storage/StorageProvider.js';

// Mock the logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fs module
vi.mock('../utils/fs.js', () => ({
  fs: {
    readFile: vi.fn().mockResolvedValue('{}'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('KnowledgeGraphManager Stability', () => {
  let manager: KnowledgeGraphManager;
  let mockGraph: KnowledgeGraph;
  let mockStorageProvider: Partial<StorageProvider>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGraph = {
      entities: [
        { name: 'Entity1', entityType: 'test', observations: ['obs1'] },
        { name: 'Entity2', entityType: 'test', observations: ['obs2'] },
        { name: 'Entity3', entityType: 'test', observations: ['obs3'] },
      ],
      relations: [
        { from: 'Entity1', to: 'Entity2', relationType: 'RELATES_TO', strength: 0.5 },
        { from: 'Entity2', to: 'Entity3', relationType: 'DEPENDS_ON', strength: 0.8 },
      ],
    };

    mockStorageProvider = {
      loadGraph: vi.fn().mockResolvedValue(mockGraph),
      saveGraph: vi.fn().mockResolvedValue(undefined),
      initialize: vi.fn().mockResolvedValue(undefined),
      createEntities: vi.fn().mockResolvedValue([]),
      createRelations: vi.fn().mockResolvedValue([]),
      addObservations: vi.fn().mockResolvedValue([]),
      deleteObservations: vi.fn().mockResolvedValue(undefined),
      deleteEntities: vi.fn().mockResolvedValue(undefined),
      deleteRelations: vi.fn().mockResolvedValue(undefined),
      openNodes: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
      searchNodes: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
      updateEntity: vi.fn().mockImplementation((name: string, updates: Partial<Entity>) => {
        const entity = mockGraph.entities.find(e => e.name === name);
        if (!entity) {
          return Promise.reject(new Error(`Entity with name ${name} not found`));
        }
        return Promise.resolve({ ...entity, ...updates });
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };

    manager = new KnowledgeGraphManager({
      storageProvider: mockStorageProvider as StorageProvider,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // getRelation Tests
  // --------------------------------------------------------------------------

  describe('getRelation', () => {
    it('should use storage provider getRelation when available', async () => {
      const mockGetRelation = vi.fn().mockResolvedValue({
        from: 'Entity1',
        to: 'Entity2',
        relationType: 'RELATES_TO',
        strength: 0.9,
      });

      mockStorageProvider.getRelation = mockGetRelation;

      manager = new KnowledgeGraphManager({
        storageProvider: mockStorageProvider as StorageProvider,
      });

      const result = await manager.getRelation('Entity1', 'Entity2', 'RELATES_TO');

      expect(mockGetRelation).toHaveBeenCalledWith('Entity1', 'Entity2', 'RELATES_TO');
      expect(result?.strength).toBe(0.9);
    });
  });

  // --------------------------------------------------------------------------
  // updateEntity with Embedding Scheduling Tests
  // --------------------------------------------------------------------------

  describe('updateEntity with embedding scheduling', () => {
    it('should schedule embedding when observations are updated and embeddingJobManager exists', async () => {
      const mockScheduleEntityEmbedding = vi.fn().mockResolvedValue(undefined);
      const mockEmbeddingJobManager = {
        scheduleEntityEmbedding: mockScheduleEntityEmbedding,
      };

      manager = new KnowledgeGraphManager({
        storageProvider: mockStorageProvider as StorageProvider,
        embeddingJobManager: mockEmbeddingJobManager as any,
      });

      await manager.updateEntity('Entity1', {
        observations: ['new observation 1', 'new observation 2'],
      });

      expect(mockScheduleEntityEmbedding).toHaveBeenCalledWith('Entity1', 2);
    });

    it('should not schedule embedding when observations are not updated', async () => {
      const mockScheduleEntityEmbedding = vi.fn().mockResolvedValue(undefined);
      const mockEmbeddingJobManager = {
        scheduleEntityEmbedding: mockScheduleEntityEmbedding,
      };

      manager = new KnowledgeGraphManager({
        storageProvider: mockStorageProvider as StorageProvider,
        embeddingJobManager: mockEmbeddingJobManager as any,
      });

      await manager.updateEntity('Entity1', {
        entityType: 'updated-type',
      });

      expect(mockScheduleEntityEmbedding).not.toHaveBeenCalled();
    });

    it('should not schedule embedding when embeddingJobManager does not exist', async () => {
      // Manager without embeddingJobManager
      manager = new KnowledgeGraphManager({
        storageProvider: mockStorageProvider as StorageProvider,
      });

      // Should not throw
      const result = await manager.updateEntity('Entity1', {
        observations: ['new observation'],
      });

      expect(result.observations).toEqual(['new observation']);
    });

    it('should update entity and schedule embedding for multiple observations', async () => {
      const mockScheduleEntityEmbedding = vi.fn().mockResolvedValue(undefined);
      const mockEmbeddingJobManager = {
        scheduleEntityEmbedding: mockScheduleEntityEmbedding,
      };

      manager = new KnowledgeGraphManager({
        storageProvider: mockStorageProvider as StorageProvider,
        embeddingJobManager: mockEmbeddingJobManager as any,
      });

      const newObservations = ['obs1', 'obs2', 'obs3', 'obs4', 'obs5'];
      await manager.updateEntity('Entity2', { observations: newObservations });

      expect(mockScheduleEntityEmbedding).toHaveBeenCalledWith('Entity2', 2);
    });
  });

  // --------------------------------------------------------------------------
  // createEntitiesBatch with Embedding Scheduling Tests
  // --------------------------------------------------------------------------

  describe('createEntitiesBatch with embedding scheduling', () => {
    it('should schedule embeddings for successfully created entities', async () => {
      const mockScheduleEntityEmbedding = vi.fn().mockResolvedValue(undefined);
      const mockEmbeddingJobManager = {
        scheduleEntityEmbedding: mockScheduleEntityEmbedding,
      };

      const mockBatchResult = {
        successful: [
          { name: 'NewEntity1', entityType: 'test', observations: ['obs1'] },
          { name: 'NewEntity2', entityType: 'test', observations: ['obs2'] },
        ],
        failed: [],
      };

      mockStorageProvider.createEntitiesBatch = vi.fn().mockResolvedValue(mockBatchResult);

      manager = new KnowledgeGraphManager({
        storageProvider: mockStorageProvider as StorageProvider,
        embeddingJobManager: mockEmbeddingJobManager as any,
      });

      const entities: Entity[] = [
        { name: 'NewEntity1', entityType: 'test', observations: ['obs1'] },
        { name: 'NewEntity2', entityType: 'test', observations: ['obs2'] },
      ];

      await manager.createEntitiesBatch(entities);

      expect(mockScheduleEntityEmbedding).toHaveBeenCalledTimes(2);
      expect(mockScheduleEntityEmbedding).toHaveBeenCalledWith('NewEntity1', 1);
      expect(mockScheduleEntityEmbedding).toHaveBeenCalledWith('NewEntity2', 1);
    });

    it('should not schedule embeddings when no entities are successful', async () => {
      const mockScheduleEntityEmbedding = vi.fn().mockResolvedValue(undefined);
      const mockEmbeddingJobManager = {
        scheduleEntityEmbedding: mockScheduleEntityEmbedding,
      };

      const mockBatchResult = {
        successful: [],
        failed: [
          {
            entity: { name: 'FailedEntity', entityType: 'test', observations: [] },
            error: 'Failed',
          },
        ],
      };

      mockStorageProvider.createEntitiesBatch = vi.fn().mockResolvedValue(mockBatchResult);

      manager = new KnowledgeGraphManager({
        storageProvider: mockStorageProvider as StorageProvider,
        embeddingJobManager: mockEmbeddingJobManager as any,
      });

      const entities: Entity[] = [{ name: 'FailedEntity', entityType: 'test', observations: [] }];

      await manager.createEntitiesBatch(entities);

      expect(mockScheduleEntityEmbedding).not.toHaveBeenCalled();
    });

    it('should not schedule embeddings when embeddingJobManager does not exist', async () => {
      const mockBatchResult = {
        successful: [{ name: 'NewEntity1', entityType: 'test', observations: ['obs1'] }],
        failed: [],
      };

      mockStorageProvider.createEntitiesBatch = vi.fn().mockResolvedValue(mockBatchResult);

      manager = new KnowledgeGraphManager({
        storageProvider: mockStorageProvider as StorageProvider,
        // No embeddingJobManager
      });

      const entities: Entity[] = [
        { name: 'NewEntity1', entityType: 'test', observations: ['obs1'] },
      ];

      // Should not throw
      const result = await manager.createEntitiesBatch(entities);
      expect(result.successful).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // createEntitiesBatch Validation Edge Cases
  // --------------------------------------------------------------------------

  describe('createEntitiesBatch validation edge cases', () => {
    beforeEach(() => {
      // Add createEntitiesBatch to mock
      mockStorageProvider.createEntitiesBatch = vi.fn().mockResolvedValue({
        successful: [],
        failed: [],
      });

      manager = new KnowledgeGraphManager({
        storageProvider: mockStorageProvider as StorageProvider,
      });
    });

    it('should throw error for entity with invalid name (number)', async () => {
      const entities = [
        { name: 123 as unknown as string, entityType: 'test', observations: ['obs'] },
      ];

      await expect(manager.createEntitiesBatch(entities)).rejects.toThrow(
        "Entity at index 0 has invalid 'name' field"
      );
    });

    it('should throw error for entity with null name', async () => {
      const entities = [
        { name: null as unknown as string, entityType: 'test', observations: ['obs'] },
      ];

      await expect(manager.createEntitiesBatch(entities)).rejects.toThrow(
        "Entity at index 0 is missing required 'name' field"
      );
    });

    it('should throw error for entity with undefined name', async () => {
      const entities = [
        { name: undefined as unknown as string, entityType: 'test', observations: ['obs'] },
      ];

      await expect(manager.createEntitiesBatch(entities)).rejects.toThrow(
        "Entity at index 0 is missing required 'name' field"
      );
    });

    it('should throw error for entity with entityType as number', async () => {
      const entities = [
        { name: 'Entity1', entityType: 123 as unknown as string, observations: ['obs'] },
      ];

      await expect(manager.createEntitiesBatch(entities)).rejects.toThrow(
        "Entity at index 0 has invalid 'entityType' field"
      );
    });

    it('should throw error for entity with null entityType', async () => {
      const entities = [
        { name: 'Entity1', entityType: null as unknown as string, observations: ['obs'] },
      ];

      await expect(manager.createEntitiesBatch(entities)).rejects.toThrow(
        "Entity at index 0 has invalid 'entityType' field"
      );
    });

    it('should throw error when storage provider does not support batch creation', async () => {
      // Remove createEntitiesBatch from mock
      delete (mockStorageProvider as any).createEntitiesBatch;

      manager = new KnowledgeGraphManager({
        storageProvider: mockStorageProvider as StorageProvider,
      });

      const entities: Entity[] = [{ name: 'Entity1', entityType: 'test', observations: ['obs'] }];

      await expect(manager.createEntitiesBatch(entities)).rejects.toThrow(
        'Storage provider does not support batch entity creation'
      );
    });

    it('should detect multiple duplicates in batch', async () => {
      const entities: Entity[] = [
        { name: 'DupeName', entityType: 'test', observations: ['obs1'] },
        { name: 'UniqueName', entityType: 'test', observations: ['obs2'] },
        { name: 'DupeName', entityType: 'test', observations: ['obs3'] },
        { name: 'AnotherDupe', entityType: 'test', observations: ['obs4'] },
        { name: 'AnotherDupe', entityType: 'test', observations: ['obs5'] },
      ];

      await expect(manager.createEntitiesBatch(entities)).rejects.toThrow(
        'Duplicate entity names within batch: DupeName, AnotherDupe'
      );
    });

    it('should detect multiple null entries in array', async () => {
      const entities = [
        { name: 'Entity1', entityType: 'test', observations: ['obs'] },
        null as unknown as Entity,
        undefined as unknown as Entity,
        { name: 'Entity2', entityType: 'test', observations: ['obs'] },
      ];

      await expect(manager.createEntitiesBatch(entities)).rejects.toThrow(
        'Found 2 null/undefined entries in entities array'
      );
    });
  });

  // --------------------------------------------------------------------------
  // createRelationsBatch Validation Edge Cases
  // --------------------------------------------------------------------------

  describe('createRelationsBatch validation edge cases', () => {
    beforeEach(() => {
      mockStorageProvider.createRelationsBatch = vi.fn().mockResolvedValue({
        successful: [],
        failed: [],
      });

      manager = new KnowledgeGraphManager({
        storageProvider: mockStorageProvider as StorageProvider,
      });
    });

    it('should throw error when storage provider does not support batch creation', async () => {
      delete (mockStorageProvider as any).createRelationsBatch;

      manager = new KnowledgeGraphManager({
        storageProvider: mockStorageProvider as StorageProvider,
      });

      const relations: Relation[] = [{ from: 'A', to: 'B', relationType: 'REL' }];

      await expect(manager.createRelationsBatch(relations)).rejects.toThrow(
        'Storage provider does not support batch relation creation'
      );
    });

    it('should throw error for relation with from as number', async () => {
      const relations = [{ from: 123 as unknown as string, to: 'B', relationType: 'REL' }];

      await expect(manager.createRelationsBatch(relations)).rejects.toThrow(
        "Relation at index 0 has invalid 'from' field"
      );
    });

    it('should throw error for relation with to as number', async () => {
      const relations = [{ from: 'A', to: 123 as unknown as string, relationType: 'REL' }];

      await expect(manager.createRelationsBatch(relations)).rejects.toThrow(
        "Relation at index 0 has invalid 'to' field"
      );
    });

    it('should throw error for relation with relationType as number', async () => {
      const relations = [{ from: 'A', to: 'B', relationType: 123 as unknown as string }];

      await expect(manager.createRelationsBatch(relations)).rejects.toThrow(
        "Relation at index 0 has invalid 'relationType' field"
      );
    });

    it('should throw error for relation with null from', async () => {
      const relations = [{ from: null as unknown as string, to: 'B', relationType: 'REL' }];

      await expect(manager.createRelationsBatch(relations)).rejects.toThrow(
        "Relation at index 0 has invalid 'from' field"
      );
    });

    it('should detect multiple null entries in relations array', async () => {
      const relations = [
        { from: 'A', to: 'B', relationType: 'REL' },
        null as unknown as Relation,
        null as unknown as Relation,
        undefined as unknown as Relation,
      ];

      await expect(manager.createRelationsBatch(relations)).rejects.toThrow(
        'Found 3 null/undefined entries in relations array'
      );
    });
  });

  // --------------------------------------------------------------------------
  // addObservationsBatch and updateEntitiesBatch Edge Cases
  // --------------------------------------------------------------------------

  describe('addObservationsBatch validation edge cases', () => {
    beforeEach(() => {
      mockStorageProvider.addObservationsBatch = vi.fn().mockResolvedValue({
        successful: [],
        failed: [],
      });

      manager = new KnowledgeGraphManager({
        storageProvider: mockStorageProvider as StorageProvider,
      });
    });

    it('should throw error when storage provider does not support batch observations', async () => {
      delete (mockStorageProvider as any).addObservationsBatch;

      manager = new KnowledgeGraphManager({
        storageProvider: mockStorageProvider as StorageProvider,
      });

      const observations = [{ entityName: 'Entity1', observations: ['obs'] }];

      await expect(manager.addObservationsBatch(observations)).rejects.toThrow(
        'Storage provider does not support batch observation addition'
      );
    });

    it('should throw error for observation with entityName as number', async () => {
      const observations = [{ entityName: 123 as unknown as string, observations: ['obs'] }];

      await expect(manager.addObservationsBatch(observations)).rejects.toThrow(
        "Observation batch at index 0 has invalid 'entityName' field"
      );
    });

    it('should throw error for observation with null entityName', async () => {
      const observations = [{ entityName: null as unknown as string, observations: ['obs'] }];

      await expect(manager.addObservationsBatch(observations)).rejects.toThrow(
        "Observation batch at index 0 has invalid 'entityName' field"
      );
    });
  });

  describe('updateEntitiesBatch validation edge cases', () => {
    beforeEach(() => {
      mockStorageProvider.updateEntitiesBatch = vi.fn().mockResolvedValue({
        successful: [],
        failed: [],
      });

      manager = new KnowledgeGraphManager({
        storageProvider: mockStorageProvider as StorageProvider,
      });
    });

    it('should throw error when storage provider does not support batch updates', async () => {
      delete (mockStorageProvider as any).updateEntitiesBatch;

      manager = new KnowledgeGraphManager({
        storageProvider: mockStorageProvider as StorageProvider,
      });

      const updates = [{ name: 'Entity1', entityType: 'new-type' }];

      await expect(manager.updateEntitiesBatch(updates)).rejects.toThrow(
        'Storage provider does not support batch entity updates'
      );
    });

    it('should throw error for update with name as number', async () => {
      const updates = [{ name: 123 as unknown as string, entityType: 'new-type' }];

      await expect(manager.updateEntitiesBatch(updates)).rejects.toThrow(
        "Entity update at index 0 has invalid 'name' field"
      );
    });

    it('should throw error for update with null name', async () => {
      const updates = [{ name: null as unknown as string, entityType: 'new-type' }];

      await expect(manager.updateEntitiesBatch(updates)).rejects.toThrow(
        "Entity update at index 0 has invalid 'name' field"
      );
    });
  });
});
