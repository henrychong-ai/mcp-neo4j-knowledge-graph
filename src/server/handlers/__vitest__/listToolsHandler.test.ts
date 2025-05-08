/**
 * Test file for the listToolsHandler module
 * Migrated from Jest to Vitest and converted to TypeScript
 */
import { describe, test, expect } from 'vitest';
import { handleListToolsRequest } from '../listToolsHandler.js';

describe('handleListToolsRequest', () => {
  test('should return a list of available tools', async () => {
    // Act
    const result = await handleListToolsRequest();

    // Assert
    expect(result).toBeDefined();
    expect(result.tools).toBeDefined();
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools.length).toBeGreaterThan(0);

    // Check that each tool has the required properties
    result.tools.forEach((tool) => {
      expect(tool.name).toBeDefined();
      expect(typeof tool.name).toBe('string');
      expect(tool.description).toBeDefined();
      expect(typeof tool.description).toBe('string');
      expect(tool.inputSchema).toBeDefined();
    });

    // Check if specific tools are present
    const toolNames = result.tools.map((tool) => tool.name);
    expect(toolNames).toContain('create_entities');
    expect(toolNames).toContain('read_graph');
    expect(toolNames).toContain('search_nodes');
  });
});
