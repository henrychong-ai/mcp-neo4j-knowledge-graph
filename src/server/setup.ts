import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { handleListToolsRequest } from './handlers/listToolsHandler.js';
import { handleCallToolRequest } from './handlers/callToolHandler.js';

/**
 * Sets up and configures the MCP server with the appropriate request handlers.
 * 
 * @param knowledgeGraphManager The KnowledgeGraphManager instance to use for request handling
 * @returns The configured server instance
 */
export function setupServer(knowledgeGraphManager: any): Server {
  // Create server instance
  const server = new Server({
    name: "memento-mcp",
    version: "1.0.0",
    description: "Memento MCP: Your persistent knowledge graph memory system",
    publisher:"gannonh"

  }, {
    capabilities: {
      tools: {},
      serverInfo: {}, // Add this capability to fix the error
      notifications: {}, // Add this capability for complete support
      logging: {} // Add this capability for complete support
    },
  });

  // Register request handlers
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    try {
      const result = await handleListToolsRequest();
      return result;
    } catch (error: any) {
      throw error;
    }
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await handleCallToolRequest(request, knowledgeGraphManager);
      return result;
    } catch (error: any) {
      throw error;
    }
  });

  return server;
}