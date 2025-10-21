/**
 * Unit tests for VectorSimilarityScorer
 */

import { describe, it, expect } from 'vitest';
import { VectorSimilarityScorer } from '../scorers/VectorSimilarityScorer.js';
import type { ScoringContext } from '../types.js';
import { DEFAULT_HYBRID_CONFIG } from '../types.js';

describe('VectorSimilarityScorer', () => {
  const scorer = new VectorSimilarityScorer();

  const createContext = (
    vectorSimilarity?: number,
    queryVector?: number[],
    entityEmbedding?: number[]
  ): ScoringContext => ({
    entity: {
      name: 'TestEntity',
      entityType: 'Test',
      observations: ['Test observation'],
      embedding: entityEmbedding
        ? {
            vector: entityEmbedding,
            model: 'test-model',
            dimensions: entityEmbedding.length,
          }
        : undefined,
    },
    relations: [],
    vectorSimilarity,
    query: 'test query',
    queryVector,
    config: DEFAULT_HYBRID_CONFIG,
  });

  describe('getName', () => {
    it('should return correct name', () => {
      expect(scorer.getName()).toBe('VectorSimilarity');
    });
  });

  describe('score', () => {
    it('should return pre-computed vector similarity when available', async () => {
      const context = createContext(0.85);
      const score = await scorer.score(context);
      expect(score).toBe(0.85);
    });

    it('should return 0.5 when no vector similarity is available', async () => {
      const context = createContext();
      const score = await scorer.score(context);
      expect(score).toBe(0.5);
    });

    it('should calculate cosine similarity when query vector and entity embedding are available', async () => {
      const queryVector = [1, 0, 0];
      const entityEmbedding = [1, 0, 0];
      const context = createContext(undefined, queryVector, entityEmbedding);
      const score = await scorer.score(context);
      expect(score).toBe(1.0); // Perfect match
    });

    it('should calculate cosine similarity for orthogonal vectors', async () => {
      const queryVector = [1, 0, 0];
      const entityEmbedding = [0, 1, 0];
      const context = createContext(undefined, queryVector, entityEmbedding);
      const score = await scorer.score(context);
      expect(score).toBe(0); // Orthogonal vectors
    });

    it('should clamp scores to [0, 1] range', async () => {
      const context = createContext(1.5); // Out of range
      const score = await scorer.score(context);
      expect(score).toBe(1.0);
    });

    it('should handle negative similarity scores', async () => {
      const context = createContext(-0.5);
      const score = await scorer.score(context);
      expect(score).toBe(0);
    });
  });

  describe('getExplanation', () => {
    it('should provide explanation for pre-computed similarity', () => {
      const context = createContext(0.85);
      const explanation = scorer.getExplanation(context, 0.85);
      expect(explanation).toContain('Vector similarity');
      expect(explanation).toContain('85.0%');
      expect(explanation).toContain('cosine distance');
    });

    it('should provide explanation when no embedding available', () => {
      const context = createContext();
      const explanation = scorer.getExplanation(context, 0.5);
      expect(explanation).toContain('N/A');
      expect(explanation).toContain('no embedding available');
    });

    it('should provide explanation for calculated similarity', () => {
      const queryVector = [1, 0, 0];
      const entityEmbedding = [1, 0, 0];
      const context = createContext(undefined, queryVector, entityEmbedding);
      const explanation = scorer.getExplanation(context, 1.0);
      expect(explanation).toContain('Vector similarity');
      expect(explanation).toContain('100.0%');
      expect(explanation).toContain('calculated');
    });
  });
});
