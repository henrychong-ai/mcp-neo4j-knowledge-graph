import http from 'node:http';
import https from 'node:https';

import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type RerankConfig, RerankerService } from '../RerankerService.js';

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

    it('defaults topK to 5 when RERANK_TOP_K is unset', () => {
      expect(RerankerService.fromEnv().topK).toBe(5);
    });

    it('honours an explicit RERANK_TOP_K', () => {
      process.env.RERANK_TOP_K = '7';
      expect(RerankerService.fromEnv().topK).toBe(7);
    });
  });

  describe('rerank', () => {
    let mockPost: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockPost = vi.fn();
      vi.mocked(axios.create).mockReturnValue({ post: mockPost } as never);
    });

    const makeService = (overrides: Partial<RerankConfig> = {}) =>
      new RerankerService({
        enabled: true,
        endpoint: 'https://example.com/rerank',
        model: '@cf/baai/bge-reranker-base',
        apiKey: 'test-key',
        topN: 20,
        topK: 2,
        maxPassageChars: 2000,
        timeoutMs: 5000,
        ...overrides,
      });

    it('creates a dedicated axios instance with keep-alive disabled http/https agents', () => {
      makeService();
      expect(axios.create).toHaveBeenCalledWith({
        httpAgent: expect.any(http.Agent),
        httpsAgent: expect.any(https.Agent),
      });
      // `options` is a runtime property of Agent not exposed on the @types/node surface
      const createArgs = vi.mocked(axios.create).mock.calls.at(-1)?.[0] as unknown as {
        httpAgent: { options: { keepAlive?: boolean } };
        httpsAgent: { options: { keepAlive?: boolean } };
      };
      expect(createArgs.httpAgent.options.keepAlive).toBe(false);
      expect(createArgs.httpsAgent.options.keepAlive).toBe(false);
    });

    it('returns the full ordering best-first and preserves headers/payload/timeout', async () => {
      mockPost.mockResolvedValue({
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
      // topK is 2 but the FULL ordering is returned — trim is the caller's job.
      const result = await makeService().rerank('query', ['a', 'b', 'c']);
      expect(result).toEqual([2, 0, 1]);
      expect(mockPost).toHaveBeenCalledWith(
        'https://example.com/rerank',
        { query: 'query', contexts: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] },
        {
          headers: {
            Authorization: 'Bearer test-key',
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        }
      );
    });

    it('sorts an unsorted response by score descending; missing scores sink to the end', async () => {
      mockPost.mockResolvedValue({
        data: {
          result: {
            response: [
              { id: 0, score: 0.1 },
              { id: 3 }, // missing score — sorts last
              { id: 2, score: 0.9 },
              { id: 1, score: 0.5 },
            ],
          },
        },
      } as never);
      const result = await makeService().rerank('query', ['a', 'b', 'c', 'd']);
      expect(result).toEqual([2, 1, 0, 3]);
    });

    it('returns the full ordering beyond topK (no early break)', async () => {
      mockPost.mockResolvedValue({
        data: {
          result: {
            response: [
              { id: 3, score: 0.9 },
              { id: 7, score: 0.8 },
              { id: 1, score: 0.7 },
              { id: 5, score: 0.6 },
              { id: 0, score: 0.5 },
              { id: 6, score: 0.4 },
              { id: 2, score: 0.3 },
              { id: 4, score: 0.2 },
            ],
          },
        },
      } as never);
      const passages = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
      const result = await makeService({ topK: 5 }).rerank('query', passages);
      expect(result).toHaveLength(8);
      expect(result).toEqual([3, 7, 1, 5, 0, 6, 2, 4]);
    });

    it('filters out-of-range ids defensively', async () => {
      mockPost.mockResolvedValue({
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
      mockPost.mockResolvedValue({
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
      mockPost.mockResolvedValue({ data: { result: {} } } as never);
      await expect(makeService().rerank('query', ['a', 'b'])).rejects.toThrow();
    });
  });
});
