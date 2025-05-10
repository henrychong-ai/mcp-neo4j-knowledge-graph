import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { EmbeddingService, EmbeddingModelInfo } from '../EmbeddingService';
import type { EmbeddingServiceFactory as EmbeddingServiceFactoryType } from '../EmbeddingServiceFactory';

// Test suite for EmbeddingService interface
describe('EmbeddingService Interface', () => {
  // This test validates the structure and behavior expected of any EmbeddingService implementation
  it('should have the required methods and properties', async () => {
    // We will dynamically import the interface once we create it
    const { EmbeddingService } = await import('../EmbeddingService.js');

    // Check that the interface exists
    expect(EmbeddingService).toBeDefined();

    // Define the methods we expect the interface to have
    const expectedMethods = ['generateEmbedding', 'generateEmbeddings', 'getModelInfo'];

    // Check that all expected methods are defined on the interface
    expectedMethods.forEach((method) => {
      expect(EmbeddingService.prototype).toHaveProperty(method);
    });
  });

  // Test for plugin system functionality
  it('should have a factory to create embedding service instances', async () => {
    // We will dynamically import the factory once we create it
    const { EmbeddingServiceFactory } = await import('../EmbeddingServiceFactory.js');

    // Check that the factory exists
    expect(EmbeddingServiceFactory).toBeDefined();

    // Check that the factory has the expected methods
    expect(EmbeddingServiceFactory).toHaveProperty('registerProvider');
    expect(EmbeddingServiceFactory).toHaveProperty('createService');
  });

  // Test for specific functionality
  it('should generate embeddings that are normalized vectors of the right dimension', async () => {
    // We will dynamically import the default implementation once we create it
    const { DefaultEmbeddingService } = await import('../DefaultEmbeddingService.js');

    // Create an instance of the default implementation
    const service = new DefaultEmbeddingService();

    // Generate an embedding for some text
    const embedding = await service.generateEmbedding('test text');

    // Validate the embedding format
    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBeGreaterThan(0);

    // Check that the embedding is normalized (L2 norm should be approximately 1)
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    expect(magnitude).toBeCloseTo(1.0, 1);

    // Get model info and verify embedding dimension matches the model's reported dimension
    const modelInfo = service.getModelInfo();
    expect(modelInfo).toHaveProperty('name');
    expect(modelInfo).toHaveProperty('dimensions');
    expect(modelInfo).toHaveProperty('version');
    expect(embedding.length).toBe(modelInfo.dimensions);
  });

  // Test batch processing
  it('should process batches of text efficiently', async () => {
    // We will dynamically import the default implementation once we create it
    const { DefaultEmbeddingService } = await import('../DefaultEmbeddingService.js');

    // Create an instance
    const service = new DefaultEmbeddingService();

    // Generate embeddings for a batch of texts
    const texts = ['first text', 'second text', 'third text'];
    const embeddings = await service.generateEmbeddings(texts);

    // Validate batch results
    expect(Array.isArray(embeddings)).toBe(true);
    expect(embeddings.length).toBe(texts.length);

    // Check that each embedding is a properly formatted vector
    embeddings.forEach((embedding) => {
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(service.getModelInfo().dimensions);

      // Verify normalization
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      expect(magnitude).toBeCloseTo(1.0, 1);
    });
  });
});
