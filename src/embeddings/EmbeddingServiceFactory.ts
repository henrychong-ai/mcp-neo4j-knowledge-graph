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
    // Surface dimension misconfig at startup, not at first write (the storage
    // layer's dimension guard remains the enforcement).
    const dimensionWarning = EmbeddingServiceFactory.checkDimensionConsistency();
    if (dimensionWarning) {
      logger.warn(`EmbeddingServiceFactory: ${dimensionWarning}`);
    }

    // Check if we should use mock embeddings (for testing / explicit opt-in).
    // NEVER honoured in production — a stale MOCK_EMBEDDINGS=true must not beat a
    // real key (or silently produce random vectors) on a production deployment.
    const isProduction = process.env.NODE_ENV === 'production';
    const useMockEmbeddings = process.env.MOCK_EMBEDDINGS === 'true' && !isProduction;
    if (process.env.MOCK_EMBEDDINGS === 'true' && isProduction) {
      logger.error(
        'EmbeddingServiceFactory: MOCK_EMBEDDINGS=true ignored under NODE_ENV=production — ' +
          'random vectors must never drive a production store.'
      );
    }

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
   * Production guard (v2.6.0): MOCK_EMBEDDINGS counts as a provider ONLY outside
   * NODE_ENV=production — random vectors must never drive a production store.
   *
   * @param env - Environment to evaluate (defaults to process.env; injectable for tests)
   * @returns true if embeddings should be enabled
   */
  static hasEmbeddingProvider(env: NodeJS.ProcessEnv = process.env): boolean {
    if (env.EMBEDDING_API_KEY || env.OPENAI_API_KEY) {
      return true;
    }
    return env.MOCK_EMBEDDINGS === 'true' && env.NODE_ENV !== 'production';
  }

  /**
   * Whether the resolved embedding service is safe to WRITE embeddings with.
   * Returns false when NODE_ENV=production and the service is the random
   * DefaultEmbeddingService — covering both MOCK_EMBEDDINGS and the silent
   * fallback path (a configured key whose service construction fell back).
   * Callers should run keyword-only (no EmbeddingJobManager) when false.
   *
   * @param service - The embedding service resolved for this process
   * @param env - Environment to evaluate (defaults to process.env; injectable for tests)
   * @returns true if the service may write embeddings
   */
  static shouldWriteEmbeddings(
    service: EmbeddingService,
    env: NodeJS.ProcessEnv = process.env
  ): boolean {
    if (env.NODE_ENV !== 'production') {
      return true;
    }
    // instanceof + model-name sentinel: instanceof alone is brittle across
    // duplicate module copies (npx cache / symlinked dev installs); every mock
    // service's model name ends in '-mock'.
    const isRandomService =
      service instanceof DefaultEmbeddingService ||
      (service.getModelInfo()?.name ?? '').endsWith('-mock');
    return !isRandomService;
  }

  /**
   * Config-consistency check: when both EMBEDDING_DIMENSIONS and
   * NEO4J_VECTOR_DIMENSIONS are set, they must match — a mismatch means every
   * embedding write will fail the storage layer's dimension guard.
   *
   * @param env - Environment to evaluate (defaults to process.env; injectable for tests)
   * @returns a human-readable warning when inconsistent, else null
   */
  static checkDimensionConsistency(env: NodeJS.ProcessEnv = process.env): string | null {
    const rawEmbedding = env.EMBEDDING_DIMENSIONS;
    const rawIndex = env.NEO4J_VECTOR_DIMENSIONS;
    const parsedEmbedding = rawEmbedding ? Number.parseInt(rawEmbedding, 10) : undefined;
    const parsedIndex = rawIndex ? Number.parseInt(rawIndex, 10) : undefined;

    // Invalid values are worse than mismatched ones: parseInt('abc') = NaN is
    // falsy, which would silently DISABLE the write-path dimension guard.
    if (rawEmbedding && (!Number.isFinite(parsedEmbedding) || (parsedEmbedding as number) <= 0)) {
      return (
        `EMBEDDING_DIMENSIONS ('${rawEmbedding}') is not a positive integer — ` +
        `embedding configuration is invalid; fix it to a positive integer matching the ` +
        `embedding model's native output dimension.`
      );
    }
    if (rawIndex && (!Number.isFinite(parsedIndex) || (parsedIndex as number) <= 0)) {
      return (
        `NEO4J_VECTOR_DIMENSIONS ('${rawIndex}') is not a positive integer — ` +
        `the write-path dimension guard is DISABLED until this is fixed to a positive integer.`
      );
    }
    // Numeric comparison (not raw string) so '1024' vs '01024' compare equal.
    if (
      parsedEmbedding !== undefined &&
      parsedIndex !== undefined &&
      parsedEmbedding !== parsedIndex
    ) {
      return (
        `EMBEDDING_DIMENSIONS (${parsedEmbedding}) != NEO4J_VECTOR_DIMENSIONS (${parsedIndex}) — ` +
        `embedding writes WILL fail the dimension guard. Align both with the embedding ` +
        `model's native output dimension.`
      );
    }
    return null;
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
