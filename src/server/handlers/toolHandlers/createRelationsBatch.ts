/**
 * MCP Tool Handler: create_relations_batch
 *
 * Creates multiple relations in a single optimized batch operation.
 * Provides 10-50x performance improvement over individual creates.
 */

/**
 * Handle create_relations_batch tool calls
 *
 * @param args Tool arguments from MCP protocol
 * @param knowledgeGraphManager Knowledge graph manager instance
 * @returns MCP response with batch result
 */
export async function handleCreateRelationsBatch(
  args: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  knowledgeGraphManager: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const result = await knowledgeGraphManager.createRelationsBatch(
    args.relations,
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
