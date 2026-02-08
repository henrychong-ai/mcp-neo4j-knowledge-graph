/**
 * Test file for the StorageProviderFactory
 * Migrated from Jest to Vitest and converted to TypeScript
 */
import { describe, it, expect, vi } from 'vitest';
import { StorageProviderFactory } from '../StorageProviderFactory.js';
import { Neo4jStorageProvider } from '../neo4j/Neo4jStorageProvider.js';

// Define types from the module
type StorageProviderType = 'neo4j';
interface StorageProviderConfig {
  type: StorageProviderType;
  options: Record<string, any>;
}

describe('StorageProviderFactory', () => {
  describe('creation', () => {
    it('should create a factory instance', () => {
      const factory = new StorageProviderFactory();
      expect(factory).toBeInstanceOf(StorageProviderFactory);
    });
  });

  describe('provider creation', () => {
    it('should create a Neo4jStorageProvider when type is "neo4j"', () => {
      // Arrange
      const factory = new StorageProviderFactory();
      const config: StorageProviderConfig = {
        type: 'neo4j',
        options: {
          neo4jUri: 'bolt://localhost:7687',
          neo4jUsername: 'neo4j',
          neo4jPassword: 'password',
        },
      };

      // Act
      const provider = factory.createProvider(config);

      // Assert
      expect(provider).toBeInstanceOf(Neo4jStorageProvider);
    });

    it('should throw error for missing configuration', () => {
      // Arrange
      const factory = new StorageProviderFactory();

      // Act & Assert
      expect(() => factory.createProvider(undefined as any)).toThrow(
        'Storage provider configuration is required'
      );
      expect(() => factory.createProvider(null as any)).toThrow(
        'Storage provider configuration is required'
      );
      expect(() => factory.createProvider({} as any)).toThrow('Storage provider type is required');
    });

    it('should use default Neo4j provider when getDefaultProvider is called', () => {
      // Arrange
      const factory = new StorageProviderFactory();

      // Act
      const provider = factory.getDefaultProvider();

      // Assert
      expect(provider).toBeInstanceOf(Neo4jStorageProvider);
    });
  });

  describe('provider connection management', () => {
    it('should check if a provider is connected', () => {
      // Arrange
      const factory = new StorageProviderFactory();
      const config: StorageProviderConfig = {
        type: 'neo4j',
        options: {
          neo4jUri: 'bolt://localhost:7687',
          neo4jUsername: 'neo4j',
          neo4jPassword: 'password',
        },
      };
      const provider = factory.createProvider(config);

      // Act & Assert
      expect(factory.isProviderConnected(provider)).toBe(true);
    });

    it('should disconnect a provider', () => {
      // Arrange
      const factory = new StorageProviderFactory();
      const config: StorageProviderConfig = {
        type: 'neo4j',
        options: {
          neo4jUri: 'bolt://localhost:7687',
          neo4jUsername: 'neo4j',
          neo4jPassword: 'password',
        },
      };
      const provider = factory.createProvider(config);

      // Act
      factory.disconnectProvider(provider);

      // Assert
      expect(factory.isProviderConnected(provider)).toBe(false);
    });

    it('should handle disconnecting an unconnected provider', () => {
      // Arrange
      const factory = new StorageProviderFactory();
      const config: StorageProviderConfig = {
        type: 'neo4j',
        options: {
          neo4jUri: 'bolt://localhost:7687',
          neo4jUsername: 'neo4j',
          neo4jPassword: 'password',
        },
      };
      const provider = factory.createProvider(config);
      factory.disconnectProvider(provider); // Disconnect once

      // Act
      factory.disconnectProvider(provider); // Disconnect again

      // Assert
      expect(factory.isProviderConnected(provider)).toBe(false);
    });

    it('should cleanup provider resources', async () => {
      // Arrange
      const factory = new StorageProviderFactory();
      const config: StorageProviderConfig = {
        type: 'neo4j',
        options: {
          neo4jUri: 'bolt://localhost:7687',
          neo4jUsername: 'neo4j',
          neo4jPassword: 'password',
        },
      };
      const provider = factory.createProvider(config);

      // Mock cleanup method after provider is created
      (provider as any).cleanup = vi.fn().mockResolvedValue(undefined);

      // Act
      await factory.cleanupProvider(provider);

      // Assert
      expect((provider as any).cleanup).toHaveBeenCalled();
      expect(factory.isProviderConnected(provider)).toBe(false);
    });

    it('should handle cleanup of already disconnected provider', () => {
      // Arrange
      const factory = new StorageProviderFactory();
      const config: StorageProviderConfig = {
        type: 'neo4j',
        options: {
          neo4jUri: 'bolt://localhost:7687',
          neo4jUsername: 'neo4j',
          neo4jPassword: 'password',
        },
      };
      const provider = factory.createProvider(config);
      factory.disconnectProvider(provider);

      // Act & Assert
      expect(() => factory.cleanupProvider(provider)).not.toThrow();
    });

    it('should cleanup multiple providers', async () => {
      // Arrange
      const factory = new StorageProviderFactory();
      const neo4jConfig1: StorageProviderConfig = {
        type: 'neo4j',
        options: {
          neo4jUri: 'bolt://localhost:7687',
          neo4jUsername: 'neo4j',
          neo4jPassword: 'password',
        },
      };
      const neo4jConfig2: StorageProviderConfig = {
        type: 'neo4j',
        options: {
          neo4jUri: 'bolt://localhost:7688',
          neo4jUsername: 'neo4j',
          neo4jPassword: 'password',
        },
      };
      const provider1 = factory.createProvider(neo4jConfig1);
      const provider2 = factory.createProvider(neo4jConfig2);

      // Mock cleanup methods
      (provider1 as any).cleanup = vi.fn().mockResolvedValue(undefined);
      (provider2 as any).cleanup = vi.fn().mockResolvedValue(undefined);

      // Act
      await factory.cleanupAllProviders();

      // Assert
      expect((provider1 as any).cleanup).toHaveBeenCalled();
      expect((provider2 as any).cleanup).toHaveBeenCalled();
      expect(factory.isProviderConnected(provider1)).toBe(false);
      expect(factory.isProviderConnected(provider2)).toBe(false);
    });
  });
});
