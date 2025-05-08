/**
 * Handles the create_relations tool request
 * @param args The arguments for the tool request
 * @param knowledgeGraphManager The KnowledgeGraphManager instance
 * @returns A response object with the result content
 */
export async function handleCreateRelations(args: any, knowledgeGraphManager: any) {
  const result = await knowledgeGraphManager.createRelations(args.relations);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
