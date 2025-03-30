/**
 * Handles the add_observations tool request
 * @param args The arguments for the tool request
 * @param knowledgeGraphManager The KnowledgeGraphManager instance
 * @returns A response object with the result content
 */
export async function handleAddObservations(args: any, knowledgeGraphManager: any) {
  try {
    // Debug message to confirm this version is running
    process.stderr.write(`[DEBUG] SIMPLIFIED addObservations handler called at ${new Date().toISOString()}\n`);
    
    // Debug the arguments we received
    process.stderr.write(`[DEBUG] addObservations received args: ${JSON.stringify(args, null, 2)}\n`);

    // Validate the input observations array
    if (!args.observations || !Array.isArray(args.observations)) {
      throw new Error('Invalid observations: must be an array');
    }
    
    // Process each observation to simply extract the required fields
    const processedObservations = args.observations.map((obs: any) => {
      if (!obs.entityName) {
        throw new Error('Missing required parameter: entityName');
      }
      if (!obs.contents || !Array.isArray(obs.contents)) {
        throw new Error('Missing required parameter: contents (must be an array)');
      }
      
      // Only include the fields that KnowledgeGraphManager actually uses
      return {
        entityName: obs.entityName,
        contents: obs.contents,
        // Add these for SDK compatibility, even though KGM doesn't use them internally
        strength: 0.9,
        confidence: 0.95,
        metadata: { source: "API call" }
      };
    });
    
    // Call knowledgeGraphManager
    process.stderr.write(`[DEBUG] Calling knowledgeGraphManager.addObservations with ${processedObservations.length} observations\n`);
    const result = await knowledgeGraphManager.addObservations(processedObservations);
    
    process.stderr.write(`[DEBUG] addObservations result: ${JSON.stringify(result)}\n`);
    return { 
      content: [{ 
        type: 'text', 
        text: JSON.stringify(result, null, 2) 
      }] 
    };
  } catch (error: any) {
    // Log the error for debugging
    process.stderr.write(`[ERROR] addObservations error: ${error.message}\n${error.stack || ''}\n`);
    
    return { 
      content: [{ 
        type: 'text', 
        text: JSON.stringify({
          error: `Error in addObservations: ${error.message}`
        }, null, 2) 
      }] 
    };
  }
} 