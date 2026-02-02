/**
 * Comprehensive tests for OpenAIEmbeddingService
 * Covers: constructor, generateEmbedding, generateEmbeddings, error handling, normalization
 */

import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OpenAIEmbeddingService } from '../OpenAIEmbeddingService.js';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// Mock the logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ============================================================================
// Test Utilities
// ============================================================================

function createValidEmbedding(dimensions = 1536): number[] {
  return Array.from({ length: dimensions }, () => Math.random() * 0.1);
}

function createMockResponse(embedding: number[] = createValidEmbedding()) {
  return {
    data: {
      data: [
        {
          embedding,
          index: 0,
          object: 'embedding',
        },
      ],
      model: 'text-embedding-3-small',
      object: 'list',
      usage: {
        prompt_tokens: 10,
        total_tokens: 10,
      },
    },
  };
}

function createMockBatchResponse(
  embeddings: number[][] = [createValidEmbedding(), createValidEmbedding()]
) {
  return {
    data: {
      data: embeddings.map((embedding, index) => ({
        embedding,
        index,
        object: 'embedding',
      })),
      model: 'text-embedding-3-small',
      object: 'list',
      usage: {
        prompt_tokens: 20,
        total_tokens: 20,
      },
    },
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe('OpenAIEmbeddingService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.DEBUG;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Constructor Tests
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('should create service with valid config', () => {
      const service = new OpenAIEmbeddingService({
        apiKey: 'test-api-key',
      });

      expect(service).toBeDefined();
      const modelInfo = service.getModelInfo();
      expect(modelInfo.name).toBe('text-embedding-3-small');
      expect(modelInfo.dimensions).toBe(1536);
    });

    it('should throw error when config is not provided', () => {
      expect(() => {
        // @ts-expect-error Testing null config
        new OpenAIEmbeddingService(null);
      }).toThrow('Configuration is required for OpenAI embedding service');
    });

    it('should throw error when API key is missing', () => {
      expect(() => {
        new OpenAIEmbeddingService({
          apiKey: '',
        });
      }).toThrow('API key is required for OpenAI embedding service');
    });

    it('should use environment variable for API key if not provided in config', () => {
      process.env.OPENAI_API_KEY = 'env-api-key';

      const service = new OpenAIEmbeddingService({
        apiKey: '',
      });

      expect(service).toBeDefined();
    });

    it('should accept custom model', () => {
      const service = new OpenAIEmbeddingService({
        apiKey: 'test-api-key',
        model: 'text-embedding-ada-002',
      });

      const modelInfo = service.getModelInfo();
      expect(modelInfo.name).toBe('text-embedding-ada-002');
    });

    it('should accept custom dimensions', () => {
      const service = new OpenAIEmbeddingService({
        apiKey: 'test-api-key',
        dimensions: 768,
      });

      const modelInfo = service.getModelInfo();
      expect(modelInfo.dimensions).toBe(768);
    });

    it('should accept custom version', () => {
      const service = new OpenAIEmbeddingService({
        apiKey: 'test-api-key',
        version: '1.0.0',
      });

      const modelInfo = service.getModelInfo();
      expect(modelInfo.version).toBe('1.0.0');
    });
  });

  // --------------------------------------------------------------------------
  // generateEmbedding Tests
  // --------------------------------------------------------------------------

  describe('generateEmbedding', () => {
    let service: OpenAIEmbeddingService;

    beforeEach(() => {
      service = new OpenAIEmbeddingService({
        apiKey: 'test-api-key',
      });
    });

    it('should generate embedding successfully', async () => {
      const mockEmbedding = createValidEmbedding();
      mockedAxios.post.mockResolvedValueOnce(createMockResponse(mockEmbedding));

      const result = await service.generateEmbedding('test text');

      expect(result).toHaveLength(1536);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.openai.com/v1/embeddings',
        {
          input: 'test text',
          model: 'text-embedding-3-small',
        },
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        })
      );
    });

    it('should normalize the embedding vector', async () => {
      const mockEmbedding = [3, 4, 0]; // Simple 3D vector with magnitude 5
      mockedAxios.post.mockResolvedValueOnce(createMockResponse(mockEmbedding));

      const result = await service.generateEmbedding('test text');

      // After normalization, magnitude should be 1
      const magnitude = Math.sqrt(result.reduce((sum, val) => sum + val * val, 0));
      expect(magnitude).toBeCloseTo(1, 5);
    });

    it('should handle zero magnitude vector', async () => {
      const mockEmbedding = [0, 0, 0]; // Zero vector
      mockedAxios.post.mockResolvedValueOnce(createMockResponse(mockEmbedding));

      const result = await service.generateEmbedding('test text');

      // For zero vector, first element should be set to 1
      expect(result[0]).toBe(1);
    });

    it('should throw error when API key is empty', async () => {
      // Access private field to clear API key
      (service as unknown as { apiKey: string }).apiKey = '';

      await expect(service.generateEmbedding('test text')).rejects.toThrow(
        'No OpenAI API key available'
      );
    });

    it('should throw error for invalid response - missing data', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          data: [],
        },
      });

      await expect(service.generateEmbedding('test text')).rejects.toThrow(
        'Invalid response from OpenAI API - missing embedding data'
      );
    });

    it('should throw error for invalid response - empty embedding', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          data: [{ embedding: [] }],
        },
      });

      await expect(service.generateEmbedding('test text')).rejects.toThrow(
        'Invalid embedding returned from OpenAI API'
      );
    });

    it('should throw error for invalid response - null embedding', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          data: [{ embedding: null }],
        },
      });

      await expect(service.generateEmbedding('test text')).rejects.toThrow(
        'Invalid embedding returned from OpenAI API'
      );
    });

    it('should handle 401 authentication error', async () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 401,
          data: { error: 'Invalid API key' },
        },
        message: 'Request failed',
      };
      mockedAxios.post.mockRejectedValueOnce(axiosError);

      await expect(service.generateEmbedding('test text')).rejects.toThrow(
        'OpenAI API authentication failed - invalid API key'
      );
    });

    it('should handle 429 rate limit error', async () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 429,
          data: { error: 'Rate limit exceeded' },
        },
        message: 'Request failed',
      };
      mockedAxios.post.mockRejectedValueOnce(axiosError);

      await expect(service.generateEmbedding('test text')).rejects.toThrow(
        'OpenAI API rate limit exceeded - try again later'
      );
    });

    it('should handle 500 server error', async () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 500,
          data: { error: 'Internal server error' },
        },
        message: 'Request failed',
      };
      mockedAxios.post.mockRejectedValueOnce(axiosError);

      await expect(service.generateEmbedding('test text')).rejects.toThrow(
        'OpenAI API server error (500) - try again later'
      );
    });

    it('should handle axios error with response data', async () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 400,
          data: { error: 'Bad request', details: 'Invalid input' },
        },
        message: 'Request failed',
      };
      mockedAxios.post.mockRejectedValueOnce(axiosError);

      await expect(service.generateEmbedding('test text')).rejects.toThrow(
        /OpenAI API error \(400\)/
      );
    });

    it('should handle axios error without status code', async () => {
      const axiosError = {
        isAxiosError: true,
        response: {},
        message: 'Network error',
      };
      mockedAxios.post.mockRejectedValueOnce(axiosError);

      await expect(service.generateEmbedding('test text')).rejects.toThrow(
        /OpenAI API error \(unknown\)/
      );
    });

    it('should handle non-axios errors', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network timeout'));

      await expect(service.generateEmbedding('test text')).rejects.toThrow(
        'Error generating embedding: Network timeout'
      );
    });

    it('should handle non-Error objects', async () => {
      mockedAxios.post.mockRejectedValueOnce('string error');

      await expect(service.generateEmbedding('test text')).rejects.toThrow(
        'Error generating embedding: string error'
      );
    });

    it('should log token usage when DEBUG is enabled', async () => {
      process.env.DEBUG = 'true';
      mockedAxios.post.mockResolvedValueOnce(createMockResponse());

      await service.generateEmbedding('test text');

      // Logger.debug should have been called with token usage
      const { logger } = await import('../../utils/logger.js');
      expect(logger.debug).toHaveBeenCalledWith('OpenAI embedding token usage', expect.any(Object));
    });
  });

  // --------------------------------------------------------------------------
  // generateEmbeddings Tests
  // --------------------------------------------------------------------------

  describe('generateEmbeddings', () => {
    let service: OpenAIEmbeddingService;

    beforeEach(() => {
      service = new OpenAIEmbeddingService({
        apiKey: 'test-api-key',
      });
    });

    it('should generate multiple embeddings successfully', async () => {
      const mockEmbeddings = [createValidEmbedding(), createValidEmbedding()];
      mockedAxios.post.mockResolvedValueOnce(createMockBatchResponse(mockEmbeddings));

      const result = await service.generateEmbeddings(['text 1', 'text 2']);

      expect(result).toHaveLength(2);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.openai.com/v1/embeddings',
        {
          input: ['text 1', 'text 2'],
          model: 'text-embedding-3-small',
        },
        expect.any(Object)
      );
    });

    it('should normalize all embedding vectors', async () => {
      const mockEmbeddings = [
        [3, 4, 0],
        [0, 5, 12],
      ];
      mockedAxios.post.mockResolvedValueOnce(createMockBatchResponse(mockEmbeddings));

      const result = await service.generateEmbeddings(['text 1', 'text 2']);

      // Check both vectors are normalized
      for (const embedding of result) {
        const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        expect(magnitude).toBeCloseTo(1, 5);
      }
    });

    it('should throw error when API call fails', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('API Error'));

      await expect(service.generateEmbeddings(['text 1', 'text 2'])).rejects.toThrow(
        'Failed to generate embeddings: API Error'
      );
    });

    it('should handle non-Error objects in batch', async () => {
      mockedAxios.post.mockRejectedValueOnce('string error');

      await expect(service.generateEmbeddings(['text'])).rejects.toThrow(
        'Failed to generate embeddings: string error'
      );
    });
  });

  // --------------------------------------------------------------------------
  // getModelInfo Tests
  // --------------------------------------------------------------------------

  describe('getModelInfo', () => {
    it('should return default model info', () => {
      const service = new OpenAIEmbeddingService({
        apiKey: 'test-api-key',
      });

      const info = service.getModelInfo();

      expect(info.name).toBe('text-embedding-3-small');
      expect(info.dimensions).toBe(1536);
      expect(info.version).toBe('3.0.0');
    });

    it('should return custom model info', () => {
      const service = new OpenAIEmbeddingService({
        apiKey: 'test-api-key',
        model: 'custom-model',
        dimensions: 768,
        version: '2.0.0',
      });

      const info = service.getModelInfo();

      expect(info.name).toBe('custom-model');
      expect(info.dimensions).toBe(768);
      expect(info.version).toBe('2.0.0');
    });
  });
});
