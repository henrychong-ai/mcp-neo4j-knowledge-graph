import { logger } from '../utils/logger.js';
import type { StorageProvider } from './StorageProvider.js';

/**
 * Wraps a `StorageProvider` (typically `Neo4jStorageProvider`) into the shape
 * `EmbeddingJobManager` expects for entity access: explicit forwarders for
 * `loadGraph`, `getEntity`, `storeEntityVector`. Queue persistence is no
 * longer the storage provider's job — that lives on `JobStore` (v2.4.0+).
 *
 * Why method forwarders are explicit: object spread (`...storageProvider`)
 * only copies OWN enumerable properties — class methods on a prototype are
 * silently dropped. Without these forwarders,
 * `EmbeddingJobManager.scheduleIncrementalRegeneration` would throw because
 * `loadGraph` would be `undefined` on the wrapper. The v2.3.2 hotfix
 * established this pattern; we keep it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAdaptedStorageProvider(storageProvider: StorageProvider): any {
  return {
    ...storageProvider,

    loadGraph: async () => {
      if (typeof storageProvider.loadGraph === 'function') {
        return storageProvider.loadGraph();
      }
      throw new Error('Underlying storage provider has no loadGraph method');
    },

    // v2.4.1+: prefer the dedicated Cypher predicate over a full loadGraph
    // when scheduling incremental regeneration. Falls through to undefined if
    // the underlying provider doesn't expose this method, in which case the
    // manager falls back to the loadGraph-and-filter approach.
    getEntityNamesMissingEmbeddings: async (): Promise<string[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fn = (storageProvider as any).getEntityNamesMissingEmbeddings;
      if (typeof fn !== 'function') {
        throw new Error(
          'Underlying storage provider has no getEntityNamesMissingEmbeddings method'
        );
      }
      return fn.call(storageProvider);
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return await (storageProvider as any).updateEntityEmbedding(name, formattedEmbedding);
        } catch (error) {
          logger.error(`Neo4j adapter: Error in storeEntityVector for ${name}`, error);
          throw error;
        }
      }
      const errorMsg = `Neo4j adapter: updateEntityEmbedding not implemented for ${name}`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    },
  };
}
