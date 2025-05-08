/**
 * Test file for the StorageProviderFactory
 * Migrated from Jest to Vitest and converted to TypeScript
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { StorageProviderFactory } from '../StorageProviderFactory.js';
import { FileStorageProvider } from '../FileStorageProvider.js';
import { Neo4jStorageProvider } from '../neo4j/Neo4jStorageProvider.js';
import { StorageProvider } from '../StorageProvider.js';
import path from 'path';
import fs from 'fs';

// Define types from the module
type StorageProviderType = 'file' | 'neo4j';
interface StorageProviderConfig {
  type: StorageProviderType;
  options: Record<string, any>;
}

// Test directory setup
const testDir = path.join(process.cwd(), 'test-output', 'storage-provider-factory');
const testJsonPath = path.join(testDir, 'test.json');

// Ensure test directory exists
beforeEach(() => {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  // Clean up any existing test files
  if (fs.existsSync(testJsonPath)) {
    fs.unlinkSync(testJsonPath);
  }
});

// Clean up after all tests
afterAll(() => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

describe('StorageProviderFactory', () => {
  describe('creation', () => {
    it('should create a factory instance', () => {
      const factory = new StorageProviderFactory();
      expect(factory).toBeInstanceOf(StorageProviderFactory);
    });
  });

  describe('provider creation', () => {
    it('should create a FileStorageProvider when type is "file"', () => {
      // Arrange
      const factory = new StorageProviderFactory();
      const config: StorageProviderConfig = {
        type: 'file',
        options: {
          memoryFilePath: testJsonPath,
        },
      };

      // Act
      const provider = factory.createProvider(config);

      // Assert
      expect(provider).toBeInstanceOf(FileStorageProvider);
    });

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
        type: 'file',
        options: {
          memoryFilePath: testJsonPath,
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
        type: 'file',
        options: {
          memoryFilePath: testJsonPath,
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
        type: 'file',
        options: {
          memoryFilePath: testJsonPath,
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
        type: 'file',
        options: {
          memoryFilePath: testJsonPath,
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
        type: 'file',
        options: {
          memoryFilePath: testJsonPath,
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
      const fileConfig: StorageProviderConfig = {
        type: 'file',
        options: {
          memoryFilePath: testJsonPath,
        },
      };
      const neo4jConfig: StorageProviderConfig = {
        type: 'neo4j',
        options: {
          neo4jUri: 'bolt://localhost:7687',
          neo4jUsername: 'neo4j',
          neo4jPassword: 'password',
        },
      };
      const fileProvider = factory.createProvider(fileConfig);
      const neo4jProvider = factory.createProvider(neo4jConfig);

      // Mock cleanup methods
      (fileProvider as any).cleanup = vi.fn().mockResolvedValue(undefined);
      (neo4jProvider as any).cleanup = vi.fn().mockResolvedValue(undefined);

      // Act
      await factory.cleanupAllProviders();

      // Assert
      expect((fileProvider as any).cleanup).toHaveBeenCalled();
      expect((neo4jProvider as any).cleanup).toHaveBeenCalled();
      expect(factory.isProviderConnected(fileProvider)).toBe(false);
      expect(factory.isProviderConnected(neo4jProvider)).toBe(false);
    });
  });
});
