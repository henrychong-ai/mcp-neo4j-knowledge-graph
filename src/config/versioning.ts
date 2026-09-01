/**
 * Configuration for entity temporal versioning safety limits.
 *
 * Two knobs, both defensive, both introduced in v2.9.0 after a production
 * incident in which a single entity accumulated 39,382 physical live
 * relationships for 15 logical ones (see CHANGELOG 2.9.0):
 *
 * - `txTimeoutMs` bounds how long any single transaction may hold locks. The
 *   Neo4j server had no transaction timeout configured, so an abandoned
 *   client transaction held write locks until the server killed the
 *   connection. A driver-level timeout fails the query instead.
 * - `maxLiveRelationships` is a pre-flight circuit breaker. Versioning an
 *   entity loads every live relationship of the version being superseded into
 *   transaction memory; past a few thousand edges that alone exhausts
 *   `db.memory.transaction.max` and every write on the database fails. The
 *   guard refuses the write and names the repair command instead.
 */

/**
 * Resolved versioning configuration (frozen).
 */
export interface VersioningConfig {
  /** Transaction timeout in milliseconds, applied to every transaction. */
  txTimeoutMs: number;
  /**
   * Maximum live relationships one entity version may have before the
   * versioning helper refuses to copy them.
   */
  maxLiveRelationships: number;
}

/** Default transaction timeout (ms). */
export const DEFAULT_TX_TIMEOUT_MS = 60_000;

/** Default per-version live-relationship ceiling. */
export const DEFAULT_MAX_LIVE_RELATIONSHIPS = 5000;

/**
 * Command an operator should run when the live-relationship guard trips.
 * Referenced from the thrown error so the fix is in the failure message.
 */
export const REPAIR_COMMAND_HINT =
  'run `pnpm kg:repair` (dry run) then `pnpm kg:repair -- --apply` to collapse duplicate relationships';

function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Resolve the versioning configuration from environment variables.
 *
 * `NEO4J_TX_TIMEOUT_MS` — transaction timeout in ms (default 60000).
 * `NEO4J_MAX_LIVE_RELATIONSHIPS` — per-version live-relationship cap (default 5000).
 *
 * Non-numeric, zero, and negative values fall back to the defaults rather than
 * producing a transaction that never times out or a guard that never fires.
 *
 * @returns A frozen, validated VersioningConfig
 */
export function getVersioningConfig(): VersioningConfig {
  return Object.freeze({
    txTimeoutMs: positiveIntEnv('NEO4J_TX_TIMEOUT_MS', DEFAULT_TX_TIMEOUT_MS),
    maxLiveRelationships: positiveIntEnv(
      'NEO4J_MAX_LIVE_RELATIONSHIPS',
      DEFAULT_MAX_LIVE_RELATIONSHIPS
    ),
  });
}
