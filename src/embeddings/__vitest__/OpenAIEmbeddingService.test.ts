import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAIEmbeddingService } from '../OpenAIEmbeddingService.js';
import { EmbeddingServiceFactory } from '../EmbeddingServiceFactory.js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import type { EmbeddingServiceConfig } from '../EmbeddingServiceFactory';

// Load environment variables from .env file
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('Loaded .env file for API key');
}

// Check if we're in mock mode
const useMockEmbeddings = process.env.MOCK_EMBEDDINGS === 'true';
if (useMockEmbeddings) {
  console.log('MOCK_EMBEDDINGS=true - OpenAI API tests will be skipped');
}

// Check for API key availability
const hasApiKey = process.env.OPENAI_API_KEY !== undefined;
console.log(`OpenAI API key ${hasApiKey ? 'is' : 'is not'} available`);

// Only run real API tests if we have a key AND we're not in mock mode
const shouldRunTests = hasApiKey && !useMockEmbeddings;
// Use conditional test functions based on environment
const conditionalTest = shouldRunTests ? it : it.skip;

// Log the decision for clarity
console.log(`OpenAI API tests ${shouldRunTests ? 'WILL' : 'will NOT'} run`);

// Set NODE_ENV to match actual runtime
process.env.NODE_ENV = undefined;

describe('OpenAIEmbeddingService', () => {
  beforeEach(() => {
    // Reset factory
    EmbeddingServiceFactory.resetRegistry();

    // Register the OpenAI provider for testing
    EmbeddingServiceFactory.registerProvider('openai', (config?: EmbeddingServiceConfig) => {
      return new OpenAIEmbeddingService({
        apiKey: config?.apiKey || process.env.OPENAI_API_KEY!,
        model: config?.model,
        dimensions: config?.dimensions,
      });
    });

    // Increase timeout for real API calls
    vi.setConfig({ testTimeout: 15000 });
  });

  conditionalTest('should create service instance directly', () => {
    // Skip if no API key
    if (!hasApiKey) {
      console.log('Skipping test - no OpenAI API key available');
      return;
    }

    const service = new OpenAIEmbeddingService({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'text-embedding-3-small',
    });

    expect(service).toBeInstanceOf(OpenAIEmbeddingService);
  });

  conditionalTest('should create service instance via factory', () => {
    // Skip if no API key
    if (!hasApiKey) {
      console.log('Skipping test - no OpenAI API key available');
      return;
    }

    const service = EmbeddingServiceFactory.createService({
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY!,
    });

    expect(service).toBeInstanceOf(OpenAIEmbeddingService);
  });

  conditionalTest('should return correct model info', () => {
    // Skip if no API key
    if (!hasApiKey) {
      console.log('Skipping test - no OpenAI API key available');
      return;
    }

    const service = new OpenAIEmbeddingService({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'text-embedding-3-small',
    });

    const modelInfo = service.getModelInfo();
    expect(modelInfo.name).toBe('text-embedding-3-small');
    expect(modelInfo.dimensions).toBe(1536);
    expect(modelInfo.version).toBeDefined();
  });

  conditionalTest('should generate embedding for single text input', async () => {
    // Skip if no API key
    if (!hasApiKey) {
      console.log('Skipping test - no OpenAI API key available');
      return;
    }

    const service = new OpenAIEmbeddingService({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'text-embedding-3-small',
    });

    const embedding = await service.generateEmbedding('Test text');

    // Verify embedding structure
    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBe(1536);

    // Check for normalization
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    expect(magnitude).toBeCloseTo(1.0, 5);
  });

  conditionalTest('should generate embeddings for multiple texts', async () => {
    // Skip if no API key
    if (!hasApiKey) {
      console.log('Skipping test - no OpenAI API key available');
      return;
    }

    const service = new OpenAIEmbeddingService({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'text-embedding-3-small',
    });

    const texts = ['Text 1', 'Text 2', 'Text 3'];
    const embeddings = await service.generateEmbeddings(texts);

    // Verify array structure
    expect(Array.isArray(embeddings)).toBe(true);
    expect(embeddings.length).toBe(3);

    // Check each embedding
    embeddings.forEach((embedding) => {
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(1536);

      // Check for normalization
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      expect(magnitude).toBeCloseTo(1.0, 5);
    });
  });
});
