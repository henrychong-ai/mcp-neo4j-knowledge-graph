/**
 * Shared helper: non-fatal entity-size warnings for write tools.
 *
 * After a batch write, the touched entities are sized with EntitySizeService and
 * any that cross the WARN/CRITICAL thresholds are returned as an additive
 * `warnings[]` field on the tool result. This is the earliest possible signal —
 * it names the offending entity at the moment it grows.
 *
 * STRICTLY fail-open: a disabled feature, a sizing error, or a hydration failure
 * yields an empty list and never disrupts or fails the write.
 */

import { getEntitySizeConfig } from '../../../config/entitySize.js';
import { estimateEntitySize } from '../../../maintenance/EntitySizeService.js';
import { logger } from '../../../utils/logger.js';

/** A single non-fatal size warning for a written entity. */
export interface WriteSizeWarning {
  name: string;
  estTokens: number;
  ratio: number;
  state: 'WARN' | 'CRITICAL';
  message: string;
}

/**
 * Extract candidate entity names from a write tool's arguments. Handles the
 * three write shapes: add_observations_batch (observations[].entityName),
 * update_entities_batch (updates[].name), create_entities_batch (entities[].name).
 *
 * @param args Tool arguments
 * @returns Candidate entity names (possibly with duplicates)
 */
export function extractWrittenNames(args: Record<string, unknown>): string[] {
  const names: string[] = [];
  const push = (item: unknown): void => {
    if (!item || typeof item !== 'object') {
      return;
    }
    const record = item as { name?: unknown; entityName?: unknown };
    if (typeof record.name === 'string') {
      names.push(record.name);
    }
    if (typeof record.entityName === 'string') {
      names.push(record.entityName);
    }
  };

  for (const key of ['observations', 'updates', 'entities']) {
    const arr = args[key];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        push(item);
      }
    }
  }
  return names;
}

/**
 * Compute non-fatal size warnings for the entities just written.
 *
 * @param knowledgeGraphManager Knowledge graph manager instance
 * @param names Names of the entities that were written
 * @returns WARN/CRITICAL warnings (empty when disabled or on any error)
 */
export async function collectWriteSizeWarnings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  knowledgeGraphManager: any,
  names: string[]
): Promise<WriteSizeWarning[]> {
  try {
    const cfg = getEntitySizeConfig();
    if (!cfg.warnOnWrite) {
      return [];
    }

    const unique = [...new Set(names.filter(n => typeof n === 'string' && n.length > 0))];
    if (unique.length === 0) {
      return [];
    }

    const graph = await knowledgeGraphManager.openNodes(unique);
    const entities = graph?.entities ?? [];
    const warnings: WriteSizeWarning[] = [];

    for (const entity of entities) {
      const report = estimateEntitySize(entity, cfg);
      if (report.state === 'OK') {
        continue;
      }
      const pct = Math.round(report.ratio * 100);
      warnings.push({
        name: report.name,
        estTokens: report.estTokens,
        ratio: Number(report.ratio.toFixed(3)),
        state: report.state,
        message:
          report.state === 'CRITICAL'
            ? `Entity "${report.name}" is ~${report.estTokens} tokens, at/above the ~${cfg.maxTokens}-token open_nodes cap — split it into sibling entities now; it may already be unretrievable whole.`
            : `Entity "${report.name}" is ~${report.estTokens} tokens (${pct}% of the ~${cfg.maxTokens}-token open_nodes cap) — consider splitting it soon.`,
      });
    }
    return warnings;
  } catch (error) {
    logger.warn('collectWriteSizeWarnings failed (non-fatal)', error);
    return [];
  }
}

/**
 * Attach size warnings to a write result without mutating existing fields.
 * Returns the original result unchanged when there are no warnings.
 *
 * @param result The batch write result
 * @param warnings Size warnings to attach
 * @returns The result, with an additive `warnings` field when applicable
 */
export function attachWriteWarnings(result: unknown, warnings: WriteSizeWarning[]): unknown {
  if (warnings.length === 0 || !result || typeof result !== 'object') {
    return result;
  }
  return { ...(result as Record<string, unknown>), warnings };
}
