/**
 * Unit tests for ConnectionStrengthScorer
 */

import { describe, it, expect } from 'vitest';
import { ConnectionStrengthScorer } from '../scorers/ConnectionStrengthScorer.js';
import type { ScoringContext } from '../types.js';
import type { Relation } from '../../types/relation.js';
import { DEFAULT_HYBRID_CONFIG } from '../types.js';

describe('ConnectionStrengthScorer', () => {
  const scorer = new ConnectionStrengthScorer();

  const createContext = (relations: Relation[] = []): ScoringContext => ({
    entity: {
      name: 'TestEntity',
      entityType: 'Test',
      observations: ['Test observation'],
    },
    relations,
    query: 'test query',
    config: DEFAULT_HYBRID_CONFIG,
  });

  describe('getName', () => {
    it('should return correct name', () => {
      expect(scorer.getName()).toBe('ConnectionStrength');
    });
  });

  describe('score', () => {
    it('should return low score for entities with no connections', async () => {
      const context = createContext([]);
      const score = await scorer.score(context);
      expect(score).toBe(0.3);
    });

    it('should return higher score for entities with high-quality connections', async () => {
      const highQualityRelations: Relation[] = [
        { from: 'TestEntity', to: 'Entity1', relationType: 'RELATES_TO', confidence: 0.95 },
        { from: 'TestEntity', to: 'Entity2', relationType: 'RELATES_TO', confidence: 0.90 },
        { from: 'TestEntity', to: 'Entity3', relationType: 'RELATES_TO', confidence: 0.85 },
      ];
      const context = createContext(highQualityRelations);
      const score = await scorer.score(context);
      expect(score).toBeGreaterThan(0.7);
    });

    it('should return lower score for entities with low-quality connections', async () => {
      const lowQualityRelations: Relation[] = [
        { from: 'TestEntity', to: 'Entity1', relationType: 'RELATES_TO', confidence: 0.3 },
        { from: 'TestEntity', to: 'Entity2', relationType: 'RELATES_TO', confidence: 0.2 },
      ];
      const context = createContext(lowQualityRelations);
      const score = await scorer.score(context);
      expect(score).toBeLessThan(0.5);
    });

    it('should reward diverse relation types', async () => {
      const diverseRelations: Relation[] = [
        { from: 'TestEntity', to: 'Entity1', relationType: 'TYPE_A', confidence: 0.8 },
        { from: 'TestEntity', to: 'Entity2', relationType: 'TYPE_B', confidence: 0.8 },
        { from: 'TestEntity', to: 'Entity3', relationType: 'TYPE_C', confidence: 0.8 },
      ];
      const uniformRelations: Relation[] = [
        { from: 'TestEntity', to: 'Entity1', relationType: 'TYPE_A', confidence: 0.8 },
        { from: 'TestEntity', to: 'Entity2', relationType: 'TYPE_A', confidence: 0.8 },
        { from: 'TestEntity', to: 'Entity3', relationType: 'TYPE_A', confidence: 0.8 },
      ];

      const diverseContext = createContext(diverseRelations);
      const uniformContext = createContext(uniformRelations);

      const diverseScore = await scorer.score(diverseContext);
      const uniformScore = await scorer.score(uniformContext);

      expect(diverseScore).toBeGreaterThan(uniformScore);
    });

    it('should handle relations with strength instead of confidence', async () => {
      const relations: Relation[] = [
        { from: 'TestEntity', to: 'Entity1', relationType: 'RELATES_TO', strength: 0.85 },
        { from: 'TestEntity', to: 'Entity2', relationType: 'RELATES_TO', strength: 0.75 },
      ];
      const context = createContext(relations);
      const score = await scorer.score(context);
      expect(score).toBeGreaterThan(0.5);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should use default quality when neither confidence nor strength is provided', async () => {
      const relations: Relation[] = [
        { from: 'TestEntity', to: 'Entity1', relationType: 'RELATES_TO' },
        { from: 'TestEntity', to: 'Entity2', relationType: 'RELATES_TO' },
      ];
      const context = createContext(relations);
      const score = await scorer.score(context);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1.0);
    });
  });

  describe('getExplanation', () => {
    it('should provide connection strength statistics', () => {
      const relations: Relation[] = [
        { from: 'TestEntity', to: 'Entity1', relationType: 'TYPE_A', confidence: 0.9 },
        { from: 'TestEntity', to: 'Entity2', relationType: 'TYPE_B', confidence: 0.8 },
        { from: 'TestEntity', to: 'Entity3', relationType: 'TYPE_A', confidence: 0.7 },
      ];
      const context = createContext(relations);
      const explanation = scorer.getExplanation(context, 0.75);
      expect(explanation).toContain('Connection strength');
      expect(explanation).toContain('75.0%');
      expect(explanation).toContain('avg quality');
      expect(explanation).toContain('3/3 strong'); // All 3 relations have confidence >= 0.7 (0.9, 0.8, 0.7)
      expect(explanation).toContain('2 types'); // TYPE_A and TYPE_B
    });

    it('should handle no connections', () => {
      const context = createContext([]);
      const explanation = scorer.getExplanation(context, 0.3);
      expect(explanation).toContain('no connections');
    });
  });
});
