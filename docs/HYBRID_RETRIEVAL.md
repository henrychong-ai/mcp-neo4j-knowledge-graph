# Hybrid Retrieval System

## Overview

The Hybrid Retrieval System enhances semantic search by combining multiple scoring signals to improve context relevance and search quality. Instead of relying solely on vector similarity, the system considers graph structure, temporal freshness, and connection strength to provide more accurate and contextually relevant results.

## Architecture

### Core Components

1. **HybridRetriever** (`src/retrieval/HybridRetriever.ts`)
   - Orchestrates multiple scoring signals
   - Implements configurable weighted scoring
   - Provides score transparency and debugging

2. **Scoring Components**:
   - **VectorSimilarityScorer**: Cosine similarity from embeddings
   - **GraphTraversalScorer**: Graph centrality and connectivity
   - **TemporalFreshnessScorer**: Recency and validity
   - **ConnectionStrengthScorer**: Relation quality and diversity

### Scoring Formula

The final hybrid score is calculated as:

```
final_score = (vector_score × vector_weight) +
              (graph_score × graph_weight) +
              (temporal_score × temporal_weight) +
              (connection_score × connection_weight)
```

**Default Weights**:
- Vector Similarity: 0.5 (50%)
- Graph Traversal: 0.2 (20%)
- Temporal Freshness: 0.15 (15%)
- Connection Strength: 0.15 (15%)

## Scoring Components

### 1. Vector Similarity Score

**What it measures**: Semantic similarity using embedding vectors

**Range**: 0.0 - 1.0 (1.0 = perfect match)

**Calculation**: Cosine similarity between query and entity embeddings

**Example**:
```
Query: "machine learning frameworks"
Entity: "TensorFlow" with embedding close to query
Score: 0.92
```

### 2. Graph Traversal Score

**What it measures**: Entity importance based on graph position

**Factors**:
- **Degree centrality**: Number of connections (normalized)
- **Relation quality**: Average confidence/strength
- **Bidirectional bonus**: Mutual relationships are valued higher

**Example**:
```
Entity A: 10 connections, 3 bidirectional, avg confidence 0.8
Entity B: 2 connections, 0 bidirectional, avg confidence 0.6
Entity A Score: 0.75
Entity B Score: 0.35
```

### 3. Temporal Freshness Score

**What it measures**: How recent and valid the entity is

**Factors**:
- **Recency**: Exponential decay based on `updatedAt`
  - Formula: `score = 2^(-age_days / half_life)`
  - Default half-life: 30 days
- **Validity**: Whether entity is currently valid (`validFrom`/`validTo`)

**Example**:
```
Entity updated 5 days ago (half-life = 30 days):
Recency score: 2^(-5/30) ≈ 0.89
Validity: Currently valid = 1.0
Combined: (1.0 × 0.4) + (0.89 × 0.6) ≈ 0.93
```

### 4. Connection Strength Score

**What it measures**: Quality and diversity of relationships

**Factors**:
- **Average quality**: Mean confidence/strength of relations
- **High-quality ratio**: Proportion with confidence ≥ 0.7
- **Type diversity**: Shannon entropy of relation types

**Example**:
```
3 relations with confidence [0.9, 0.8, 0.7]
3 different relation types
Avg quality: 0.8
High-quality ratio: 1.0 (all ≥ 0.7)
Diversity: High (3 types)
Score: 0.82
```

## Configuration

### Default Configuration

```typescript
{
  vectorWeight: 0.5,
  graphWeight: 0.2,
  temporalWeight: 0.15,
  connectionWeight: 0.15,
  enableScoreDebug: false,
  temporalHalfLife: 30
}
```

### Custom Configuration

**Via MCP Tool** (`semantic_search`):

```json
{
  "query": "machine learning",
  "hybrid_config": {
    "vector_weight": 0.6,
    "graph_weight": 0.3,
    "temporal_weight": 0.05,
    "connection_weight": 0.05,
    "enable_score_debug": true,
    "temporal_half_life": 60
  }
}
```

**Programmatic**:

```typescript
const retriever = new HybridRetriever({
  config: {
    vectorWeight: 0.4,
    graphWeight: 0.3,
    temporalWeight: 0.2,
    connectionWeight: 0.1,
    enableScoreDebug: true,
  },
});
```

## Usage

### Basic Usage

Hybrid retrieval is **enabled by default** for all semantic searches:

```json
{
  "query": "neural networks",
  "limit": 10,
  "min_similarity": 0.6
}
```

### Disable Hybrid Retrieval

To use vector-only search:

```json
{
  "query": "neural networks",
  "enable_hybrid_retrieval": false
}
```

### Enable Debug Mode

Get detailed score breakdowns:

```json
{
  "query": "neural networks",
  "hybrid_config": {
    "enable_score_debug": true
  }
}
```

**Debug output example**:

```
Entity: TensorFlow
Final Score: 82.5%

Score Breakdown:
- Vector similarity: 92.0% (cosine distance) (weight: 0.5)
- Graph centrality: 75.0% (15 connections: 8 in, 7 out) (weight: 0.2)
- Temporal freshness: 88.0% (3.2 days old, currently valid) (weight: 0.15)
- Connection strength: 78.0% (avg quality: 85%, 12/15 strong, 5 types) (weight: 0.15)

Calculation: (0.920 × 0.5) + (0.750 × 0.2) + (0.880 × 0.15) + (0.780 × 0.15) = 0.825
```

## Tuning Recommendations

### Use Case Profiles

**1. Research / Exploration** (emphasize graph structure):
```typescript
{
  vectorWeight: 0.4,
  graphWeight: 0.4,
  temporalWeight: 0.1,
  connectionWeight: 0.1
}
```

**2. Recent Information** (emphasize freshness):
```typescript
{
  vectorWeight: 0.4,
  graphWeight: 0.1,
  temporalWeight: 0.4,
  connectionWeight: 0.1
}
```

**3. High-Quality Connections** (emphasize relation quality):
```typescript
{
  vectorWeight: 0.4,
  graphWeight: 0.2,
  temporalWeight: 0.1,
  connectionWeight: 0.3
}
```

**4. Pure Semantic** (vector-only):
```typescript
{
  vectorWeight: 1.0,
  graphWeight: 0.0,
  temporalWeight: 0.0,
  connectionWeight: 0.0
}
```

## Performance Considerations

### Computational Cost

Hybrid retrieval adds ~100-300ms per query depending on:
- Number of results being reranked
- Graph size (for graph scoring)
- Number of relations per entity

### Optimization Strategies

1. **Limit result set**: Use `limit` parameter to reduce reranking overhead
2. **Disable unused scorers**: Set weights to 0.0 for scorers you don't need
3. **Cache graph data**: All entities and relations are cached per query
4. **Async scoring**: All scorers run in parallel using `Promise.all()`

### Scalability

- Tested with knowledge graphs up to 10,000 entities
- Performance degrades gracefully with graph size
- Consider using `enable_hybrid_retrieval: false` for very large graphs

## Testing

### Unit Tests

Run scorer-specific tests:

```bash
# All retrieval tests
npm test -- src/retrieval/__vitest__

# Specific scorer
npm test -- VectorSimilarityScorer.test.ts
```

### Integration Tests

```bash
npm test -- HybridRetrieval.integration.test.ts
```

### Manual Testing

Use the MCP tool with debug mode:

```json
{
  "query": "test query",
  "limit": 5,
  "hybrid_config": {
    "enable_score_debug": true
  }
}
```

## Troubleshooting

### Issue: Results seem wrong

**Solution**: Enable debug mode to see score breakdown:

```json
{
  "hybrid_config": {
    "enable_score_debug": true
  }
}
```

### Issue: Hybrid retrieval is slow

**Solution**: Reduce result limit or disable hybrid retrieval:

```json
{
  "limit": 5,
  "enable_hybrid_retrieval": false
}
```

### Issue: Temporal scores are unexpected

**Solution**: Adjust temporal half-life:

```json
{
  "hybrid_config": {
    "temporal_half_life": 60  // Slower decay (60 days)
  }
}
```

## Future Enhancements

Potential improvements identified in TODO.md:

1. **A/B Testing Framework**: Compare hybrid vs. vector-only results
2. **Baseline Metrics**: Collect quality metrics for optimization
3. **Learned Weights**: ML-based weight optimization
4. **Query-Specific Tuning**: Adjust weights based on query type
5. **Cached Scoring**: Cache expensive graph computations

## References

- **Implementation**: `src/retrieval/`
- **Tests**: `src/retrieval/__vitest__/`
- **Types**: `src/retrieval/types.ts`
- **Integration**: `src/storage/neo4j/Neo4jStorageProvider.ts`
- **MCP Handler**: `src/server/handlers/callToolHandler.ts`
