/**
 * Types for hybrid retrieval system
 */

import type { Entity } from '../KnowledgeGraphManager.js';
import type { Relation } from '../types/relation.js';
import type { TemporalEntity } from '../types/temporalEntity.js';
import type { TemporalRelation } from '../types/temporalRelation.js';

/**
 * Configuration for hybrid search scoring weights
 */
export interface HybridSearchConfig {
  /**
   * Weight for vector similarity score (0.0 - 1.0)
   * Default: 0.5
   */
  vectorWeight: number;

  /**
   * Weight for graph traversal score (0.0 - 1.0)
   * Default: 0.2
   */
  graphWeight: number;

  /**
   * Weight for temporal freshness score (0.0 - 1.0)
   * Default: 0.15
   */
  temporalWeight: number;

  /**
   * Weight for connection strength score (0.0 - 1.0)
   * Default: 0.15
   */
  connectionWeight: number;

  /**
   * Enable detailed scoring debug information
   * Default: false
   */
  enableScoreDebug: boolean;

  /**
   * Reference time for temporal scoring (milliseconds since epoch)
   * Default: Date.now()
   */
  referenceTime?: number;

  /**
   * Half-life for temporal decay in days
   * Default: 30 days
   */
  temporalHalfLife?: number;
}

/**
 * Default configuration for hybrid search
 */
export const DEFAULT_HYBRID_CONFIG: HybridSearchConfig = {
  vectorWeight: 0.5,
  graphWeight: 0.2,
  temporalWeight: 0.15,
  connectionWeight: 0.15,
  enableScoreDebug: false,
  referenceTime: undefined, // Will use Date.now() when needed
  temporalHalfLife: 30, // 30 days
};

/**
 * Individual score breakdown for a hybrid search result
 */
export interface ScoreBreakdown {
  /**
   * Vector similarity score (0.0 - 1.0)
   */
  vector: number;

  /**
   * Graph traversal score (0.0 - 1.0)
   */
  graph: number;

  /**
   * Temporal freshness score (0.0 - 1.0)
   */
  temporal: number;

  /**
   * Connection strength score (0.0 - 1.0)
   */
  connection: number;

  /**
   * Final weighted score (0.0 - 1.0)
   */
  final: number;

  /**
   * Human-readable explanation of the score
   */
  explanation?: string;
}

/**
 * Result from hybrid search with detailed scoring information
 */
export interface HybridSearchResult {
  /**
   * Entity ID or name
   */
  id: string | number;

  /**
   * Entity data
   */
  entity: Entity;

  /**
   * Score breakdown
   */
  scores: ScoreBreakdown;

  /**
   * Metadata about the result
   */
  metadata: {
    entityType?: string;
    searchMethod: 'hybrid';
    [key: string]: unknown;
  };
}

/**
 * Context for scoring an entity
 */
export interface ScoringContext {
  /**
   * The entity being scored
   */
  entity: Entity & Partial<TemporalEntity>;

  /**
   * Relations connected to this entity
   */
  relations: (Relation & Partial<TemporalRelation>)[];

  /**
   * Vector similarity score (if available)
   */
  vectorSimilarity?: number;

  /**
   * Original query string
   */
  query: string;

  /**
   * Query embedding vector (if available)
   */
  queryVector?: number[];

  /**
   * Configuration for scoring
   */
  config: HybridSearchConfig;

  /**
   * All entities in the result set (for graph analysis)
   */
  allEntities?: Entity[];

  /**
   * All relations in the graph (for graph analysis)
   */
  allRelations?: Relation[];
}

/**
 * Base interface for all scorers
 */
export interface Scorer {
  /**
   * Calculate a score for an entity (0.0 - 1.0)
   * @param context Scoring context with entity, relations, and config
   * @returns Score between 0.0 and 1.0
   */
  score(context: ScoringContext): Promise<number>;

  /**
   * Get a human-readable name for this scorer
   */
  getName(): string;

  /**
   * Get a human-readable explanation of the score
   */
  getExplanation(context: ScoringContext, score: number): string;
}
