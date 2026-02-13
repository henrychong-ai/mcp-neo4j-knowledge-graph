/**
 * Connection strength scorer
 * Scores entities based on the quality and strength of their connections
 */

import type { Relation } from '../../types/relation.js';
import { logger } from '../../utils/logger.js';
import type { Scorer, ScoringContext } from '../types.js';

export class ConnectionStrengthScorer implements Scorer {
  getName(): string {
    return 'ConnectionStrength';
  }

  /**
   * Score based on connection strength and quality
   *
   * Considers:
   * - Average confidence of relations
   * - Average strength of relations
   * - Number of high-quality connections (confidence >= 0.7)
   * - Diversity of relation types
   */
  async score(context: ScoringContext): Promise<number> {
    try {
      const relations = context.relations || [];

      if (relations.length === 0) {
        return 0.3; // Low score for entities with no connections
      }

      // Calculate average confidence/strength
      const avgQuality = this.calculateAverageQuality(relations);

      // Calculate high-quality connection ratio
      const highQualityRatio = this.calculateHighQualityRatio(relations);

      // Calculate relation type diversity
      const diversityScore = this.calculateRelationTypeDiversity(relations);

      // Combine scores with weights
      const finalScore = avgQuality * 0.5 + highQualityRatio * 0.3 + diversityScore * 0.2;

      return Math.max(0, Math.min(1, finalScore));
    } catch (error) {
      logger.error(`${this.getName()}: Error calculating score`, error);
      return 0.5; // Neutral score on error
    }
  }

  getExplanation(context: ScoringContext, score: number): string {
    const relations = context.relations || [];

    if (relations.length === 0) {
      return `Connection strength: ${(score * 100).toFixed(1)}% (no connections)`;
    }

    const avgQuality = this.calculateAverageQuality(relations);
    const highQualityCount = relations.filter(
      r => (r.confidence ?? r.strength ?? 0.5) >= 0.7
    ).length;
    const relationTypes = new Set(relations.map(r => r.relationType)).size;

    return `Connection strength: ${(score * 100).toFixed(1)}% (avg quality: ${(avgQuality * 100).toFixed(0)}%, ${highQualityCount}/${relations.length} strong, ${relationTypes} types)`;
  }

  /**
   * Calculate average quality of connections
   * Uses confidence if available, otherwise strength, otherwise 0.5
   */
  private calculateAverageQuality(relations: Relation[]): number {
    if (relations.length === 0) {
      return 0;
    }

    let totalQuality = 0;

    for (const relation of relations) {
      // Prefer confidence over strength, with fallback to 0.5
      const quality = relation.confidence ?? relation.strength ?? 0.5;
      totalQuality += quality;
    }

    return totalQuality / relations.length;
  }

  /**
   * Calculate ratio of high-quality connections
   * High-quality is defined as confidence/strength >= 0.7
   */
  private calculateHighQualityRatio(relations: Relation[]): number {
    if (relations.length === 0) {
      return 0;
    }

    const highQualityCount = relations.filter(r => {
      const quality = r.confidence ?? r.strength ?? 0.5;
      return quality >= 0.7;
    }).length;

    return highQualityCount / relations.length;
  }

  /**
   * Calculate relation type diversity
   * Higher score for entities with diverse types of relationships
   *
   * Uses Shannon entropy for diversity calculation
   * Normalized to [0, 1] range
   */
  private calculateRelationTypeDiversity(relations: Relation[]): number {
    if (relations.length === 0) {
      return 0;
    }

    // Count relation types
    const typeCounts = new Map<string, number>();
    for (const relation of relations) {
      const type = relation.relationType;
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }

    const uniqueTypes = typeCounts.size;

    // If only one type, diversity is 0
    if (uniqueTypes === 1) {
      return 0.3; // Low but not zero
    }

    // Calculate Shannon entropy
    let entropy = 0;
    for (const count of typeCounts.values()) {
      const probability = count / relations.length;
      entropy -= probability * Math.log2(probability);
    }

    // Normalize entropy
    // Maximum entropy is log2(n) where n is the number of unique types
    const maxEntropy = Math.log2(uniqueTypes);
    const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;

    // Scale to give higher scores for more diversity
    // Boost the score to make diversity more impactful
    return Math.min(1, normalizedEntropy * 0.7 + 0.3);
  }
}
