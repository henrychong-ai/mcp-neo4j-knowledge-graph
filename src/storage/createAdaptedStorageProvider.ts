import { logger } from '../utils/logger.js';
import type { StorageProvider } from './StorageProvider.js';

/**
 * Wraps a `StorageProvider` (typically `Neo4jStorageProvider`) into a shape
 * `EmbeddingJobManager` expects: a `.db` shim (it was originally written
 * against better-sqlite3) plus explicit method forwarders.
 *
 * Why method forwarders are explicit: object spread (`...storageProvider`) only
 * copies OWN enumerable properties — class methods defined on the prototype are
 * silently dropped. `EmbeddingJobManager.scheduleIncrementalRegeneration` calls
 * `loadGraph` on the wrapper, and without an explicit forwarder it would throw
 * `Storage provider does not support getAllEntities or loadGraph`. v2.3.2
 * fixed exactly this gap (was silently breaking the daily backfill cron all the
 * way back to v1.x).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAdaptedStorageProvider(storageProvider: StorageProvider): any {
  return {
    ...storageProvider,

    // SQLite-compatible no-op `.db` shim (EmbeddingJobManager initializes its
    // own embedding_jobs table; with Neo4j there's no SQL DB on this side).
    db: {
      exec: (sql: string) => {
        logger.debug(`Neo4j adapter: Received SQL: ${sql}`);
        return null;
      },
      prepare: () => ({
        run: () => null,
        all: () => [],
        get: () => null,
      }),
    },

    // Forward loadGraph so _getAllEntitiesFromStorage works.
    loadGraph: async () => {
      if (typeof storageProvider.loadGraph === 'function') {
        return storageProvider.loadGraph();
      }
      throw new Error('Underlying storage provider has no loadGraph method');
    },

    getEntity: async (name: string) => {
      if (typeof storageProvider.getEntity === 'function') {
        return storageProvider.getEntity(name);
      }
      const result = await storageProvider.openNodes([name]);
      return result.entities[0] || null;
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    storeEntityVector: async (name: string, embedding: any) => {
      logger.debug(`Neo4j adapter: storeEntityVector called for ${name}`, {
        embeddingType: typeof embedding,
        vectorLength: embedding?.vector?.length || 'no vector',
        model: embedding?.model || 'no model',
      });

      const formattedEmbedding = {
        vector: embedding.vector || embedding,
        model: embedding.model || 'unknown',
        lastUpdated: embedding.lastUpdated || Date.now(),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof (storageProvider as any).updateEntityEmbedding === 'function') {
        try {
          logger.debug(`Neo4j adapter: Using updateEntityEmbedding for ${name}`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return await (storageProvider as any).updateEntityEmbedding(name, formattedEmbedding);
        } catch (error) {
          logger.error(`Neo4j adapter: Error in storeEntityVector for ${name}`, error);
          throw error;
        }
      }
      const errorMsg = `Neo4j adapter: Neither storeEntityVector nor updateEntityEmbedding implemented for ${name}`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    },
  };
}
