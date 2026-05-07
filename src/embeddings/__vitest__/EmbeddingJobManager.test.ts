import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { Entity, KnowledgeGraph } from '../../KnowledgeGraphManager.js';
import type { Relation } from '../../types/relation.js';
import type { EntityEmbedding } from '../../types/entity-embedding.js';
import type { EmbeddingService } from '../EmbeddingService.js';
import { EmbeddingJobManager } from '../EmbeddingJobManager.js';

import { FakeJobStore } from './helpers/FakeJobStore.js';

/**
 * Behavioural tests for `EmbeddingJobManager` — covers scheduling, processing,
 * rate-limiting interaction, retry semantics, and cleanup. The queue is
 * exercised through `FakeJobStore`, the in-memory faithful stand-in for
 * `Neo4jJobStore`. Tests that need the real Neo4j atomic-claim semantics
 * live in `Neo4jJobStore.integration.test.ts`.
 */

interface MockEntity {
  name: string;
  entityType: string;
  observations: string[];
}

function makeStorage(entities: MockEntity[] = []) {
  const map = new Map<string, MockEntity>();
  for (const e of entities) map.set(e.name, e);
  return {
    db: undefined,
    loadGraph: vi.fn(
      async (): Promise<KnowledgeGraph> => ({
        entities: [...map.values()] as Entity[],
        relations: [] as Relation[],
      })
    ),
    saveGraph: vi.fn(async () => {}),
    searchNodes: vi.fn(),
    openNodes: vi.fn(),
    createEntities: vi.fn(),
    createRelations: vi.fn(),
    addObservations: vi.fn(),
    deleteEntities: vi.fn(),
    deleteObservations: vi.fn(),
    deleteRelations: vi.fn(),
    getEntity: vi.fn(async (name: string): Promise<Entity | null> => {
      return (map.get(name) as Entity | undefined) ?? null;
    }),
    storeEntityVector: vi.fn(async (_name: string, _embedding: EntityEmbedding) => {}),
  };
}

function makeEmbeddingService(): EmbeddingService {
  return {
    generateEmbedding: vi.fn(async () => new Array(1536).fill(0.1) as number[]),
    generateEmbeddings: vi.fn(async () => []),
    getModelInfo: () => ({ name: 'test-model', dimensions: 1536, version: '1.0.0' }),
  } as unknown as EmbeddingService;
}

describe('EmbeddingJobManager constructor', () => {
  it('throws when no JobStore is supplied', () => {
    const storage = makeStorage();
    const svc = makeEmbeddingService();
    expect(() => new EmbeddingJobManager(storage as never, svc, null, null, null)).toThrow(
      /requires a JobStore/
    );
  });

  it('generates a stable workerId for the process', () => {
    const m1 = new EmbeddingJobManager(
      makeStorage() as never,
      makeEmbeddingService(),
      null,
      null,
      null,
      new FakeJobStore()
    );
    const m2 = new EmbeddingJobManager(
      makeStorage() as never,
      makeEmbeddingService(),
      null,
      null,
      null,
      new FakeJobStore()
    );
    expect(m1.workerId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(m1.workerId).not.toBe(m2.workerId);
  });

  it('calls jobStore.ensureSchema() once on construction', async () => {
    const store = new FakeJobStore();
    new EmbeddingJobManager(
      makeStorage() as never,
      makeEmbeddingService(),
      null,
      null,
      null,
      store
    );
    // ensureSchema is fire-and-forget — let any pending promise resolve
    await new Promise(r => setImmediate(r));
    expect(store.ensureSchema).toHaveBeenCalledOnce();
  });
});

describe('scheduleEntityEmbedding', () => {
  it('throws when the entity does not exist', async () => {
    const storage = makeStorage();
    const mgr = new EmbeddingJobManager(
      storage as never,
      makeEmbeddingService(),
      null,
      null,
      null,
      new FakeJobStore()
    );
    await expect(mgr.scheduleEntityEmbedding('does-not-exist')).rejects.toThrow(/not found/);
  });

  it('enqueues a job and returns the id when the entity exists', async () => {
    const storage = makeStorage([{ name: 'A', entityType: 'thing', observations: ['x'] }]);
    const store = new FakeJobStore();
    const mgr = new EmbeddingJobManager(
      storage as never,
      makeEmbeddingService(),
      null,
      null,
      null,
      store
    );

    const jobId = await mgr.scheduleEntityEmbedding('A', 7);

    expect(jobId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(store.enqueue).toHaveBeenCalledWith({ entityName: 'A', priority: 7 });
    expect(store._byStatus('pending')).toHaveLength(1);
  });

  it('dedups when called twice for the same entity', async () => {
    const storage = makeStorage([{ name: 'A', entityType: 'thing', observations: ['x'] }]);
    const store = new FakeJobStore();
    const mgr = new EmbeddingJobManager(
      storage as never,
      makeEmbeddingService(),
      null,
      null,
      null,
      store
    );

    const id1 = await mgr.scheduleEntityEmbedding('A');
    const id2 = await mgr.scheduleEntityEmbedding('A');
    expect(id1).toBe(id2);
    expect(store._byStatus('pending')).toHaveLength(1);
  });
});

describe('processJobs', () => {
  it('processes pending jobs to completed and writes the embedding', async () => {
    const storage = makeStorage([{ name: 'A', entityType: 'thing', observations: ['x'] }]);
    const store = new FakeJobStore();
    const mgr = new EmbeddingJobManager(
      storage as never,
      makeEmbeddingService(),
      null,
      null,
      null,
      store
    );
    await mgr.scheduleEntityEmbedding('A');

    const result = await mgr.processJobs(10);

    expect(result).toEqual({ processed: 1, successful: 1, failed: 0 });
    expect(storage.storeEntityVector).toHaveBeenCalledOnce();
    expect(store._byStatus('completed')).toHaveLength(1);
  });

  it('sweeps stale claims before claiming new work', async () => {
    const storage = makeStorage();
    const store = new FakeJobStore();
    new EmbeddingJobManager(storage as never, makeEmbeddingService(), null, null, null, store);

    const mgr = new EmbeddingJobManager(
      storage as never,
      makeEmbeddingService(),
      null,
      null,
      null,
      store
    );
    await mgr.processJobs(1);
    expect(store.releaseStale).toHaveBeenCalled();
  });

  it('marks job failed when the entity vanishes mid-process and retries are exhausted', async () => {
    const storage = makeStorage([{ name: 'A', entityType: 'thing', observations: ['x'] }]);
    const store = new FakeJobStore();
    // Pre-seed a job already at 2 attempts so the next failure is terminal
    store._seedJob({ entityName: 'A', attempts: 2, maxAttempts: 3, status: 'pending' });

    const mgr = new EmbeddingJobManager(
      storage as never,
      makeEmbeddingService(),
      null,
      null,
      null,
      store
    );

    // Make getEntity miss after the claim
    storage.getEntity.mockResolvedValueOnce(null);

    const result = await mgr.processJobs(1);

    expect(result.failed).toBe(1);
    expect(store._byStatus('failed')).toHaveLength(1);
  });

  it('reschedules to pending when retries remain', async () => {
    const storage = makeStorage([{ name: 'A', entityType: 'thing', observations: ['x'] }]);
    const store = new FakeJobStore();
    store._seedJob({ entityName: 'A', attempts: 0, maxAttempts: 3, status: 'pending' });

    const svc = makeEmbeddingService();
    (svc.generateEmbedding as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('flaky'));

    const mgr = new EmbeddingJobManager(storage as never, svc, null, null, null, store);
    const result = await mgr.processJobs(1);

    expect(result.failed).toBe(1);
    expect(store._byStatus('pending')).toHaveLength(1);
    expect(store._byStatus('failed')).toHaveLength(0);
  });

  it('releases remaining claims (without burning attempts) when rate limit is hit', async () => {
    const storage = makeStorage([
      { name: 'A', entityType: 't', observations: ['x'] },
      { name: 'B', entityType: 't', observations: ['x'] },
      { name: 'C', entityType: 't', observations: ['x'] },
    ]);
    const store = new FakeJobStore();
    const mgr = new EmbeddingJobManager(
      storage as never,
      makeEmbeddingService(),
      { tokensPerInterval: 1, interval: 60_000 }, // budget = 1
      null,
      null,
      store
    );
    await mgr.scheduleEntityEmbedding('A');
    await mgr.scheduleEntityEmbedding('B');
    await mgr.scheduleEntityEmbedding('C');

    const result = await mgr.processJobs(3);

    expect(result.successful).toBe(1);
    expect(result.processed).toBe(1); // we stopped after rate-limit
    expect(store.releaseClaims).toHaveBeenCalledOnce();
    // The 2 unprocessed jobs are back to pending — their attempts were rolled back
    expect(store._byStatus('pending')).toHaveLength(2);
    for (const j of store._byStatus('pending')) {
      expect(j.attempts).toBe(0);
    }
  });
});

describe('queue admin methods', () => {
  it('getQueueStatus reflects FakeJobStore counts', async () => {
    const storage = makeStorage();
    const store = new FakeJobStore();
    store._seedJob({ entityName: 'A', status: 'pending' });
    store._seedJob({ entityName: 'B', status: 'completed' });
    store._seedJob({ entityName: 'C', status: 'failed' });
    const mgr = new EmbeddingJobManager(
      storage as never,
      makeEmbeddingService(),
      null,
      null,
      null,
      store
    );
    expect(await mgr.getQueueStatus()).toEqual({
      pending: 1,
      processing: 0,
      completed: 1,
      failed: 1,
      totalJobs: 3,
    });
  });

  it('retryFailedJobs flips failed → pending', async () => {
    const storage = makeStorage();
    const store = new FakeJobStore();
    store._seedJob({ entityName: 'A', status: 'failed', attempts: 3 });
    const mgr = new EmbeddingJobManager(
      storage as never,
      makeEmbeddingService(),
      null,
      null,
      null,
      store
    );
    expect(await mgr.retryFailedJobs()).toBe(1);
    expect(store._byStatus('pending')).toHaveLength(1);
    expect(store._byStatus('pending')[0].attempts).toBe(0);
  });

  it('cleanupJobs removes completed jobs older than threshold', async () => {
    const storage = makeStorage();
    const store = new FakeJobStore();
    const old = Date.now() - 14 * 24 * 60 * 60 * 1000; // 14 days old
    store._seedJob({ entityName: 'old', status: 'completed', updatedAt: old });
    store._seedJob({ entityName: 'fresh', status: 'completed' });
    const mgr = new EmbeddingJobManager(
      storage as never,
      makeEmbeddingService(),
      null,
      null,
      null,
      store
    );

    expect(await mgr.cleanupJobs()).toBe(1); // default 7d threshold
    expect(store._all().map(j => j.entityName)).toEqual(['fresh']);
  });
});

describe('rate limiter (legacy public surface)', () => {
  it('refills tokens after the interval elapses', () => {
    const mgr = new EmbeddingJobManager(
      makeStorage() as never,
      makeEmbeddingService(),
      { tokensPerInterval: 2, interval: 1000 },
      null,
      null,
      new FakeJobStore()
    );
    expect(mgr._checkRateLimiter().success).toBe(true);
    expect(mgr._checkRateLimiter().success).toBe(true);
    expect(mgr._checkRateLimiter().success).toBe(false);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 1500);
    expect(mgr._checkRateLimiter().success).toBe(true);
    vi.useRealTimers();
  });
});

describe('cache', () => {
  it('reuses cached embeddings within TTL', async () => {
    const svc = makeEmbeddingService();
    const mgr = new EmbeddingJobManager(
      makeStorage() as never,
      svc,
      null,
      null,
      null,
      new FakeJobStore()
    );

    await mgr._getCachedEmbeddingOrGenerate('hello');
    await mgr._getCachedEmbeddingOrGenerate('hello');

    expect(svc.generateEmbedding).toHaveBeenCalledTimes(1);
  });
});

describe('scheduleIncrementalRegeneration', () => {
  it('enqueues only entities lacking embeddings', async () => {
    const storage = makeStorage([
      { name: 'A', entityType: 't', observations: ['x'] },
      { name: 'B', entityType: 't', observations: ['x'] },
    ]);
    // B has an embedding already
    storage.loadGraph.mockResolvedValue({
      entities: [
        { name: 'A', entityType: 't', observations: ['x'] } as Entity,
        {
          name: 'B',
          entityType: 't',
          observations: ['x'],
          embedding: { vector: [0.1], model: 'test', lastUpdated: Date.now() },
        } as Entity,
      ],
      relations: [],
    });
    const store = new FakeJobStore();
    const mgr = new EmbeddingJobManager(
      storage as never,
      makeEmbeddingService(),
      null,
      null,
      null,
      store
    );

    const scheduled = await mgr.scheduleIncrementalRegeneration();

    expect(scheduled).toBe(1);
    expect(store._byStatus('pending').map(j => j.entityName)).toEqual(['A']);
  });
});
