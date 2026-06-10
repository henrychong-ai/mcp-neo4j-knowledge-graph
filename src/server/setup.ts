import { createRequire } from 'node:module';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { handleCallToolRequest } from './handlers/callToolHandler.js';
import { handleListToolsRequest } from './handlers/listToolsHandler.js';

const require = createRequire(import.meta.url);

/**
 * Resolve the package version from package.json at runtime — the single source
 * of truth (no hardcoded literal to drift). Runtime read (not a static JSON
 * import) because tsconfig rootDir=src excludes package.json from the build;
 * `../../package.json` resolves identically from src/server/ (dev) and
 * dist/server/ (published package).
 *
 * @returns The package.json version string
 */
export function getPackageVersion(): string {
  const { version } = require('../../package.json') as { version: string };
  return version;
}

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
      version: getPackageVersion(),
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
