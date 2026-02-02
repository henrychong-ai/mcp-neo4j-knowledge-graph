/**
 * Comprehensive tests for TemporalFreshnessScorer
 * Covers: error handling, edge cases, validity status
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TemporalFreshnessScorer } from '../scorers/TemporalFreshnessScorer.js';
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

describe('TemporalFreshnessScorer Comprehensive', () => {
  let scorer: TemporalFreshnessScorer;
  const now = Date.now();

  beforeEach(() => {
    vi.clearAllMocks();
    scorer = new TemporalFreshnessScorer();
  });

  // --------------------------------------------------------------------------
  // Error Handling Tests
  // --------------------------------------------------------------------------

  describe('error handling', () => {
    it('should return neutral score on error', async () => {
      // Create a context that will cause an error in score calculation
      // by providing an object that throws when accessed
      const throwingEntity = {
        get updatedAt() {
          throw new Error('Test error');
        },
      };

      const context: ScoringContext = {
        entity: throwingEntity,
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
  // Validity Status Edge Cases
  // --------------------------------------------------------------------------

  describe('getValidityStatus via getExplanation', () => {
    it('should report "no validity period" when no validFrom or validTo', async () => {
      const context: ScoringContext = {
        entity: {
          name: 'test',
          entityType: 'test',
          observations: [],
          updatedAt: now - 1000 * 60 * 60 * 24, // 1 day ago
          // No validFrom or validTo
        },
        config: {
          referenceTime: now,
        } as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      const explanation = scorer.getExplanation(context, score);

      expect(explanation).toContain('no validity period');
    });

    it('should report "currently valid" for valid entity', async () => {
      const context: ScoringContext = {
        entity: {
          name: 'test',
          entityType: 'test',
          observations: [],
          updatedAt: now,
          validFrom: now - 1000 * 60 * 60 * 24, // Started 1 day ago
          validTo: now + 1000 * 60 * 60 * 24, // Ends 1 day from now
        },
        config: {
          referenceTime: now,
        } as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      const explanation = scorer.getExplanation(context, score);

      expect(explanation).toContain('currently valid');
    });

    it('should report "not yet valid" for future validFrom', async () => {
      const context: ScoringContext = {
        entity: {
          name: 'test',
          entityType: 'test',
          observations: [],
          updatedAt: now,
          validFrom: now + 1000 * 60 * 60 * 24, // Starts 1 day from now
        },
        config: {
          referenceTime: now,
        } as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      const explanation = scorer.getExplanation(context, score);

      expect(explanation).toContain('not yet valid');
    });

    it('should report "expired" for past validTo', async () => {
      const context: ScoringContext = {
        entity: {
          name: 'test',
          entityType: 'test',
          observations: [],
          updatedAt: now - 1000 * 60 * 60 * 24 * 30, // 30 days ago
          validFrom: now - 1000 * 60 * 60 * 24 * 60, // Started 60 days ago
          validTo: now - 1000 * 60 * 60 * 24, // Expired 1 day ago
        },
        config: {
          referenceTime: now,
        } as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      const explanation = scorer.getExplanation(context, score);

      expect(explanation).toContain('expired');
    });
  });

  // --------------------------------------------------------------------------
  // No Temporal Metadata
  // --------------------------------------------------------------------------

  describe('no temporal metadata', () => {
    it('should return "N/A" explanation when no updatedAt', () => {
      const context: ScoringContext = {
        entity: {
          name: 'test',
          entityType: 'test',
          observations: [],
          // No updatedAt
        },
        config: {} as HybridSearchConfig,
      };

      const explanation = scorer.getExplanation(context, 0.5);
      expect(explanation).toContain('N/A');
      expect(explanation).toContain('no temporal metadata');
    });
  });

  // --------------------------------------------------------------------------
  // Recency Score Edge Cases
  // --------------------------------------------------------------------------

  describe('recency score calculation', () => {
    it('should use createdAt when updatedAt is missing', async () => {
      const context: ScoringContext = {
        entity: {
          name: 'test',
          entityType: 'test',
          observations: [],
          createdAt: now, // Just created
          // No updatedAt
        },
        config: {
          referenceTime: now,
          temporalHalfLife: 30,
        } as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      // Score should be high since it's just created
      expect(score).toBeGreaterThan(0.5);
    });

    it('should return neutral score when no temporal data at all', async () => {
      const context: ScoringContext = {
        entity: {
          name: 'test',
          entityType: 'test',
          observations: [],
          // No createdAt or updatedAt
        },
        config: {
          referenceTime: now,
        } as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      // Should return neutral-ish score
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should handle very old entities gracefully', async () => {
      const context: ScoringContext = {
        entity: {
          name: 'test',
          entityType: 'test',
          observations: [],
          updatedAt: now - 1000 * 60 * 60 * 24 * 365, // 1 year ago
        },
        config: {
          referenceTime: now,
          temporalHalfLife: 30,
        } as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      // Score should be very low for old entity
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThan(0.5);
    });
  });

  // --------------------------------------------------------------------------
  // Validity Score Calculation
  // --------------------------------------------------------------------------

  describe('validity score calculation', () => {
    it('should give high score to currently valid entities', async () => {
      const context: ScoringContext = {
        entity: {
          name: 'test',
          entityType: 'test',
          observations: [],
          updatedAt: now,
          validFrom: now - 1000,
          validTo: now + 1000,
        },
        config: {
          referenceTime: now,
        } as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      expect(score).toBeGreaterThan(0.8); // High score for valid + fresh
    });

    it('should give lower score to invalid entities', async () => {
      const context: ScoringContext = {
        entity: {
          name: 'test',
          entityType: 'test',
          observations: [],
          updatedAt: now,
          validFrom: now + 1000, // Not yet valid
        },
        config: {
          referenceTime: now,
        } as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      expect(score).toBeLessThan(0.8); // Lower score for invalid
    });

    it('should handle null validTo as no end date', async () => {
      const context: ScoringContext = {
        entity: {
          name: 'test',
          entityType: 'test',
          observations: [],
          updatedAt: now,
          validFrom: now - 1000,
          validTo: null, // No end date
        },
        config: {
          referenceTime: now,
        } as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      expect(score).toBeGreaterThan(0.5); // Should be valid
    });
  });

  // --------------------------------------------------------------------------
  // Default Config Values
  // --------------------------------------------------------------------------

  describe('default config values', () => {
    it('should use current time as default reference time', async () => {
      const context: ScoringContext = {
        entity: {
          name: 'test',
          entityType: 'test',
          observations: [],
          updatedAt: Date.now(), // Now
        },
        config: {} as HybridSearchConfig, // No referenceTime
      };

      const score = await scorer.score(context);
      expect(score).toBeGreaterThan(0.5); // Recent entity should score high
    });

    it('should use default temporal half-life of 30 days', async () => {
      const thirtyDaysAgo = Date.now() - 1000 * 60 * 60 * 24 * 30;
      const context: ScoringContext = {
        entity: {
          name: 'test',
          entityType: 'test',
          observations: [],
          updatedAt: thirtyDaysAgo,
        },
        config: {
          referenceTime: Date.now(),
          // No temporalHalfLife - should default to 30
        } as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      // At half-life, recency component should be ~0.5
      // Combined with validity, total should be around 0.5-0.6
      expect(score).toBeGreaterThanOrEqual(0.3);
      expect(score).toBeLessThanOrEqual(0.7);
    });
  });

  // --------------------------------------------------------------------------
  // Score Clamping
  // --------------------------------------------------------------------------

  describe('score clamping', () => {
    it('should never return score below 0', async () => {
      const context: ScoringContext = {
        entity: {
          name: 'test',
          entityType: 'test',
          observations: [],
          updatedAt: 0, // Very old timestamp
          validFrom: now + 1000, // Not valid yet
        },
        config: {
          referenceTime: now,
        } as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should never return score above 1', async () => {
      const context: ScoringContext = {
        entity: {
          name: 'test',
          entityType: 'test',
          observations: [],
          updatedAt: now, // Just updated
          validFrom: now - 1000,
          validTo: now + 1000,
        },
        config: {
          referenceTime: now,
        } as HybridSearchConfig,
      };

      const score = await scorer.score(context);
      expect(score).toBeLessThanOrEqual(1);
    });
  });
});
