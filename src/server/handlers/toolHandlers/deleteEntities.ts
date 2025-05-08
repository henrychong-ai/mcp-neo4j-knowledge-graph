/**
 * Handles the delete_entities tool request
 * @param args The arguments for the tool request
 * @param knowledgeGraphManager The KnowledgeGraphManager instance
 * @returns A response object with the success message
 */
export async function handleDeleteEntities(args: any, knowledgeGraphManager: any) {
  await knowledgeGraphManager.deleteEntities(args.entityNames);
  return {
    content: [
      {
        type: 'text',
        text: 'Entities deleted successfully',
      },
    ],
  };
}
