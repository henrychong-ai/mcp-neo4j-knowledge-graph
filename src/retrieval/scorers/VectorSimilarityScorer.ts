/**
 * Vector similarity scorer
 * Uses cosine similarity from vector embeddings
 */

import { logger } from '../../utils/logger.js';
import type { Scorer, ScoringContext } from '../types.js';

export class VectorSimilarityScorer implements Scorer {
  getName(): string {
    return 'VectorSimilarity';
  }

  /**
   * Score based on vector similarity
   * Returns the pre-computed vector similarity score if available,
   * otherwise returns a neutral score of 0.5
   */
  async score(context: ScoringContext): Promise<number> {
    try {
      // If we have a pre-computed vector similarity, use it
      if (context.vectorSimilarity !== undefined) {
        // Vector similarity is already 0-1 range from cosine similarity
        return Math.max(0, Math.min(1, context.vectorSimilarity));
      }

      // If we have both query vector and entity embedding, calculate similarity
      if (context.queryVector && context.entity.embedding?.vector) {
        const similarity = this.cosineSimilarity(
          context.queryVector,
          context.entity.embedding.vector
        );
        return Math.max(0, Math.min(1, similarity));
      }

      // If no vector similarity available, return neutral score
      logger.debug(
        `${this.getName()}: No vector similarity available for entity ${context.entity.name}`
      );
      return 0.5;
    } catch (error) {
      logger.error(`${this.getName()}: Error calculating score`, error);
      return 0.5; // Neutral score on error
    }
  }

  getExplanation(context: ScoringContext, score: number): string {
    if (context.vectorSimilarity !== undefined) {
      return `Vector similarity: ${(score * 100).toFixed(1)}% (cosine distance)`;
    }
    if (context.queryVector && context.entity.embedding?.vector) {
      return `Vector similarity: ${(score * 100).toFixed(1)}% (calculated)`;
    }
    return `Vector similarity: N/A (no embedding available)`;
  }

  /**
   * Calculate cosine similarity between two vectors
   * Returns a value between -1 and 1, where 1 means identical direction
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (const [i, element] of a.entries()) {
      dotProduct += element * b[i];
      normA += element * element;
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0; // Avoid division by zero
    }

    return dotProduct / (normA * normB);
  }
}
