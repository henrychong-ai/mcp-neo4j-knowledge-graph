import crypto from 'node:crypto';
import neo4j from 'neo4j-driver';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

import { Neo4jJobStore } from '../Neo4jJobStore.js';
import { Neo4jConnectionManager } from '../../storage/neo4j/Neo4jConnectionManager.js';

/**
 * Integration suite for `Neo4jJobStore` — proves atomic-claim correctness
 * under multi-worker contention and stuck-claim recovery against a real
 * Neo4j. Gated on `TEST_INTEGRATION=true` so unit-only test runs stay fast
 * and don't require a live database.
 *
 * Required env when enabled:
 *   NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD (NEO4J_DATABASE optional)
 */

const integration = process.env.TEST_INTEGRATION === 'true';

const D = integration ? describe : describe.skip;

D('Neo4jJobStore (integration)', () => {
  let connectionManager: Neo4jConnectionManager;
  let store: Neo4jJobStore;

  beforeAll(async () => {
    connectionManager = new Neo4jConnectionManager({
      uri: process.env.NEO4J_URI ?? 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME ?? 'neo4j',
      password: process.env.NEO4J_PASSWORD ?? 'memento_password',
      database: process.env.NEO4J_DATABASE ?? 'neo4j',
    });
    store = new Neo4jJobStore(connectionManager);
    await store.ensureSchema();
  });

  afterAll(async () => {
    await connectionManager.close();
  });

  beforeEach(async () => {
    // Wipe queue between tests; entity nodes are untouched.
    await connectionManager.executeQuery('MATCH (j:EmbeddingJob) DETACH DELETE j', {});
  });

  it('roundtrips: enqueue → claim → complete', async () => {
    const jobId = await store.enqueue({ entityName: 'roundtrip-A' });
    expect(jobId).toMatch(/^[0-9a-f-]{36}$/i);

    const claimed = await store.claim('worker-1', 1);
    expect(claimed).toHaveLength(1);
    expect(claimed[0].entityName).toBe('roundtrip-A');
    expect(claimed[0].claimedBy).toBe('worker-1');

    await store.complete(claimed[0].id);
    const counts = await store.countByStatus();
    expect(counts.completed).toBe(1);
  });

  it('dedups pending enqueue for the same entity', async () => {
    const id1 = await store.enqueue({ entityName: 'dedup-A' });
    const id2 = await store.enqueue({ entityName: 'dedup-A' });
    expect(id2).toBe(id1);
    const counts = await store.countByStatus();
    expect(counts.pending).toBe(1);
  });

  it('claim is atomic under multi-worker contention — no duplicates across 5 workers draining 50 jobs', async () => {
    // Seed 50 distinct pending jobs
    for (let i = 0; i < 50; i++) {
      await store.enqueue({ entityName: `concurrent-${i}` });
    }

    // 5 separate stores simulate 5 workers (each holds its own UUID)
    const workers = Array.from({ length: 5 }, () => ({
      store: new Neo4jJobStore(connectionManager),
      id: crypto.randomUUID(),
    }));

    // Each round, all 5 workers race to claim concurrently. The atomic
    // CASE-WHEN guard guarantees no two workers claim the same job — but
    // because the ORDER BY is deterministic, contending workers may end up
    // racing for the same rows in a given round. Loop until drained.
    const claimedByWorker = workers.map(() => [] as string[]);
    for (let round = 0; round < 20; round++) {
      const batches = await Promise.all(workers.map(w => w.store.claim(w.id, 10)));
      let progress = false;
      for (let i = 0; i < workers.length; i++) {
        claimedByWorker[i].push(...batches[i].map(j => j.id));
        if (batches[i].length > 0) progress = true;
      }
      const total = claimedByWorker.reduce((sum, ids) => sum + ids.length, 0);
      if (total >= 50 || !progress) break;
    }

    const all = claimedByWorker.flat();
    expect(all.length).toBe(50); // every job eventually claimed
    expect(new Set(all).size).toBe(50); // every claim unique — no double-processing
  });

  it('releaseStale unsticks jobs whose claimedAt is older than cutoff', async () => {
    const id = await store.enqueue({ entityName: 'stuck-A' });
    const [claimed] = await store.claim('dead-worker', 1);
    expect(claimed.id).toBe(id);

    // Force claimedAt into the past so releaseStale picks it up.
    await connectionManager.executeQuery(
      'MATCH (j:EmbeddingJob {id: $id}) SET j.claimedAt = $past',
      { id, past: neo4j.int(Date.now() - 60_000) }
    );

    const released = await store.releaseStale(30_000);
    expect(released).toBe(1);

    const [reclaimed] = await store.claim('alive-worker', 1);
    expect(reclaimed.id).toBe(id);
    expect(reclaimed.attempts).toBe(2); // attempt counter incremented again on re-claim
  });

  it('releaseClaims voluntarily releases without burning attempts', async () => {
    const id = await store.enqueue({ entityName: 'release-A' });
    const [job] = await store.claim('worker-1', 1);
    expect(job.attempts).toBe(1);

    const released = await store.releaseClaims([job.id]);
    expect(released).toBe(1);

    // The released job should be re-claimable, and the attempts counter
    // should have rolled back so the retry budget isn't burned.
    const counts = await store.countByStatus();
    expect(counts.pending).toBe(1);
    const [reclaimed] = await store.claim('worker-2', 1);
    expect(reclaimed.id).toBe(id);
    expect(reclaimed.attempts).toBe(1); // back to 1, not 2
  });

  it('fail() flips terminal once attempts >= maxAttempts', async () => {
    const id = await store.enqueue({ entityName: 'doomed', maxAttempts: 1 });
    await store.claim('w', 1); // attempts becomes 1, equal to maxAttempts
    const result = await store.fail(id, 'kapow');
    expect(result.status).toBe('failed');
    expect((await store.countByStatus()).failed).toBe(1);
  });

  it('fail() resets to pending while retries remain', async () => {
    const id = await store.enqueue({ entityName: 'retry', maxAttempts: 3 });
    await store.claim('w', 1); // attempts = 1
    const result = await store.fail(id, 'try again');
    expect(result.status).toBe('pending');
    expect((await store.countByStatus()).pending).toBe(1);
  });

  it('retryFailed and cleanup work end-to-end', async () => {
    const id = await store.enqueue({ entityName: 'cycler', maxAttempts: 1 });
    await store.claim('w', 1);
    await store.fail(id, 'x');
    expect((await store.countByStatus()).failed).toBe(1);

    const reset = await store.retryFailed();
    expect(reset).toBe(1);
    expect((await store.countByStatus()).pending).toBe(1);

    // Now complete it, age it, and prove cleanup deletes it
    const [c] = await store.claim('w', 1);
    await store.complete(c.id);
    await connectionManager.executeQuery(
      'MATCH (j:EmbeddingJob {id: $id}) SET j.updatedAt = $past',
      { id: c.id, past: neo4j.int(Date.now() - 14 * 24 * 60 * 60 * 1000) }
    );

    const deleted = await store.cleanup(7 * 24 * 60 * 60 * 1000);
    expect(deleted).toBe(1);
    expect((await store.countByStatus()).totalJobs).toBe(0);
  });
});
