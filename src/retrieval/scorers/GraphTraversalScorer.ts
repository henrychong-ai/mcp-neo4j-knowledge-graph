/**
 * Graph traversal scorer
 * Scores entities based on their position and connectivity in the knowledge graph
 */

import type { Scorer, ScoringContext } from '../types.js';
import type { Relation } from '../../types/relation.js';
import { logger } from '../../utils/logger.js';

export class GraphTraversalScorer implements Scorer {
  getName(): string {
    return 'GraphTraversal';
  }

  /**
   * Score based on graph connectivity and centrality
   *
   * Considers:
   * - Degree centrality (number of connections)
   * - Relation quality (confidence and strength)
   * - Bidirectional connections (more important)
   */
  async score(context: ScoringContext): Promise<number> {
    try {
      const entityName = context.entity.name;
      const relations = context.relations || [];
      const allRelations = context.allRelations || relations;

      // Calculate degree centrality (normalized)
      const degreeScore = this.calculateDegreeScore(entityName, relations, allRelations);

      // Calculate relation quality score
      const qualityScore = this.calculateRelationQualityScore(relations);

      // Calculate bidirectional connection bonus
      const bidirectionalBonus = this.calculateBidirectionalBonus(
        entityName,
        relations,
        allRelations
      );

      // Combine scores with weights
      const finalScore =
        degreeScore * 0.4 + qualityScore * 0.4 + bidirectionalBonus * 0.2;

      return Math.max(0, Math.min(1, finalScore));
    } catch (error) {
      logger.error(`${this.getName()}: Error calculating score`, error);
      return 0.5; // Neutral score on error
    }
  }

  getExplanation(context: ScoringContext, score: number): string {
    const relations = context.relations || [];
    const inbound = relations.filter((r) => r.to === context.entity.name).length;
    const outbound = relations.filter((r) => r.from === context.entity.name).length;
    const total = inbound + outbound;

    return `Graph centrality: ${(score * 100).toFixed(1)}% (${total} connections: ${inbound} in, ${outbound} out)`;
  }

  /**
   * Calculate degree centrality score
   * Higher score for entities with more connections
   */
  private calculateDegreeScore(
    entityName: string,
    relations: Relation[],
    allRelations: Relation[]
  ): number {
    // Count connections for this entity
    const entityConnections = relations.filter(
      (r) => r.from === entityName || r.to === entityName
    ).length;

    if (entityConnections === 0) {
      return 0.1; // Low score for isolated entities
    }

    // Find the maximum number of connections in the entire graph
    const entityConnectionCounts = new Map<string, number>();
    for (const relation of allRelations) {
      entityConnectionCounts.set(relation.from, (entityConnectionCounts.get(relation.from) || 0) + 1);
      entityConnectionCounts.set(relation.to, (entityConnectionCounts.get(relation.to) || 0) + 1);
    }

    const maxConnections = Math.max(...entityConnectionCounts.values(), 1);

    // Normalize using logarithmic scale to avoid over-penalizing less connected nodes
    const normalizedScore = Math.log(entityConnections + 1) / Math.log(maxConnections + 1);

    return normalizedScore;
  }

  /**
   * Calculate average relation quality based on confidence and strength
   */
  private calculateRelationQualityScore(relations: Relation[]): number {
    if (relations.length === 0) {
      return 0.5; // Neutral score if no relations
    }

    let totalQuality = 0;
    let count = 0;

    for (const relation of relations) {
      // Use confidence if available, otherwise use strength, otherwise use 0.5
      const confidence = relation.confidence ?? relation.strength ?? 0.5;
      totalQuality += confidence;
      count++;
    }

    return count > 0 ? totalQuality / count : 0.5;
  }

  /**
   * Calculate bonus score for bidirectional connections
   * Bidirectional connections indicate stronger relationships
   */
  private calculateBidirectionalBonus(
    entityName: string,
    relations: Relation[],
    allRelations: Relation[]
  ): number {
    const outboundRelations = relations.filter((r) => r.from === entityName);

    if (outboundRelations.length === 0) {
      return 0;
    }

    let bidirectionalCount = 0;

    for (const outbound of outboundRelations) {
      // Check if there's a reverse relation
      const hasReverse = allRelations.some(
        (r) =>
          r.from === outbound.to &&
          r.to === outbound.from &&
          r.relationType === outbound.relationType
      );

      if (hasReverse) {
        bidirectionalCount++;
      }
    }

    // Return ratio of bidirectional to total outbound connections
    return bidirectionalCount / outboundRelations.length;
  }
}
