/**
 * Comprehensive tests for EmbeddingServiceFactory
 * Covers: provider registration, service creation, environment-based creation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DefaultEmbeddingService } from '../DefaultEmbeddingService.js';
import { EmbeddingServiceFactory } from '../EmbeddingServiceFactory.js';
import { OpenAIEmbeddingService } from '../OpenAIEmbeddingService.js';

// Mock the logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('EmbeddingServiceFactory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.MOCK_EMBEDDINGS;
    delete process.env.OPENAI_EMBEDDING_MODEL;
    // Reset the factory to clean state - registry is preserved across tests
    // Note: resetRegistry clears providers, so we need to be careful
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Provider Registration Tests
  // --------------------------------------------------------------------------

  describe('registerProvider', () => {
    it('should register a custom provider', () => {
      const customProvider = vi.fn().mockReturnValue(new DefaultEmbeddingService());

      EmbeddingServiceFactory.registerProvider('custom', customProvider);

      const providers = EmbeddingServiceFactory.getAvailableProviders();
      expect(providers).toContain('custom');
    });

    it('should register provider with lowercase name', () => {
      const customProvider = vi.fn().mockReturnValue(new DefaultEmbeddingService());

      EmbeddingServiceFactory.registerProvider('UPPERCASE', customProvider);

      const providers = EmbeddingServiceFactory.getAvailableProviders();
      expect(providers).toContain('uppercase');
    });
  });

  describe('resetRegistry', () => {
    it('should clear all registered providers', () => {
      // Register a test provider
      EmbeddingServiceFactory.registerProvider('test-reset', vi.fn());

      EmbeddingServiceFactory.resetRegistry();

      const providers = EmbeddingServiceFactory.getAvailableProviders();
      expect(providers).not.toContain('test-reset');
    });
  });

  describe('getAvailableProviders', () => {
    it('should return array of provider names', () => {
      // First reset to clean state
      EmbeddingServiceFactory.resetRegistry();

      // Register known providers
      EmbeddingServiceFactory.registerProvider('provider1', vi.fn());
      EmbeddingServiceFactory.registerProvider('provider2', vi.fn());

      const providers = EmbeddingServiceFactory.getAvailableProviders();

      expect(Array.isArray(providers)).toBe(true);
      expect(providers).toContain('provider1');
      expect(providers).toContain('provider2');
    });
  });

  // --------------------------------------------------------------------------
  // createService Tests
  // --------------------------------------------------------------------------

  describe('createService', () => {
    beforeEach(() => {
      // Reset and re-register default providers
      EmbeddingServiceFactory.resetRegistry();
      EmbeddingServiceFactory.registerProvider('default', (config = {}) => {
        return new DefaultEmbeddingService(config.dimensions);
      });
      EmbeddingServiceFactory.registerProvider('openai', (config = {}) => {
        if (!config.apiKey) {
          throw new Error('API key is required for OpenAI embedding service');
        }
        return new OpenAIEmbeddingService({
          apiKey: config.apiKey,
          model: config.model,
          dimensions: config.dimensions,
        });
      });
    });

    it('should create service with default provider when no config provided', () => {
      const service = EmbeddingServiceFactory.createService();

      expect(service).toBeInstanceOf(DefaultEmbeddingService);
    });

    it('should create service with specified provider', () => {
      const service = EmbeddingServiceFactory.createService({
        provider: 'default',
        dimensions: 768,
      });

      expect(service).toBeInstanceOf(DefaultEmbeddingService);
    });

    it('should create OpenAI service with valid config', () => {
      const service = EmbeddingServiceFactory.createService({
        provider: 'openai',
        apiKey: 'test-api-key',
        model: 'text-embedding-3-small',
      });

      expect(service).toBeInstanceOf(OpenAIEmbeddingService);
    });

    it('should throw error for unregistered provider', () => {
      expect(() => {
        EmbeddingServiceFactory.createService({
          provider: 'nonexistent',
        });
      }).toThrow('Provider "nonexistent" is not registered');
    });

    it('should rethrow error when provider throws', () => {
      EmbeddingServiceFactory.registerProvider('failing', () => {
        throw new Error('Provider initialization failed');
      });

      expect(() => {
        EmbeddingServiceFactory.createService({ provider: 'failing' });
      }).toThrow('Provider initialization failed');
    });

    it('should handle case-insensitive provider names', () => {
      const service = EmbeddingServiceFactory.createService({
        provider: 'DEFAULT',
      });

      expect(service).toBeInstanceOf(DefaultEmbeddingService);
    });
  });

  // --------------------------------------------------------------------------
  // createFromEnvironment Tests
  // --------------------------------------------------------------------------

  describe('createFromEnvironment', () => {
    it('should return DefaultEmbeddingService when MOCK_EMBEDDINGS is true', () => {
      process.env.MOCK_EMBEDDINGS = 'true';

      const service = EmbeddingServiceFactory.createFromEnvironment();

      expect(service).toBeInstanceOf(DefaultEmbeddingService);
    });

    it('should return OpenAIEmbeddingService when API key is set', () => {
      process.env.OPENAI_API_KEY = 'test-api-key';

      const service = EmbeddingServiceFactory.createFromEnvironment();

      expect(service).toBeInstanceOf(OpenAIEmbeddingService);
    });

    it('should use custom model from environment', () => {
      process.env.OPENAI_API_KEY = 'test-api-key';
      process.env.OPENAI_EMBEDDING_MODEL = 'text-embedding-ada-002';

      const service = EmbeddingServiceFactory.createFromEnvironment();

      expect(service.getModelInfo().name).toBe('text-embedding-ada-002');
    });

    it('should return DefaultEmbeddingService when no API key is set', () => {
      const service = EmbeddingServiceFactory.createFromEnvironment();

      expect(service).toBeInstanceOf(DefaultEmbeddingService);
    });

    it('should fallback to DefaultEmbeddingService when OpenAI creation fails', () => {
      process.env.OPENAI_API_KEY = ''; // Empty key triggers error in OpenAI constructor

      const service = EmbeddingServiceFactory.createFromEnvironment();

      expect(service).toBeInstanceOf(DefaultEmbeddingService);
    });
  });

  // --------------------------------------------------------------------------
  // createOpenAIService Tests
  // --------------------------------------------------------------------------

  describe('createOpenAIService', () => {
    it('should create OpenAI service with API key', () => {
      const service = EmbeddingServiceFactory.createOpenAIService('test-api-key');

      expect(service).toBeInstanceOf(OpenAIEmbeddingService);
    });

    it('should create OpenAI service with custom model', () => {
      const service = EmbeddingServiceFactory.createOpenAIService('test-api-key', 'custom-model');

      expect(service.getModelInfo().name).toBe('custom-model');
    });

    it('should create OpenAI service with custom dimensions', () => {
      const service = EmbeddingServiceFactory.createOpenAIService('test-api-key', undefined, 768);

      expect(service.getModelInfo().dimensions).toBe(768);
    });
  });

  // --------------------------------------------------------------------------
  // createDefaultService Tests
  // --------------------------------------------------------------------------

  describe('createDefaultService', () => {
    it('should create default service with default dimensions', () => {
      const service = EmbeddingServiceFactory.createDefaultService();

      expect(service).toBeInstanceOf(DefaultEmbeddingService);
      expect(service.getModelInfo().dimensions).toBe(1536);
    });

    it('should create default service with custom dimensions', () => {
      const service = EmbeddingServiceFactory.createDefaultService(768);

      expect(service.getModelInfo().dimensions).toBe(768);
    });
  });

  // --------------------------------------------------------------------------
  // Built-in Provider Tests
  // --------------------------------------------------------------------------

  describe('built-in providers', () => {
    beforeEach(() => {
      // Reset and re-register to ensure clean state
      EmbeddingServiceFactory.resetRegistry();
      // Re-register built-in providers (simulating module load)
      EmbeddingServiceFactory.registerProvider('default', (config = {}) => {
        return new DefaultEmbeddingService(config.dimensions);
      });
      EmbeddingServiceFactory.registerProvider('openai', (config = {}) => {
        if (!config.apiKey) {
          throw new Error('API key is required for OpenAI embedding service');
        }
        return new OpenAIEmbeddingService({
          apiKey: config.apiKey,
          model: config.model,
          dimensions: config.dimensions,
        });
      });
    });

    it('should have default provider registered', () => {
      const service = EmbeddingServiceFactory.createService({ provider: 'default' });
      expect(service).toBeInstanceOf(DefaultEmbeddingService);
    });

    it('should have openai provider registered', () => {
      const service = EmbeddingServiceFactory.createService({
        provider: 'openai',
        apiKey: 'test-key',
      });
      expect(service).toBeInstanceOf(OpenAIEmbeddingService);
    });

    it('should throw error when openai provider called without API key', () => {
      expect(() => {
        EmbeddingServiceFactory.createService({ provider: 'openai' });
      }).toThrow('API key is required for OpenAI embedding service');
    });
  });
});
