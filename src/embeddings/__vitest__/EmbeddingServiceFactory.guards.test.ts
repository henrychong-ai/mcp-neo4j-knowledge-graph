/**
 * v2.6.0 hardening guards — production mock-guard + dimension-consistency check.
 *
 * These guards exist because of a real incident (2026-06-09): stale client
 * processes whose API key could not resolve fell back to the random
 * DefaultEmbeddingService and silently wrote 1536-dim mock vectors into a
 * production 1024-dim store. Random vectors must never drive a production KG.
 */
import { describe, it, expect } from 'vitest';

import { DefaultEmbeddingService } from '../DefaultEmbeddingService.js';
import { EmbeddingServiceFactory } from '../EmbeddingServiceFactory.js';
import { OpenAIEmbeddingService } from '../OpenAIEmbeddingService.js';

describe('EmbeddingServiceFactory.hasEmbeddingProvider (env-injectable)', () => {
  it('returns true when EMBEDDING_API_KEY is set (any NODE_ENV)', () => {
    expect(EmbeddingServiceFactory.hasEmbeddingProvider({ EMBEDDING_API_KEY: 'k' })).toBe(true);
    expect(
      EmbeddingServiceFactory.hasEmbeddingProvider({
        EMBEDDING_API_KEY: 'k',
        NODE_ENV: 'production',
      })
    ).toBe(true);
  });

  it('returns true when OPENAI_API_KEY is set (any NODE_ENV)', () => {
    expect(
      EmbeddingServiceFactory.hasEmbeddingProvider({
        OPENAI_API_KEY: 'k',
        NODE_ENV: 'production',
      })
    ).toBe(true);
  });

  it('counts MOCK_EMBEDDINGS as a provider outside production (back-compat)', () => {
    expect(EmbeddingServiceFactory.hasEmbeddingProvider({ MOCK_EMBEDDINGS: 'true' })).toBe(true);
    expect(
      EmbeddingServiceFactory.hasEmbeddingProvider({ MOCK_EMBEDDINGS: 'true', NODE_ENV: 'test' })
    ).toBe(true);
  });

  it('REJECTS MOCK_EMBEDDINGS as a provider under NODE_ENV=production', () => {
    expect(
      EmbeddingServiceFactory.hasEmbeddingProvider({
        MOCK_EMBEDDINGS: 'true',
        NODE_ENV: 'production',
      })
    ).toBe(false);
  });

  it('returns false with no provider configured', () => {
    expect(EmbeddingServiceFactory.hasEmbeddingProvider({})).toBe(false);
  });
});

describe('EmbeddingServiceFactory.shouldWriteEmbeddings', () => {
  const mockService = new DefaultEmbeddingService();
  const realService = new OpenAIEmbeddingService({ apiKey: 'test-key' });

  it('allows a real service in production', () => {
    expect(
      EmbeddingServiceFactory.shouldWriteEmbeddings(realService, { NODE_ENV: 'production' })
    ).toBe(true);
  });

  it('REFUSES the random DefaultEmbeddingService in production (mock OR silent fallback)', () => {
    expect(
      EmbeddingServiceFactory.shouldWriteEmbeddings(mockService, { NODE_ENV: 'production' })
    ).toBe(false);
  });

  it('allows the DefaultEmbeddingService outside production (tests/dev)', () => {
    expect(EmbeddingServiceFactory.shouldWriteEmbeddings(mockService, {})).toBe(true);
    expect(EmbeddingServiceFactory.shouldWriteEmbeddings(mockService, { NODE_ENV: 'test' })).toBe(
      true
    );
  });

  it("REFUSES a '-mock' model name in production even when not instanceof DefaultEmbeddingService (duplicate-module robustness)", () => {
    const foreignMock = {
      getModelInfo: () => ({ name: 'text-embedding-3-small-mock', dimensions: 1536 }),
    } as unknown as Parameters<typeof EmbeddingServiceFactory.shouldWriteEmbeddings>[0];
    expect(
      EmbeddingServiceFactory.shouldWriteEmbeddings(foreignMock, { NODE_ENV: 'production' })
    ).toBe(false);
    // ...but allowed outside production
    expect(EmbeddingServiceFactory.shouldWriteEmbeddings(foreignMock, {})).toBe(true);
  });
});

describe('EmbeddingServiceFactory.checkDimensionConsistency', () => {
  it('returns null when consistent', () => {
    expect(
      EmbeddingServiceFactory.checkDimensionConsistency({
        EMBEDDING_DIMENSIONS: '1024',
        NEO4J_VECTOR_DIMENSIONS: '1024',
      })
    ).toBeNull();
  });

  it('returns null when either side is unset', () => {
    expect(
      EmbeddingServiceFactory.checkDimensionConsistency({ EMBEDDING_DIMENSIONS: '1024' })
    ).toBeNull();
    expect(
      EmbeddingServiceFactory.checkDimensionConsistency({ NEO4J_VECTOR_DIMENSIONS: '1536' })
    ).toBeNull();
    expect(EmbeddingServiceFactory.checkDimensionConsistency({})).toBeNull();
  });

  it('returns a warning naming both values when they differ', () => {
    const warning = EmbeddingServiceFactory.checkDimensionConsistency({
      EMBEDDING_DIMENSIONS: '1024',
      NEO4J_VECTOR_DIMENSIONS: '1536',
    });
    expect(warning).toContain('1024');
    expect(warning).toContain('1536');
    expect(warning).toContain('dimension guard');
  });

  it('compares numerically, not as raw strings', () => {
    expect(
      EmbeddingServiceFactory.checkDimensionConsistency({
        EMBEDDING_DIMENSIONS: '01024',
        NEO4J_VECTOR_DIMENSIONS: '1024',
      })
    ).toBeNull();
  });

  it('warns on non-numeric or non-positive dimension values (NaN would silently disable the guard)', () => {
    expect(
      EmbeddingServiceFactory.checkDimensionConsistency({ NEO4J_VECTOR_DIMENSIONS: 'abc' })
    ).toContain('not a positive integer');
    expect(
      EmbeddingServiceFactory.checkDimensionConsistency({ EMBEDDING_DIMENSIONS: '-5' })
    ).toContain('not a positive integer');
    expect(
      EmbeddingServiceFactory.checkDimensionConsistency({ NEO4J_VECTOR_DIMENSIONS: '0' })
    ).toContain('not a positive integer');
  });
});
