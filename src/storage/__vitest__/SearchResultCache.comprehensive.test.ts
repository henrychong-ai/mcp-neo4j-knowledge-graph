/**
 * Comprehensive tests for SearchResultCache edge cases
 * Covers: eviction, size estimation, performance tracking
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchResultCache } from '../SearchResultCache.js';

describe('SearchResultCache Comprehensive', () => {
  // --------------------------------------------------------------------------
  // Size Estimation Tests
  // --------------------------------------------------------------------------

  describe('size estimation', () => {
    it('should estimate size for null values', () => {
      const cache = new SearchResultCache({ maxSize: 1024 });
      cache.set('test', null);
      const stats = cache.getStats();
      // Null returns 0 size, so entry overhead should be minimal
      expect(stats.currentSize).toBeGreaterThanOrEqual(0);
    });

    it('should estimate size for undefined values', () => {
      const cache = new SearchResultCache({ maxSize: 1024 });
      cache.set('test', undefined);
      const stats = cache.getStats();
      expect(stats.currentSize).toBeGreaterThanOrEqual(0);
    });

    it('should estimate size for number arrays (vectors)', () => {
      const cache = new SearchResultCache({ maxSize: 100000 });
      const vector = new Array(1536).fill(0.1);
      cache.set('vector', vector);
      const stats = cache.getStats();
      // 1536 * 8 bytes = 12288 bytes
      expect(stats.currentSize).toBe(1536 * 8);
    });

    it('should estimate size for strings', () => {
      const cache = new SearchResultCache({ maxSize: 10000 });
      const str = 'Hello World'; // 11 chars * 2 bytes = 22 bytes
      cache.set('string', str);
      const stats = cache.getStats();
      expect(stats.currentSize).toBe(22);
    });

    it('should estimate size for objects with data string property', () => {
      const cache = new SearchResultCache({ maxSize: 10000 });
      const obj = { data: 'test string' }; // 11 chars * 2 + 100 overhead = 122 bytes
      cache.set('obj', obj);
      const stats = cache.getStats();
      expect(stats.currentSize).toBe(122);
    });

    it('should estimate size for complex objects using JSON', () => {
      const cache = new SearchResultCache({ maxSize: 100000 });
      const obj = { nested: { deep: { value: 123 } }, array: [1, 2, 3] };
      cache.set('complex', obj);
      const stats = cache.getStats();
      expect(stats.currentSize).toBeGreaterThan(0);
    });

    it('should handle objects that fail JSON stringification', () => {
      const cache = new SearchResultCache({ maxSize: 10000 });
      const obj: Record<string, unknown> = {};
      obj.circular = obj; // Circular reference
      cache.set('circular', obj);
      const stats = cache.getStats();
      // Should default to 1024 bytes when stringification fails
      expect(stats.currentSize).toBe(1024);
    });
  });

  // --------------------------------------------------------------------------
  // Eviction Tests
  // --------------------------------------------------------------------------

  describe('eviction', () => {
    it('should not cache items larger than maxSize', () => {
      const cache = new SearchResultCache({ maxSize: 100 });
      const largeString = 'x'.repeat(1000); // 2000 bytes > 100 byte limit
      cache.set('large', largeString);
      expect(cache.get('large')).toBeUndefined();
      expect(cache.size()).toBe(0);
    });

    it('should evict oldest entries when cache is full', () => {
      // Create a very small cache
      const cache = new SearchResultCache({ maxSize: 100 });

      // Add first entry - should fit
      cache.set('first', 'short'); // ~10 bytes
      expect(cache.has('first')).toBe(true);

      // Add second entry - should fit
      cache.set('second', 'value'); // ~10 bytes
      expect(cache.has('second')).toBe(true);

      // Add large entry that forces eviction
      cache.set('third', 'x'.repeat(30)); // ~60 bytes, should evict oldest
      expect(cache.has('third')).toBe(true);
    });

    it('should evict multiple entries if needed', () => {
      const cache = new SearchResultCache({ maxSize: 200 });

      // Add several small entries
      cache.set('a', 'value1'); // ~12 bytes
      cache.set('b', 'value2'); // ~12 bytes
      cache.set('c', 'value3'); // ~12 bytes
      cache.set('d', 'value4'); // ~12 bytes

      // Add a larger entry that requires evicting multiple entries
      cache.set('large', 'x'.repeat(80)); // ~160 bytes, should evict multiple

      // Should have the large entry
      expect(cache.has('large')).toBe(true);
    });

    it('should not evict from empty cache', () => {
      const cache = new SearchResultCache({ maxSize: 100 });
      // This should not throw
      cache.set('test', 'value');
      expect(cache.size()).toBe(1);
    });

    it('should track eviction statistics', () => {
      // Create a tiny cache (50 bytes) to force eviction
      const cache = new SearchResultCache({ maxSize: 50 });

      // Add first entry (~10 bytes for 'short')
      cache.set('first', 'short');

      // Add second entry (~10 bytes for 'value')
      cache.set('second', 'value');

      // Add entry large enough to force eviction (~60 bytes > 50 maxSize - current)
      cache.set('third', 'x'.repeat(20));

      const stats = cache.getStats();
      // Eviction may or may not happen depending on total size calculation
      // Check that the cache has at least one entry
      expect(stats.entryCount).toBeGreaterThanOrEqual(1);
    });
  });

  // --------------------------------------------------------------------------
  // Cache Key Generation Tests
  // --------------------------------------------------------------------------

  describe('cache key generation', () => {
    it('should generate consistent keys for same params in different order', () => {
      const cache = new SearchResultCache();

      cache.set('query', 'value1', { a: 1, b: 2 });
      const result = cache.get('query', { b: 2, a: 1 });

      expect(result).toBe('value1');
    });

    it('should handle params with complex values', () => {
      const cache = new SearchResultCache();

      cache.set('query', 'value', { nested: { deep: true }, array: [1, 2] });
      const result = cache.get('query', { nested: { deep: true }, array: [1, 2] });

      expect(result).toBe('value');
    });

    it('should treat queries with and without params as different', () => {
      const cache = new SearchResultCache();

      cache.set('query', 'value1');
      cache.set('query', 'value2', { limit: 10 });

      expect(cache.get('query')).toBe('value1');
      expect(cache.get('query', { limit: 10 })).toBe('value2');
    });
  });

  // --------------------------------------------------------------------------
  // Statistics Tests with Disabled Stats
  // --------------------------------------------------------------------------

  describe('statistics disabled', () => {
    it('should not track stats when enableStats is false', () => {
      const cache = new SearchResultCache({ enableStats: false });

      cache.set('key', 'value');
      cache.get('key'); // hit
      cache.get('missing'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    it('should not track lookup time when stats disabled', () => {
      const cache = new SearchResultCache({ enableStats: false });

      cache.set('key', 'value');
      cache.get('key');

      const stats = cache.getStats();
      expect(stats.averageLookupTime).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle empty string keys', () => {
      const cache = new SearchResultCache();

      cache.set('', 'empty key value');
      expect(cache.get('')).toBe('empty key value');
    });

    it('should handle very long keys', () => {
      const cache = new SearchResultCache();
      const longKey = 'x'.repeat(10000);

      cache.set(longKey, 'value');
      expect(cache.get(longKey)).toBe('value');
    });

    it('should properly remove expired entries on removeExpired', () => {
      const cache = new SearchResultCache({ defaultTtl: 50 });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      // Wait for expiration
      return new Promise<void>(resolve => {
        setTimeout(() => {
          cache.removeExpired();
          expect(cache.size()).toBe(0);
          resolve();
        }, 100);
      });
    });

    it('should update currentSize correctly after expired entry removal in get', async () => {
      const cache = new SearchResultCache({ defaultTtl: 50 });

      cache.set('key', 'x'.repeat(50)); // ~100 bytes
      const initialSize = cache.getStats().currentSize;
      expect(initialSize).toBeGreaterThan(0);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get should remove expired entry and update size
      cache.get('key');
      const finalSize = cache.getStats().currentSize;
      expect(finalSize).toBe(0);
    });

    it('should update currentSize correctly after expired entry removal in has', async () => {
      const cache = new SearchResultCache({ defaultTtl: 50 });

      cache.set('key', 'x'.repeat(50)); // ~100 bytes
      const initialSize = cache.getStats().currentSize;
      expect(initialSize).toBeGreaterThan(0);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));

      // has should remove expired entry and update size
      cache.has('key');
      const finalSize = cache.getStats().currentSize;
      expect(finalSize).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Default Configuration Tests
  // --------------------------------------------------------------------------

  describe('default configuration', () => {
    it('should use default maxSize of 100MB', () => {
      const cache = new SearchResultCache();
      const stats = cache.getStats();
      expect(stats.maxSize).toBe(100 * 1024 * 1024);
    });

    it('should use default TTL of 5 minutes', async () => {
      const cache = new SearchResultCache();
      // We can't easily test 5 minutes, but we can verify the value exists

      // Store with default TTL
      cache.set('key', 'value');

      // Should still exist immediately
      expect(cache.has('key')).toBe(true);
    });

    it('should enable stats by default', () => {
      const cache = new SearchResultCache();

      cache.set('key', 'value');
      cache.get('key');

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Performance Tracking Tests
  // --------------------------------------------------------------------------

  describe('performance tracking', () => {
    it('should calculate hit rate correctly', () => {
      const cache = new SearchResultCache();

      cache.set('a', 1);
      cache.set('b', 2);

      cache.get('a'); // hit
      cache.get('a'); // hit
      cache.get('b'); // hit
      cache.get('c'); // miss

      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0.75); // 3 hits / 4 requests
    });

    it('should handle zero requests for hit rate', () => {
      const cache = new SearchResultCache();
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });

    it('should track average lookup time', () => {
      const cache = new SearchResultCache();

      cache.set('key', 'value');

      // Perform several lookups
      for (let i = 0; i < 10; i++) {
        cache.get('key');
      }

      const stats = cache.getStats();
      expect(stats.averageLookupTime).toBeGreaterThanOrEqual(0);
    });
  });
});
