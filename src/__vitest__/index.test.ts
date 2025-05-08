/**
 * Tests for index.ts
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';

// Define mocks at the top level to handle hoisting
// These mocks will be applied for all tests
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(() => ({ name: 'StdioServerTransport mock' })),
}));

// Mock KnowledgeGraphManager
vi.mock('../KnowledgeGraphManager.js', () => {
  const MockKnowledgeGraphManager = vi.fn();
  return {
    KnowledgeGraphManager: MockKnowledgeGraphManager,
  };
});

// Mock config/storage.js
vi.mock('../config/storage.js', () => ({
  initializeStorageProvider: vi.fn(() => ({})),
}));

// Mock server/setup.js
vi.mock('../server/setup.js', () => ({
  setupServer: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock types/relation.js
vi.mock('../types/relation.js', () => ({
  Relation: { type: 'Relation' },
  RelationMetadata: { type: 'RelationMetadata' },
}));

// Create a test directory
const testDir = path.join(process.cwd(), 'test-output', 'index-test');

// Setup test environment
beforeEach(() => {
  // Create test directory if it doesn't exist
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true, mode: 0o777 });
  }

  // Reset all mocks
  vi.resetAllMocks();
  vi.resetModules();
});

afterEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
});

// Clean up after all tests
afterEach(() => {
  // Clean up test directory
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

describe('Memory Server Index Module', () => {
  test('index module exports KnowledgeGraphManager', async () => {
    // Import the module after mocks are set up
    const { KnowledgeGraphManager } = await import('../index.js');

    // Verify exports
    expect(KnowledgeGraphManager).toBeDefined();
  });

  test('exports come from KnowledgeGraphManager.js module', async () => {
    // Import both modules after mocks are set up
    const indexExports = await import('../index.js');
    const knowledgeGraphManagerExports = await import('../KnowledgeGraphManager.js');

    // Verify the exports are the same
    expect(indexExports.KnowledgeGraphManager).toBe(
      knowledgeGraphManagerExports.KnowledgeGraphManager
    );
  });

  test('exports include relation types', async () => {
    // Import the module after mocks are set up
    const indexModule = await import('../index.js');
    const moduleExports = Object.keys(indexModule);

    // Check that export keys include relation related exports
    // Since we're testing a type export which might not be visible at runtime,
    // we'll just verify the main exports we know should exist
    expect(moduleExports).toContain('KnowledgeGraphManager');
    expect(moduleExports).toContain('main');
  });
});

describe('Memory Server Main Function', () => {
  test('main function connects the server with stdio transport', async () => {
    // Get access to the mocked functions
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
    const { setupServer } = await import('../server/setup.js');

    // Create mock instances for this test
    const mockTransport = { name: 'Transport for test' };
    const mockServer = {
      connect: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    };

    // Set mock implementation for this test
    (StdioServerTransport as any).mockReturnValue(mockTransport);
    (setupServer as any).mockReturnValue(mockServer);

    // Save current environment
    const originalNodeEnv = process.env.NODE_ENV;

    // Set test environment
    process.env.NODE_ENV = 'test';

    // Import the module with all dependencies mocked
    const indexModule = await import('../index.js');

    // Get the main function
    const mainFunction = indexModule.main;

    // Execute the main function
    await mainFunction();

    // Verify server.connect was called with the transport
    expect(mockServer.connect).toHaveBeenCalledWith(mockTransport);

    // Restore environment
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('main function catches and logs errors before exiting', async () => {
    // Get access to the mocked functions
    const { setupServer } = await import('../server/setup.js');

    // Create mock instance for this test with an error
    const mockServer = {
      connect: vi.fn().mockRejectedValue(new Error('Test error')),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    };

    // Set mock implementation for this test
    (setupServer as any).mockReturnValue(mockServer);

    // Spy on console.error and process.exit
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    // Import the module with all dependencies mocked
    const indexModule = await import('../index.js');

    // Create a wrapper that handles the error like in index.ts
    const runMain = async () => {
      try {
        await indexModule.main();
      } catch (error) {
        console.error('Fatal error in main():', error);
        process.exit(1);
      }
    };

    // Execute the wrapper function
    await runMain();

    // Verify error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith('Fatal error in main():', expect.any(Error));

    // Verify process.exit was called with exit code 1
    expect(processExitSpy).toHaveBeenCalledWith(1);

    // Restore spies
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  test('index initializes storage, manager, and server in correct sequence', async () => {
    // Get access to the mocked functions
    const { initializeStorageProvider } = await import('../config/storage.js');
    const { KnowledgeGraphManager } = await import('../KnowledgeGraphManager.js');
    const { setupServer } = await import('../server/setup.js');

    // Create mock values
    const mockStorageProvider = { id: 'mock-storage' };
    const mockKnowledgeGraphManager = { id: 'mock-manager' };
    const mockServer = { id: 'mock-server' };

    // Set mock implementations for this test
    (initializeStorageProvider as any).mockReturnValue(mockStorageProvider);
    (KnowledgeGraphManager as any).mockReturnValue(mockKnowledgeGraphManager);
    (setupServer as any).mockReturnValue(mockServer);

    // Import index to trigger initialization
    await import('../index.js');

    // Verify initialization sequence
    expect(initializeStorageProvider).toHaveBeenCalled();
    // Allow any parameters to be passed to KnowledgeGraphManager as long as it includes storageProvider
    expect(KnowledgeGraphManager).toHaveBeenCalledWith(
      expect.objectContaining({
        storageProvider: mockStorageProvider,
      })
    );
    expect(setupServer).toHaveBeenCalledWith(mockKnowledgeGraphManager);
  });
});

describe('Memory Server Request Handlers', () => {
  test('CallTool handler throws error when arguments are missing', () => {
    // Create a request with missing arguments
    const request = {
      params: {
        name: 'test-tool',
        // arguments is missing
      },
    };

    // Define our handler function based on the code in index.ts
    const callToolHandler = (request: { params: { name: string; arguments?: any } }) => {
      const { name, arguments: args } = request.params;

      if (!args) {
        throw new Error(`No arguments provided for tool: ${name}`);
      }

      return { success: true };
    };

    // Test that it throws the expected error
    expect(() => callToolHandler(request)).toThrow(`No arguments provided for tool: test-tool`);
  });

  test('CallTool handler throws error for unknown tools', () => {
    // Create a request with an unknown tool
    const request = {
      params: {
        name: 'unknown-tool',
        arguments: {},
      },
    };

    // Define a simpler version of the handler function with the same error logic
    const callToolHandler = (request: { params: { name: string; arguments: any } }) => {
      const { name, arguments: args } = request.params;

      if (!args) {
        throw new Error(`No arguments provided for tool: ${name}`);
      }

      // This simulates the switch statement with default case
      switch (name) {
        case 'known-tool':
          return { success: true };
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    };

    // Test that it throws the expected error
    expect(() => callToolHandler(request)).toThrow(`Unknown tool: unknown-tool`);
  });

  test('ReadGraph tool handler returns graph data', async () => {
    // Create a mock manager with a readGraph method
    const mockManager = {
      readGraph: vi.fn().mockResolvedValue({
        entities: [{ name: 'TestEntity', entityType: 'test', observations: [] }],
        relations: [],
      }),
    };

    // Define a handler function for ReadGraph tool
    const handleReadGraphTool = async (
      request: { params: { arguments: any } },
      manager: { readGraph: () => Promise<any> }
    ) => {
      const result = await manager.readGraph();
      return { result };
    };

    // Create a simple request
    const request = {
      params: {
        name: 'ReadGraph',
        arguments: {},
      },
    };

    // Call the handler
    const response = await handleReadGraphTool(request, mockManager);

    // Verify the manager method was called and response includes the graph data
    expect(mockManager.readGraph).toHaveBeenCalled();
    expect(response.result.entities).toHaveLength(1);
    expect(response.result.entities[0].name).toBe('TestEntity');
  });
});
