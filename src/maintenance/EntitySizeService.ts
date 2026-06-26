/**
 * EntitySizeService — the single primitive for estimating how much of the MCP
 * `open_nodes` output cap a knowledge-graph entity consumes.
 *
 * The cap (default MAX_MCP_OUTPUT_TOKENS = 25,000) is enforced by the MCP
 * client/harness on the serialized tool RESPONSE, not by the server. An entity
 * whose own serialized form approaches the cap risks becoming unretrievable via
 * `open_nodes(["Name"])`, because that call fails closed above the cap.
 *
 * The estimate is deliberately dependency-free and conservative: it counts the
 * characters of the entity as `open_nodes` serializes it (JSON, 2-space
 * indented) and approximates tokens at chars / 4. Combined with a sub-1.0 warn
 * ratio, this gives margin against the harness's real (unseen) tokenizer rather
 * than false precision.
 */

import type { EntitySizeConfig } from '../config/entitySize.js';

/** Three-state classification for an entity's size relative to the cap. */
export type EntitySizeState = 'OK' | 'WARN' | 'CRITICAL';

/** Minimal entity shape needed to estimate size (matches what open_nodes returns). */
export interface SizeableEntity {
  name: string;
  entityType?: string;
  domain?: string | null;
  observations?: string[];
}

/** Per-entity size report. */
export interface EntitySizeReport {
  name: string;
  entityType: string;
  /** Characters of the entity as open_nodes serializes it (incl. wrapper overhead). */
  charCount: number;
  /** Estimated tokens (charCount / 4, rounded up). */
  estTokens: number;
  /** estTokens / cap. */
  ratio: number;
  state: EntitySizeState;
  obsCount: number;
  /** Size in characters of the single largest observation (the first thing to peel off). */
  largestObservationChars: number;
}

/**
 * Average characters per token. Dense technical / JSON content — paths, IPs,
 * hex, code, plus the heavy punctuation and 2-space indentation of an
 * `open_nodes` response — tokenizes at FEWER chars per token (more tokens per
 * char) than the ~4 chars/token prose rule. Using too large a divisor
 * UNDER-estimates tokens, which is the unsafe direction for an early warning.
 *
 * Calibration anchor: the documented `sgo-mac-studio` failure was ~73k
 * serialized chars and EXCEEDED the 25,000-token cap (it failed `open_nodes`
 * closed) ⇒ real density was < 2.93 chars/token for this KG's content. We pick
 * 2.8 so that incident lands CRITICAL with margin (≈ WARN at ~56k chars,
 * CRITICAL at ~70k chars), deliberately erring toward over-estimating tokens:
 * a false WARN is cheap (you look and decide not to split) while a false OK is
 * the missed-unretrievability catastrophe the feature exists to prevent.
 * Exported so tests assert behaviour relative to it rather than a magic number.
 */
export const CHARS_PER_TOKEN = 2.8;

/**
 * Fixed envelope overhead (chars) added to the storage-scan APPROXIMATE path,
 * which has only the observation-char total — not the full serialized entity.
 * Covers the `{ entities: [ { name, type, domain, temporal fields… } ], ... }`
 * structure around the observations. The precise path serializes the real
 * shape directly (see serializedEntityChars) and does not use this.
 */
const APPROX_ENVELOPE_CHARS = 320;

/** Convert a character count to an estimated token count. */
export function estimateTokensFromChars(charCount: number): number {
  return Math.ceil(Math.max(charCount, 0) / CHARS_PER_TOKEN);
}

/** Classify a token estimate against the configured thresholds. */
export function classifySize(estTokens: number, cfg: EntitySizeConfig): EntitySizeState {
  const ratio = estTokens / cfg.maxTokens;
  if (ratio >= cfg.criticalRatio) {
    return 'CRITICAL';
  }
  if (ratio >= cfg.warnRatio) {
    return 'WARN';
  }
  return 'OK';
}

/**
 * Character length of a single entity as `open_nodes` ACTUALLY serializes it:
 * the entity nested inside the `{ entities: [ … ], relations: [], total, timeTaken }`
 * response envelope, 2-space indented. Nesting matters — each observation sits
 * at 8-space indentation in the real response (array-in-entity-in-array), which
 * a top-level slice would undercount by ~4 chars per observation.
 *
 * open_nodes' nodeToEntity does NOT include the embedding vector, but it DOES
 * include the temporal/identity fields (id, version, timestamps, changedBy);
 * representative placeholder values are included so the char count matches a
 * real response without needing the live values. A single-name open_nodes
 * attaches only self-loop relations, so relations are omitted (empty), making
 * this the per-entity retrievability cost. Observations dominate.
 */
export function serializedEntityChars(entity: SizeableEntity): number {
  const slice = {
    name: entity.name,
    entityType: entity.entityType ?? '',
    domain: entity.domain ?? null,
    observations: entity.observations ?? [],
    // Representative placeholders for the temporal/identity fields nodeToEntity
    // returns — present so indentation + field overhead match a real response.
    id: '00000000-0000-0000-0000-000000000000',
    version: 1,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    validFrom: 1700000000000,
    validTo: null,
    changedBy: null,
  };
  const response = { entities: [slice], relations: [], total: 1, timeTaken: 0 };
  return JSON.stringify(response, null, 2).length;
}

/**
 * Build a precise size report for a single entity.
 *
 * @param entity The entity (as open_nodes would return it)
 * @param cfg Resolved entity-size configuration
 * @returns The entity's size report
 */
export function estimateEntitySize(
  entity: SizeableEntity,
  cfg: EntitySizeConfig
): EntitySizeReport {
  const observations = entity.observations ?? [];
  const charCount = serializedEntityChars(entity);
  const estTokens = estimateTokensFromChars(charCount);
  const largestObservationChars = observations.reduce(
    (max, obs) => Math.max(max, (obs ?? '').length),
    0
  );

  return {
    name: entity.name,
    entityType: entity.entityType ?? '',
    charCount,
    estTokens,
    ratio: estTokens / cfg.maxTokens,
    state: classifySize(estTokens, cfg),
    obsCount: observations.length,
    largestObservationChars,
  };
}

/**
 * Build an approximate size report from a raw character count (the storage-layer
 * scan path, where full observation text was deliberately not materialized).
 *
 * @param row Compact ranking row from the storage scan
 * @param cfg Resolved entity-size configuration
 * @returns An approximate size report (precise fields refined elsewhere)
 */
export function estimateFromCharCount(
  row: { name: string; entityType?: string; approxChars: number; obsCount?: number },
  cfg: EntitySizeConfig
): EntitySizeReport {
  const charCount = Math.max(row.approxChars, 0) + APPROX_ENVELOPE_CHARS;
  const estTokens = estimateTokensFromChars(charCount);
  return {
    name: row.name,
    entityType: row.entityType ?? '',
    charCount,
    estTokens,
    ratio: estTokens / cfg.maxTokens,
    state: classifySize(estTokens, cfg),
    obsCount: row.obsCount ?? 0,
    largestObservationChars: 0,
  };
}

/**
 * Human-readable guidance for restructuring an oversized entity, included in
 * tool/CLI output. Restructuring stays a manual/agent judgement call.
 */
export const RESTRUCTURE_HINT =
  'Split oversized entities into themed sibling entities linked by relations: ' +
  'group related observations under new, more specific entity names, then connect ' +
  'them with create_relations (e.g. part-of / relates-to). Dedup with open_nodes ' +
  'before creating. CRITICAL entities already exceed the cap and cannot be fetched ' +
  'whole via open_nodes — split them first.';
