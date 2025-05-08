import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Neo4jConfig } from '../../storage/neo4j/Neo4jConfig';
import {
  ConnectionManagerFactory,
  SchemaManagerFactory,
  parseArgs,
  testConnection,
  initializeSchema,
} from '../neo4j-setup.js';

describe('Neo4j CLI Utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Silence console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('parseArgs', () => {
    it('should return default config when no arguments are provided', () => {
      const argv: string[] = [];
      const { config } = parseArgs(argv);

      expect(config.uri).toBe('bolt://localhost:7687');
      expect(config.username).toBe('neo4j');
      expect(config.password).toBe('memento_password');
    });

    it('should parse command line arguments correctly', () => {
      const argv = [
        '--uri',
        'bolt://custom-host:7687',
        '--username',
        'testuser',
        '--password',
        'testpass',
        '--database',
        'testdb',
      ];

      const { config } = parseArgs(argv);

      expect(config.uri).toBe('bolt://custom-host:7687');
      expect(config.username).toBe('testuser');
      expect(config.password).toBe('testpass');
      expect(config.database).toBe('testdb');
    });
  });

  describe('testConnection', () => {
    it('should test connection successfully', async () => {
      const config: Neo4jConfig = {
        uri: 'bolt://localhost:7687',
        username: 'neo4j',
        password: 'memento_password',
        database: 'neo4j',
        vectorIndexName: 'entity_embeddings',
        vectorDimensions: 1536,
        similarityFunction: 'cosine',
      };

      // Create mock session and connection manager
      const mockSession = {
        run: vi.fn().mockResolvedValue({
          records: [
            {
              get: vi.fn().mockImplementation((key) => ({
                toNumber: () => 1,
              })),
            },
          ],
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const mockConnectionManager = {
        getSession: vi.fn().mockResolvedValue(mockSession),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const mockConnectionManagerFactory: ConnectionManagerFactory = vi
        .fn()
        .mockReturnValue(mockConnectionManager);

      const result = await testConnection(config, true, mockConnectionManagerFactory);

      expect(result).toBe(true);
      expect(mockConnectionManager.getSession).toHaveBeenCalled();
      expect(mockConnectionManager.close).toHaveBeenCalled();
      expect(mockSession.run).toHaveBeenCalledWith('RETURN 1 as value');
      expect(mockSession.close).toHaveBeenCalled();
    });
  });

  describe('initializeSchema', () => {
    it('should initialize schema successfully', async () => {
      const config: Neo4jConfig = {
        uri: 'bolt://localhost:7687',
        username: 'neo4j',
        password: 'memento_password',
        database: 'neo4j',
        vectorIndexName: 'entity_embeddings',
        vectorDimensions: 1536,
        similarityFunction: 'cosine',
      };

      // Create mock connection and schema managers
      const mockConnectionManager = {
        getSession: vi.fn().mockResolvedValue({}),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const mockSchemaManager = {
        listConstraints: vi.fn().mockResolvedValue([]),
        listIndexes: vi.fn().mockResolvedValue([]),
        createEntityConstraints: vi.fn().mockResolvedValue(undefined),
        createVectorIndex: vi.fn().mockResolvedValue(undefined),
        vectorIndexExists: vi.fn().mockResolvedValue(true),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const mockConnectionManagerFactory: ConnectionManagerFactory = vi
        .fn()
        .mockReturnValue(mockConnectionManager);
      const mockSchemaManagerFactory: SchemaManagerFactory = vi
        .fn()
        .mockReturnValue(mockSchemaManager);

      await initializeSchema(
        config,
        true,
        false,
        mockConnectionManagerFactory,
        mockSchemaManagerFactory
      );

      expect(mockConnectionManagerFactory).toHaveBeenCalledWith(config);
      expect(mockSchemaManagerFactory).toHaveBeenCalledWith(mockConnectionManager, true);
      expect(mockSchemaManager.createEntityConstraints).toHaveBeenCalled();
      expect(mockSchemaManager.createVectorIndex).toHaveBeenCalledWith(
        'entity_embeddings',
        'Entity',
        'embedding',
        1536,
        'cosine',
        false
      );
      expect(mockSchemaManager.close).toHaveBeenCalled();
    });
  });
});
