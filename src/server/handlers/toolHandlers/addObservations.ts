/**
 * Handles the add_observations tool request
 * @param args The arguments for the tool request
 * @param knowledgeGraphManager The KnowledgeGraphManager instance
 * @returns A response object with the result content
 */
export async function handleAddObservations(args: any, knowledgeGraphManager: any) {
  try {
    // Enhanced logging for debugging
    process.stderr.write(`[DEBUG] addObservations handler called at ${new Date().toISOString()}\n`);
    process.stderr.write(`[DEBUG] FULL ARGS: ${JSON.stringify(args, null, 2)}\n`);
    process.stderr.write(`[DEBUG] ARGS KEYS: ${Object.keys(args).join(', ')}\n`);
    process.stderr.write(
      `[DEBUG] ARGS TYPES: ${Object.keys(args)
        .map((k) => `${k}: ${typeof args[k]}`)
        .join(', ')}\n`
    );

    // Validate the observations array
    if (!args.observations || !Array.isArray(args.observations)) {
      throw new Error('Invalid observations: must be an array');
    }

    // Add default values for required parameters
    const defaultStrength = 0.9;
    const defaultConfidence = 0.95;

    // Force add strength to args if it doesn't exist
    if (args.strength === undefined) {
      process.stderr.write(`[DEBUG] Adding default strength value: ${defaultStrength}\n`);
      args.strength = defaultStrength;
    }

    // Ensure each observation has the required fields
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

      process.stderr.write(
        `[DEBUG] Processing observation for ${obs.entityName}, using strength: ${obsStrength}\n`
      );

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
    process.stderr.write(
      `[DEBUG] Calling knowledgeGraphManager.addObservations with ${processedObservations.length} observations\n`
    );
    process.stderr.write(`[DEBUG] PROCESSED: ${JSON.stringify(processedObservations, null, 2)}\n`);

    const result = await knowledgeGraphManager.addObservations(processedObservations);

    process.stderr.write(`[DEBUG] addObservations result: ${JSON.stringify(result, null, 2)}\n`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              result,
              debug: {
                timestamp: Date.now(),
                input_args: args,
                processed_observations: processedObservations,
                tool_version: 'v2 with debug info',
              },
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error: any) {
    // Enhanced error logging for debugging
    process.stderr.write(`[ERROR] addObservations error: ${error.message}\n`);
    process.stderr.write(`[ERROR] Stack trace: ${error.stack || 'No stack trace available'}\n`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: error.message,
              debug: {
                timestamp: Date.now(),
                input_args: args || 'No args available',
                error_type: error.constructor.name,
                error_stack: error.stack?.split('\n') || 'No stack trace',
                tool_version: 'v2 with debug info',
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }
}
