/**
 * Handles the add_observations tool request
 * @param args The arguments for the tool request
 * @param knowledgeGraphManager The KnowledgeGraphManager instance
 * @returns A response object with the result content
 */

export async function handleAddObservations(
  args: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  knowledgeGraphManager: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    // Validate the observations array
    if (!args.observations || !Array.isArray(args.observations)) {
      throw new Error('Invalid observations: must be an array');
    }

    // Add default values for required parameters
    const defaultStrength = 0.9;
    const defaultConfidence = 0.95;

    // Force add strength to args if it doesn't exist
    if (args.strength === undefined) {
      args.strength = defaultStrength;
    }

    // Ensure each observation has the required fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processedObservations = args.observations.map((obs: any) => {
      // Validate required fields
      if (!obs.entityName) {
        throw new Error('Missing required parameter: entityName');
      }
      if (!obs.contents || !Array.isArray(obs.contents)) {
        throw new Error('Missing required parameter: contents (must be an array)');
      }

      // Always set strength value
      const obsStrength = obs.strength !== undefined ? obs.strength : args.strength;

      // Set defaults for each observation
      return {
        entityName: obs.entityName,
        contents: obs.contents,
        strength: obsStrength,
        confidence:
          obs.confidence !== undefined ? obs.confidence : args.confidence || defaultConfidence,
        metadata: obs.metadata || args.metadata || { source: 'API call' },
      };
    });

    // Call knowledgeGraphManager
    const result = await knowledgeGraphManager.addObservations(processedObservations);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, count: processedObservations.length, result }, null, 2),
        },
      ],
    };
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = error as any;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: err.message }, null, 2),
        },
      ],
    };
  }
}
