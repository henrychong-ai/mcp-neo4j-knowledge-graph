/**
 * Tests for the v2.7.0 reranker-aware search defaults and maybeRerank behaviour:
 * - recallLimit = limit ?? 10 (no recall-widening to RERANK_TOP_N)
 * - returnCount = limit ?? (reranker enabled ? topK : 10); explicit limit always honoured
 * - maybeRerank always trims to returnCount (rerank order, recall order on fail-open,
 *   unscored-tail append when the rerank ordering covers fewer entities than returnCount)
 * - once-per-process warn when semantic search falls back to keyword-only searchNodes
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  KnowledgeGraphManager,
  type Entity,
  type KnowledgeGraph,
} from '../KnowledgeGraphManager.js';
import type { StorageProvider } from '../storage/StorageProvider.js';
import type { EmbeddingJobManager } from '../embeddings/EmbeddingJobManager.js';
import type { RerankerService } from '../retrieval/RerankerService.js';
import { logger } from '../utils/logger.js';

function makeEntities(count: number): Entity[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `Entity${index}`,
    entityType: 'test',
    observations: [`observation ${index}`],
  }));
}

function makeRecall(count: number): KnowledgeGraph {
  return {
    entities: makeEntities(count),
    relations: [
      // Survives any trim that keeps the head of the recall order
      { from: 'Entity0', to: 'Entity1', relationType: 'related-to' },
      // Dropped whenever the tail entity is trimmed away
      { from: 'Entity0', to: `Entity${count - 1}`, relationType: 'related-to' },
    ],
    total: count,
  };
}

function makeProvider(recall: KnowledgeGraph): StorageProvider {
  return {
    loadGraph: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    saveGraph: vi.fn().mockResolvedValue(undefined),
    searchNodes: vi.fn().mockResolvedValue({
      entities: [{ name: 'KeywordResult', entityType: 'test', observations: [] }],
      relations: [],
    }),
    openNodes: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    semanticSearch: vi.fn().mockResolvedValue(recall),
  } as unknown as StorageProvider;
}

function makeEmbeddingJobManager(): EmbeddingJobManager {
  return {
    embeddingService: {
      generateEmbedding: vi.fn().mockResolvedValue(Array.from({ length: 8 }, () => 0.1)),
    },
    scheduleEntityEmbedding: vi.fn().mockResolvedValue('mock-job-id'),
  } as unknown as EmbeddingJobManager;
}

function makeReranker(overrides: Record<string, unknown> = {}): RerankerService {
  return {
    enabled: true,
    topN: 20,
    topK: 5,
    rerank: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as RerankerService;
}

function makeManager(options: {
  recall?: KnowledgeGraph;
  reranker?: RerankerService;
  provider?: StorageProvider;
}): { manager: KnowledgeGraphManager; provider: StorageProvider } {
  const provider = options.provider ?? makeProvider(options.recall ?? makeRecall(10));
  const manager = new KnowledgeGraphManager({
    storageProvider: provider,
    embeddingJobManager: makeEmbeddingJobManager(),
    reranker: options.reranker,
  });
  return { manager, provider };
}

function entityNames(graph: KnowledgeGraph): string[] {
  return graph.entities.map(entity => entity.name);
}

describe('KnowledgeGraphManager v2.7.0 search defaults matrix', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Reset the once-per-process keyword-fallback warn latch — other tests in this
    // file legitimately hit the fallback branch and would otherwise consume the warn.
    (KnowledgeGraphManager as unknown as { keywordFallbackWarned: boolean }).keywordFallbackWarned =
      false;
  });

  it('no reranker + limit undefined: provider called with limit 10, 10 returned in recall order', async () => {
    const { manager, provider } = makeManager({ recall: makeRecall(10) });

    const result = await manager.search('test query', { semanticSearch: true });

    expect(provider.semanticSearch).toHaveBeenCalledWith(
      'test query',
      expect.objectContaining({ limit: 10 })
    );
    expect(entityNames(result)).toEqual(makeEntities(10).map(entity => entity.name));
    expect(result.total).toBe(10);
  });

  it('reranker enabled + limit undefined: provider called with limit 10 (no widening to topN), trimmed to topK in rerank order', async () => {
    const reranker = makeReranker({
      rerank: vi.fn().mockResolvedValue([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]),
    });
    const { manager, provider } = makeManager({ recall: makeRecall(10), reranker });

    const result = await manager.search('test query', { semanticSearch: true });

    // Recall is NOT widened to max(limit, topN) any more — fixed default of 10.
    expect(provider.semanticSearch).toHaveBeenCalledWith(
      'test query',
      expect.objectContaining({ limit: 10 })
    );
    expect(reranker.rerank).toHaveBeenCalledTimes(1);
    expect(reranker.rerank).toHaveBeenCalledWith(
      'test query',
      expect.arrayContaining([expect.any(String)])
    );
    expect(entityNames(result)).toEqual(['Entity9', 'Entity8', 'Entity7', 'Entity6', 'Entity5']);
    expect(result.total).toBe(5);
    // Both seed relations reference trimmed-away entities (Entity0/Entity1) — filtered out.
    expect(result.relations).toEqual([]);
  });

  it('explicit limit honoured without a reranker (trim responsibility lives in the manager)', async () => {
    // Provider mock ignores limit and returns 10 — the manager must still trim to 3.
    const { manager, provider } = makeManager({ recall: makeRecall(10) });

    const result = await manager.search('test query', { semanticSearch: true, limit: 3 });

    expect(provider.semanticSearch).toHaveBeenCalledWith(
      'test query',
      expect.objectContaining({ limit: 3 })
    );
    expect(entityNames(result)).toEqual(['Entity0', 'Entity1', 'Entity2']);
    expect(result.total).toBe(3);
    expect(result.relations).toEqual([
      { from: 'Entity0', to: 'Entity1', relationType: 'related-to' },
    ]);
  });

  it('explicit limit above topK honoured with a reranker (returnCount = limit, rerank order)', async () => {
    const reranker = makeReranker({
      rerank: vi.fn().mockResolvedValue([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]),
    });
    const { manager, provider } = makeManager({ recall: makeRecall(10), reranker });

    const result = await manager.search('test query', { semanticSearch: true, limit: 8 });

    expect(provider.semanticSearch).toHaveBeenCalledWith(
      'test query',
      expect.objectContaining({ limit: 8 })
    );
    expect(entityNames(result)).toEqual([
      'Entity9',
      'Entity8',
      'Entity7',
      'Entity6',
      'Entity5',
      'Entity4',
      'Entity3',
      'Entity2',
    ]);
    expect(result.total).toBe(8);
  });

  it('explicit limit below topK honoured with a reranker', async () => {
    const reranker = makeReranker({
      rerank: vi.fn().mockResolvedValue([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]),
    });
    const { manager } = makeManager({ recall: makeRecall(10), reranker });

    const result = await manager.search('test query', { semanticSearch: true, limit: 2 });

    expect(entityNames(result)).toEqual(['Entity9', 'Entity8']);
    expect(result.total).toBe(2);
  });

  it('limit: 0 is respected (not coerced to 10) and short-circuits before embed and recall', async () => {
    const provider = makeProvider(makeRecall(10));
    const embeddingJobManager = makeEmbeddingJobManager();
    const manager = new KnowledgeGraphManager({
      storageProvider: provider,
      embeddingJobManager,
    });

    const result = await manager.search('test query', { semanticSearch: true, limit: 0 });

    // Empty by construction — no billable embed call, no recall query, no rerank call.
    expect(embeddingJobManager.embeddingService?.generateEmbedding).not.toHaveBeenCalled();
    expect(provider.semanticSearch).not.toHaveBeenCalled();
    expect(result.entities).toEqual([]);
    expect(result.relations).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('negative limit clamps to 0 (empty result, no recall) instead of slice(0, -1)', async () => {
    const reranker = makeReranker();
    const { manager, provider } = makeManager({ recall: makeRecall(10), reranker });

    const result = await manager.search('test query', { semanticSearch: true, limit: -1 });

    expect(provider.semanticSearch).not.toHaveBeenCalled();
    expect(reranker.rerank).not.toHaveBeenCalled();
    expect(result.entities).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('fractional limit floors (2.7 → 2)', async () => {
    const { manager, provider } = makeManager({ recall: makeRecall(10) });

    const result = await manager.search('test query', { semanticSearch: true, limit: 2.7 });

    expect(provider.semanticSearch).toHaveBeenCalledWith(
      'test query',
      expect.objectContaining({ limit: 2 })
    );
    expect(entityNames(result)).toEqual(['Entity0', 'Entity1']);
    expect(result.total).toBe(2);
  });

  it('non-finite limit (NaN) falls back to the defaults as if no limit were given', async () => {
    const { manager, provider } = makeManager({ recall: makeRecall(10) });

    const result = await manager.search('test query', {
      semanticSearch: true,
      limit: Number.NaN,
    });

    expect(provider.semanticSearch).toHaveBeenCalledWith(
      'test query',
      expect.objectContaining({ limit: 10 })
    );
    expect(result.total).toBe(10);
  });

  it('keyword-only fallback honours an explicit limit (degraded mode keeps the limit contract)', async () => {
    const provider = makeProvider(makeRecall(10));
    (provider.searchNodes as ReturnType<typeof vi.fn>).mockResolvedValue({
      entities: [
        { name: 'Keyword0', entityType: 'test', observations: [] },
        { name: 'Keyword1', entityType: 'test', observations: [] },
        { name: 'Keyword2', entityType: 'test', observations: [] },
      ],
      relations: [],
    });
    // Provider supports semanticSearch but there is no embedding service → keyword fallback.
    const manager = new KnowledgeGraphManager({ storageProvider: provider });

    const result = await manager.search('test query', { semanticSearch: true, limit: 2 });

    expect(entityNames(result)).toEqual(['Keyword0', 'Keyword1']);
    expect(result.total).toBe(2);

    // Without an explicit limit the keyword result passes through unchanged.
    const unlimited = await manager.search('test query', { semanticSearch: true });
    expect(unlimited.entities).toHaveLength(3);
  });

  it('keyword-only fallback forwards entityTypes, limit, and domain filters to searchNodes (v2.7.1)', async () => {
    const provider = makeProvider(makeRecall(10));
    // No embedding service → keyword fallback path.
    const manager = new KnowledgeGraphManager({ storageProvider: provider });

    await manager.search('test query', {
      semanticSearch: true,
      limit: 4,
      entityTypes: ['incident-playbook', 'infrastructure'],
      domain: 'infra',
    });

    expect(provider.searchNodes).toHaveBeenCalledWith('test query', {
      limit: 4,
      entityTypes: ['incident-playbook', 'infrastructure'],
      domain: 'infra',
      includeNullDomain: undefined,
    });
  });

  it('fail-open: rerank failure returns recall order sliced to returnCount (not the unsliced recall)', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    const reranker = makeReranker({
      rerank: vi.fn().mockRejectedValue(new Error('ECONNABORTED')),
    });
    const { manager } = makeManager({ recall: makeRecall(10), reranker });

    const result = await manager.search('test query', { semanticSearch: true });

    // returnCount defaults to topK (5) when the reranker is configured.
    expect(entityNames(result)).toEqual(['Entity0', 'Entity1', 'Entity2', 'Entity3', 'Entity4']);
    expect(result.total).toBe(5);
    expect(result.relations).toEqual([
      { from: 'Entity0', to: 'Entity1', relationType: 'related-to' },
    ]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Reranker failed'),
      expect.objectContaining({ error: 'ECONNABORTED' })
    );
  });

  it('empty rerank ordering falls back to recall order sliced to returnCount', async () => {
    const reranker = makeReranker({ rerank: vi.fn().mockResolvedValue([]) });
    const { manager } = makeManager({ recall: makeRecall(10), reranker });

    const result = await manager.search('test query', { semanticSearch: true });

    expect(entityNames(result)).toEqual(['Entity0', 'Entity1', 'Entity2', 'Entity3', 'Entity4']);
    expect(result.total).toBe(5);
  });

  it('appends the unscored remainder in recall order when the rerank ordering covers fewer entities than returnCount', async () => {
    // Simulates an explicit limit above the RERANK_TOP_N scoring cap: only two
    // candidates were scored, but six results were requested.
    const reranker = makeReranker({ rerank: vi.fn().mockResolvedValue([2, 0]) });
    const { manager } = makeManager({ recall: makeRecall(10), reranker });

    const result = await manager.search('test query', { semanticSearch: true, limit: 6 });

    expect(entityNames(result)).toEqual([
      'Entity2',
      'Entity0',
      'Entity1',
      'Entity3',
      'Entity4',
      'Entity5',
    ]);
    expect(result.total).toBe(6);
  });

  it('trivial candidate set (<=1) skips the reranker and still trims/normalises the result', async () => {
    const reranker = makeReranker();
    const recall: KnowledgeGraph = {
      entities: makeEntities(1),
      relations: [],
      total: 1,
    };
    const { manager } = makeManager({ recall, reranker });

    const result = await manager.search('test query', { semanticSearch: true });

    expect(reranker.rerank).not.toHaveBeenCalled();
    expect(entityNames(result)).toEqual(['Entity0']);
    expect(result.total).toBe(1);
  });

  it('warns once per process on keyword-only fallback, then logs at debug level', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    const debugSpy = vi.spyOn(logger, 'debug');
    const provider = makeProvider(makeRecall(10));
    // Provider supports semanticSearch but there is no embedding service at all.
    const manager = new KnowledgeGraphManager({ storageProvider: provider });

    const expectedMessage =
      'Semantic search requested but no embedding service is available — falling back to keyword-only searchNodes. Configure EMBEDDING_API_KEY (or OPENAI_API_KEY) for semantic retrieval.';

    const first = await manager.search('test query', { semanticSearch: true });
    expect(provider.searchNodes).toHaveBeenCalledTimes(1);
    expect(provider.semanticSearch).not.toHaveBeenCalled();
    expect(first.entities[0].name).toBe('KeywordResult');
    expect(warnSpy).toHaveBeenCalledWith(expectedMessage);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    await manager.search('test query again', { semanticSearch: true });
    // Latch: subsequent fallbacks log at debug level, never warn again.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).toHaveBeenCalledWith(expectedMessage);
  });
});
