import crypto from 'node:crypto';
import { vi } from 'vitest';

import type { EmbeddingJobRecord, JobStatus, JobStore, QueueCounts } from '../../JobStore.js';

/**
 * In-memory `JobStore` for unit tests. Behaviourally faithful enough to
 * back the manager's queue logic — preserves priority ordering, atomic
 * claim semantics, retry budget, stale-claim recovery — without touching
 * a database. Each public method is a `vi.fn()` so tests can assert on
 * call patterns where useful.
 */
export class FakeJobStore implements JobStore {
  private jobs = new Map<string, EmbeddingJobRecord>();

  ensureSchema = vi.fn(async (): Promise<void> => {
    // no-op; in-memory store has no schema
  });

  enqueue = vi.fn(
    async (opts: {
      entityName: string;
      priority?: number;
      maxAttempts?: number;
    }): Promise<string> => {
      // Dedup-on-pending — match Neo4jJobStore semantics
      for (const job of this.jobs.values()) {
        if (job.status === 'pending' && job.entityName === opts.entityName) {
          return job.id;
        }
      }
      const id = crypto.randomUUID();
      const now = Date.now();
      this.jobs.set(id, {
        id,
        entityName: opts.entityName,
        status: 'pending',
        priority: opts.priority ?? 1,
        attempts: 0,
        maxAttempts: opts.maxAttempts ?? 3,
        createdAt: now,
        updatedAt: now,
        claimedAt: null,
        claimedBy: null,
        errorMessage: null,
      });
      return id;
    }
  );

  releaseStale = vi.fn(async (staleClaimMs: number): Promise<number> => {
    const cutoff = Date.now() - staleClaimMs;
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.status === 'processing' && (job.claimedAt ?? 0) < cutoff) {
        job.status = 'pending';
        job.claimedAt = null;
        job.claimedBy = null;
        job.updatedAt = Date.now();
        count++;
      }
    }
    return count;
  });

  releaseClaims = vi.fn(async (jobIds: string[]): Promise<number> => {
    let count = 0;
    for (const id of jobIds) {
      const job = this.jobs.get(id);
      if (job && job.status === 'processing') {
        job.status = 'pending';
        job.claimedAt = null;
        job.claimedBy = null;
        if (job.attempts > 0) job.attempts -= 1;
        job.updatedAt = Date.now();
        count++;
      }
    }
    return count;
  });

  claim = vi.fn(async (workerId: string, batchSize: number): Promise<EmbeddingJobRecord[]> => {
    const candidates = [...this.jobs.values()]
      .filter(j => j.status === 'pending')
      .sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.createdAt - b.createdAt;
      })
      .slice(0, Math.max(1, Math.floor(batchSize)));

    const now = Date.now();
    for (const j of candidates) {
      j.status = 'processing';
      j.claimedAt = now;
      j.claimedBy = workerId;
      j.attempts += 1;
      j.updatedAt = now;
    }
    // Return copies so test callers don't mutate internal state
    return candidates.map(j => ({ ...j }));
  });

  complete = vi.fn(async (jobId: string): Promise<void> => {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = 'completed';
    job.errorMessage = null;
    job.updatedAt = Date.now();
  });

  fail = vi.fn(
    async (jobId: string, errorMessage: string): Promise<{ status: 'pending' | 'failed' }> => {
      const job = this.jobs.get(jobId);
      if (!job) {
        throw new Error(`FakeJobStore.fail: job ${jobId} not found`);
      }
      const next: 'pending' | 'failed' = job.attempts >= job.maxAttempts ? 'failed' : 'pending';
      job.status = next;
      job.errorMessage = errorMessage;
      job.updatedAt = Date.now();
      if (next === 'pending') {
        job.claimedAt = null;
        job.claimedBy = null;
      }
      return { status: next };
    }
  );

  countByStatus = vi.fn(async (): Promise<QueueCounts> => {
    const counts: QueueCounts = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      totalJobs: 0,
    };
    for (const job of this.jobs.values()) {
      counts.totalJobs += 1;
      counts[job.status] += 1;
    }
    return counts;
  });

  retryFailed = vi.fn(async (): Promise<number> => {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.status === 'failed') {
        job.status = 'pending';
        job.attempts = 0;
        job.errorMessage = null;
        job.claimedAt = null;
        job.claimedBy = null;
        job.updatedAt = Date.now();
        count++;
      }
    }
    return count;
  });

  cleanup = vi.fn(async (thresholdMs: number): Promise<number> => {
    const cutoff = Date.now() - thresholdMs;
    let count = 0;
    for (const [id, job] of this.jobs) {
      if (job.status === 'completed' && job.updatedAt < cutoff) {
        this.jobs.delete(id);
        count++;
      }
    }
    return count;
  });

  /** Test-only helpers — not part of the JobStore interface */

  _seedJob(job: Partial<EmbeddingJobRecord> & { entityName: string }): EmbeddingJobRecord {
    const id = job.id ?? crypto.randomUUID();
    const now = Date.now();
    const record: EmbeddingJobRecord = {
      id,
      entityName: job.entityName,
      status: job.status ?? 'pending',
      priority: job.priority ?? 1,
      attempts: job.attempts ?? 0,
      maxAttempts: job.maxAttempts ?? 3,
      createdAt: job.createdAt ?? now,
      updatedAt: job.updatedAt ?? now,
      claimedAt: job.claimedAt ?? null,
      claimedBy: job.claimedBy ?? null,
      errorMessage: job.errorMessage ?? null,
    };
    this.jobs.set(id, record);
    return record;
  }

  _all(): EmbeddingJobRecord[] {
    return [...this.jobs.values()].map(j => ({ ...j }));
  }

  _byStatus(status: JobStatus): EmbeddingJobRecord[] {
    return this._all().filter(j => j.status === status);
  }
}
