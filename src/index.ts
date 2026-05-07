import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import cron from 'node-cron';

import { initializeStorageProvider } from './config/storage.js';
import { EmbeddingJobManager } from './embeddings/EmbeddingJobManager.js';
import { EmbeddingServiceFactory } from './embeddings/EmbeddingServiceFactory.js';
import { Neo4jJobStore } from './embeddings/Neo4jJobStore.js';
import { KnowledgeGraphManager } from './KnowledgeGraphManager.js';
import { PrometheusMetrics } from './metrics/PrometheusMetrics.js';
import { setupServer } from './server/setup.js';
import { createAdaptedStorageProvider } from './storage/createAdaptedStorageProvider.js';
import type { Neo4jConnectionManager } from './storage/neo4j/Neo4jConnectionManager.js';
import { logger } from './utils/logger.js';

// Re-export the types and classes for use in other modules
export * from './KnowledgeGraphManager.js';
// Export the Relation type
export type { RelationMetadata } from './types/relation.js';
export { Relation } from './types/relation.js';

// Initialize storage and create KnowledgeGraphManager
const storageProvider = initializeStorageProvider();

// See README "Embedding Pipeline Topology" for what these env flags do.
const writeEmbeddingsLocally = process.env.WRITE_EMBEDDINGS_LOCALLY !== 'false';
const embeddingBackfillCron = process.env.EMBEDDING_BACKFILL_CRON ?? '0 19 * * *';
const staleClaimMs = process.env.EMBEDDING_STALE_CLAIM_MS
  ? Number.parseInt(process.env.EMBEDDING_STALE_CLAIM_MS, 10)
  : 5 * 60 * 1000;

// Initialize Prometheus metrics (will be initialized in production environment only)
let prometheusMetrics: PrometheusMetrics | null = null;

// Initialize embedding job manager only if storage provider supports it
let embeddingJobManager: EmbeddingJobManager | undefined;
try {
  // Force debug logging to help troubleshoot
  logger.debug(`OpenAI API key exists: ${!!process.env.OPENAI_API_KEY}`);
  logger.debug(`OpenAI Embedding model: ${process.env.OPENAI_EMBEDDING_MODEL || 'not set'}`);
  logger.debug(`Storage provider type: ${process.env.MEMORY_STORAGE_TYPE || 'default'}`);

  // Ensure OPENAI_API_KEY is defined for embedding generation
  if (process.env.OPENAI_API_KEY) {
    logger.info('OpenAI API key found, will use for generating embeddings');
  } else {
    logger.warn(
      'OPENAI_API_KEY environment variable is not set. Semantic search will use random embeddings.'
    );
  }

  // Initialize the embedding service
  const embeddingService = EmbeddingServiceFactory.createFromEnvironment();
  logger.debug(`Embedding service model info: ${JSON.stringify(embeddingService.getModelInfo())}`);

  // Configure rate limiting options - stricter limits to prevent OpenAI API abuse
  const rateLimiterOptions = {
    tokensPerInterval: process.env.EMBEDDING_RATE_LIMIT_TOKENS
      ? Number.parseInt(process.env.EMBEDDING_RATE_LIMIT_TOKENS, 10)
      : 20, // Default: 20 requests per minute
    interval: process.env.EMBEDDING_RATE_LIMIT_INTERVAL
      ? Number.parseInt(process.env.EMBEDDING_RATE_LIMIT_INTERVAL, 10)
      : 60 * 1000, // Default: 1 minute
  };

  logger.info('Initializing EmbeddingJobManager', {
    rateLimiterOptions,
    model: embeddingService.getModelInfo().name,
    storageType: process.env.MEMORY_STORAGE_TYPE || 'neo4j',
  });

  const adaptedStorageProvider = createAdaptedStorageProvider(storageProvider);

  // Pull the Neo4j connection out of the storage provider so the queue
  // shares the same driver/pool. Falls back to throwing if missing — we
  // only support Neo4j storage in v2.x.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getConnectionManager = (storageProvider as any).getConnectionManager;
  if (typeof getConnectionManager !== 'function') {
    throw new Error(
      'Storage provider does not expose getConnectionManager(); EmbeddingJobManager v2.4.0+ requires Neo4j.'
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connectionManager: Neo4jConnectionManager = getConnectionManager.call(storageProvider);
  const jobStore = new Neo4jJobStore(connectionManager);

  // Create the embedding job manager with adapted storage provider + Neo4j-backed queue
  embeddingJobManager = new EmbeddingJobManager(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adaptedStorageProvider as any,
    embeddingService,
    rateLimiterOptions,
    null, // Use default cache options
    logger,
    jobStore,
    staleClaimMs
  );

  logger.info('EmbeddingJobManager initialized (background jobs will start only in production)');
} catch (error) {
  // Fail gracefully if embedding job manager initialization fails
  logger.error('Failed to initialize EmbeddingJobManager', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  embeddingJobManager = undefined;
}

// Create the KnowledgeGraphManager with the storage provider, embedding job manager, and vector store options
const knowledgeGraphManager = new KnowledgeGraphManager({
  storageProvider,
  embeddingJobManager,
  writeEmbeddingsLocally,
  // Pass vector store options from storage provider if available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vectorStoreOptions: (storageProvider as any).vectorStoreOptions,
});

if (!writeEmbeddingsLocally) {
  logger.info(
    'WRITE_EMBEDDINGS_LOCALLY=false: entity writes will NOT queue embedding jobs. ' +
      'A server-side instance with OPENAI_API_KEY must run `scheduleIncrementalRegeneration` ' +
      'to embed NULL entities.'
  );
}

// Ensure the storeEntityVector method is available on KnowledgeGraphManager's storageProvider
// Cast to any to bypass type checking for internal properties
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const knowledgeGraphManagerAny = knowledgeGraphManager as any;

if (
  knowledgeGraphManagerAny.storageProvider &&
  typeof knowledgeGraphManagerAny.storageProvider.storeEntityVector !== 'function'
) {
  // Add the storeEntityVector method to the storage provider
  knowledgeGraphManagerAny.storageProvider.storeEntityVector = async (
    name: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    embedding: any
  ) => {
    logger.debug(`Neo4j knowledgeGraphManager adapter: storeEntityVector called for ${name}`, {
      embeddingType: typeof embedding,
      vectorLength: embedding?.vector?.length || 'no vector',
      model: embedding?.model || 'no model',
    });

    // Ensure embedding has the correct format
    const formattedEmbedding = {
      vector: embedding.vector || embedding,
      model: embedding.model || 'unknown',
      lastUpdated: embedding.lastUpdated || Date.now(),
    };

    if (typeof knowledgeGraphManagerAny.storageProvider.updateEntityEmbedding === 'function') {
      try {
        logger.debug(
          `Neo4j knowledgeGraphManager adapter: Using updateEntityEmbedding for ${name}`
        );
        return await knowledgeGraphManagerAny.storageProvider.updateEntityEmbedding(
          name,
          formattedEmbedding
        );
      } catch (error) {
        logger.error(
          `Neo4j knowledgeGraphManager adapter: Error in storeEntityVector for ${name}`,
          error
        );
        throw error;
      }
    } else {
      const errorMsg = `Neo4j knowledgeGraphManager adapter: updateEntityEmbedding not implemented for ${name}`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  };

  logger.info(
    'Added storeEntityVector adapter method to Neo4j storage provider for KnowledgeGraphManager'
  );
}

// Use a custom createEntities method for immediate job processing, but only if knowledgeGraphManager exists
if (knowledgeGraphManager && typeof knowledgeGraphManager.createEntities === 'function') {
  const originalCreateEntities = knowledgeGraphManager.createEntities.bind(knowledgeGraphManager);
  knowledgeGraphManager.createEntities = async function (entities) {
    // First call the original method to create the entities
    const result = await originalCreateEntities(entities);

    if (embeddingJobManager && writeEmbeddingsLocally) {
      try {
        logger.info('Processing embedding jobs immediately after entity creation', {
          entityCount: entities.length,
          entityNames: entities.map(e => e.name).join(', '),
        });
        await embeddingJobManager.processJobs(entities.length);
      } catch (error) {
        logger.error('Error processing embedding jobs immediately', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }

    return result;
  };
}

// Setup the server with the KnowledgeGraphManager
const server = setupServer(knowledgeGraphManager);

// Export main function for testing
export async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only run main and background jobs if not in a test environment
if (!process.env.VITEST && !process.env.NODE_ENV?.includes('test')) {
  // Initialize Prometheus metrics (production only - prevents interval leaks in tests)
  prometheusMetrics = PrometheusMetrics.getInstance();
  prometheusMetrics.startServer(9091);

  // When writeEmbeddingsLocally=false, no jobs are ever queued, so skip the worker tick + cron.
  if (embeddingJobManager && writeEmbeddingsLocally) {
    const EMBEDDING_PROCESS_INTERVAL = 10_000; // 10 seconds - more frequent processing
    setInterval(async () => {
      try {
        // Process pending embedding jobs
        await embeddingJobManager?.processJobs(10);
      } catch (error) {
        // Log error but don't crash
        logger.error('Error in scheduled job processing', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }, EMBEDDING_PROCESS_INTERVAL);

    // Schedule incremental embedding regeneration via configurable cron (default 19:00 UTC daily).
    // Server-side instances should tighten this (e.g. `EMBEDDING_BACKFILL_CRON='*/1 * * * *'`)
    // to backfill NULL entities written by client-side instances within ~1 minute.
    cron.schedule(
      embeddingBackfillCron,
      async () => {
        logger.info('Starting incremental embedding regeneration', {
          schedule: embeddingBackfillCron,
        });

        try {
          const scheduledCount = await embeddingJobManager?.scheduleIncrementalRegeneration();
          logger.info('Incremental regeneration completed', {
            entitiesScheduled: scheduledCount,
            time: new Date().toISOString(),
          });
        } catch (error) {
          logger.error('Incremental regeneration failed', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            time: new Date().toISOString(),
          });
        }
      },
      {
        timezone: 'UTC',
      }
    );

    logger.info('Embedding automation configured', {
      periodicProcessing: `Every ${EMBEDDING_PROCESS_INTERVAL}ms`,
      backfillSchedule: embeddingBackfillCron,
      timezone: 'UTC',
    });
  }

  // Start MCP server
  main().catch(error => {
    // Log error but don't use console.error
    logger.error(`Main process terminated: ${error}`);
    process.exit(1);
  });
}
