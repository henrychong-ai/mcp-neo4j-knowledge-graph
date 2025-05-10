/**
 * Cache system for search results to improve performance for repeated queries
 */

/**
 * Cache entry with TTL
 */
interface CacheEntry<T> {
  // The cached data
  data: T;

  // Expiration timestamp
  expiration: number;

  // When the entry was created
  created: number;

  // Size of the entry in bytes (approximate)
  size: number;
}

/**
 * Cache configuration
 */
export interface SearchCacheConfig {
  // Maximum cache size in bytes
  maxSize?: number;

  // Default TTL in milliseconds
  defaultTtl?: number;

  // Enable cache statistics
  enableStats?: boolean;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  // Total number of cache hits
  hits: number;

  // Total number of cache misses
  misses: number;

  // Hit rate (0-1)
  hitRate: number;

  // Current size in bytes
  currentSize: number;

  // Maximum size in bytes
  maxSize: number;

  // Current number of entries
  entryCount: number;

  // Number of evictions
  evictions: number;

  // Average lookup time (ms)
  averageLookupTime: number;
}

/**
 * A memory-efficient cache for search results
 */
export class SearchResultCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private currentSize: number = 0;
  private defaultTtl: number;
  private enableStats: boolean;

  // Statistics
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;
  private totalLookupTime: number = 0;
  private totalLookups: number = 0;

  /**
   * Create a new SearchResultCache
   * @param config Configuration options
   */
  constructor(config?: SearchCacheConfig) {
    // Default to 100MB max size
    this.maxSize = config?.maxSize || 100 * 1024 * 1024;

    // Default to 5 minute TTL
    this.defaultTtl = config?.defaultTtl || 5 * 60 * 1000;

    // Enable stats by default
    this.enableStats = config?.enableStats !== false;
  }

  /**
   * Estimate the size of an object in bytes
   * @param obj The object to measure
   * @returns Approximate size in bytes
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private estimateSize(obj: any): number {
    if (obj === null || obj === undefined) {
      return 0;
    }

    // For arrays of numbers (vectors), use more precise calculation
    if (Array.isArray(obj) && obj.length > 0 && typeof obj[0] === 'number') {
      return obj.length * 8; // 8 bytes per number (Float64)
    }

    // For strings, use character count * 2 (for UTF-16)
    if (typeof obj === 'string') {
      return obj.length * 2;
    }

    // For simple objects with a 'data' property containing a string
    if (obj && typeof obj === 'object' && typeof obj.data === 'string') {
      return obj.data.length * 2 + 100; // String length + overhead
    }

    // Use JSON stringification as an approximation for complex objects
    // Add a small overhead to account for object structure
    try {
      const json = JSON.stringify(obj);
      return json ? json.length * 2 + 100 : 100; // UTF-16 characters + overhead
    } catch {
      // If stringification fails, use a reasonable default
      return 1024; // 1KB default
    }
  }

  /**
   * Generate a cache key from a query and parameters
   * @param query Original query string
   * @param params Optional parameters that affect the query
   * @returns A cache key string
   */
  private generateKey(query: string, params?: Record<string, unknown>): string {
    if (!params) {
      return query;
    }

    // Sort keys for consistent key generation regardless of parameter order
    const sortedParams = Object.keys(params)
      .sort()
      .map((key) => `${key}:${JSON.stringify(params[key])}`)
      .join(',');

    return `${query}|${sortedParams}`;
  }

  /**
   * Evict the oldest or least valuable entries to free up space
   * @param requiredSpace The amount of space needed
   */
  private evictEntries(requiredSpace: number): void {
    // If cache is empty, nothing to evict
    if (this.cache.size === 0) {
      return;
    }

    // Create an array of entries sorted by "value"
    // Value is determined by how recently they were created
    const entries = Array.from(this.cache.entries()).sort((a, b) => a[1].created - b[1].created);

    let freedSpace = 0;
    let evictionCount = 0;

    // Evict entries until we have enough space
    for (const [key, entry] of entries) {
      if (freedSpace >= requiredSpace && evictionCount > 0) {
        break;
      }

      this.cache.delete(key);
      freedSpace += entry.size;
      this.currentSize -= entry.size;
      evictionCount++;

      // Only evict the oldest entry and then check if we have enough space
      if (evictionCount === 1 && freedSpace >= requiredSpace) {
        break;
      }
    }

    // Update statistics
    if (this.enableStats) {
      this.evictions += evictionCount;
    }
  }

  /**
   * Set a cache entry
   * @param query The original query
   * @param params Optional parameters that affect the results
   * @param data The data to cache
   * @param ttl Optional time-to-live in milliseconds
   */
  set(query: string, data: T, params?: Record<string, unknown>, ttl?: number): void {
    // Clean expired entries
    this.removeExpired();

    // Generate cache key
    const key = this.generateKey(query, params);

    // Estimate data size
    const size = this.estimateSize(data);

    // If item is too large for the cache, don't cache it
    if (size > this.maxSize) {
      return;
    }

    // Calculate expiration time
    const now = Date.now();
    const expiration = now + (ttl || this.defaultTtl);

    // Create cache entry
    const entry: CacheEntry<T> = {
      data,
      expiration,
      created: now,
      size,
    };

    // Check if we need to make space
    if (this.currentSize + size > this.maxSize) {
      this.evictEntries(size);
    }

    // Add to cache
    this.cache.set(key, entry);
    this.currentSize += size;
  }

  /**
   * Get a value from the cache
   * @param query The original query
   * @param params Optional parameters that affect the results
   * @returns The cached data or undefined if not found or expired
   */
  get(query: string, params?: Record<string, unknown>): T | undefined {
    const startTime = this.enableStats ? performance.now() : 0;

    // Generate cache key
    const key = this.generateKey(query, params);

    // Get entry
    const entry = this.cache.get(key);

    // Track lookup time
    if (this.enableStats) {
      const endTime = performance.now();
      this.totalLookupTime += endTime - startTime;
      this.totalLookups++;
    }

    // If entry doesn't exist, return undefined
    if (!entry) {
      if (this.enableStats) {
        this.misses++;
      }
      return undefined;
    }

    // Check if expired
    if (entry.expiration < Date.now()) {
      // Remove expired entry
      this.cache.delete(key);
      this.currentSize -= entry.size;

      if (this.enableStats) {
        this.misses++;
      }

      return undefined;
    }

    // Valid cache hit
    if (this.enableStats) {
      this.hits++;
    }

    return entry.data;
  }

  /**
   * Remove all expired entries from the cache
   */
  removeExpired(): void {
    const now = Date.now();
    let removedSize = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiration < now) {
        this.cache.delete(key);
        removedSize += entry.size;
      }
    }

    this.currentSize -= removedSize;
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  /**
   * Get cache statistics
   * @returns Cache statistics
   */
  getStats(): CacheStats {
    // Calculate hit rate
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? this.hits / totalRequests : 0;

    // Calculate average lookup time
    const averageLookupTime = this.totalLookups > 0 ? this.totalLookupTime / this.totalLookups : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      hitRate,
      currentSize: this.currentSize,
      maxSize: this.maxSize,
      entryCount: this.cache.size,
      evictions: this.evictions,
      averageLookupTime,
    };
  }

  /**
   * Get the current number of entries in the cache
   * @returns Number of entries
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Check if the cache contains a specific key
   * @param query The original query
   * @param params Optional parameters that affect the results
   * @returns True if the key exists and is not expired
   */
  has(query: string, params?: Record<string, unknown>): boolean {
    const key = this.generateKey(query, params);
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    if (entry.expiration < Date.now()) {
      // Remove expired entry
      this.cache.delete(key);
      this.currentSize -= entry.size;
      return false;
    }

    return true;
  }
}
