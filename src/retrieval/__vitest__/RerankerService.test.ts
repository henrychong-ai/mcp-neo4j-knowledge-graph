import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RerankerService } from '../RerankerService.js';

vi.mock('axios');

describe('RerankerService', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clear all rerank-related env so each test sets its own
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('RERANK_') || key === 'EMBEDDING_API_KEY' || key === 'CF_ACCOUNT_ID') {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('fromEnv', () => {
    it('is disabled by default when RERANK_ENABLED is unset', () => {
      expect(RerankerService.fromEnv().enabled).toBe(false);
    });

    it('stays disabled (fail-open) when RERANK_ENABLED=true but no endpoint/key resolve', () => {
      process.env.RERANK_ENABLED = 'true';
      expect(RerankerService.fromEnv().enabled).toBe(false);
    });

    it('is enabled with RERANK_ENABLED=true + explicit endpoint + key', () => {
      process.env.RERANK_ENABLED = 'true';
      process.env.RERANK_ENDPOINT = 'https://example.com/rerank';
      process.env.RERANK_API_KEY = 'test-key';
      expect(RerankerService.fromEnv().enabled).toBe(true);
    });

    it('derives the endpoint from an account id + model and uses EMBEDDING_API_KEY fallback', () => {
      process.env.RERANK_ENABLED = 'true';
      process.env.CF_ACCOUNT_ID = 'acct123';
      process.env.EMBEDDING_API_KEY = 'shared-key';
      const service = RerankerService.fromEnv();
      expect(service.enabled).toBe(true);
      expect(service.model).toBe('@cf/baai/bge-reranker-base');
    });
  });

  describe('rerank', () => {
    const makeService = () =>
      new RerankerService({
        enabled: true,
        endpoint: 'https://example.com/rerank',
        model: '@cf/baai/bge-reranker-base',
        apiKey: 'test-key',
        topN: 20,
        topK: 2,
        maxPassageChars: 2000,
        timeoutMs: 5000,
      });

    it('returns candidate indices in the API order, sliced to topK', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        data: {
          result: {
            response: [
              { id: 2, score: 0.9 },
              { id: 0, score: 0.5 },
              { id: 1, score: 0.1 },
            ],
          },
        },
      } as never);
      const result = await makeService().rerank('query', ['a', 'b', 'c']);
      expect(result).toEqual([2, 0]);
    });

    it('filters out-of-range ids defensively', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        data: {
          result: {
            response: [
              { id: 9, score: 0.9 },
              { id: 1, score: 0.5 },
            ],
          },
        },
      } as never);
      const result = await makeService().rerank('query', ['a', 'b']);
      expect(result).toEqual([1]);
    });

    it('drops fractional ids and de-duplicates repeated ids (defensive)', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        data: {
          result: {
            response: [
              { id: 1, score: 0.9 },
              { id: 1, score: 0.8 },
              { id: 0.5, score: 0.7 },
              { id: 0, score: 0.6 },
            ],
          },
        },
      } as never);
      const result = await makeService().rerank('query', ['a', 'b', 'c']);
      expect(result).toEqual([1, 0]);
    });

    it('throws on a malformed response so the caller can fail open', async () => {
      vi.mocked(axios.post).mockResolvedValue({ data: { result: {} } } as never);
      await expect(makeService().rerank('query', ['a', 'b'])).rejects.toThrow();
    });
  });
});
