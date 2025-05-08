/**
 * Test file for the server setup module
 * Migrated from Jest to Vitest and converted to TypeScript
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Turn off automatic mocking
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  return {
    Server: vi.fn(function () {
      return {
        _serverInfo: {
          name: 'memento-mcp',
          version: '1.0.0',
          description: 'Memento MCP: Your persistent knowledge graph memory system',
          publisher: 'gannonh',
        },
        _options: {
          capabilities: {
            tools: {},
            serverInfo: {},
            notifications: {},
            logging: {},
          },
        },
        setRequestHandler: vi.fn(),
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

// Define schemas
vi.mock('@modelcontextprotocol/sdk/types.js', () => {
  return {
    ListToolsRequestSchema: 'ListToolsRequestSchema',
    CallToolRequestSchema: 'CallToolRequestSchema',
  };
});

// Mock handler functions
const mockListToolsResult = { result: 'list tools response' };
const mockCallToolResult = { result: 'call tool response' };

vi.mock('../handlers/listToolsHandler.js', () => {
  return {
    handleListToolsRequest: vi.fn().mockResolvedValue(mockListToolsResult),
  };
});

vi.mock('../handlers/callToolHandler.js', () => {
  return {
    handleCallToolRequest: vi.fn().mockResolvedValue(mockCallToolResult),
  };
});

describe('setupServer', () => {
  let ServerMock: any;
  let mockServerInstance: any;
  let handleListToolsRequestMock: any;
  let handleCallToolRequestMock: any;

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();

    // Import the mocked modules
    const serverModule = await import('@modelcontextprotocol/sdk/server/index.js');
    const handlersModule1 = await import('../handlers/listToolsHandler.js');
    const handlersModule2 = await import('../handlers/callToolHandler.js');

    // Get the mocks
    ServerMock = serverModule.Server;
    handleListToolsRequestMock = handlersModule1.handleListToolsRequest;
    handleCallToolRequestMock = handlersModule2.handleCallToolRequest;

    // The first instance created by the constructor will be used in the tests
    mockServerInstance = undefined;
    ServerMock.mockImplementation(function (serverInfo, options) {
      const instance = {
        _serverInfo: serverInfo,
        _options: options,
        setRequestHandler: vi.fn(),
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
      };

      if (!mockServerInstance) {
        mockServerInstance = instance;
      }

      return mockServerInstance;
    });
  });

  it('should create a server with the correct configuration', async () => {
    // Import the module under test
    const setupModule = await import('../setup.js');

    // Act
    const knowledgeGraphManager = {};
    const result = setupModule.setupServer(knowledgeGraphManager);

    // Assert server was created with the right parameters
    expect(ServerMock).toHaveBeenCalledWith(
      {
        name: 'memento-mcp',
        version: '1.0.0',
        description: 'Memento MCP: Your persistent knowledge graph memory system',
        publisher: 'gannonh',
      },
      {
        capabilities: {
          tools: {},
          serverInfo: {},
          notifications: {},
          logging: {},
        },
      }
    );

    // Assert server instance was returned
    expect(result).toBe(mockServerInstance);
  });

  it('should register request handlers', async () => {
    // Import the module under test
    const setupModule = await import('../setup.js');
    const typesModule = await import('@modelcontextprotocol/sdk/types.js');

    // Act
    const knowledgeGraphManager = {};
    setupModule.setupServer(knowledgeGraphManager);

    // Assert handlers were registered
    expect(mockServerInstance.setRequestHandler).toHaveBeenCalledTimes(2);
    expect(mockServerInstance.setRequestHandler).toHaveBeenCalledWith(
      typesModule.ListToolsRequestSchema,
      expect.any(Function)
    );
    expect(mockServerInstance.setRequestHandler).toHaveBeenCalledWith(
      typesModule.CallToolRequestSchema,
      expect.any(Function)
    );
  });

  it('should call handleListToolsRequest when handling ListTools requests', async () => {
    // Import the module under test
    const setupModule = await import('../setup.js');
    const typesModule = await import('@modelcontextprotocol/sdk/types.js');

    // Act
    const knowledgeGraphManager = {};
    setupModule.setupServer(knowledgeGraphManager);

    // Get the handler function that was registered
    const calls = mockServerInstance.setRequestHandler.mock.calls;
    const listToolsHandlerCall = calls.find(
      (call) => call[0] === typesModule.ListToolsRequestSchema
    );
    expect(listToolsHandlerCall).toBeDefined();

    if (listToolsHandlerCall) {
      const handler = listToolsHandlerCall[1];
      const request = { type: 'ListToolsRequest' };

      // Call the handler
      const result = await handler(request);

      // Verify handler was called and returned expected result
      expect(handleListToolsRequestMock).toHaveBeenCalled();
      expect(result).toEqual(mockListToolsResult);
    }
  });

  it('should call handleCallToolRequest with request and knowledgeGraphManager', async () => {
    // Import the module under test
    const setupModule = await import('../setup.js');
    const typesModule = await import('@modelcontextprotocol/sdk/types.js');

    // Act
    const knowledgeGraphManager = { name: 'test-manager' };
    setupModule.setupServer(knowledgeGraphManager);

    // Get the handler function that was registered
    const calls = mockServerInstance.setRequestHandler.mock.calls;
    const callToolHandlerCall = calls.find((call) => call[0] === typesModule.CallToolRequestSchema);
    expect(callToolHandlerCall).toBeDefined();

    if (callToolHandlerCall) {
      const handler = callToolHandlerCall[1];
      const request = {
        type: 'CallToolRequest',
        params: {
          name: 'test-tool',
          arguments: { arg1: 'value1' },
        },
      };

      // Call the handler
      const result = await handler(request);

      // Verify handler was called with correct args and returned expected result
      expect(handleCallToolRequestMock).toHaveBeenCalledWith(request, knowledgeGraphManager);
      expect(result).toEqual(mockCallToolResult);
    }
  });
});
