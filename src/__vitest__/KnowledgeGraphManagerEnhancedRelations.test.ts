/**
 * Test file for KnowledgeGraphManager with enhanced relations
 */
import { describe, it, expect, vi } from 'vitest';
import { KnowledgeGraphManager, Relation } from '../KnowledgeGraphManager.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import type { RelationMetadata } from '../types/relation.js';

describe('KnowledgeGraphManager with Enhanced Relations', () => {
  it('should use StorageProvider getRelation for retrieving a relation', async () => {
    const timestamp = Date.now();
    const enhancedRelation: Relation = {
      from: 'entity1',
      to: 'entity2',
      relationType: 'knows',
      strength: 0.8,
      confidence: 0.9,
      metadata: {
        createdAt: timestamp,
        updatedAt: timestamp,
        inferredFrom: [], // Correct property according to RelationMetadata
        lastAccessed: timestamp,
      },
    };

    const mockProvider: Partial<StorageProvider> = {
      loadGraph: vi.fn(),
      saveGraph: vi.fn(),
      searchNodes: vi.fn(),
      openNodes: vi.fn(),
      createRelations: vi.fn(),
      addObservations: vi.fn(),
      getRelation: vi.fn().mockResolvedValue(enhancedRelation),
    };

    const manager = new KnowledgeGraphManager({ storageProvider: mockProvider as StorageProvider });

    // Call getRelation method
    const relation = await manager.getRelation('entity1', 'entity2', 'knows');

    // Verify the provider's getRelation was called with the right parameters
    expect(mockProvider.getRelation).toHaveBeenCalledWith('entity1', 'entity2', 'knows');

    // Verify we got the expected relation back
    expect(relation).toEqual(enhancedRelation);
  });

  it('should use StorageProvider updateRelation for updating a relation', async () => {
    const timestamp = Date.now();
    const updatedRelation: Relation = {
      from: 'entity1',
      to: 'entity2',
      relationType: 'knows',
      strength: 0.9, // Updated strength
      confidence: 0.95, // Updated confidence
      metadata: {
        createdAt: timestamp,
        updatedAt: timestamp + 1000, // Updated timestamp
        inferredFrom: [],
        lastAccessed: timestamp,
      },
    };

    const mockProvider: Partial<StorageProvider> = {
      loadGraph: vi.fn(),
      saveGraph: vi.fn(),
      searchNodes: vi.fn(),
      openNodes: vi.fn(),
      createRelations: vi.fn(),
      addObservations: vi.fn(),
      updateRelation: vi.fn().mockResolvedValue(undefined),
    };

    const manager = new KnowledgeGraphManager({ storageProvider: mockProvider as StorageProvider });

    // Call updateRelation method
    await manager.updateRelation(updatedRelation);

    // Verify the provider's updateRelation was called with the right parameters
    expect(mockProvider.updateRelation).toHaveBeenCalledWith(updatedRelation);
  });
});
