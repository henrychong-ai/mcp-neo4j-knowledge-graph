/**
 * Unit tests for GraphTraversalScorer
 */

import { describe, it, expect } from 'vitest';
import { GraphTraversalScorer } from '../scorers/GraphTraversalScorer.js';
import type { ScoringContext } from '../types.js';
import type { Relation } from '../../types/relation.js';
import { DEFAULT_HYBRID_CONFIG } from '../types.js';

describe('GraphTraversalScorer', () => {
  const scorer = new GraphTraversalScorer();

  const createContext = (relations: Relation[] = [], allRelations: Relation[] = []): ScoringContext => ({
    entity: {
      name: 'TestEntity',
      entityType: 'Test',
      observations: ['Test observation'],
    },
    relations,
    query: 'test query',
    config: DEFAULT_HYBRID_CONFIG,
    allRelations,
  });

  describe('getName', () => {
    it('should return correct name', () => {
      expect(scorer.getName()).toBe('GraphTraversal');
    });
  });

  describe('score', () => {
    it('should return low score for isolated entities', async () => {
      const context = createContext([], []);
      const score = await scorer.score(context);
      expect(score).toBeLessThan(0.3);
    });

    it('should return higher score for well-connected entities', async () => {
      const relations: Relation[] = [
        { from: 'TestEntity', to: 'Entity1', relationType: 'RELATES_TO', confidence: 0.9 },
        { from: 'TestEntity', to: 'Entity2', relationType: 'RELATES_TO', confidence: 0.8 },
        { from: 'Entity3', to: 'TestEntity', relationType: 'RELATES_TO', confidence: 0.85 },
      ];
      const context = createContext(relations, relations);
      const score = await scorer.score(context);
      expect(score).toBeGreaterThan(0.4);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should consider relation quality', async () => {
      const highQualityRelations: Relation[] = [
        { from: 'TestEntity', to: 'Entity1', relationType: 'RELATES_TO', confidence: 0.95 },
        { from: 'TestEntity', to: 'Entity2', relationType: 'RELATES_TO', confidence: 0.90 },
      ];
      const lowQualityRelations: Relation[] = [
        { from: 'TestEntity', to: 'Entity1', relationType: 'RELATES_TO', confidence: 0.3 },
        { from: 'TestEntity', to: 'Entity2', relationType: 'RELATES_TO', confidence: 0.2 },
      ];

      const highQualityContext = createContext(highQualityRelations, highQualityRelations);
      const lowQualityContext = createContext(lowQualityRelations, lowQualityRelations);

      const highScore = await scorer.score(highQualityContext);
      const lowScore = await scorer.score(lowQualityContext);

      expect(highScore).toBeGreaterThan(lowScore);
    });

    it('should reward bidirectional connections', async () => {
      const bidirectionalRelations: Relation[] = [
        { from: 'TestEntity', to: 'Entity1', relationType: 'RELATES_TO', confidence: 0.8 },
        { from: 'Entity1', to: 'TestEntity', relationType: 'RELATES_TO', confidence: 0.8 },
      ];
      const unidirectionalRelations: Relation[] = [
        { from: 'TestEntity', to: 'Entity1', relationType: 'RELATES_TO', confidence: 0.8 },
      ];

      const bidirContext = createContext(bidirectionalRelations, bidirectionalRelations);
      const unidirContext = createContext(unidirectionalRelations, unidirectionalRelations);

      const bidirScore = await scorer.score(bidirContext);
      const unidirScore = await scorer.score(unidirContext);

      expect(bidirScore).toBeGreaterThan(unidirScore);
    });
  });

  describe('getExplanation', () => {
    it('should provide connection statistics', () => {
      const relations: Relation[] = [
        { from: 'TestEntity', to: 'Entity1', relationType: 'RELATES_TO' },
        { from: 'Entity2', to: 'TestEntity', relationType: 'RELATES_TO' },
      ];
      const context = createContext(relations, relations);
      const explanation = scorer.getExplanation(context, 0.75);
      expect(explanation).toContain('Graph centrality');
      expect(explanation).toContain('75.0%');
      expect(explanation).toContain('2 connections');
      expect(explanation).toContain('1 in');
      expect(explanation).toContain('1 out');
    });
  });
});
