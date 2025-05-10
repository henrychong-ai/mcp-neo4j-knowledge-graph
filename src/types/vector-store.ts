export interface VectorSearchResult {
  id: string | number;
  similarity: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any>;
}

export interface VectorStore {
  initialize(): Promise<void>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addVector(id: string | number, vector: number[], metadata?: Record<string, any>): Promise<void>;

  removeVector(id: string | number): Promise<void>;

  search(
    queryVector: number[],
    options?: {
      limit?: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      filter?: Record<string, any>;
      hybridSearch?: boolean;
      minSimilarity?: number;
    }
  ): Promise<VectorSearchResult[]>;
}
