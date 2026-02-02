/**
 * Comprehensive tests for ConnectionStrengthScorer
 * Covers: error handling, edge cases, diversity calculation
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Relation } from '../../types/relation.js';
import { ConnectionStrengthScorer } from '../scorers/ConnectionStrengthScorer.js';
import type { ScoringContext, HybridSearchConfig } from '../types.js';

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ConnectionStrengthScorer Comprehensive', () => {
  let scorer: ConnectionStrengthScorer;

  beforeEach(() => {
    vi.clearAllMocks();
    scorer = new ConnectionStrengthScorer();
  });

  // --------------------------------------------------------------------------
  // Error Handling
  // --------------------------------------------------------------------------

  describe('error handling', () => {
    it('should return neutral score on error', async () => {
      // Create a context with a getter that throws
      const throwingRelations = {
        get length() {
          throw new Error('Test error');
        },
      };

      const context: ScoringContext = {
        entity: { name: 'test', entityType: 'test', observations: [] },
        relations: throwingRelations as unknown as Relation[],
        config: {} as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      expect(score).toBe(0.5);

      // Verify error was logged
      const { logger } = await import('../../utils/logger.js');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // No Connections
  // --------------------------------------------------------------------------

  describe('no connections', () => {
    it('should return low score for entity with no relations', async () => {
      const context: ScoringContext = {
        entity: { name: 'test', entityType: 'test', observations: [] },
        relations: [],
        config: {} as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      expect(score).toBe(0.3);
    });

    it('should return low score when relations is undefined', async () => {
      const context: ScoringContext = {
        entity: { name: 'test', entityType: 'test', observations: [] },
        config: {} as HybridSearchConfig,
        // relations is undefined
      };

      const score = await scorer.score(context);
      expect(score).toBe(0.3);
    });

    it('should explain no connections correctly', () => {
      const context: ScoringContext = {
        entity: { name: 'test', entityType: 'test', observations: [] },
        relations: [],
        config: {} as HybridSearchConfig,
      };

      const explanation = scorer.getExplanation(context, 0.3);
      expect(explanation).toContain('no connections');
    });
  });

  // --------------------------------------------------------------------------
  // Quality Calculation
  // --------------------------------------------------------------------------

  describe('quality calculation', () => {
    it('should prefer confidence over strength', async () => {
      const context: ScoringContext = {
        entity: { name: 'test', entityType: 'test', observations: [] },
        relations: [
          { from: 'a', to: 'b', relationType: 'RELATES', confidence: 0.9, strength: 0.3 },
        ],
        config: {} as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      // Should use confidence (0.9) not strength (0.3)
      expect(score).toBeGreaterThan(0.5);
    });

    it('should use strength when confidence is missing', async () => {
      const context: ScoringContext = {
        entity: { name: 'test', entityType: 'test', observations: [] },
        relations: [{ from: 'a', to: 'b', relationType: 'RELATES', strength: 0.8 }],
        config: {} as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      expect(score).toBeGreaterThan(0.5);
    });

    it('should use default 0.5 when no quality metrics', async () => {
      const context: ScoringContext = {
        entity: { name: 'test', entityType: 'test', observations: [] },
        relations: [{ from: 'a', to: 'b', relationType: 'RELATES' }],
        config: {} as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      // Should use default 0.5 for quality
      expect(score).toBeGreaterThan(0.3);
      expect(score).toBeLessThan(0.7);
    });
  });

  // --------------------------------------------------------------------------
  // High Quality Ratio
  // --------------------------------------------------------------------------

  describe('high quality ratio', () => {
    it('should count high quality relations (confidence >= 0.7)', async () => {
      const context: ScoringContext = {
        entity: { name: 'test', entityType: 'test', observations: [] },
        relations: [
          { from: 'a', to: 'b', relationType: 'RELATES', confidence: 0.8 },
          { from: 'a', to: 'c', relationType: 'RELATES', confidence: 0.9 },
          { from: 'a', to: 'd', relationType: 'RELATES', confidence: 0.5 }, // Not high quality
        ],
        config: {} as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      // 2/3 high quality + good average
      expect(score).toBeGreaterThan(0.5);
    });

    it('should include high quality count in explanation', () => {
      const context: ScoringContext = {
        entity: { name: 'test', entityType: 'test', observations: [] },
        relations: [
          { from: 'a', to: 'b', relationType: 'RELATES', confidence: 0.8 },
          { from: 'a', to: 'c', relationType: 'RELATES', confidence: 0.5 },
        ],
        config: {} as HybridSearchConfig,
      };

      const explanation = scorer.getExplanation(context, 0.6);
      expect(explanation).toContain('1/2 strong');
    });
  });

  // --------------------------------------------------------------------------
  // Relation Type Diversity
  // --------------------------------------------------------------------------

  describe('relation type diversity', () => {
    it('should give lower diversity score for single relation type', async () => {
      const context: ScoringContext = {
        entity: { name: 'test', entityType: 'test', observations: [] },
        relations: [
          { from: 'a', to: 'b', relationType: 'RELATES', confidence: 0.8 },
          { from: 'a', to: 'c', relationType: 'RELATES', confidence: 0.8 },
          { from: 'a', to: 'd', relationType: 'RELATES', confidence: 0.8 },
        ],
        config: {} as HybridSearchConfig,
      };

      const singleTypeScore = await scorer.score(context);

      // Compare with diverse types
      const diverseContext: ScoringContext = {
        entity: { name: 'test', entityType: 'test', observations: [] },
        relations: [
          { from: 'a', to: 'b', relationType: 'RELATES', confidence: 0.8 },
          { from: 'a', to: 'c', relationType: 'KNOWS', confidence: 0.8 },
          { from: 'a', to: 'd', relationType: 'WORKS_WITH', confidence: 0.8 },
        ],
        config: {} as HybridSearchConfig,
      };

      const diverseScore = await scorer.score(diverseContext);

      expect(diverseScore).toBeGreaterThan(singleTypeScore);
    });

    it('should include type count in explanation', () => {
      const context: ScoringContext = {
        entity: { name: 'test', entityType: 'test', observations: [] },
        relations: [
          { from: 'a', to: 'b', relationType: 'RELATES', confidence: 0.8 },
          { from: 'a', to: 'c', relationType: 'KNOWS', confidence: 0.8 },
        ],
        config: {} as HybridSearchConfig,
      };

      const explanation = scorer.getExplanation(context, 0.6);
      expect(explanation).toContain('2 types');
    });

    it('should handle many relation types evenly distributed', async () => {
      const context: ScoringContext = {
        entity: { name: 'test', entityType: 'test', observations: [] },
        relations: [
          { from: 'a', to: 'b', relationType: 'TYPE1', confidence: 0.8 },
          { from: 'a', to: 'c', relationType: 'TYPE2', confidence: 0.8 },
          { from: 'a', to: 'd', relationType: 'TYPE3', confidence: 0.8 },
          { from: 'a', to: 'e', relationType: 'TYPE4', confidence: 0.8 },
        ],
        config: {} as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      // High diversity should result in high score
      expect(score).toBeGreaterThan(0.7);
    });
  });

  // --------------------------------------------------------------------------
  // Score Clamping
  // --------------------------------------------------------------------------

  describe('score clamping', () => {
    it('should never return score below 0', async () => {
      const context: ScoringContext = {
        entity: { name: 'test', entityType: 'test', observations: [] },
        relations: [{ from: 'a', to: 'b', relationType: 'RELATES', confidence: 0 }],
        config: {} as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should never return score above 1', async () => {
      const context: ScoringContext = {
        entity: { name: 'test', entityType: 'test', observations: [] },
        relations: [
          { from: 'a', to: 'b', relationType: 'T1', confidence: 1 },
          { from: 'a', to: 'c', relationType: 'T2', confidence: 1 },
          { from: 'a', to: 'd', relationType: 'T3', confidence: 1 },
          { from: 'a', to: 'e', relationType: 'T4', confidence: 1 },
        ],
        config: {} as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  // --------------------------------------------------------------------------
  // getName
  // --------------------------------------------------------------------------

  describe('getName', () => {
    it('should return correct name', () => {
      expect(scorer.getName()).toBe('ConnectionStrength');
    });
  });
});
