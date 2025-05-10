/**
 * Test file for the storage configuration module
 * Migrated from Jest to Vitest and converted to TypeScript
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import path from 'path';

// Define types for the module under test
type StorageType = 'neo4j';
interface StorageConfig {
  type: StorageType;
  options: {
    neo4jUri?: string;
    neo4jUsername?: string;
    neo4jPassword?: string;
    neo4jDatabase?: string;
    neo4jVectorIndexName?: string;
    neo4jVectorDimensions?: number;
    neo4jSimilarityFunction?: 'cosine' | 'euclidean';
  };
}

// Vitest auto-mocks - these must be before any imports
vi.mock('../../storage/StorageProviderFactory');
vi.mock('../../storage/VectorStoreFactory.js');

// Now import the module under test after all mocks are set up
import {
  initializeStorageProvider,
  createStorageConfig,
  determineStorageType,
} from '../storage.js';
import { StorageProviderFactory } from '../../storage/StorageProviderFactory.js';
import { VectorStoreFactory } from '../../storage/VectorStoreFactory.js';

describe('storage configuration module', () => {
  let storageModule: typeof import('../storage');
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  beforeEach(async () => {
    // Reset all mocks
    vi.resetAllMocks();
    vi.resetModules();

    // Set up default mock implementations
    vi.mocked(StorageProviderFactory.prototype.createProvider).mockReturnValue({
      mockedProvider: true,
    } as any);

    // Import the module under test (after mocking)
    storageModule = await import('../storage');
  });

  afterEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('determineStorageType', () => {
    it('should always return "neo4j" regardless of input', () => {
      expect(storageModule.determineStorageType('chroma')).toBe('neo4j');
      expect(storageModule.determineStorageType('sqlite')).toBe('neo4j');
      expect(storageModule.determineStorageType('file')).toBe('neo4j');
      expect(storageModule.determineStorageType('other')).toBe('neo4j');
      expect(storageModule.determineStorageType('')).toBe('neo4j');
      expect(storageModule.determineStorageType(undefined)).toBe('neo4j');
    });
  });

  describe('createStorageConfig', () => {
    it('should create a neo4j storage config with default values', () => {
      // Act
      const result = storageModule.createStorageConfig('neo4j');

      // Assert
      expect(result).toEqual({
        type: 'neo4j',
        options: {
          neo4jUri: 'bolt://localhost:7687',
          neo4jUsername: 'neo4j',
          neo4jPassword: 'memento_password',
          neo4jDatabase: 'neo4j',
          neo4jVectorIndexName: 'entity_embeddings',
          neo4jVectorDimensions: 1536,
          neo4jSimilarityFunction: 'cosine',
        },
      });
    });

    it('should create a neo4j storage config with custom environment values', () => {
      // Arrange
      process.env.NEO4J_URI = 'bolt://custom:7687';
      process.env.NEO4J_USERNAME = 'custom_user';
      process.env.NEO4J_PASSWORD = 'custom_pass';
      process.env.NEO4J_DATABASE = 'custom_db';
      process.env.NEO4J_VECTOR_INDEX = 'custom_index';
      process.env.NEO4J_VECTOR_DIMENSIONS = '768';
      process.env.NEO4J_SIMILARITY_FUNCTION = 'euclidean';

      // Act
      const result = storageModule.createStorageConfig('neo4j');

      // Assert
      expect(result).toEqual({
        type: 'neo4j',
        options: {
          neo4jUri: 'bolt://custom:7687',
          neo4jUsername: 'custom_user',
          neo4jPassword: 'custom_pass',
          neo4jDatabase: 'custom_db',
          neo4jVectorIndexName: 'custom_index',
          neo4jVectorDimensions: 768,
          neo4jSimilarityFunction: 'euclidean',
        },
      });
    });

    it('should use undefined input correctly', () => {
      // Act
      const result = storageModule.createStorageConfig(undefined);

      // Assert
      expect(result).toEqual({
        type: 'neo4j',
        options: {
          neo4jUri: 'bolt://localhost:7687',
          neo4jUsername: 'neo4j',
          neo4jPassword: 'memento_password',
          neo4jDatabase: 'neo4j',
          neo4jVectorIndexName: 'entity_embeddings',
          neo4jVectorDimensions: 1536,
          neo4jSimilarityFunction: 'cosine',
        },
      });
    });
  });

  describe('initializeStorageProvider', () => {
    it('should create a Neo4j storage provider with environment variables', async () => {
      // Arrange
      process.env.MEMORY_STORAGE_TYPE = 'neo4j';
      process.env.NEO4J_URI = 'bolt://test-neo4j:7687';

      // Act
      const result = storageModule.initializeStorageProvider();

      // Assert
      expect(vi.mocked(StorageProviderFactory.prototype.createProvider)).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'neo4j',
          options: expect.objectContaining({
            neo4jUri: 'bolt://test-neo4j:7687',
          }),
        })
      );
      expect(result).toEqual({ mockedProvider: true });
    });

    it('should create a Neo4j storage provider with default values', async () => {
      // Act
      const result = storageModule.initializeStorageProvider();

      // Assert
      expect(vi.mocked(StorageProviderFactory.prototype.createProvider)).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'neo4j',
          options: expect.objectContaining({
            neo4jUri: 'bolt://localhost:7687',
            neo4jUsername: 'neo4j',
            neo4jPassword: 'memento_password',
            neo4jDatabase: 'neo4j',
            neo4jVectorIndexName: 'entity_embeddings',
            neo4jVectorDimensions: 1536,
            neo4jSimilarityFunction: 'cosine',
          }),
        })
      );
      expect(result).toEqual({ mockedProvider: true });
    });
  });
});
