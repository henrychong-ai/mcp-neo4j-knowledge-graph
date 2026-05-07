/**
 * Job-queue persistence interface used by `EmbeddingJobManager`.
 *
 * Replaces the v2.x SQLite shim that was a silent no-op when the storage
 * backend was Neo4j. Implementations are responsible for atomicity of
 * `claim()` under multi-worker contention.
 */

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface EmbeddingJobRecord {
  id: string;
  entityName: string;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  updatedAt: number;
  claimedAt: number | null;
  claimedBy: string | null;
  errorMessage: string | null;
}

export interface QueueCounts {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  totalJobs: number;
}

export interface JobStore {
  /** Idempotent — safe to call on every server start. */
  ensureSchema(): Promise<void>;

  /**
   * Enqueue (or dedup) a job for an entity. If a `pending` job for the
   * same entityName already exists, its id is returned unchanged — never
   * inserts a duplicate pending row.
   */
  enqueue(opts: { entityName: string; priority?: number; maxAttempts?: number }): Promise<string>;

  /**
   * Recover jobs whose `claimedAt` is older than `staleClaimMs` —
   * resets them to `pending` so any worker can pick them up again.
   * Returns the count released.
   */
  releaseStale(staleClaimMs: number): Promise<number>;

  /**
   * Voluntarily release a list of claimed jobs back to `pending` without
   * burning a retry attempt. Used when a worker can't proceed for a
   * non-fault reason (rate limit, shutdown).
   */
  releaseClaims(jobIds: string[]): Promise<number>;

  /**
   * Atomically claim up to `batchSize` pending jobs for `workerId`.
   * Implementations must ensure two workers calling concurrently do not
   * both see the same job as `pending`.
   */
  claim(workerId: string, batchSize: number): Promise<EmbeddingJobRecord[]>;

  /** Mark a claimed job complete. */
  complete(jobId: string): Promise<void>;

  /**
   * Mark a claimed job failed. If the job has remaining attempts, status
   * resets to `pending` for retry; otherwise terminal `failed`. Returns
   * the resulting status so the caller can log appropriately.
   */
  fail(jobId: string, errorMessage: string): Promise<{ status: 'pending' | 'failed' }>;

  countByStatus(): Promise<QueueCounts>;

  /** Reset every `failed` job back to `pending` with attempts cleared. Returns count. */
  retryFailed(): Promise<number>;

  /**
   * Delete `completed` jobs older than `thresholdMs` (calculated from now).
   * Returns count deleted.
   */
  cleanup(thresholdMs: number): Promise<number>;

  /** Optional teardown for tests / shutdown. */
  close?(): Promise<void>;
}
