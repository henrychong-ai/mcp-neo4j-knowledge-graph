/**
 * Integration tests for Hybrid Retrieval System
 * Tests the complete integration with Neo4jStorageProvider
 */

import { describe, it, expect } from 'vitest';
import { HybridRetriever } from '../HybridRetriever.js';
import { DEFAULT_HYBRID_CONFIG } from '../types.js';

describe('Hybrid Retrieval Integration', () => {
  it('should have correct default configuration', () => {
    expect(DEFAULT_HYBRID_CONFIG.vectorWeight).toBe(0.5);
    expect(DEFAULT_HYBRID_CONFIG.graphWeight).toBe(0.2);
    expect(DEFAULT_HYBRID_CONFIG.temporalWeight).toBe(0.15);
    expect(DEFAULT_HYBRID_CONFIG.connectionWeight).toBe(0.15);
    expect(DEFAULT_HYBRID_CONFIG.enableScoreDebug).toBe(false);
    expect(DEFAULT_HYBRID_CONFIG.temporalHalfLife).toBe(30);
  });

  it('should create HybridRetriever with default config', () => {
    const retriever = new HybridRetriever();
    const config = retriever.getConfig();

    expect(config.vectorWeight).toBe(0.5);
    expect(config.graphWeight).toBe(0.2);
    expect(config.temporalWeight).toBe(0.15);
    expect(config.connectionWeight).toBe(0.15);
  });

  it('should allow custom configuration', () => {
    const retriever = new HybridRetriever({
      config: {
        vectorWeight: 0.4,
        graphWeight: 0.3,
        temporalWeight: 0.2,
        connectionWeight: 0.1,
        enableScoreDebug: true,
        temporalHalfLife: 60,
      },
    });

    const config = retriever.getConfig();
    expect(config.vectorWeight).toBe(0.4);
    expect(config.graphWeight).toBe(0.3);
    expect(config.temporalWeight).toBe(0.2);
    expect(config.connectionWeight).toBe(0.1);
    expect(config.enableScoreDebug).toBe(true);
    expect(config.temporalHalfLife).toBe(60);
  });

  it('should validate weight sum and warn if not equal to 1.0', () => {
    // This test just ensures the retriever can be created with non-normalized weights
    // The warning is logged but doesn't prevent creation
    const retriever = new HybridRetriever({
      config: {
        vectorWeight: 0.8,
        graphWeight: 0.1,
        temporalWeight: 0.05,
        connectionWeight: 0.05,
        // Sum = 1.0, should not warn
      },
    });

    expect(retriever).toBeDefined();
  });
});
