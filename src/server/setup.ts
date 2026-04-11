import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { handleCallToolRequest } from './handlers/callToolHandler.js';
import { handleListToolsRequest } from './handlers/listToolsHandler.js';

/**
 * Sets up and configures the MCP server with the appropriate request handlers.
 *
 * @param knowledgeGraphManager The KnowledgeGraphManager instance to use for request handling
 * @returns The configured server instance
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setupServer(knowledgeGraphManager: any): Server {
  // Create server instance
  const server = new Server(
    {
      name: 'mcp-neo4j-knowledge-graph',
      version: '2.2.5',
    },
    {
      capabilities: {
        tools: {},
        logging: {},
      },
    }
  );

  // Register request handlers
  server.setRequestHandler(ListToolsRequestSchema, async _request => {
    return await handleListToolsRequest();
  });

  server.setRequestHandler(CallToolRequestSchema, async request => {
    return await handleCallToolRequest(request, knowledgeGraphManager);
  });

  return server;
}
