/**
 * MCP Tool Handler: create_entities_batch
 *
 * Creates multiple entities in a single optimized batch operation.
 * Provides 10-50x performance improvement over individual creates.
 */

import { normaliseBatchConfig } from './batchConfig.js';
import {
  attachWriteWarnings,
  collectWriteSizeWarnings,
  extractWrittenNames,
} from './writeSizeWarnings.js';

/**
 * Handle create_entities_batch tool calls
 *
 * @param args Tool arguments from MCP protocol
 * @param knowledgeGraphManager Knowledge graph manager instance
 * @returns MCP response with batch result
 */
export async function handleCreateEntitiesBatch(
  args: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  knowledgeGraphManager: any
): Promise<{ content: { type: string; text: string }[] }> {
  const result = await knowledgeGraphManager.createEntitiesBatch(
    args['entities'],
    normaliseBatchConfig(args['config'])
  );

  // Additive, fail-open: flag any entity this write created near the open_nodes cap.
  const warnings = await collectWriteSizeWarnings(knowledgeGraphManager, extractWrittenNames(args));
  const payload = attachWriteWarnings(result, warnings);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}
