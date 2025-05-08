/**
 * Interface for optimized vector index operations
 */
export interface VectorIndex {
  /**
   * Add a vector to the index
   * @param id Unique identifier for the vector
   * @param vector The vector to add
   */
  addVector(id: string, vector: number[]): Promise<void>;

  /**
   * Search for nearest neighbors
   * @param vector The query vector
   * @param limit Maximum number of results to return
   * @returns Promise resolving to array of results with id and similarity score
   */
  search(
    vector: number[],
    limit: number
  ): Promise<
    {
      id: string;
      score: number;
    }[]
  >;

  /**
   * Remove a vector from the index
   * @param id ID of the vector to remove
   */
  removeVector(id: string): Promise<void>;

  /**
   * Get index statistics
   * @returns Object with index statistics
   */
  getStats(): {
    totalVectors: number;
    dimensionality: number;
    indexType: string;
    memoryUsage: number;
    approximateSearch?: boolean;
    quantized?: boolean;
  };

  /**
   * Enable or disable approximate nearest neighbor search
   * @param enable Whether to enable approximate search
   */
  setApproximateSearch(enable: boolean): void;

  /**
   * Enable or disable vector quantization for memory optimization
   * @param enable Whether to enable quantization
   */
  setQuantization(enable: boolean): void;
}
