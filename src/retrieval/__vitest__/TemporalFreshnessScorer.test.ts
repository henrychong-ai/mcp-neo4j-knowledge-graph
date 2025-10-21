/**
 * Unit tests for TemporalFreshnessScorer
 */

import { describe, it, expect } from 'vitest';
import { TemporalFreshnessScorer } from '../scorers/TemporalFreshnessScorer.js';
import type { ScoringContext } from '../types.js';
import type { TemporalEntity } from '../../types/temporalEntity.js';
import { DEFAULT_HYBRID_CONFIG } from '../types.js';

describe('TemporalFreshnessScorer', () => {
  const scorer = new TemporalFreshnessScorer();
  const now = Date.now();

  const createContext = (
    temporalData: Partial<TemporalEntity> = {},
    referenceTime: number = now
  ): ScoringContext => ({
    entity: {
      name: 'TestEntity',
      entityType: 'Test',
      observations: ['Test observation'],
      ...temporalData,
    },
    relations: [],
    query: 'test query',
    config: {
      ...DEFAULT_HYBRID_CONFIG,
      referenceTime,
      temporalHalfLife: 30,
    },
  });

  describe('getName', () => {
    it('should return correct name', () => {
      expect(scorer.getName()).toBe('TemporalFreshness');
    });
  });

  describe('score', () => {
    it('should return high score for recently updated entities', async () => {
      const context = createContext({
        updatedAt: now - 1000 * 60 * 60, // 1 hour ago
        createdAt: now - 1000 * 60 * 60 * 24,
      });
      const score = await scorer.score(context);
      expect(score).toBeGreaterThan(0.9);
    });

    it('should return lower score for old entities', async () => {
      const context = createContext({
        updatedAt: now - 1000 * 60 * 60 * 24 * 90, // 90 days ago
        createdAt: now - 1000 * 60 * 60 * 24 * 100,
      });
      const score = await scorer.score(context);
      expect(score).toBeLessThan(0.3);
    });

    it('should handle entities with no temporal data', async () => {
      const context = createContext({});
      const score = await scorer.score(context);
      expect(score).toBe(0.5); // Neutral score
    });

    it('should return high score for currently valid entities', async () => {
      const context = createContext({
        updatedAt: now - 1000 * 60 * 60 * 24, // 1 day ago
        validFrom: now - 1000 * 60 * 60 * 24 * 10, // Valid from 10 days ago
        validTo: null, // Still valid
      });
      const score = await scorer.score(context);
      expect(score).toBeGreaterThan(0.8);
    });

    it('should return lower score for invalid entities', async () => {
      const context = createContext({
        updatedAt: now - 1000 * 60 * 60 * 24, // 1 day ago
        validFrom: now - 1000 * 60 * 60 * 24 * 30,
        validTo: now - 1000 * 60 * 60 * 24 * 10, // Invalid for 10 days
      });
      const score = await scorer.score(context);
      expect(score).toBeLessThan(0.5);
    });

    it('should use exponential decay based on half-life', async () => {
      const halfLife = 30; // 30 days
      const context30Days = createContext(
        {
          updatedAt: now - 1000 * 60 * 60 * 24 * 30,
        },
        now
      );
      const score30Days = await scorer.score(context30Days);

      // At exactly half-life, contribution from recency should be ~0.5
      // Combined with validity (0.7), we expect around 0.6
      expect(score30Days).toBeGreaterThan(0.5);
      expect(score30Days).toBeLessThan(0.7);
    });
  });

  describe('getExplanation', () => {
    it('should provide temporal information', () => {
      const context = createContext({
        updatedAt: now - 1000 * 60 * 60 * 24 * 5, // 5 days ago
        validFrom: now - 1000 * 60 * 60 * 24 * 10,
        validTo: null,
      });
      const explanation = scorer.getExplanation(context, 0.85);
      expect(explanation).toContain('Temporal freshness');
      expect(explanation).toContain('85.0%');
      expect(explanation).toContain('5.0 days old');
      expect(explanation).toContain('currently valid');
    });

    it('should handle entities with no temporal metadata', () => {
      const context = createContext({});
      const explanation = scorer.getExplanation(context, 0.5);
      expect(explanation).toContain('N/A');
      expect(explanation).toContain('no temporal metadata');
    });
  });
});
