import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Neo4jConnectionManager, Neo4jConnectionOptions } from '../../neo4j/Neo4jConnectionManager';
import neo4j from 'neo4j-driver';

// Mock the neo4j driver
vi.mock('neo4j-driver', () => {
  // Create properly typed mock functions
  const mockRun = vi.fn().mockResolvedValue({ records: [] });
  const mockClose = vi.fn();

  const mockSession = {
    run: mockRun,
    close: mockClose,
  };

  const mockSessionFn = vi.fn().mockReturnValue(mockSession);
  const mockDriverClose = vi.fn();

  const mockDriver = {
    session: mockSessionFn,
    close: mockDriverClose,
  };

  const mockDriverFn = vi.fn().mockReturnValue(mockDriver);

  return {
    default: {
      auth: {
        basic: vi.fn().mockReturnValue('mock-auth'),
      },
      driver: mockDriverFn,
    },
  };
});

describe('Neo4jConnectionManager', () => {
  let connectionManager: Neo4jConnectionManager;
  const defaultOptions: Neo4jConnectionOptions = {
    uri: 'bolt://localhost:7687',
    username: 'neo4j',
    password: 'memento_password',
    database: 'neo4j',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (connectionManager) {
      await connectionManager.close();
    }
  });

  it('should create a connection with default options', () => {
    connectionManager = new Neo4jConnectionManager();

    expect(neo4j.driver).toHaveBeenCalledWith('bolt://localhost:7687', 'mock-auth', {});
  });

  it('should create a connection with custom options', () => {
    const customOptions: Neo4jConnectionOptions = {
      uri: 'bolt://custom-host:7687',
      username: 'custom-user',
      password: 'custom-pass',
      database: 'custom-db',
    };

    connectionManager = new Neo4jConnectionManager(customOptions);

    expect(neo4j.driver).toHaveBeenCalledWith('bolt://custom-host:7687', 'mock-auth', {});
    expect(neo4j.auth.basic).toHaveBeenCalledWith('custom-user', 'custom-pass');
  });

  it('should create a session with the configured database', async () => {
    connectionManager = new Neo4jConnectionManager(defaultOptions);
    const session = await connectionManager.getSession();

    // Get mockDriver result to access session method (with proper types)
    const mockDriverInstance = (neo4j.driver as unknown as ReturnType<typeof vi.fn>)();
    expect(mockDriverInstance.session).toHaveBeenCalledWith({
      database: 'neo4j',
    });
    expect(session).toBeDefined();
  });

  it('should close the driver connection', async () => {
    connectionManager = new Neo4jConnectionManager();
    await connectionManager.close();

    // Get mockDriver result to access close method (with proper types)
    const mockDriverInstance = (neo4j.driver as unknown as ReturnType<typeof vi.fn>)();
    expect(mockDriverInstance.close).toHaveBeenCalled();
  });

  it('should execute a query and return results', async () => {
    connectionManager = new Neo4jConnectionManager();
    const mockResult = { records: [{ get: () => 'test' }] };

    // Access the mocked session and mock its run method for this test
    const mockDriverInstance = (neo4j.driver as unknown as ReturnType<typeof vi.fn>)();
    const sessionInstance = mockDriverInstance.session();

    // Type assertion for mock methods
    const mockRun = sessionInstance.run as ReturnType<typeof vi.fn>;
    mockRun.mockResolvedValueOnce(mockResult);

    const result = await connectionManager.executeQuery('MATCH (n) RETURN n', {});

    expect(mockRun).toHaveBeenCalledWith('MATCH (n) RETURN n', {});
    expect(result).toBe(mockResult);
    expect(sessionInstance.close).toHaveBeenCalled();
  });
});
