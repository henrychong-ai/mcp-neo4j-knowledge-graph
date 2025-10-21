/**
 * Unit tests for HybridRetriever
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HybridRetriever } from '../HybridRetriever.js';
import type { Entity } from '../../KnowledgeGraphManager.js';
import type { Relation } from '../../types/relation.js';
import type { VectorSearchResult } from '../../types/vector-store.js';

describe('HybridRetriever', () => {
  let retriever: HybridRetriever;

  beforeEach(() => {
    retriever = new HybridRetriever();
  });

  const createVectorResults = (): VectorSearchResult[] => [
    {
      id: 'Entity1',
      similarity: 0.9,
      metadata: { entityType: 'Test', searchMethod: 'vector' },
    },
    {
      id: 'Entity2',
      similarity: 0.7,
      metadata: { entityType: 'Test', searchMethod: 'vector' },
    },
    {
      id: 'Entity3',
      similarity: 0.6,
      metadata: { entityType: 'Test', searchMethod: 'vector' },
    },
  ];

  const createEntities = (): Entity[] => [
    {
      name: 'Entity1',
      entityType: 'Test',
      observations: ['Observation 1'],
    },
    {
      name: 'Entity2',
      entityType: 'Test',
      observations: ['Observation 2'],
    },
    {
      name: 'Entity3',
      entityType: 'Test',
      observations: ['Observation 3'],
    },
  ];

  const createRelations = (): Map<string, Relation[]> => {
    const map = new Map<string, Relation[]>();
    map.set('Entity1', [
      { from: 'Entity1', to: 'Entity2', relationType: 'RELATES_TO', confidence: 0.9 },
      { from: 'Entity1', to: 'Entity3', relationType: 'RELATES_TO', confidence: 0.8 },
    ]);
    map.set('Entity2', [
      { from: 'Entity2', to: 'Entity3', relationType: 'RELATES_TO', confidence: 0.7 },
    ]);
    map.set('Entity3', []);
    return map;
  };

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const config = retriever.getConfig();
      expect(config.vectorWeight).toBe(0.5);
      expect(config.graphWeight).toBe(0.2);
      expect(config.temporalWeight).toBe(0.15);
      expect(config.connectionWeight).toBe(0.15);
      expect(config.enableScoreDebug).toBe(false);
    });

    it('should initialize with custom config', () => {
      const customRetriever = new HybridRetriever({
        config: {
          vectorWeight: 0.6,
          graphWeight: 0.3,
          temporalWeight: 0.05,
          connectionWeight: 0.05,
          enableScoreDebug: true,
        },
      });
      const config = customRetriever.getConfig();
      expect(config.vectorWeight).toBe(0.6);
      expect(config.graphWeight).toBe(0.3);
      expect(config.enableScoreDebug).toBe(true);
    });
  });

  describe('rerank', () => {
    it('should rerank results based on hybrid scores', async () => {
      const vectorResults = createVectorResults();
      const entities = createEntities();
      const relations = createRelations();

      const hybridResults = await retriever.rerank(
        vectorResults,
        entities,
        relations,
        'test query'
      );

      expect(hybridResults).toHaveLength(3);
      expect(hybridResults[0].entity).toBeDefined();
      expect(hybridResults[0].scores).toBeDefined();
      expect(hybridResults[0].scores.final).toBeGreaterThan(0);
      expect(hybridResults[0].scores.final).toBeLessThanOrEqual(1);

      // Results should be sorted by final score
      for (let i = 0; i < hybridResults.length - 1; i++) {
        expect(hybridResults[i].scores.final).toBeGreaterThanOrEqual(
          hybridResults[i + 1].scores.final
        );
      }
    });

    it('should include all score components', async () => {
      const vectorResults = createVectorResults();
      const entities = createEntities();
      const relations = createRelations();

      const hybridResults = await retriever.rerank(
        vectorResults,
        entities,
        relations,
        'test query'
      );

      const scores = hybridResults[0].scores;
      expect(scores.vector).toBeDefined();
      expect(scores.graph).toBeDefined();
      expect(scores.temporal).toBeDefined();
      expect(scores.connection).toBeDefined();
      expect(scores.final).toBeDefined();
    });

    it('should calculate final score as weighted sum', async () => {
      const vectorResults = createVectorResults();
      const entities = createEntities();
      const relations = createRelations();

      const hybridResults = await retriever.rerank(
        vectorResults,
        entities,
        relations,
        'test query'
      );

      const scores = hybridResults[0].scores;
      const config = retriever.getConfig();

      const expectedFinal =
        scores.vector * config.vectorWeight +
        scores.graph * config.graphWeight +
        scores.temporal * config.temporalWeight +
        scores.connection * config.connectionWeight;

      expect(scores.final).toBeCloseTo(expectedFinal, 5);
    });

    it('should include explanation when debug mode is enabled', async () => {
      const debugRetriever = new HybridRetriever({
        config: { enableScoreDebug: true },
      });

      const vectorResults = createVectorResults();
      const entities = createEntities();
      const relations = createRelations();

      const hybridResults = await debugRetriever.rerank(
        vectorResults,
        entities,
        relations,
        'test query'
      );

      expect(hybridResults[0].scores.explanation).toBeDefined();
      expect(hybridResults[0].scores.explanation).toContain('Entity:');
      expect(hybridResults[0].scores.explanation).toContain('Final Score:');
    });

    it('should not include explanation when debug mode is disabled', async () => {
      const vectorResults = createVectorResults();
      const entities = createEntities();
      const relations = createRelations();

      const hybridResults = await retriever.rerank(
        vectorResults,
        entities,
        relations,
        'test query'
      );

      expect(hybridResults[0].scores.explanation).toBeUndefined();
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      retriever.updateConfig({
        vectorWeight: 0.7,
        enableScoreDebug: true,
      });

      const config = retriever.getConfig();
      expect(config.vectorWeight).toBe(0.7);
      expect(config.enableScoreDebug).toBe(true);
      // Other values should remain from defaults
      expect(config.graphWeight).toBe(0.2);
    });
  });

  describe('getConfig', () => {
    it('should return a copy of the configuration', () => {
      const config1 = retriever.getConfig();
      config1.vectorWeight = 0.999;

      const config2 = retriever.getConfig();
      expect(config2.vectorWeight).not.toBe(0.999);
      expect(config2.vectorWeight).toBe(0.5);
    });
  });
});
