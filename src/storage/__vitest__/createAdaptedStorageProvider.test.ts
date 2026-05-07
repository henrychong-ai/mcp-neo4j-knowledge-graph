import { describe, it, expect, vi } from 'vitest';
import { createAdaptedStorageProvider } from '../createAdaptedStorageProvider.js';
import type { StorageProvider } from '../StorageProvider.js';

/**
 * Regression tests for v2.3.2 hotfix. The bug: prior versions used
 * `{ ...storageProvider, ...overrides }` to build the adapter, but spread
 * only copies OWN enumerable properties. Methods defined on a class prototype
 * (e.g. `loadGraph` on `Neo4jStorageProvider`) were silently dropped, causing
 * `EmbeddingJobManager._getAllEntitiesFromStorage` to throw "Storage provider
 * does not support getAllEntities or loadGraph". The fix is explicit
 * forwarding for `loadGraph`, `getEntity`, `storeEntityVector`.
 */

describe('createAdaptedStorageProvider', () => {
  // Build a class instance whose methods live on the prototype (the actual
  // shape of `Neo4jStorageProvider`).
  class FakeProvider {
    public ownProp = 'visible-via-spread';

    async loadGraph() {
      return { entities: [{ name: 'e1' }, { name: 'e2' }], relations: [] };
    }
    async openNodes(_names: string[]) {
      return { entities: [{ name: 'from-openNodes' }], relations: [], total: 1 };
    }
    async getEntity(name: string) {
      return { name, source: 'from-getEntity' };
    }
    async updateEntityEmbedding(_name: string, _embedding: unknown) {
      return undefined;
    }
  }

  it('reproduces the v2.3.1 bug: raw spread drops prototype methods', () => {
    const provider = new FakeProvider();
    const naivelySpread = { ...provider };
    expect(naivelySpread.ownProp).toBe('visible-via-spread');
    // The bug — class methods from the prototype are NOT copied:
    expect((naivelySpread as { loadGraph?: unknown }).loadGraph).toBeUndefined();
  });

  it('explicit forwarder makes loadGraph callable on the adapter', async () => {
    const provider = new FakeProvider() as unknown as StorageProvider;
    const adapter = createAdaptedStorageProvider(provider);

    expect(typeof adapter.loadGraph).toBe('function');
    const graph = await adapter.loadGraph();
    expect(graph.entities).toHaveLength(2);
    expect(graph.entities[0].name).toBe('e1');
  });

  it('explicit forwarder makes getEntity callable on the adapter', async () => {
    const provider = new FakeProvider() as unknown as StorageProvider;
    const adapter = createAdaptedStorageProvider(provider);

    const entity = await adapter.getEntity('e1');
    expect(entity).toEqual({ name: 'e1', source: 'from-getEntity' });
  });

  it('getEntity falls back to openNodes when getEntity is missing on the provider', async () => {
    class ProviderWithoutGetEntity {
      async loadGraph() {
        return { entities: [], relations: [] };
      }
      async openNodes(_names: string[]) {
        return { entities: [{ name: 'fallback' }], relations: [], total: 1 };
      }
    }
    const provider = new ProviderWithoutGetEntity() as unknown as StorageProvider;
    const adapter = createAdaptedStorageProvider(provider);

    const entity = await adapter.getEntity('any');
    expect(entity).toEqual({ name: 'fallback' });
  });

  it('storeEntityVector forwards to updateEntityEmbedding with formatted shape', async () => {
    const provider = new FakeProvider();
    const updateSpy = vi.spyOn(provider, 'updateEntityEmbedding');
    const adapter = createAdaptedStorageProvider(provider as unknown as StorageProvider);

    await adapter.storeEntityVector('e1', {
      vector: [0.1, 0.2, 0.3],
      model: 'text-embedding-3-small',
      lastUpdated: 12345,
    });

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith('e1', {
      vector: [0.1, 0.2, 0.3],
      model: 'text-embedding-3-small',
      lastUpdated: 12345,
    });
  });

  it('does NOT expose a `.db` field — queue persistence moved to JobStore in v2.4.0', () => {
    const provider = new FakeProvider() as unknown as StorageProvider;
    const adapter = createAdaptedStorageProvider(provider);

    expect(adapter.db).toBeUndefined();
  });
});
