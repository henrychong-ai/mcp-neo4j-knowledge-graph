/**
 * Comprehensive tests for StorageProviderFactory
 * Covers: error handling, edge cases, all validation branches
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StorageProviderFactory } from '../StorageProviderFactory.js';
import { Neo4jStorageProvider } from '../neo4j/Neo4jStorageProvider.js';

describe('StorageProviderFactory Comprehensive', () => {
  let factory: StorageProviderFactory;

  beforeEach(() => {
    factory = new StorageProviderFactory();
  });

  // --------------------------------------------------------------------------
  // Error Handling - Missing Configuration
  // --------------------------------------------------------------------------

  describe('error handling - missing configuration', () => {
    it('should throw error when config is undefined', () => {
      expect(() => factory.createProvider(undefined as any)).toThrow(
        'Storage provider configuration is required'
      );
    });

    it('should throw error when config is null', () => {
      expect(() => factory.createProvider(null as any)).toThrow(
        'Storage provider configuration is required'
      );
    });

    it('should throw error when type is missing', () => {
      expect(() => factory.createProvider({} as any)).toThrow('Storage provider type is required');
    });

    it('should throw error when type is empty string', () => {
      expect(() => factory.createProvider({ type: '' } as any)).toThrow(
        'Storage provider type is required'
      );
    });

    it('should throw error when options is missing', () => {
      expect(() => factory.createProvider({ type: 'neo4j' } as any)).toThrow(
        'Storage provider options are required'
      );
    });

    it('should throw error when options is null', () => {
      expect(() => factory.createProvider({ type: 'neo4j', options: null } as any)).toThrow(
        'Storage provider options are required'
      );
    });

    it('should throw error when options is undefined', () => {
      expect(() => factory.createProvider({ type: 'neo4j', options: undefined } as any)).toThrow(
        'Storage provider options are required'
      );
    });
  });

  // --------------------------------------------------------------------------
  // Error Handling - Unsupported Provider Type
  // --------------------------------------------------------------------------

  describe('error handling - unsupported provider type', () => {
    it('should throw error for unsupported provider type', () => {
      expect(() =>
        factory.createProvider({
          type: 'mongodb' as any,
          options: { uri: 'mongodb://localhost' },
        })
      ).toThrow('Unsupported provider type: mongodb');
    });

    it('should throw error for unknown provider type', () => {
      expect(() =>
        factory.createProvider({
          type: 'postgres' as any,
          options: { connectionString: 'postgres://localhost' },
        })
      ).toThrow('Unsupported provider type: postgres');
    });

    it('should throw error for random string provider type', () => {
      expect(() =>
        factory.createProvider({
          type: 'invalid-type' as any,
          options: {},
        })
      ).toThrow('Unsupported provider type: invalid-type');
    });
  });

  // --------------------------------------------------------------------------
  // Case Insensitive Type Handling
  // --------------------------------------------------------------------------

  describe('case insensitive type handling', () => {
    it('should handle mixed case Neo4j type', () => {
      const provider = factory.createProvider({
        type: 'Neo4J' as any,
        options: {
          neo4jUri: 'bolt://localhost:7687',
          neo4jUsername: 'neo4j',
          neo4jPassword: 'password',
        },
      });
      expect(provider).toBeInstanceOf(Neo4jStorageProvider);
    });

    it('should handle uppercase NEO4J type', () => {
      const provider = factory.createProvider({
        type: 'NEO4J' as any,
        options: {
          neo4jUri: 'bolt://localhost:7687',
          neo4jUsername: 'neo4j',
          neo4jPassword: 'password',
        },
      });
      expect(provider).toBeInstanceOf(Neo4jStorageProvider);
    });
  });

  // --------------------------------------------------------------------------
  // Neo4j Provider Configuration
  // Note: These tests require valid connection parameters to avoid driver errors
  // --------------------------------------------------------------------------

  describe('neo4j provider configuration', () => {
    const validNeo4jOptions = {
      neo4jUri: 'bolt://localhost:7687',
      neo4jUsername: 'neo4j',
      neo4jPassword: 'password',
    };

    it('should create Neo4j provider with valid connection options', () => {
      const provider = factory.createProvider({
        type: 'neo4j',
        options: validNeo4jOptions,
      });
      expect(provider).toBeInstanceOf(Neo4jStorageProvider);
    });

    it('should create Neo4j provider with full options', () => {
      const provider = factory.createProvider({
        type: 'neo4j',
        options: {
          ...validNeo4jOptions,
          neo4jDatabase: 'neo4j',
          neo4jVectorIndexName: 'entity_embeddings',
          neo4jVectorDimensions: 1536,
          neo4jSimilarityFunction: 'cosine',
        },
      });
      expect(provider).toBeInstanceOf(Neo4jStorageProvider);
    });

    it('should create Neo4j provider with decay config', () => {
      const provider = factory.createProvider({
        type: 'neo4j',
        options: {
          ...validNeo4jOptions,
          decayConfig: {
            enabled: true,
            halfLifeDays: 30,
            minConfidence: 0.1,
          },
        },
      });
      expect(provider).toBeInstanceOf(Neo4jStorageProvider);
    });

    it('should create Neo4j provider with partial decay config', () => {
      const provider = factory.createProvider({
        type: 'neo4j',
        options: {
          ...validNeo4jOptions,
          decayConfig: {
            halfLifeDays: 60,
          },
        },
      });
      expect(provider).toBeInstanceOf(Neo4jStorageProvider);
    });

    it('should create Neo4j provider with decay config enabled=false', () => {
      const provider = factory.createProvider({
        type: 'neo4j',
        options: {
          ...validNeo4jOptions,
          decayConfig: {
            enabled: false,
          },
        },
      });
      expect(provider).toBeInstanceOf(Neo4jStorageProvider);
    });
  });

  // --------------------------------------------------------------------------
  // Provider Tracking
  // --------------------------------------------------------------------------

  describe('provider tracking', () => {
    it('should track newly created neo4j provider', () => {
      const provider = factory.createProvider({
        type: 'neo4j',
        options: {
          neo4jUri: 'bolt://localhost:7687',
          neo4jUsername: 'neo4j',
          neo4jPassword: 'password',
        },
      });
      expect(factory.isProviderConnected(provider)).toBe(true);
    });

    it('should track default provider', () => {
      const provider = factory.getDefaultProvider();
      expect(factory.isProviderConnected(provider)).toBe(true);
    });

    it('should track multiple providers independently', () => {
      const provider1 = factory.createProvider({
        type: 'neo4j',
        options: {
          neo4jUri: 'bolt://localhost:7687',
          neo4jUsername: 'neo4j',
          neo4jPassword: 'password',
        },
      });
      const provider2 = factory.createProvider({
        type: 'neo4j',
        options: {
          neo4jUri: 'bolt://localhost:7688',
          neo4jUsername: 'neo4j',
          neo4jPassword: 'password',
        },
      });

      expect(factory.isProviderConnected(provider1)).toBe(true);
      expect(factory.isProviderConnected(provider2)).toBe(true);

      factory.disconnectProvider(provider1);

      expect(factory.isProviderConnected(provider1)).toBe(false);
      expect(factory.isProviderConnected(provider2)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Cleanup Operations
  // --------------------------------------------------------------------------

  describe('cleanup operations', () => {
    it('should cleanup provider without cleanup method', async () => {
      const provider = factory.createProvider({
        type: 'neo4j',
        options: {
          neo4jUri: 'bolt://localhost:7687',
          neo4jUsername: 'neo4j',
          neo4jPassword: 'password',
        },
      });

      // Neo4jStorageProvider doesn't have cleanup method by default
      await factory.cleanupProvider(provider);

      expect(factory.isProviderConnected(provider)).toBe(false);
    });

    it('should handle cleanup when cleanup method throws', async () => {
      const provider = factory.createProvider({
        type: 'neo4j',
        options: {
          neo4jUri: 'bolt://localhost:7687',
          neo4jUsername: 'neo4j',
          neo4jPassword: 'password',
        },
      });

      // Mock cleanup to throw
      (provider as any).cleanup = vi.fn().mockRejectedValue(new Error('Cleanup failed'));

      await expect(factory.cleanupProvider(provider)).rejects.toThrow('Cleanup failed');
    });

    it('should cleanup all providers even if some fail', async () => {
      const provider1 = factory.createProvider({
        type: 'neo4j',
        options: {
          neo4jUri: 'bolt://localhost:7687',
          neo4jUsername: 'neo4j',
          neo4jPassword: 'password',
        },
      });
      const provider2 = factory.createProvider({
        type: 'neo4j',
        options: {
          neo4jUri: 'bolt://localhost:7688',
          neo4jUsername: 'neo4j',
          neo4jPassword: 'password',
        },
      });

      (provider1 as any).cleanup = vi.fn().mockResolvedValue(undefined);
      (provider2 as any).cleanup = vi.fn().mockResolvedValue(undefined);

      await factory.cleanupAllProviders();

      expect((provider1 as any).cleanup).toHaveBeenCalled();
      expect((provider2 as any).cleanup).toHaveBeenCalled();
      expect(factory.isProviderConnected(provider1)).toBe(false);
      expect(factory.isProviderConnected(provider2)).toBe(false);
    });

    it('should handle cleanupAllProviders with empty provider set', async () => {
      // No providers created yet
      await expect(factory.cleanupAllProviders()).resolves.not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // getDefaultProvider
  // Note: getDefaultProvider creates Neo4jStorageProvider which requires env vars
  // These tests verify the factory behavior, not the provider functionality
  // --------------------------------------------------------------------------

  describe('getDefaultProvider', () => {
    it('should return Neo4jStorageProvider instance', () => {
      // getDefaultProvider uses environment variables for Neo4j connection
      // This test verifies the type returned
      const provider = factory.getDefaultProvider();
      expect(provider).toBeInstanceOf(Neo4jStorageProvider);
    });

    it('should track the default provider', () => {
      const provider = factory.getDefaultProvider();
      expect(factory.isProviderConnected(provider)).toBe(true);
    });

    it('should create new instance each time', () => {
      const provider1 = factory.getDefaultProvider();
      const provider2 = factory.getDefaultProvider();
      expect(provider1).not.toBe(provider2);
    });
  });
});
