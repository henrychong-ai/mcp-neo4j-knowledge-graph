/**
 * Tests for KnowledgeGraphManager fallback implementations
 * Covers: updateRelation, updateEntity fallbacks, and batch operations
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  KnowledgeGraphManager,
  type Entity,
  type KnowledgeGraph,
} from '../KnowledgeGraphManager.js';
import type { Relation } from '../types/relation.js';

// Mock the logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fs module with the named export 'fs' matching how it's imported
vi.mock('../utils/fs.js', () => ({
  fs: {
    readFile: vi.fn().mockResolvedValue('{}'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('KnowledgeGraphManager Fallback Operations', () => {
  let manager: KnowledgeGraphManager;
  let mockGraph: KnowledgeGraph;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a simple mock graph
    mockGraph = {
      entities: [
        { name: 'Entity1', entityType: 'test', observations: ['obs1'] },
        { name: 'Entity2', entityType: 'test', observations: ['obs2'] },
      ],
      relations: [{ from: 'Entity1', to: 'Entity2', relationType: 'RELATES_TO', strength: 0.5 }],
    };

    // Create manager with minimal storage provider that supports loading/saving but not updates
    const minimalStorageProvider = {
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
      close: vi.fn().mockResolvedValue(undefined),
    };

    manager = new KnowledgeGraphManager({
      storageProvider:
        minimalStorageProvider as unknown as import('../storage/StorageProvider.js').StorageProvider,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Temporal Operations Tests (Error Cases)
  // --------------------------------------------------------------------------

  describe('temporal operations error cases', () => {
    let managerNoTemporal: KnowledgeGraphManager;

    beforeEach(() => {
      // Create manager with storage provider that doesn't support temporal ops
      const noTemporalProvider = {
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
        close: vi.fn().mockResolvedValue(undefined),
        // Explicitly no getDecayedGraph, getEntityHistory, getRelationHistory, getGraphAtTime
      };

      managerNoTemporal = new KnowledgeGraphManager({
        storageProvider:
          noTemporalProvider as unknown as import('../storage/StorageProvider.js').StorageProvider,
      });
    });

    it('should throw error when getDecayedGraph not supported', async () => {
      await expect(managerNoTemporal.getDecayedGraph()).rejects.toThrow(
        'Storage provider does not support decay operations'
      );
    });

    it('should throw error when getEntityHistory not supported', async () => {
      await expect(managerNoTemporal.getEntityHistory('Entity1')).rejects.toThrow(
        'Storage provider does not support entity history operations'
      );
    });

    it('should throw error when getRelationHistory not supported', async () => {
      await expect(
        managerNoTemporal.getRelationHistory('Entity1', 'Entity2', 'RELATES_TO')
      ).rejects.toThrow('Storage provider does not support relation history operations');
    });

    it('should throw error when getGraphAtTime not supported', async () => {
      await expect(managerNoTemporal.getGraphAtTime(Date.now())).rejects.toThrow(
        'Storage provider does not support temporal graph operations'
      );
    });
  });

  // --------------------------------------------------------------------------
  // Batch Operations Validation Tests
  // --------------------------------------------------------------------------

  describe('createEntitiesBatch validation', () => {
    it('should throw error for empty array', async () => {
      await expect(manager.createEntitiesBatch([])).rejects.toThrow(
        'Entities must be a non-empty array'
      );
    });

    it('should throw error for null entries in array', async () => {
      const entities = [
        { name: 'Entity1', entityType: 'test', observations: ['obs'] },
        null as unknown as Entity,
      ];

      await expect(manager.createEntitiesBatch(entities)).rejects.toThrow(
        'Found 1 null/undefined entries in entities array'
      );
    });

    it('should throw error for duplicate names in batch', async () => {
      const entities: Entity[] = [
        { name: 'DuplicateName', entityType: 'test', observations: ['obs1'] },
        { name: 'DuplicateName', entityType: 'test', observations: ['obs2'] },
      ];

      await expect(manager.createEntitiesBatch(entities)).rejects.toThrow(
        'Duplicate entity names within batch: DuplicateName'
      );
    });

    it('should throw error for invalid entityType', async () => {
      const entities = [{ name: 'Entity1', entityType: '', observations: ['obs'] }];

      await expect(manager.createEntitiesBatch(entities)).rejects.toThrow(
        "Entity at index 0 has invalid 'entityType' field"
      );
    });

    it('should throw error for invalid observations', async () => {
      const entities = [
        {
          name: 'Entity1',
          entityType: 'test',
          observations: 'not-an-array' as unknown as string[],
        },
      ];

      await expect(manager.createEntitiesBatch(entities)).rejects.toThrow(
        "Entity at index 0 has invalid 'observations' field (must be array)"
      );
    });
  });

  describe('createRelationsBatch validation', () => {
    it('should throw error for empty array', async () => {
      await expect(manager.createRelationsBatch([])).rejects.toThrow(
        'Relations must be a non-empty array'
      );
    });

    it('should throw error for null entries in array', async () => {
      const relations = [{ from: 'A', to: 'B', relationType: 'REL' }, null as unknown as Relation];

      await expect(manager.createRelationsBatch(relations)).rejects.toThrow(
        'Found 1 null/undefined entries in relations array'
      );
    });

    it('should throw error for missing from field', async () => {
      const relations = [{ from: '', to: 'B', relationType: 'REL' }];

      await expect(manager.createRelationsBatch(relations)).rejects.toThrow(
        "Relation at index 0 has invalid 'from' field"
      );
    });

    it('should throw error for missing to field', async () => {
      const relations = [{ from: 'A', to: '', relationType: 'REL' }];

      await expect(manager.createRelationsBatch(relations)).rejects.toThrow(
        "Relation at index 0 has invalid 'to' field"
      );
    });

    it('should throw error for missing relationType field', async () => {
      const relations = [{ from: 'A', to: 'B', relationType: '' }];

      await expect(manager.createRelationsBatch(relations)).rejects.toThrow(
        "Relation at index 0 has invalid 'relationType' field"
      );
    });
  });

  describe('addObservationsBatch validation', () => {
    it('should throw error for empty array', async () => {
      await expect(manager.addObservationsBatch([])).rejects.toThrow(
        'Observation batches must be a non-empty array'
      );
    });

    it('should throw error for null entries in array', async () => {
      const observations = [
        { entityName: 'Entity1', observations: ['obs'] },
        null as unknown as { entityName: string; observations: string[] },
      ];

      await expect(manager.addObservationsBatch(observations)).rejects.toThrow(
        'Found 1 null/undefined entries in observation batches array'
      );
    });

    it('should throw error for missing entityName', async () => {
      const observations = [{ entityName: '', observations: ['obs'] }];

      await expect(manager.addObservationsBatch(observations)).rejects.toThrow(
        "Observation batch at index 0 has invalid 'entityName' field"
      );
    });

    it('should throw error for invalid observations', async () => {
      const observations = [
        { entityName: 'Entity1', observations: 'not-an-array' as unknown as string[] },
      ];

      await expect(manager.addObservationsBatch(observations)).rejects.toThrow(
        "Observation batch at index 0 has invalid 'observations' field (must be array)"
      );
    });
  });

  describe('updateEntitiesBatch validation', () => {
    it('should throw error for empty array', async () => {
      await expect(manager.updateEntitiesBatch([])).rejects.toThrow(
        'Entity updates must be a non-empty array'
      );
    });

    it('should throw error for null entries in array', async () => {
      const updates = [
        { name: 'Entity1', entityType: 'new-type' },
        null as unknown as { name: string },
      ];

      await expect(manager.updateEntitiesBatch(updates)).rejects.toThrow(
        'Found 1 null/undefined entries in entity updates array'
      );
    });

    it('should throw error for missing name', async () => {
      const updates = [{ name: '', entityType: 'new-type' }];

      await expect(manager.updateEntitiesBatch(updates)).rejects.toThrow(
        "Entity update at index 0 has invalid 'name' field"
      );
    });
  });
});
