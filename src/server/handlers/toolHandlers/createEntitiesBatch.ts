/**
 * MCP Tool Handler: create_entities_batch
 *
 * Creates multiple entities in a single optimized batch operation.
 * Provides 10-50x performance improvement over individual creates.
 */

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
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const result = await knowledgeGraphManager.createEntitiesBatch(
    args.entities,
    args.config
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
