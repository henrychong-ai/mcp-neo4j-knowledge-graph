/**
 * Comprehensive tests for VectorSimilarityScorer
 * Covers: error handling, edge cases, cosine similarity calculation
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VectorSimilarityScorer } from '../scorers/VectorSimilarityScorer.js';
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

describe('VectorSimilarityScorer Comprehensive', () => {
  let scorer: VectorSimilarityScorer;

  beforeEach(() => {
    vi.clearAllMocks();
    scorer = new VectorSimilarityScorer();
  });

  // --------------------------------------------------------------------------
  // Error Handling
  // --------------------------------------------------------------------------

  describe('error handling', () => {
    it('should return neutral score on error', async () => {
      // Create a context with a getter that throws
      const throwingEntity = {
        get embedding() {
          throw new Error('Test error');
        },
        name: 'test',
        entityType: 'test',
        observations: [],
      };

      const context: ScoringContext = {
        entity: throwingEntity,
        queryVector: [1, 2, 3],
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
  // Pre-computed Vector Similarity
  // --------------------------------------------------------------------------

  describe('pre-computed vector similarity', () => {
    it('should use pre-computed vectorSimilarity when available', async () => {
      const context: ScoringContext = {
        entity: { name: 'test', entityType: 'test', observations: [] },
        vectorSimilarity: 0.85,
        config: {} as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      expect(score).toBe(0.85);
    });

    it('should clamp pre-computed similarity to [0, 1]', async () => {
      const contextHigh: ScoringContext = {
        entity: { name: 'test', entityType: 'test', observations: [] },
        vectorSimilarity: 1.5, // Over 1
        config: {} as HybridSearchConfig,
      };

      const contextLow: ScoringContext = {
        entity: { name: 'test', entityType: 'test', observations: [] },
        vectorSimilarity: -0.5, // Under 0
        config: {} as HybridSearchConfig,
      };

      expect(await scorer.score(contextHigh)).toBe(1);
      expect(await scorer.score(contextLow)).toBe(0);
    });

    it('should explain pre-computed similarity correctly', () => {
      const context: ScoringContext = {
        entity: { name: 'test', entityType: 'test', observations: [] },
        vectorSimilarity: 0.85,
        config: {} as HybridSearchConfig,
      };

      const explanation = scorer.getExplanation(context, 0.85);
      expect(explanation).toContain('cosine distance');
      expect(explanation).toContain('85.0%');
    });
  });

  // --------------------------------------------------------------------------
  // Calculated Vector Similarity
  // --------------------------------------------------------------------------

  describe('calculated vector similarity', () => {
    it('should calculate similarity from queryVector and entity embedding', async () => {
      const context: ScoringContext = {
        entity: {
          name: 'test',
          entityType: 'test',
          observations: [],
          embedding: {
            vector: [1, 0, 0],
            model: 'test-model',
            lastUpdated: Date.now(),
          },
        },
        queryVector: [1, 0, 0], // Same direction
        config: {} as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      expect(score).toBeCloseTo(1, 5); // Identical vectors
    });

    it('should return 0 for perpendicular vectors', async () => {
      const context: ScoringContext = {
        entity: {
          name: 'test',
          entityType: 'test',
          observations: [],
          embedding: {
            vector: [1, 0, 0],
            model: 'test-model',
            lastUpdated: Date.now(),
          },
        },
        queryVector: [0, 1, 0], // Perpendicular
        config: {} as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      expect(score).toBeCloseTo(0, 5);
    });

    it('should explain calculated similarity correctly', () => {
      const context: ScoringContext = {
        entity: {
          name: 'test',
          entityType: 'test',
          observations: [],
          embedding: {
            vector: [1, 0, 0],
            model: 'test-model',
            lastUpdated: Date.now(),
          },
        },
        queryVector: [1, 0, 0],
        config: {} as HybridSearchConfig,
      };

      const explanation = scorer.getExplanation(context, 1);
      expect(explanation).toContain('calculated');
      expect(explanation).toContain('100.0%');
    });
  });

  // --------------------------------------------------------------------------
  // No Vector Available
  // --------------------------------------------------------------------------

  describe('no vector available', () => {
    it('should return neutral score when no vectorSimilarity or embedding', async () => {
      const context: ScoringContext = {
        entity: { name: 'test', entityType: 'test', observations: [] },
        config: {} as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      expect(score).toBe(0.5);

      // Verify debug log
      const { logger } = await import('../../utils/logger.js');
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('No vector similarity available')
      );
    });

    it('should return neutral score when only queryVector is present', async () => {
      const context: ScoringContext = {
        entity: { name: 'test', entityType: 'test', observations: [] },
        queryVector: [1, 2, 3],
        config: {} as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      expect(score).toBe(0.5);
    });

    it('should return neutral score when only embedding is present', async () => {
      const context: ScoringContext = {
        entity: {
          name: 'test',
          entityType: 'test',
          observations: [],
          embedding: {
            vector: [1, 2, 3],
            model: 'test-model',
            lastUpdated: Date.now(),
          },
        },
        config: {} as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      expect(score).toBe(0.5);
    });

    it('should explain no embedding correctly', () => {
      const context: ScoringContext = {
        entity: { name: 'test', entityType: 'test', observations: [] },
        config: {} as HybridSearchConfig,
      };

      const explanation = scorer.getExplanation(context, 0.5);
      expect(explanation).toContain('N/A');
      expect(explanation).toContain('no embedding available');
    });
  });

  // --------------------------------------------------------------------------
  // Cosine Similarity Edge Cases
  // --------------------------------------------------------------------------

  describe('cosine similarity edge cases', () => {
    it('should handle zero vectors gracefully', async () => {
      const context: ScoringContext = {
        entity: {
          name: 'test',
          entityType: 'test',
          observations: [],
          embedding: {
            vector: [0, 0, 0],
            model: 'test-model',
            lastUpdated: Date.now(),
          },
        },
        queryVector: [1, 2, 3],
        config: {} as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      // Zero vector should return 0 (division by zero protection)
      expect(score).toBe(0);
    });

    it('should handle both zero vectors gracefully', async () => {
      const context: ScoringContext = {
        entity: {
          name: 'test',
          entityType: 'test',
          observations: [],
          embedding: {
            vector: [0, 0, 0],
            model: 'test-model',
            lastUpdated: Date.now(),
          },
        },
        queryVector: [0, 0, 0],
        config: {} as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      expect(score).toBe(0);
    });

    it('should clamp calculated similarity to [0, 1]', async () => {
      // Negative cosine similarity should be clamped to 0
      const context: ScoringContext = {
        entity: {
          name: 'test',
          entityType: 'test',
          observations: [],
          embedding: {
            vector: [1, 0, 0],
            model: 'test-model',
            lastUpdated: Date.now(),
          },
        },
        queryVector: [-1, 0, 0], // Opposite direction
        config: {} as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      expect(score).toBe(0); // Clamped from -1
    });
  });

  // --------------------------------------------------------------------------
  // getName
  // --------------------------------------------------------------------------

  describe('getName', () => {
    it('should return correct name', () => {
      expect(scorer.getName()).toBe('VectorSimilarity');
    });
  });
});
