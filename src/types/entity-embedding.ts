/**
 * Interface representing a vector embedding for semantic search
 */
export interface EntityEmbedding {
  /**
   * The embedding vector
   */
  vector: number[];

  /**
   * Name/version of embedding model used
   */
  model: string;

  /**
   * Timestamp when embedding was last updated
   */
  lastUpdated: number;
}

/**
 * Search filter for advanced filtering
 */
export interface SearchFilter {
  /**
   * Field to filter on
   */
  field: string;

  /**
   * Filter operation
   */
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains';

  /**
   * Filter value
   */
  value: any;
}

/**
 * Extended SearchOptions interface with semantic search capabilities
 */
export interface SemanticSearchOptions {
  /**
   * Use vector similarity for search
   */
  semanticSearch?: boolean;

  /**
   * Combine keyword and semantic search
   */
  hybridSearch?: boolean;

  /**
   * Balance between keyword vs semantic (0.0-1.0)
   */
  semanticWeight?: number;

  /**
   * Minimum similarity threshold
   */
  minSimilarity?: number;

  /**
   * Apply query expansion
   */
  expandQuery?: boolean;

  /**
   * Include facet information in results
   */
  includeFacets?: boolean;

  /**
   * Facets to include (entityType, etc.)
   */
  facets?: string[];

  /**
   * Include score explanations
   */
  includeExplanations?: boolean;

  /**
   * Additional filters
   */
  filters?: SearchFilter[];

  /**
   * Maximum number of results to return
   */
  limit?: number;

  /**
   * Number of results to skip (for pagination)
   */
  offset?: number;

  /**
   * Include document content in search (when available)
   */
  includeDocuments?: boolean;

  /**
   * Use search result caching
   */
  useCache?: boolean;
}

/**
 * Match details for search results
 */
export interface SearchMatch {
  /**
   * Field that matched
   */
  field: string;

  /**
   * Score for this field
   */
  score: number;

  /**
   * Text match locations
   */
  textMatches?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

/**
 * Search result with relevance information
 */
export interface SearchResult {
  /**
   * The matching entity
   */
  entity: any;

  /**
   * Overall relevance score
   */
  score: number;

  /**
   * Match details
   */
  matches?: SearchMatch[];

  /**
   * Explanation of the scoring (if requested)
   */
  explanation?: any;
}

/**
 * Search response with results and metadata
 */
export interface SearchResponse {
  /**
   * Search results
   */
  results: SearchResult[];

  /**
   * Total number of matching results
   */
  total: number;

  /**
   * Facet information
   */
  facets?: Record<
    string,
    {
      counts: Record<string, number>;
    }
  >;

  /**
   * Search execution time in ms
   */
  timeTaken: number;
}
