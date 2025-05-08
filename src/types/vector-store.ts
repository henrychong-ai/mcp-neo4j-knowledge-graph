export interface VectorSearchResult {
  id: string | number;
  similarity: number;
  metadata: Record<string, any>;
}

export interface VectorStore {
  initialize(): Promise<void>;

  addVector(id: string | number, vector: number[], metadata?: Record<string, any>): Promise<void>;

  removeVector(id: string | number): Promise<void>;

  search(
    queryVector: number[],
    options?: {
      limit?: number;
      filter?: Record<string, any>;
      hybridSearch?: boolean;
      minSimilarity?: number;
    }
  ): Promise<VectorSearchResult[]>;
}
