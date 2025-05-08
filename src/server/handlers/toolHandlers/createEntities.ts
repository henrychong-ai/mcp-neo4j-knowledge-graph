/**
 * Handles the create_entities tool request
 * @param args The arguments for the tool request
 * @param knowledgeGraphManager The KnowledgeGraphManager instance
 * @returns A response object with the result content
 */
export async function handleCreateEntities(args: any, knowledgeGraphManager: any) {
  const result = await knowledgeGraphManager.createEntities(args.entities);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
