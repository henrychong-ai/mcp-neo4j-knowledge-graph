/**
 * Temporal freshness scorer
 * Scores entities based on how recently they were updated
 */

import type { Scorer, ScoringContext } from '../types.js';
import type { TemporalEntity } from '../../types/temporalEntity.js';
import { logger } from '../../utils/logger.js';

export class TemporalFreshnessScorer implements Scorer {
  getName(): string {
    return 'TemporalFreshness';
  }

  /**
   * Score based on temporal freshness
   *
   * Considers:
   * - How recently the entity was updated (updatedAt)
   * - Whether the entity is currently valid (validFrom/validTo)
   * - Time decay using exponential decay function
   */
  async score(context: ScoringContext): Promise<number> {
    try {
      const entity = context.entity as Partial<TemporalEntity>;
      const config = context.config;
      const referenceTime = config.referenceTime || Date.now();

      // Check if entity is currently valid
      const validityScore = this.calculateValidityScore(entity, referenceTime);

      // Calculate recency score with exponential decay
      const recencyScore = this.calculateRecencyScore(entity, referenceTime, config.temporalHalfLife || 30);

      // Combine validity and recency (validity is more important)
      const finalScore = validityScore * 0.4 + recencyScore * 0.6;

      return Math.max(0, Math.min(1, finalScore));
    } catch (error) {
      logger.error(`${this.getName()}: Error calculating score`, error);
      return 0.5; // Neutral score on error
    }
  }

  getExplanation(context: ScoringContext, score: number): string {
    const entity = context.entity as Partial<TemporalEntity>;
    const referenceTime = context.config.referenceTime || Date.now();

    if (entity.updatedAt) {
      const ageInDays = (referenceTime - entity.updatedAt) / (1000 * 60 * 60 * 24);
      const validity = this.getValidityStatus(entity, referenceTime);
      return `Temporal freshness: ${(score * 100).toFixed(1)}% (${ageInDays.toFixed(1)} days old, ${validity})`;
    }

    return `Temporal freshness: N/A (no temporal metadata)`;
  }

  /**
   * Calculate validity score
   * Returns 1.0 if currently valid, 0.3 if invalid, 0.7 if no validity period
   */
  private calculateValidityScore(entity: Partial<TemporalEntity>, referenceTime: number): number {
    // If no validity period is defined, assume it's valid
    if (entity.validFrom === undefined && entity.validTo === undefined) {
      return 0.7; // Neutral-positive score
    }

    // Check if currently valid
    const isValid =
      (entity.validFrom === undefined || referenceTime >= entity.validFrom) &&
      (entity.validTo === undefined || entity.validTo === null || referenceTime <= entity.validTo);

    return isValid ? 1.0 : 0.3;
  }

  /**
   * Calculate recency score using exponential decay
   *
   * Uses the formula: score = 2^(-age / halfLife)
   * where age is in days and halfLife is the decay half-life in days
   *
   * Examples with 30-day half-life:
   * - Just updated (0 days): 1.0
   * - 30 days old: 0.5
   * - 60 days old: 0.25
   * - 90 days old: 0.125
   */
  private calculateRecencyScore(
    entity: Partial<TemporalEntity>,
    referenceTime: number,
    halfLifeDays: number
  ): number {
    // Use updatedAt if available, otherwise use createdAt, otherwise return neutral score
    const timestamp = entity.updatedAt ?? entity.createdAt;

    if (timestamp === undefined) {
      return 0.5; // Neutral score if no temporal data
    }

    // Calculate age in days
    const ageInMillis = referenceTime - timestamp;
    const ageInDays = ageInMillis / (1000 * 60 * 60 * 24);

    // Apply exponential decay
    // score = 2^(-age / halfLife)
    const score = Math.pow(2, -ageInDays / halfLifeDays);

    // Clamp to [0, 1] range (though it should naturally be in this range)
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Get human-readable validity status
   */
  private getValidityStatus(entity: Partial<TemporalEntity>, referenceTime: number): string {
    if (entity.validFrom === undefined && entity.validTo === undefined) {
      return 'no validity period';
    }

    const isValid =
      (entity.validFrom === undefined || referenceTime >= entity.validFrom) &&
      (entity.validTo === undefined || entity.validTo === null || referenceTime <= entity.validTo);

    if (isValid) {
      return 'currently valid';
    }

    if (entity.validFrom !== undefined && referenceTime < entity.validFrom) {
      return 'not yet valid';
    }

    return 'expired';
  }
}
