/**
 * Configuration for entity-size flagging.
 *
 * The MCP `open_nodes` response is bounded by the client/harness output cap
 * (default 25,000 tokens). An entity whose own serialized form approaches that
 * cap risks becoming unretrievable via `open_nodes(["Name"])`. These settings
 * drive the early-warning thresholds used by `flag_oversized_entities`, the
 * on-write warnings, and the `report-oversized` CLI.
 *
 * All values are advisory: the estimate is a conservative chars-per-token
 * heuristic (see EntitySizeService), not a reproduction of the harness tokenizer.
 */

/**
 * Resolved entity-size configuration (frozen).
 */
export interface EntitySizeConfig {
  /** Assumed MCP output cap in tokens (MAX_MCP_OUTPUT_TOKENS). */
  maxTokens: number;
  /** Ratio of the cap at/above which an entity is flagged WARN (0-1). */
  warnRatio: number;
  /** Ratio of the cap at/above which an entity is flagged CRITICAL (>= warnRatio). */
  criticalRatio: number;
  /** When true, write tools append non-fatal size warnings for touched entities. */
  warnOnWrite: boolean;
  /** Number of largest entities to scan/rank per pass. */
  scanLimit: number;
}

/** Per-call overrides accepted by tools/CLI (all optional). */
export interface EntitySizeConfigOverrides {
  maxTokens?: number;
  warnRatio?: number;
  criticalRatio?: number;
  warnOnWrite?: boolean;
  scanLimit?: number;
}

const DEFAULTS: EntitySizeConfig = {
  maxTokens: 25_000,
  warnRatio: 0.8,
  criticalRatio: 1.0,
  warnOnWrite: true,
  scanLimit: 50,
};

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function floatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  return raw.toLowerCase() === 'true' || raw === '1';
}

/**
 * Resolve the entity-size configuration from environment variables, applying
 * optional per-call overrides on top. Values are validated and clamped so a bad
 * input never produces nonsensical thresholds.
 *
 * @param overrides Optional per-call overrides (e.g. tool arguments)
 * @returns A frozen, validated EntitySizeConfig
 */
export function getEntitySizeConfig(overrides?: EntitySizeConfigOverrides): EntitySizeConfig {
  const maxTokens = overrides?.maxTokens ?? intEnv('MAX_MCP_OUTPUT_TOKENS', DEFAULTS.maxTokens);
  let warnRatio = overrides?.warnRatio ?? floatEnv('ENTITY_SIZE_WARN_RATIO', DEFAULTS.warnRatio);
  let criticalRatio =
    overrides?.criticalRatio ?? floatEnv('ENTITY_SIZE_CRITICAL_RATIO', DEFAULTS.criticalRatio);
  const warnOnWrite =
    overrides?.warnOnWrite ?? boolEnv('ENTITY_SIZE_WARN_ON_WRITE', DEFAULTS.warnOnWrite);
  const scanLimit = overrides?.scanLimit ?? intEnv('ENTITY_SIZE_SCAN_LIMIT', DEFAULTS.scanLimit);

  // Clamp ratios into a sane range and keep critical >= warn.
  warnRatio = Math.min(Math.max(warnRatio, 0.01), 2);
  criticalRatio = Math.min(Math.max(criticalRatio, 0.01), 4);
  if (criticalRatio < warnRatio) {
    criticalRatio = warnRatio;
  }

  // Upper-clamp scanLimit: it bounds both how many entities the refine step
  // hydrates AND how many size rows the tool returns. Too large a value would
  // let flag_oversized_entities' own response approach the very cap it polices
  // (especially with include_ok). SCAN_LIMIT_MAX rows stay well under it.
  const SCAN_LIMIT_MAX = 200;
  const boundedScanLimit = scanLimit > 0 ? Math.min(scanLimit, SCAN_LIMIT_MAX) : DEFAULTS.scanLimit;

  return Object.freeze({
    maxTokens: maxTokens > 0 ? maxTokens : DEFAULTS.maxTokens,
    warnRatio,
    criticalRatio,
    warnOnWrite,
    scanLimit: boundedScanLimit,
  });
}
