import { logger } from '../utils/logger.js';

import { DefaultEmbeddingService } from './DefaultEmbeddingService.js';
import type { EmbeddingService } from './EmbeddingService.js';
import { OpenAIEmbeddingService } from './OpenAIEmbeddingService.js';

/**
 * Configuration options for embedding services
 */
export interface EmbeddingServiceConfig {
  provider?: string;
  model?: string;
  dimensions?: number;
  apiKey?: string;
  /** Full OpenAI-compatible embeddings endpoint URL (e.g. Cloudflare Workers AI). */
  apiEndpoint?: string;
  [key: string]: unknown;
}

/**
 * Type definition for embedding service provider creation function
 */
type EmbeddingServiceProvider = (config?: EmbeddingServiceConfig) => EmbeddingService;

/**
 * Factory for creating embedding services
 */
export class EmbeddingServiceFactory {
  /**
   * Registry of embedding service providers
   */
  private static providers: Record<string, EmbeddingServiceProvider> = {};

  /**
   * Register a new embedding service provider
   *
   * @param name - Provider name
   * @param provider - Provider factory function
   */
  static registerProvider(name: string, provider: EmbeddingServiceProvider): void {
    EmbeddingServiceFactory.providers[name.toLowerCase()] = provider;
  }

  /**
   * Reset the provider registry - used primarily for testing
   */
  static resetRegistry(): void {
    EmbeddingServiceFactory.providers = {};
  }

  /**
   * Get a list of available provider names
   *
   * @returns Array of provider names
   */
  static getAvailableProviders(): string[] {
    return Object.keys(EmbeddingServiceFactory.providers);
  }

  /**
   * Create a service using a registered provider
   *
   * @param config - Configuration options including provider name and service-specific settings
   * @returns The created embedding service
   * @throws Error if the provider is not registered
   */
  static createService(config: EmbeddingServiceConfig = {}): EmbeddingService {
    const providerName = (config.provider || 'default').toLowerCase();
    logger.debug(`EmbeddingServiceFactory: Creating service with provider "${providerName}"`);

    const providerFn = EmbeddingServiceFactory.providers[providerName];

    if (providerFn) {
      try {
        const service = providerFn(config);
        logger.debug(
          `EmbeddingServiceFactory: Service created successfully with provider "${providerName}"`,
          {
            modelInfo: service.getModelInfo(),
          }
        );
        return service;
      } catch (error) {
        logger.error(
          `EmbeddingServiceFactory: Failed to create service with provider "${providerName}"`,
          error
        );
        throw error;
      }
    }

    // If provider not found, throw an error
    logger.error(`EmbeddingServiceFactory: Provider "${providerName}" is not registered`);
    throw new Error(`Provider "${providerName}" is not registered`);
  }

  /**
   * Create an embedding service from environment variables
   *
   * @returns An embedding service implementation
   */
  static createFromEnvironment(): EmbeddingService {
    // Check if we should use mock embeddings (for testing / explicit opt-in)
    const useMockEmbeddings = process.env.MOCK_EMBEDDINGS === 'true';

    // New EMBEDDING_* env vars (provider-neutral) fall back to the legacy OPENAI_* names,
    // so existing deployments are unaffected. Point EMBEDDING_API_ENDPOINT / EMBEDDING_API_BASE_URL
    // at any OpenAI-compatible endpoint (e.g. Cloudflare Workers AI) to switch providers.
    const apiKey = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY;
    const embeddingModel =
      process.env.EMBEDDING_MODEL || process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    const apiEndpoint =
      process.env.EMBEDDING_API_ENDPOINT ||
      (process.env.EMBEDDING_API_BASE_URL
        ? `${process.env.EMBEDDING_API_BASE_URL.replace(/\/$/, '')}/embeddings`
        : undefined);
    const dimensions = process.env.EMBEDDING_DIMENSIONS
      ? Number.parseInt(process.env.EMBEDDING_DIMENSIONS, 10)
      : undefined;

    logger.debug('EmbeddingServiceFactory: Creating service from environment variables', {
      mockEmbeddings: useMockEmbeddings,
      apiKeyPresent: !!apiKey,
      embeddingModel,
      apiEndpoint: apiEndpoint || 'openai-default',
      dimensions: dimensions ?? 'default',
    });

    if (useMockEmbeddings) {
      logger.info('EmbeddingServiceFactory: Using mock embeddings (MOCK_EMBEDDINGS=true)');
      return new DefaultEmbeddingService(dimensions);
    }

    if (apiKey) {
      try {
        logger.debug('EmbeddingServiceFactory: Creating OpenAI-compatible embedding service', {
          model: embeddingModel,
          apiEndpoint: apiEndpoint || 'openai-default',
        });
        const service = new OpenAIEmbeddingService({
          apiKey,
          model: embeddingModel,
          apiEndpoint,
          dimensions,
        });
        logger.info('EmbeddingServiceFactory: OpenAI-compatible embedding service created', {
          model: service.getModelInfo().name,
          dimensions: service.getModelInfo().dimensions,
        });
        return service;
      } catch (error) {
        logger.error('EmbeddingServiceFactory: Failed to create OpenAI-compatible service', error);
        logger.info('EmbeddingServiceFactory: Falling back to default embedding service');
        // Fallback to default if service creation fails
        return new DefaultEmbeddingService(dimensions);
      }
    }

    // No API key: default (random) service. Callers should consult hasEmbeddingProvider()
    // to decide whether to enable semantic search — index.ts runs keyword-only when no
    // provider is configured rather than generating meaningless random-vector embeddings.
    logger.info(
      'EmbeddingServiceFactory: No embedding API key found, using default embedding service'
    );
    return new DefaultEmbeddingService(dimensions);
  }

  /**
   * Whether a real embedding provider is configured: an API key (EMBEDDING_API_KEY or
   * OPENAI_API_KEY) or MOCK_EMBEDDINGS=true. When false, the server should run in
   * keyword-only mode rather than generate meaningless random-vector embeddings.
   *
   * @returns true if embeddings should be enabled
   */
  static hasEmbeddingProvider(): boolean {
    return (
      process.env.MOCK_EMBEDDINGS === 'true' ||
      !!(process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY)
    );
  }

  /**
   * Create an OpenAI embedding service
   *
   * @param apiKey - OpenAI API key
   * @param model - Optional model name
   * @param dimensions - Optional embedding dimensions
   * @returns OpenAI embedding service
   */
  static createOpenAIService(
    apiKey: string,
    model?: string,
    dimensions?: number
  ): EmbeddingService {
    return new OpenAIEmbeddingService({
      apiKey,
      model,
      dimensions,
    });
  }

  /**
   * Create a default embedding service that generates random vectors
   *
   * @param dimensions - Optional embedding dimensions
   * @returns Default embedding service
   */
  static createDefaultService(dimensions?: number): EmbeddingService {
    return new DefaultEmbeddingService(dimensions);
  }
}

// Register built-in providers
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
    apiEndpoint: config.apiEndpoint,
  });
});
