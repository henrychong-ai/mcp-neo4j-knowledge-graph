import { describe, it, expect, beforeEach, vi } from 'vitest';

import { Neo4jJobStore } from '../Neo4jJobStore.js';
import type { Neo4jConnectionManager } from '../../storage/neo4j/Neo4jConnectionManager.js';

/**
 * Unit tests for `Neo4jJobStore` — mocks `Neo4jConnectionManager.executeQuery`
 * and asserts on the Cypher and parameter shape. Concurrency / atomic-claim
 * semantics are covered by the integration suite which runs against real Neo4j.
 */

interface MockRecord {
  get(key: string): unknown;
}

function record(values: Record<string, unknown>): MockRecord {
  return { get: (k: string) => values[k] };
}

function makeMockConnectionManager(
  executeImpl?: (
    query: string,
    params: Record<string, unknown>
  ) => Promise<{ records: MockRecord[] }>
) {
  const executeQuery = vi.fn(executeImpl ?? (async () => ({ records: [] })));
  return {
    executeQuery,
    getSession: vi.fn(),
    close: vi.fn(),
  } as unknown as Neo4jConnectionManager & { executeQuery: ReturnType<typeof vi.fn> };
}

describe('Neo4jJobStore.ensureSchema', () => {
  it('creates the EmbeddingJob constraint and two supporting indexes', async () => {
    const cm = makeMockConnectionManager();
    const store = new Neo4jJobStore(cm);

    await store.ensureSchema();

    expect(cm.executeQuery).toHaveBeenCalledTimes(3);
    const queries = cm.executeQuery.mock.calls.map(c => c[0] as string);
    expect(queries[0]).toMatch(/CREATE CONSTRAINT embedding_job_id IF NOT EXISTS/);
    expect(queries[0]).toMatch(/REQUIRE j\.id IS UNIQUE/);
    expect(queries[1]).toMatch(/CREATE INDEX embedding_job_status_priority IF NOT EXISTS/);
    expect(queries[1]).toMatch(/ON \(j\.status, j\.priority, j\.createdAt\)/);
    expect(queries[2]).toMatch(/CREATE INDEX embedding_job_entity_name IF NOT EXISTS/);
  });
});

describe('Neo4jJobStore.enqueue', () => {
  it('returns the id of a newly created pending job', async () => {
    let createdId: string | undefined;
    const cm = makeMockConnectionManager(async (_q, params) => {
      createdId = params.newId as string;
      // Return the id the Cypher would produce
      return { records: [record({ id: createdId })] };
    });
    const store = new Neo4jJobStore(cm);

    const id = await store.enqueue({ entityName: 'foo', priority: 5 });

    expect(id).toBe(createdId);
    expect(cm.executeQuery).toHaveBeenCalledOnce();
    const [, params] = cm.executeQuery.mock.calls[0];
    expect(params.entityName).toBe('foo');
    expect(Number(params.priority)).toBe(5);
    expect(Number(params.maxAttempts)).toBe(3);
    expect(typeof params.newId).toBe('string');
    expect(Number(params.now)).toBeGreaterThan(0);
  });

  it('uses default priority and maxAttempts when not supplied', async () => {
    const cm = makeMockConnectionManager(async (_q, params) => ({
      records: [record({ id: params.newId })],
    }));
    const store = new Neo4jJobStore(cm);

    await store.enqueue({ entityName: 'foo' });

    const [, params] = cm.executeQuery.mock.calls[0];
    expect(Number(params.priority)).toBe(1);
    expect(Number(params.maxAttempts)).toBe(3);
  });

  it('throws if Neo4j returns no record (job neither created nor found)', async () => {
    const cm = makeMockConnectionManager(async () => ({ records: [] }));
    const store = new Neo4jJobStore(cm);

    await expect(store.enqueue({ entityName: 'foo' })).rejects.toThrow(
      /failed to create or find job/
    );
  });
});

describe('Neo4jJobStore.releaseStale', () => {
  it('passes a cutoff = now - staleClaimMs', async () => {
    const cm = makeMockConnectionManager(async () => ({ records: [record({ released: 0 })] }));
    const store = new Neo4jJobStore(cm);
    const before = Date.now();

    await store.releaseStale(60_000);

    const after = Date.now();
    const [, params] = cm.executeQuery.mock.calls[0];
    const cutoff = Number(params.cutoff);
    expect(cutoff).toBeGreaterThanOrEqual(before - 60_000);
    expect(cutoff).toBeLessThanOrEqual(after - 60_000);
  });

  it('returns the BigInt-converted release count', async () => {
    const cm = makeMockConnectionManager(async () => ({ records: [record({ released: 5 })] }));
    const store = new Neo4jJobStore(cm);
    expect(await store.releaseStale(60_000)).toBe(5);
  });
});

describe('Neo4jJobStore.releaseClaims', () => {
  it('skips the round-trip when the id list is empty', async () => {
    const cm = makeMockConnectionManager();
    const store = new Neo4jJobStore(cm);

    expect(await store.releaseClaims([])).toBe(0);
    expect(cm.executeQuery).not.toHaveBeenCalled();
  });

  it('decrements attempts when releasing without burning the budget', async () => {
    const cm = makeMockConnectionManager(async () => ({
      records: [record({ released: 2 })],
    }));
    const store = new Neo4jJobStore(cm);
    const released = await store.releaseClaims(['a', 'b']);
    expect(released).toBe(2);
    const [query] = cm.executeQuery.mock.calls[0];
    expect(query).toMatch(/j\.attempts > 0 THEN j\.attempts - 1/);
  });
});

describe('Neo4jJobStore.claim', () => {
  it('issues an atomic claim Cypher with priority+createdAt ordering', async () => {
    const now = Date.now();
    const cm = makeMockConnectionManager(async () => ({
      records: [
        record({
          j: {
            properties: {
              id: 'job-1',
              entityName: 'A',
              status: 'processing',
              priority: 5,
              attempts: 1,
              maxAttempts: 3,
              createdAt: now,
              updatedAt: now,
              claimedAt: now,
              claimedBy: 'worker-1',
              errorMessage: null,
            },
          },
        }),
      ],
    }));
    const store = new Neo4jJobStore(cm);

    const claimed = await store.claim('worker-1', 10);

    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      id: 'job-1',
      entityName: 'A',
      status: 'processing',
      claimedBy: 'worker-1',
    });
    const [query, params] = cm.executeQuery.mock.calls[0];
    expect(query).toMatch(/ORDER BY j\.priority DESC, j\.createdAt ASC LIMIT \$batchSize/);
    // Atomic claim guard — CASE WHEN re-evaluates status post-lock
    expect(query).toMatch(/CASE WHEN j\.status = 'pending' THEN 'processing'/);
    expect(query).toMatch(/j\.attempts \+ 1/);
    expect(params.workerId).toBe('worker-1');
    expect(Number(params.batchSize)).toBe(10);
  });

  it('floors and clamps batch size to a positive integer', async () => {
    const cm = makeMockConnectionManager(async () => ({ records: [] }));
    const store = new Neo4jJobStore(cm);
    await store.claim('w', 0.1);
    expect(Number(cm.executeQuery.mock.calls[0][1].batchSize)).toBe(1);
  });
});

describe('Neo4jJobStore.complete', () => {
  it('writes status=completed with timestamp', async () => {
    const cm = makeMockConnectionManager(async () => ({ records: [] }));
    const store = new Neo4jJobStore(cm);
    await store.complete('job-1');

    const [query, params] = cm.executeQuery.mock.calls[0];
    expect(query).toMatch(/SET j\.status = 'completed'/);
    expect(query).toMatch(/j\.errorMessage = null/);
    expect(params.jobId).toBe('job-1');
    expect(Number(params.now)).toBeGreaterThan(0);
  });
});

describe('Neo4jJobStore.fail', () => {
  it('passes through the resulting status from Cypher', async () => {
    const cm = makeMockConnectionManager(async () => ({
      records: [record({ status: 'failed' })],
    }));
    const store = new Neo4jJobStore(cm);
    const result = await store.fail('job-1', 'boom');
    expect(result.status).toBe('failed');
    const [query, params] = cm.executeQuery.mock.calls[0];
    expect(query).toMatch(/CASE WHEN j\.attempts >= j\.maxAttempts THEN 'failed' ELSE 'pending'/);
    expect(params).toMatchObject({ jobId: 'job-1', errorMessage: 'boom' });
  });

  it('throws if the job id does not exist', async () => {
    const cm = makeMockConnectionManager(async () => ({ records: [] }));
    const store = new Neo4jJobStore(cm);
    await expect(store.fail('missing', 'x')).rejects.toThrow(/not found/);
  });
});

describe('Neo4jJobStore.countByStatus', () => {
  it('aggregates per-status counts and totalJobs', async () => {
    const cm = makeMockConnectionManager(async () => ({
      records: [
        record({ status: 'pending', n: 3 }),
        record({ status: 'completed', n: 17 }),
        record({ status: 'failed', n: 1 }),
      ],
    }));
    const store = new Neo4jJobStore(cm);

    const counts = await store.countByStatus();

    expect(counts).toEqual({
      pending: 3,
      processing: 0,
      completed: 17,
      failed: 1,
      totalJobs: 21,
    });
  });

  it('handles empty queue (no records)', async () => {
    const cm = makeMockConnectionManager(async () => ({ records: [] }));
    const store = new Neo4jJobStore(cm);
    const counts = await store.countByStatus();
    expect(counts).toEqual({
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      totalJobs: 0,
    });
  });
});

describe('Neo4jJobStore.retryFailed', () => {
  it('returns the count reset by Cypher', async () => {
    const cm = makeMockConnectionManager(async () => ({
      records: [record({ reset: 4 })],
    }));
    const store = new Neo4jJobStore(cm);
    const reset = await store.retryFailed();
    expect(reset).toBe(4);
    const [query] = cm.executeQuery.mock.calls[0];
    expect(query).toMatch(/WHERE j\.status = 'failed'/);
    expect(query).toMatch(/SET j\.status = 'pending'/);
    expect(query).toMatch(/j\.attempts = 0/);
  });
});

describe('Neo4jJobStore.cleanup', () => {
  it('passes cutoff = now - thresholdMs and deletes completed jobs', async () => {
    const cm = makeMockConnectionManager(async () => ({
      records: [record({ deleted: 9 })],
    }));
    const store = new Neo4jJobStore(cm);
    const before = Date.now();

    const deleted = await store.cleanup(60_000);
    const after = Date.now();

    expect(deleted).toBe(9);
    const [query, params] = cm.executeQuery.mock.calls[0];
    expect(query).toMatch(/WHERE j\.status = 'completed'/);
    expect(query).toMatch(/DETACH DELETE j/);
    expect(Number(params.cutoff)).toBeGreaterThanOrEqual(before - 60_000);
    expect(Number(params.cutoff)).toBeLessThanOrEqual(after - 60_000);
  });
});
