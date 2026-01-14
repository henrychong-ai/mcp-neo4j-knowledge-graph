/**
 * Hybrid retrieval system that combines multiple scoring signals
 */

import type { Entity } from '../KnowledgeGraphManager.js';
import type { Relation } from '../types/relation.js';
import type { VectorSearchResult } from '../types/vector-store.js';
import { logger } from '../utils/logger.js';

import { ConnectionStrengthScorer } from './scorers/ConnectionStrengthScorer.js';
import { GraphTraversalScorer } from './scorers/GraphTraversalScorer.js';
import { TemporalFreshnessScorer } from './scorers/TemporalFreshnessScorer.js';
import { VectorSimilarityScorer } from './scorers/VectorSimilarityScorer.js';
import { DEFAULT_HYBRID_CONFIG } from './types.js';
import type {
  HybridSearchConfig,
  HybridSearchResult,
  ScoreBreakdown,
  ScoringContext,
} from './types.js';

export interface HybridRetrieverOptions {
  /**
   * Configuration for hybrid search scoring
   */
  config?: Partial<HybridSearchConfig>;
}

/**
 * HybridRetriever orchestrates multiple scoring signals to rerank search results
 */
export class HybridRetriever {
  private config: HybridSearchConfig;
  private vectorScorer: VectorSimilarityScorer;
  private graphScorer: GraphTraversalScorer;
  private temporalScorer: TemporalFreshnessScorer;
  private connectionScorer: ConnectionStrengthScorer;

  constructor(options: HybridRetrieverOptions = {}) {
    this.config = {
      ...DEFAULT_HYBRID_CONFIG,
      ...options.config,
    };

    // Validate weights sum to approximately 1.0
    const totalWeight =
      this.config.vectorWeight +
      this.config.graphWeight +
      this.config.temporalWeight +
      this.config.connectionWeight;

    if (Math.abs(totalWeight - 1) > 0.01) {
      logger.warn(
        `HybridRetriever: Weights sum to ${totalWeight.toFixed(2)}, not 1.0. Results may be skewed.`
      );
    }

    // Initialize scorers
    this.vectorScorer = new VectorSimilarityScorer();
    this.graphScorer = new GraphTraversalScorer();
    this.temporalScorer = new TemporalFreshnessScorer();
    this.connectionScorer = new ConnectionStrengthScorer();
  }

  /**
   * Rerank vector search results using hybrid scoring
   *
   * @param vectorResults Initial results from vector search
   * @param entities Full entity data for each result
   * @param relations Relations for each entity
   * @param query Original search query
   * @param queryVector Query embedding vector (optional)
   * @param allEntities All entities in the graph (for graph analysis)
   * @param allRelations All relations in the graph (for graph analysis)
   * @returns Reranked results with score breakdowns
   */
  async rerank(
    vectorResults: VectorSearchResult[],
    entities: Entity[],
    relations: Map<string, Relation[]>,
    query: string,
    queryVector?: number[],
    allEntities?: Entity[],
    allRelations?: Relation[]
  ): Promise<HybridSearchResult[]> {
    const startTime = Date.now();

    logger.debug('HybridRetriever: Starting reranking process', {
      resultCount: vectorResults.length,
      entityCount: entities.length,
      config: this.config,
    });

    // Build results with hybrid scores
    const hybridResults: HybridSearchResult[] = [];

    for (const [i, vectorResult] of vectorResults.entries()) {
      const entity = entities[i];

      if (!entity) {
        logger.warn(`HybridRetriever: No entity found for result ${i} (id: ${vectorResult.id})`);
        continue;
      }

      const entityRelations = relations.get(entity.name) || [];

      // Build scoring context
      const context: ScoringContext = {
        entity,
        relations: entityRelations,
        vectorSimilarity: vectorResult.similarity,
        query,
        queryVector,
        config: this.config,
        allEntities,
        allRelations,
      };

      // Calculate individual scores
      const scores = await this.calculateScores(context);

      // Build result
      const hybridResult: HybridSearchResult = {
        id: vectorResult.id,
        entity,
        scores,
        metadata: {
          ...vectorResult.metadata,
          searchMethod: 'hybrid',
        },
      };

      hybridResults.push(hybridResult);
    }

    // Sort by final score (descending)
    hybridResults.sort((a, b) => b.scores.final - a.scores.final);

    const timeTaken = Date.now() - startTime;

    logger.debug('HybridRetriever: Reranking complete', {
      resultCount: hybridResults.length,
      timeTaken: `${timeTaken}ms`,
      topScore: hybridResults[0]?.scores.final,
    });

    return hybridResults;
  }

  /**
   * Calculate all scores for an entity
   */
  private async calculateScores(context: ScoringContext): Promise<ScoreBreakdown> {
    // Calculate individual scores in parallel
    const [vectorScore, graphScore, temporalScore, connectionScore] = await Promise.all([
      this.vectorScorer.score(context),
      this.graphScorer.score(context),
      this.temporalScorer.score(context),
      this.connectionScorer.score(context),
    ]);

    // Calculate weighted final score
    const finalScore =
      vectorScore * this.config.vectorWeight +
      graphScore * this.config.graphWeight +
      temporalScore * this.config.temporalWeight +
      connectionScore * this.config.connectionWeight;

    // Generate explanation if debug mode is enabled
    let explanation: string | undefined;

    if (this.config.enableScoreDebug) {
      explanation = this.generateExplanation(
        context,
        vectorScore,
        graphScore,
        temporalScore,
        connectionScore,
        finalScore
      );
    }

    return {
      vector: vectorScore,
      graph: graphScore,
      temporal: temporalScore,
      connection: connectionScore,
      final: finalScore,
      explanation,
    };
  }

  /**
   * Generate a human-readable explanation of the score
   */
  private generateExplanation(
    context: ScoringContext,
    vectorScore: number,
    graphScore: number,
    temporalScore: number,
    connectionScore: number,
    finalScore: number
  ): string {
    const lines: string[] = [`Entity: ${context.entity.name}`];

    lines.push(`Final Score: ${(finalScore * 100).toFixed(1)}%`, '', 'Score Breakdown:');
    lines.push(
      `- ${this.vectorScorer.getExplanation(context, vectorScore)} (weight: ${this.config.vectorWeight})`
    );
    lines.push(
      `- ${this.graphScorer.getExplanation(context, graphScore)} (weight: ${this.config.graphWeight})`
    );
    lines.push(
      `- ${this.temporalScorer.getExplanation(context, temporalScore)} (weight: ${this.config.temporalWeight})`
    );
    lines.push(
      `- ${this.connectionScorer.getExplanation(context, connectionScore)} (weight: ${this.config.connectionWeight})`,
      ''
    );
    lines.push(
      `Calculation: (${vectorScore.toFixed(3)} × ${this.config.vectorWeight}) + (${graphScore.toFixed(3)} × ${this.config.graphWeight}) + (${temporalScore.toFixed(3)} × ${this.config.temporalWeight}) + (${connectionScore.toFixed(3)} × ${this.config.connectionWeight}) = ${finalScore.toFixed(3)}`
    );

    return lines.join('\n');
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HybridSearchConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };

    logger.debug('HybridRetriever: Configuration updated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): HybridSearchConfig {
    return { ...this.config };
  }
}
