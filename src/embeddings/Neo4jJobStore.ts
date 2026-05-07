import crypto from 'node:crypto';

import neo4j from 'neo4j-driver';

import type { Neo4jConnectionManager } from '../storage/neo4j/Neo4jConnectionManager.js';
import { logger } from '../utils/logger.js';

import type { EmbeddingJobRecord, JobStatus, JobStore, QueueCounts } from './JobStore.js';

/**
 * Default retry budget per job, applied when callers don't supply one.
 * Matches the value used by the prior SQLite-backed implementation.
 */
const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Neo4j-backed implementation of `JobStore`.
 *
 * Persistence model: each job is a `:EmbeddingJob` node. Atomicity for
 * `claim()` relies on Neo4j's standard write-lock semantics — two
 * concurrent transactions matching the same `pending` rows will serialise:
 * the loser re-evaluates the WHERE clause after the winner commits and
 * sees the rows are no longer `pending`.
 *
 * Schema is provisioned lazily via `ensureSchema()`, called once from the
 * `EmbeddingJobManager` constructor.
 */
export class Neo4jJobStore implements JobStore {
  constructor(private readonly connectionManager: Neo4jConnectionManager) {}

  async ensureSchema(): Promise<void> {
    const queries = [
      'CREATE CONSTRAINT embedding_job_id IF NOT EXISTS FOR (j:EmbeddingJob) REQUIRE j.id IS UNIQUE',
      'CREATE INDEX embedding_job_status_priority IF NOT EXISTS FOR (j:EmbeddingJob) ON (j.status, j.priority, j.createdAt)',
      'CREATE INDEX embedding_job_entity_name IF NOT EXISTS FOR (j:EmbeddingJob) ON (j.entityName)',
    ];
    for (const q of queries) {
      await this.connectionManager.executeQuery(q, {});
    }
    logger.debug('Neo4jJobStore schema ensured');
  }

  async enqueue(opts: {
    entityName: string;
    priority?: number;
    maxAttempts?: number;
  }): Promise<string> {
    const now = Date.now();
    const newId = crypto.randomUUID();
    const priority = opts.priority ?? 1;
    const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

    // Dedup-on-enqueue: if a pending job already exists for this entity,
    // return its id; otherwise create a new one. Cypher's `coalesce` plus
    // `MERGE` doesn't quite fit here (MERGE on j.entityName alone would
    // also match completed/failed rows), so an OPTIONAL MATCH + conditional
    // CREATE expresses the intent more clearly.
    const result = await this.connectionManager.executeQuery(
      `
      OPTIONAL MATCH (existing:EmbeddingJob {entityName: $entityName, status: 'pending'})
      WITH existing
      FOREACH (_ IN CASE WHEN existing IS NULL THEN [1] ELSE [] END |
        CREATE (:EmbeddingJob {
          id: $newId,
          entityName: $entityName,
          status: 'pending',
          priority: $priority,
          attempts: 0,
          maxAttempts: $maxAttempts,
          createdAt: $now,
          updatedAt: $now,
          claimedAt: null,
          claimedBy: null,
          errorMessage: null
        })
      )
      WITH existing
      MATCH (j:EmbeddingJob {entityName: $entityName, status: 'pending'})
      RETURN j.id AS id
      LIMIT 1
      `,
      {
        entityName: opts.entityName,
        newId,
        priority: neo4j.int(priority),
        maxAttempts: neo4j.int(maxAttempts),
        now: neo4j.int(now),
      }
    );

    const id = result.records[0]?.get('id');
    if (typeof id !== 'string') {
      throw new Error(`Neo4jJobStore.enqueue: failed to create or find job for ${opts.entityName}`);
    }
    return id;
  }

  async releaseStale(staleClaimMs: number): Promise<number> {
    const now = Date.now();
    const cutoff = now - staleClaimMs;
    const result = await this.connectionManager.executeQuery(
      `
      MATCH (j:EmbeddingJob)
      WHERE j.status = 'processing' AND j.claimedAt < $cutoff
      SET j.status = 'pending',
          j.claimedAt = null,
          j.claimedBy = null,
          j.updatedAt = $now
      RETURN count(j) AS released
      `,
      { cutoff: neo4j.int(cutoff), now: neo4j.int(now) }
    );
    const released = Number(result.records[0]?.get('released') ?? 0);
    if (released > 0) {
      logger.info('Neo4jJobStore released stale claims', { released, staleClaimMs });
    }
    return released;
  }

  async releaseClaims(jobIds: string[]): Promise<number> {
    if (jobIds.length === 0) return 0;
    const now = Date.now();
    const result = await this.connectionManager.executeQuery(
      `
      MATCH (j:EmbeddingJob)
      WHERE j.id IN $jobIds AND j.status = 'processing'
      SET j.status = 'pending',
          j.claimedAt = null,
          j.claimedBy = null,
          j.attempts = CASE WHEN j.attempts > 0 THEN j.attempts - 1 ELSE 0 END,
          j.updatedAt = $now
      RETURN count(j) AS released
      `,
      { jobIds, now: neo4j.int(now) }
    );
    return Number(result.records[0]?.get('released') ?? 0);
  }

  async claim(workerId: string, batchSize: number): Promise<EmbeddingJobRecord[]> {
    const now = Date.now();
    // Atomic claim via CASE-WHEN: the lock on `j` is acquired when SET begins,
    // and the CASE conditions then re-read `j.status` against the locked
    // (i.e. latest committed) state. If a competing transaction has already
    // flipped this row to 'processing', the CASE branches all fall through to
    // ELSE — leaving every field unchanged for that row, so the trailing WHERE
    // filters it out of the RETURN. The naive `MATCH … WHERE pending …
    // SET status = 'processing'` form has a lost-update race because the
    // MATCH/WHERE happens before any lock is held.
    const result = await this.connectionManager.executeQuery(
      `
      MATCH (j:EmbeddingJob)
      WHERE j.status = 'pending'
      WITH j ORDER BY j.priority DESC, j.createdAt ASC LIMIT $batchSize
      SET j.updatedAt = $now,
          j.claimedBy = CASE WHEN j.status = 'pending' THEN $workerId ELSE j.claimedBy END,
          j.claimedAt = CASE WHEN j.status = 'pending' THEN $now ELSE j.claimedAt END,
          j.attempts  = CASE WHEN j.status = 'pending' THEN j.attempts + 1 ELSE j.attempts END,
          j.status    = CASE WHEN j.status = 'pending' THEN 'processing' ELSE j.status END
      WITH j WHERE j.claimedBy = $workerId AND j.claimedAt = $now AND j.status = 'processing'
      RETURN j
      `,
      {
        batchSize: neo4j.int(Math.max(1, Math.floor(batchSize))),
        now: neo4j.int(now),
        workerId,
      }
    );
    return result.records.map(r => recordFromNode(r.get('j').properties));
  }

  async complete(jobId: string): Promise<void> {
    const now = Date.now();
    await this.connectionManager.executeQuery(
      `
      MATCH (j:EmbeddingJob {id: $jobId})
      SET j.status = 'completed',
          j.errorMessage = null,
          j.updatedAt = $now
      `,
      { jobId, now: neo4j.int(now) }
    );
  }

  async fail(jobId: string, errorMessage: string): Promise<{ status: 'pending' | 'failed' }> {
    const now = Date.now();
    const result = await this.connectionManager.executeQuery(
      `
      MATCH (j:EmbeddingJob {id: $jobId})
      WITH j, CASE WHEN j.attempts >= j.maxAttempts THEN 'failed' ELSE 'pending' END AS nextStatus
      SET j.errorMessage = $errorMessage,
          j.updatedAt = $now,
          j.status = nextStatus,
          j.claimedAt = CASE WHEN nextStatus = 'failed' THEN j.claimedAt ELSE null END,
          j.claimedBy = CASE WHEN nextStatus = 'failed' THEN j.claimedBy ELSE null END
      RETURN nextStatus AS status
      `,
      { jobId, errorMessage, now: neo4j.int(now) }
    );
    const status = result.records[0]?.get('status');
    if (status !== 'pending' && status !== 'failed') {
      throw new Error(`Neo4jJobStore.fail: job ${jobId} not found`);
    }
    return { status };
  }

  async countByStatus(): Promise<QueueCounts> {
    const result = await this.connectionManager.executeQuery(
      `
      MATCH (j:EmbeddingJob)
      RETURN j.status AS status, count(j) AS n
      `,
      {}
    );
    const counts: QueueCounts = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      totalJobs: 0,
    };
    for (const r of result.records) {
      const status = r.get('status') as JobStatus;
      const n = Number(r.get('n'));
      if (
        status === 'pending' ||
        status === 'processing' ||
        status === 'completed' ||
        status === 'failed'
      ) {
        counts[status] = n;
      }
      counts.totalJobs += n;
    }
    return counts;
  }

  async retryFailed(): Promise<number> {
    const now = Date.now();
    const result = await this.connectionManager.executeQuery(
      `
      MATCH (j:EmbeddingJob)
      WHERE j.status = 'failed'
      SET j.status = 'pending',
          j.attempts = 0,
          j.errorMessage = null,
          j.claimedAt = null,
          j.claimedBy = null,
          j.updatedAt = $now
      RETURN count(j) AS reset
      `,
      { now: neo4j.int(now) }
    );
    return Number(result.records[0]?.get('reset') ?? 0);
  }

  async cleanup(thresholdMs: number): Promise<number> {
    const cutoff = Date.now() - thresholdMs;
    const result = await this.connectionManager.executeQuery(
      `
      MATCH (j:EmbeddingJob)
      WHERE j.status = 'completed' AND j.updatedAt < $cutoff
      WITH j, count(j) AS _count
      DETACH DELETE j
      RETURN count(*) AS deleted
      `,
      { cutoff: neo4j.int(cutoff) }
    );
    return Number(result.records[0]?.get('deleted') ?? 0);
  }
}

/**
 * Convert a raw Neo4j node properties bag into an `EmbeddingJobRecord`.
 * Neo4j returns integer fields as BigInt — convert before exposing.
 */
function recordFromNode(props: Record<string, unknown>): EmbeddingJobRecord {
  return {
    id: String(props.id),
    entityName: String(props.entityName),
    status: props.status as JobStatus,
    priority: Number(props.priority ?? 1),
    attempts: Number(props.attempts ?? 0),
    maxAttempts: Number(props.maxAttempts ?? DEFAULT_MAX_ATTEMPTS),
    createdAt: Number(props.createdAt ?? 0),
    updatedAt: Number(props.updatedAt ?? 0),
    claimedAt: props.claimedAt == null ? null : Number(props.claimedAt),
    claimedBy: props.claimedBy == null ? null : String(props.claimedBy),
    errorMessage: props.errorMessage == null ? null : String(props.errorMessage),
  };
}
