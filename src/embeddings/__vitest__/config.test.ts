import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EMBEDDING_SETTINGS,
  getEmbeddingCacheConfig,
  getJobProcessingConfig,
} from '../config.js';

describe('Embedding Config', () => {
  describe('DEFAULT_EMBEDDING_SETTINGS', () => {
    it('should have expected batch size default', () => {
      expect(DEFAULT_EMBEDDING_SETTINGS.BATCH_SIZE).toBe(10);
    });

    it('should have expected API rate limit default', () => {
      expect(DEFAULT_EMBEDDING_SETTINGS.API_RATE_LIMIT_MS).toBe(1000);
    });

    it('should have expected cache TTL default (30 days)', () => {
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(DEFAULT_EMBEDDING_SETTINGS.CACHE_TTL_MS).toBe(thirtyDaysMs);
    });

    it('should have expected cache max size default', () => {
      expect(DEFAULT_EMBEDDING_SETTINGS.CACHE_MAX_SIZE).toBe(1000);
    });

    it('should have expected job cleanup age default (30 days)', () => {
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(DEFAULT_EMBEDDING_SETTINGS.JOB_CLEANUP_AGE_MS).toBe(thirtyDaysMs);
    });

    it('should have expected job status values', () => {
      expect(DEFAULT_EMBEDDING_SETTINGS.JOB_STATUS.PENDING).toBe('pending');
      expect(DEFAULT_EMBEDDING_SETTINGS.JOB_STATUS.PROCESSING).toBe('processing');
      expect(DEFAULT_EMBEDDING_SETTINGS.JOB_STATUS.COMPLETED).toBe('completed');
      expect(DEFAULT_EMBEDDING_SETTINGS.JOB_STATUS.FAILED).toBe('failed');
    });
  });

  describe('getEmbeddingCacheConfig', () => {
    it('should return default config when no options provided', () => {
      const config = getEmbeddingCacheConfig();

      expect(config.max).toBe(DEFAULT_EMBEDDING_SETTINGS.CACHE_MAX_SIZE);
      expect(config.ttl).toBe(DEFAULT_EMBEDDING_SETTINGS.CACHE_TTL_MS);
    });

    it('should override max when provided', () => {
      const config = getEmbeddingCacheConfig({ max: 500 });

      expect(config.max).toBe(500);
      expect(config.ttl).toBe(DEFAULT_EMBEDDING_SETTINGS.CACHE_TTL_MS);
    });

    it('should override ttl when provided', () => {
      const customTtl = 7 * 24 * 60 * 60 * 1000; // 7 days
      const config = getEmbeddingCacheConfig({ ttl: customTtl });

      expect(config.max).toBe(DEFAULT_EMBEDDING_SETTINGS.CACHE_MAX_SIZE);
      expect(config.ttl).toBe(customTtl);
    });

    it('should override both max and ttl when provided', () => {
      const config = getEmbeddingCacheConfig({ max: 2000, ttl: 3600000 });

      expect(config.max).toBe(2000);
      expect(config.ttl).toBe(3600000);
    });
  });

  describe('getJobProcessingConfig', () => {
    it('should return default config when no options provided', () => {
      const config = getJobProcessingConfig();

      expect(config.batchSize).toBe(DEFAULT_EMBEDDING_SETTINGS.BATCH_SIZE);
      expect(config.apiRateLimitMs).toBe(DEFAULT_EMBEDDING_SETTINGS.API_RATE_LIMIT_MS);
      expect(config.jobCleanupAgeMs).toBe(DEFAULT_EMBEDDING_SETTINGS.JOB_CLEANUP_AGE_MS);
    });

    it('should override batchSize when provided', () => {
      const config = getJobProcessingConfig({ batchSize: 20 });

      expect(config.batchSize).toBe(20);
      expect(config.apiRateLimitMs).toBe(DEFAULT_EMBEDDING_SETTINGS.API_RATE_LIMIT_MS);
      expect(config.jobCleanupAgeMs).toBe(DEFAULT_EMBEDDING_SETTINGS.JOB_CLEANUP_AGE_MS);
    });

    it('should override apiRateLimitMs when provided', () => {
      const config = getJobProcessingConfig({ apiRateLimitMs: 500 });

      expect(config.batchSize).toBe(DEFAULT_EMBEDDING_SETTINGS.BATCH_SIZE);
      expect(config.apiRateLimitMs).toBe(500);
      expect(config.jobCleanupAgeMs).toBe(DEFAULT_EMBEDDING_SETTINGS.JOB_CLEANUP_AGE_MS);
    });

    it('should override jobCleanupAgeMs when provided', () => {
      const config = getJobProcessingConfig({ jobCleanupAgeMs: 7 * 24 * 60 * 60 * 1000 });

      expect(config.batchSize).toBe(DEFAULT_EMBEDDING_SETTINGS.BATCH_SIZE);
      expect(config.apiRateLimitMs).toBe(DEFAULT_EMBEDDING_SETTINGS.API_RATE_LIMIT_MS);
      expect(config.jobCleanupAgeMs).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('should override all options when provided', () => {
      const config = getJobProcessingConfig({
        batchSize: 50,
        apiRateLimitMs: 2000,
        jobCleanupAgeMs: 86400000,
      });

      expect(config.batchSize).toBe(50);
      expect(config.apiRateLimitMs).toBe(2000);
      expect(config.jobCleanupAgeMs).toBe(86400000);
    });
  });
});
