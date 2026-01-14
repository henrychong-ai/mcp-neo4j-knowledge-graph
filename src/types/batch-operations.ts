/**
 * Type definitions for batch operations API
 *
 * Batch operations provide optimized bulk processing for knowledge graph operations,
 * delivering 10-50x performance improvements over individual operations.
 */

/**
 * Configuration options for batch operations
 */
export interface BatchConfig {
  /**
   * Maximum number of items to process in a single batch
   * Default: 100
   *
   * Larger batches are automatically chunked to this size
   * to prevent transaction size limits and memory exhaustion.
   */
  maxBatchSize?: number;

  /**
   * Enable parallel processing where applicable
   * Default: false
   *
   * When enabled, independent operations (like embedding generation)
   * are processed concurrently for improved performance.
   */
  enableParallel?: boolean;

  /**
   * Optional callback for progress tracking
   *
   * Called periodically during batch processing to report progress.
   * Useful for long-running operations to provide user feedback.
   */
  onProgress?: (progress: BatchProgress) => void;
}

/**
 * Result of a batch operation
 */
export interface BatchResult<T> {
  /**
   * Items that were successfully processed
   */
  successful: T[];

  /**
   * Items that failed processing with error details
   */
  failed: {
    item: T;
    error: string;
  }[];

  /**
   * Total time taken for the batch operation in milliseconds
   */
  totalTimeMs: number;

  /**
   * Average time per item in milliseconds
   */
  avgTimePerItemMs: number;
}

/**
 * Progress information for batch operations
 */
export interface BatchProgress {
  /**
   * Total number of items to process
   */
  total: number;

  /**
   * Number of items completed successfully
   */
  completed: number;

  /**
   * Number of items that failed
   */
  failed: number;

  /**
   * Current progress percentage (0-100)
   */
  percentage: number;

  /**
   * Estimated time remaining in milliseconds
   */
  estimatedTimeMs?: number;
}

/**
 * Batch structure for adding observations to multiple entities
 */
export interface ObservationBatch {
  /**
   * Name of the entity to add observations to
   */
  entityName: string;

  /**
   * Observations to add to this entity
   */
  observations: string[];

  /**
   * Optional metadata for the observations
   */
  metadata?: Record<string, unknown>;

  /**
   * Optional confidence level (0.0-1.0)
   */
  confidence?: number;

  /**
   * Optional strength value (0.0-1.0)
   */
  strength?: number;
}

/**
 * Entity update structure for batch updates
 */
export interface EntityUpdate {
  /**
   * Name of the entity to update
   */
  name: string;

  /**
   * New entity type (optional)
   */
  entityType?: string;

  /**
   * Domain for namespace scoping (user-defined, optional)
   */
  domain?: string;

  /**
   * Observations to add (optional)
   */
  addObservations?: string[];

  /**
   * Observations to remove (optional)
   */
  removeObservations?: string[];
}
