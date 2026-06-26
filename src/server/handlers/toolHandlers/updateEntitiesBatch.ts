/**
 * MCP Tool Handler: update_entities_batch
 *
 * Updates multiple entities in a single optimized batch operation.
 * Provides 10-50x performance improvement over individual updates.
 */

import {
  attachWriteWarnings,
  collectWriteSizeWarnings,
  extractWrittenNames,
} from './writeSizeWarnings.js';

/**
 * Handle update_entities_batch tool calls
 *
 * @param args Tool arguments from MCP protocol
 * @param knowledgeGraphManager Knowledge graph manager instance
 * @returns MCP response with batch result
 */
export async function handleUpdateEntitiesBatch(
  args: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  knowledgeGraphManager: any
): Promise<{ content: { type: string; text: string }[] }> {
  const result = await knowledgeGraphManager.updateEntitiesBatch(args.updates, args.config);

  // Additive, fail-open: flag any entity this write pushed near the open_nodes cap.
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
