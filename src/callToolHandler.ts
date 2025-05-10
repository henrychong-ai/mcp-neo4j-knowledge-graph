// Note: This file connects Claude's tool calls to the appropriate internal function
// Each tool function is separate and should have the same name signature as the tools Claude uses

import type { KnowledgeGraphManager } from './KnowledgeGraphManager.js';

export async function handleToolCall(
  manager: KnowledgeGraphManager,
  toolCall: { name: string; args: Record<string, unknown> }
): Promise<unknown> {
  if (!toolCall || !toolCall.name) {
    return { error: 'Invalid tool call' };
  }

  // Handle the various tool calls
  try {
    switch (toolCall.name) {
      // ... existing code ...

      case 'get_decayed_graph': {
        // Note: The getDecayedGraph method no longer takes options
        // The decay settings now must be configured at the StorageProvider level
        const result = await manager.getDecayedGraph();
        return result;
      }

      // ... existing code ...
      default:
        return { error: `Unknown tool call: ${toolCall.name}` };
    }
  } catch (err) {
    return { error: `Error handling tool call: ${err}` };
  }
}
