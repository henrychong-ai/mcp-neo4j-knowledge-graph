/**
 * Comprehensive tests for HybridRetriever
 * Covers: edge cases, error handling, weight validation, missing entities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HybridRetriever } from '../HybridRetriever.js';
import type { Entity } from '../../KnowledgeGraphManager.js';
import type { Relation } from '../../types/relation.js';
import type { VectorSearchResult } from '../../types/vector-store.js';

// Mock logger to capture warnings
vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('HybridRetriever Comprehensive', () => {
  let retriever: HybridRetriever;

  beforeEach(() => {
    vi.clearAllMocks();
    retriever = new HybridRetriever();
  });

  // --------------------------------------------------------------------------
  // Weight Validation
  // --------------------------------------------------------------------------

  describe('weight validation', () => {
    it('should warn when weights do not sum to 1.0', async () => {
      const { logger } = await import('../../utils/logger.js');

      // Create retriever with weights that don't sum to 1.0
      const unbalancedRetriever = new HybridRetriever({
        config: {
          vectorWeight: 0.3,
          graphWeight: 0.3,
          temporalWeight: 0.3,
          connectionWeight: 0.3, // Total: 1.2
        },
      });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Weights sum to 1.20, not 1.0')
      );
    });

    it('should warn when weights sum to less than 1.0', async () => {
      const { logger } = await import('../../utils/logger.js');

      new HybridRetriever({
        config: {
          vectorWeight: 0.2,
          graphWeight: 0.2,
          temporalWeight: 0.2,
          connectionWeight: 0.2, // Total: 0.8
        },
      });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Weights sum to 0.80, not 1.0')
      );
    });

    it('should not warn when weights sum to exactly 1.0', async () => {
      const { logger } = await import('../../utils/logger.js');
      vi.mocked(logger.warn).mockClear();

      new HybridRetriever({
        config: {
          vectorWeight: 0.5,
          graphWeight: 0.2,
          temporalWeight: 0.15,
          connectionWeight: 0.15, // Total: 1.0
        },
      });

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should not warn when weights are within 0.01 tolerance', async () => {
      const { logger } = await import('../../utils/logger.js');
      vi.mocked(logger.warn).mockClear();

      new HybridRetriever({
        config: {
          vectorWeight: 0.503,
          graphWeight: 0.2,
          temporalWeight: 0.15,
          connectionWeight: 0.15, // Total: 1.003
        },
      });

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Missing Entity Handling
  // --------------------------------------------------------------------------

  describe('missing entity handling', () => {
    it('should skip results when corresponding entity is missing', async () => {
      const { logger } = await import('../../utils/logger.js');

      const vectorResults: VectorSearchResult[] = [
        {
          id: 'Entity1',
          similarity: 0.9,
          metadata: { entityType: 'Test', searchMethod: 'vector' },
        },
        {
          id: 'Entity2',
          similarity: 0.8,
          metadata: { entityType: 'Test', searchMethod: 'vector' },
        },
        {
          id: 'Entity3',
          similarity: 0.7,
          metadata: { entityType: 'Test', searchMethod: 'vector' },
        },
      ];

      // Only provide 2 entities - entities array has fewer items than vectorResults
      // entities[0] = Entity1, entities[1] = Entity3, entities[2] = undefined
      const entities: Entity[] = [
        { name: 'Entity1', entityType: 'Test', observations: ['obs1'] },
        { name: 'Entity3', entityType: 'Test', observations: ['obs3'] },
        // No third entity - entities[2] is undefined
      ];

      const relations = new Map<string, Relation[]>();
      relations.set('Entity1', []);
      relations.set('Entity3', []);

      const hybridResults = await retriever.rerank(
        vectorResults,
        entities,
        relations,
        'test query'
      );

      // Should only have 2 results since entities[2] is missing
      expect(hybridResults).toHaveLength(2);

      // Should have logged a warning about missing entity at index 2
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No entity found for result 2')
      );
    });

    it('should skip results when entity is undefined', async () => {
      const { logger } = await import('../../utils/logger.js');

      const vectorResults: VectorSearchResult[] = [
        {
          id: 'Entity1',
          similarity: 0.9,
          metadata: { entityType: 'Test', searchMethod: 'vector' },
        },
        {
          id: 'Entity2',
          similarity: 0.8,
          metadata: { entityType: 'Test', searchMethod: 'vector' },
        },
      ];

      // Provide array with undefined entry
      const entities: (Entity | undefined)[] = [
        { name: 'Entity1', entityType: 'Test', observations: ['obs1'] },
        undefined, // Entity2 is undefined
      ];

      const relations = new Map<string, Relation[]>();
      relations.set('Entity1', []);

      const hybridResults = await retriever.rerank(
        vectorResults,
        entities as Entity[],
        relations,
        'test query'
      );

      expect(hybridResults).toHaveLength(1);
      expect(hybridResults[0].entity.name).toBe('Entity1');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No entity found for result 1')
      );
    });

    it('should skip results when entity is null', async () => {
      const { logger } = await import('../../utils/logger.js');

      const vectorResults: VectorSearchResult[] = [
        {
          id: 'Entity1',
          similarity: 0.9,
          metadata: { entityType: 'Test', searchMethod: 'vector' },
        },
        {
          id: 'Entity2',
          similarity: 0.8,
          metadata: { entityType: 'Test', searchMethod: 'vector' },
        },
      ];

      const entities: (Entity | null)[] = [
        { name: 'Entity1', entityType: 'Test', observations: ['obs1'] },
        null, // Entity2 is null
      ];

      const relations = new Map<string, Relation[]>();
      relations.set('Entity1', []);

      const hybridResults = await retriever.rerank(
        vectorResults,
        entities as Entity[],
        relations,
        'test query'
      );

      expect(hybridResults).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should handle all entities missing', async () => {
      const vectorResults: VectorSearchResult[] = [
        {
          id: 'Entity1',
          similarity: 0.9,
          metadata: { entityType: 'Test', searchMethod: 'vector' },
        },
        {
          id: 'Entity2',
          similarity: 0.8,
          metadata: { entityType: 'Test', searchMethod: 'vector' },
        },
      ];

      const entities: Entity[] = []; // No entities provided
      const relations = new Map<string, Relation[]>();

      const hybridResults = await retriever.rerank(
        vectorResults,
        entities,
        relations,
        'test query'
      );

      expect(hybridResults).toHaveLength(0);
    });

    it('should include vector result id in warning message', async () => {
      const { logger } = await import('../../utils/logger.js');

      const vectorResults: VectorSearchResult[] = [
        {
          id: 'missing-entity-id',
          similarity: 0.9,
          metadata: { entityType: 'Test', searchMethod: 'vector' },
        },
      ];

      const entities: Entity[] = []; // No entities
      const relations = new Map<string, Relation[]>();

      await retriever.rerank(vectorResults, entities, relations, 'test query');

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('id: missing-entity-id'));
    });
  });

  // --------------------------------------------------------------------------
  // Empty Input Handling
  // --------------------------------------------------------------------------

  describe('empty input handling', () => {
    it('should return empty array for empty vector results', async () => {
      const hybridResults = await retriever.rerank([], [], new Map(), 'test query');

      expect(hybridResults).toHaveLength(0);
    });

    it('should handle empty query string', async () => {
      const vectorResults: VectorSearchResult[] = [
        {
          id: 'Entity1',
          similarity: 0.9,
          metadata: { entityType: 'Test', searchMethod: 'vector' },
        },
      ];

      const entities: Entity[] = [{ name: 'Entity1', entityType: 'Test', observations: ['obs1'] }];

      const relations = new Map<string, Relation[]>();
      relations.set('Entity1', []);

      const hybridResults = await retriever.rerank(
        vectorResults,
        entities,
        relations,
        '' // Empty query
      );

      expect(hybridResults).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // Relations Handling
  // --------------------------------------------------------------------------

  describe('relations handling', () => {
    it('should handle entity with no relations in map', async () => {
      const vectorResults: VectorSearchResult[] = [
        {
          id: 'Entity1',
          similarity: 0.9,
          metadata: { entityType: 'Test', searchMethod: 'vector' },
        },
      ];

      const entities: Entity[] = [{ name: 'Entity1', entityType: 'Test', observations: ['obs1'] }];

      // Empty relations map - Entity1 has no entry
      const relations = new Map<string, Relation[]>();

      const hybridResults = await retriever.rerank(
        vectorResults,
        entities,
        relations,
        'test query'
      );

      expect(hybridResults).toHaveLength(1);
      // Should use empty relations array as fallback
      expect(hybridResults[0].scores.connection).toBeDefined();
    });

    it('should use empty array for entity not in relations map', async () => {
      const vectorResults: VectorSearchResult[] = [
        {
          id: 'Entity1',
          similarity: 0.9,
          metadata: { entityType: 'Test', searchMethod: 'vector' },
        },
        {
          id: 'Entity2',
          similarity: 0.8,
          metadata: { entityType: 'Test', searchMethod: 'vector' },
        },
      ];

      const entities: Entity[] = [
        { name: 'Entity1', entityType: 'Test', observations: ['obs1'] },
        { name: 'Entity2', entityType: 'Test', observations: ['obs2'] },
      ];

      // Only Entity1 has relations
      const relations = new Map<string, Relation[]>();
      relations.set('Entity1', [
        { from: 'Entity1', to: 'Entity2', relationType: 'RELATES_TO', confidence: 0.9 },
      ]);
      // Entity2 not in map

      const hybridResults = await retriever.rerank(
        vectorResults,
        entities,
        relations,
        'test query'
      );

      expect(hybridResults).toHaveLength(2);
    });
  });

  // --------------------------------------------------------------------------
  // Query Vector Handling
  // --------------------------------------------------------------------------

  describe('query vector handling', () => {
    it('should accept optional query vector', async () => {
      const vectorResults: VectorSearchResult[] = [
        {
          id: 'Entity1',
          similarity: 0.9,
          metadata: { entityType: 'Test', searchMethod: 'vector' },
        },
      ];

      const entities: Entity[] = [{ name: 'Entity1', entityType: 'Test', observations: ['obs1'] }];

      const relations = new Map<string, Relation[]>();
      relations.set('Entity1', []);

      const queryVector = [0.1, 0.2, 0.3, 0.4, 0.5];

      const hybridResults = await retriever.rerank(
        vectorResults,
        entities,
        relations,
        'test query',
        queryVector
      );

      expect(hybridResults).toHaveLength(1);
    });

    it('should work without query vector', async () => {
      const vectorResults: VectorSearchResult[] = [
        {
          id: 'Entity1',
          similarity: 0.9,
          metadata: { entityType: 'Test', searchMethod: 'vector' },
        },
      ];

      const entities: Entity[] = [{ name: 'Entity1', entityType: 'Test', observations: ['obs1'] }];

      const relations = new Map<string, Relation[]>();
      relations.set('Entity1', []);

      const hybridResults = await retriever.rerank(
        vectorResults,
        entities,
        relations,
        'test query'
        // No query vector
      );

      expect(hybridResults).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // Result Sorting
  // --------------------------------------------------------------------------

  describe('result sorting', () => {
    it('should sort results by final score descending', async () => {
      const vectorResults: VectorSearchResult[] = [
        {
          id: 'LowScore',
          similarity: 0.3,
          metadata: { entityType: 'Test', searchMethod: 'vector' },
        },
        {
          id: 'HighScore',
          similarity: 0.95,
          metadata: { entityType: 'Test', searchMethod: 'vector' },
        },
        {
          id: 'MidScore',
          similarity: 0.6,
          metadata: { entityType: 'Test', searchMethod: 'vector' },
        },
      ];

      const entities: Entity[] = [
        { name: 'LowScore', entityType: 'Test', observations: ['obs1'] },
        { name: 'HighScore', entityType: 'Test', observations: ['obs2'] },
        { name: 'MidScore', entityType: 'Test', observations: ['obs3'] },
      ];

      const relations = new Map<string, Relation[]>();
      relations.set('LowScore', []);
      relations.set('HighScore', []);
      relations.set('MidScore', []);

      const hybridResults = await retriever.rerank(
        vectorResults,
        entities,
        relations,
        'test query'
      );

      // Results should be sorted by final score
      for (let i = 0; i < hybridResults.length - 1; i++) {
        expect(hybridResults[i].scores.final).toBeGreaterThanOrEqual(
          hybridResults[i + 1].scores.final
        );
      }
    });
  });

  // --------------------------------------------------------------------------
  // Score Component Validation
  // --------------------------------------------------------------------------

  describe('score component validation', () => {
    it('should have all score components between 0 and 1', async () => {
      const vectorResults: VectorSearchResult[] = [
        {
          id: 'Entity1',
          similarity: 0.9,
          metadata: { entityType: 'Test', searchMethod: 'vector' },
        },
      ];

      const entities: Entity[] = [{ name: 'Entity1', entityType: 'Test', observations: ['obs1'] }];

      const relations = new Map<string, Relation[]>();
      relations.set('Entity1', [
        { from: 'Entity1', to: 'Other', relationType: 'RELATES_TO', confidence: 0.9 },
      ]);

      const hybridResults = await retriever.rerank(
        vectorResults,
        entities,
        relations,
        'test query'
      );

      const scores = hybridResults[0].scores;
      expect(scores.vector).toBeGreaterThanOrEqual(0);
      expect(scores.vector).toBeLessThanOrEqual(1);
      expect(scores.graph).toBeGreaterThanOrEqual(0);
      expect(scores.graph).toBeLessThanOrEqual(1);
      expect(scores.temporal).toBeGreaterThanOrEqual(0);
      expect(scores.temporal).toBeLessThanOrEqual(1);
      expect(scores.connection).toBeGreaterThanOrEqual(0);
      expect(scores.connection).toBeLessThanOrEqual(1);
      expect(scores.final).toBeGreaterThanOrEqual(0);
      expect(scores.final).toBeLessThanOrEqual(1);
    });
  });

  // --------------------------------------------------------------------------
  // Configuration Updates
  // --------------------------------------------------------------------------

  describe('configuration updates', () => {
    it('should apply config updates to subsequent rerank calls', async () => {
      const vectorResults: VectorSearchResult[] = [
        {
          id: 'Entity1',
          similarity: 0.9,
          metadata: { entityType: 'Test', searchMethod: 'vector' },
        },
      ];

      const entities: Entity[] = [{ name: 'Entity1', entityType: 'Test', observations: ['obs1'] }];

      const relations = new Map<string, Relation[]>();
      relations.set('Entity1', []);

      // Get initial result
      const initialResults = await retriever.rerank(
        vectorResults,
        entities,
        relations,
        'test query'
      );

      // Update config to heavily weight vector score
      retriever.updateConfig({
        vectorWeight: 0.97,
        graphWeight: 0.01,
        temporalWeight: 0.01,
        connectionWeight: 0.01,
      });

      // Get result with new config
      const updatedResults = await retriever.rerank(
        vectorResults,
        entities,
        relations,
        'test query'
      );

      // Final scores should be different due to different weights
      expect(updatedResults[0].scores.final).not.toBe(initialResults[0].scores.final);
    });
  });
});
