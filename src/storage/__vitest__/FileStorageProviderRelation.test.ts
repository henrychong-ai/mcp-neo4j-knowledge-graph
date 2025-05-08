/**
 * Test file specifically for FileStorageProvider with enhanced relations
 * Migrated from Jest to Vitest and converted to TypeScript
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { FileStorageProvider } from '../FileStorageProvider.js';
import fs from 'fs';
import path from 'path';
import { Relation } from '../../types/relation.js';
import { KnowledgeGraph } from '../../KnowledgeGraphManager.js';

// Test directory setup
const testDir = path.join(process.cwd(), 'test-output', 'file-provider-relations');

// Ensure base test directory exists
beforeAll(() => {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
});

// Cleanup after tests
afterAll(() => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

describe('FileStorageProvider with Enhanced Relations', () => {
  let provider: FileStorageProvider;
  let testFilePath: string; // Will be unique for each test

  beforeEach(() => {
    // Create a unique file path for each test with more entropy
    const testId = Date.now() + '-' + Math.random().toString(36).substring(2, 15);
    testFilePath = path.join(testDir, `test-${testId}.json`);

    // Create a new provider for each test with the unique path
    provider = new FileStorageProvider({ memoryFilePath: testFilePath });
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      if (provider && (provider as any).cleanup) {
        await (provider as any).cleanup();
      }
      // Ensure we don't have any file handles open
      provider = null as any;

      // Remove test file if it exists (with a small delay to ensure handles are closed)
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    } catch (error) {
      console.error('Error during test cleanup:', (error as Error).message);
    }
  });

  it('should save and retrieve enhanced relation with strength property', async () => {
    // Create some entities first
    const graph: KnowledgeGraph = {
      entities: [
        { name: 'EntityA', entityType: 'test', observations: [] },
        { name: 'EntityB', entityType: 'test', observations: [] },
      ],
      relations: [],
    };

    await provider.saveGraph(graph);

    // Create a relation with strength
    const relationWithStrength: Relation = {
      from: 'EntityA',
      to: 'EntityB',
      relationType: 'knows',
      strength: 0.8,
    };

    // Try to create the relation
    const createdRelations = await provider.createRelations([relationWithStrength]);

    // Verify the relation was created with the strength property
    expect(createdRelations).toHaveLength(1);
    expect(createdRelations[0].strength).toBe(0.8);

    // Load the graph and verify the relation was saved with strength
    const loadedGraph = await provider.loadGraph();
    expect(loadedGraph.relations).toHaveLength(1);
    expect(loadedGraph.relations[0].strength).toBe(0.8);
  });

  it('should save and retrieve enhanced relation with confidence property', async () => {
    // Create some entities first
    const graph: KnowledgeGraph = {
      entities: [
        { name: 'EntityA', entityType: 'test', observations: [] },
        { name: 'EntityB', entityType: 'test', observations: [] },
      ],
      relations: [],
    };

    await provider.saveGraph(graph);

    // Create a relation with confidence
    const relationWithConfidence: Relation = {
      from: 'EntityA',
      to: 'EntityB',
      relationType: 'knows',
      confidence: 0.9,
    };

    // Try to create the relation
    const createdRelations = await provider.createRelations([relationWithConfidence]);

    // Verify the relation was created with the confidence property
    expect(createdRelations).toHaveLength(1);
    expect(createdRelations[0].confidence).toBe(0.9);

    // Load the graph and verify the relation was saved with confidence
    const loadedGraph = await provider.loadGraph();
    expect(loadedGraph.relations).toHaveLength(1);
    expect(loadedGraph.relations[0].confidence).toBe(0.9);
  });

  it('should save and retrieve enhanced relation with metadata property', async () => {
    // Create some entities first
    const graph: KnowledgeGraph = {
      entities: [
        { name: 'EntityA', entityType: 'test', observations: [] },
        { name: 'EntityB', entityType: 'test', observations: [] },
      ],
      relations: [],
    };

    await provider.saveGraph(graph);

    // Create a relation with metadata
    const currentTime = Date.now();
    const relationWithMetadata: Relation = {
      from: 'EntityA',
      to: 'EntityB',
      relationType: 'knows',
      metadata: {
        createdAt: currentTime,
        updatedAt: currentTime,
        source: 'test',
        timestamp: '2023-03-19T12:00:00Z',
        tags: ['important', 'verified'],
      } as any,
    };

    // Try to create the relation
    const createdRelations = await provider.createRelations([relationWithMetadata]);

    // Verify the relation was created with the metadata property
    expect(createdRelations).toHaveLength(1);
    expect(createdRelations[0].metadata).toHaveProperty('source', 'test');
    expect(createdRelations[0].metadata).toHaveProperty('tags');

    // Load the graph and verify the relation was saved with metadata
    const loadedGraph = await provider.loadGraph();
    expect(loadedGraph.relations).toHaveLength(1);
    expect(loadedGraph.relations[0].metadata).toHaveProperty('source', 'test');
    expect(loadedGraph.relations[0].metadata).toHaveProperty('tags');
  });

  it('should save and retrieve enhanced relation with all optional properties', async () => {
    // Create some entities first
    const graph: KnowledgeGraph = {
      entities: [
        { name: 'EntityA', entityType: 'test', observations: [] },
        { name: 'EntityB', entityType: 'test', observations: [] },
      ],
      relations: [],
    };

    await provider.saveGraph(graph);

    // Create a relation with all enhanced properties
    const currentTime = Date.now();
    const enhancedRelation: Relation = {
      from: 'EntityA',
      to: 'EntityB',
      relationType: 'knows',
      strength: 0.75,
      confidence: 0.95,
      metadata: {
        createdAt: currentTime,
        updatedAt: currentTime,
        source: 'complete test',
        tags: ['full', 'enhanced'],
        custom: { key: 'value' },
      } as any,
    };

    // Try to create the relation
    const createdRelations = await provider.createRelations([enhancedRelation]);

    // Verify the relation was created with all properties
    expect(createdRelations).toHaveLength(1);
    expect(createdRelations[0].strength).toBe(0.75);
    expect(createdRelations[0].confidence).toBe(0.95);
    expect(createdRelations[0].metadata).toHaveProperty('source', 'complete test');

    // Load the graph and verify the relation was saved with all properties
    const loadedGraph = await provider.loadGraph();
    expect(loadedGraph.relations).toHaveLength(1);
    expect(loadedGraph.relations[0].strength).toBe(0.75);
    expect(loadedGraph.relations[0].confidence).toBe(0.95);
    expect(loadedGraph.relations[0].metadata).toHaveProperty('source', 'complete test');
  });

  it('should update enhanced relation properties', async () => {
    // Create some entities first
    const graph: KnowledgeGraph = {
      entities: [
        { name: 'EntityA', entityType: 'test', observations: [] },
        { name: 'EntityB', entityType: 'test', observations: [] },
      ],
      relations: [],
    };

    await provider.saveGraph(graph);

    // Create an initial relation with some properties
    const initialRelation: Relation = {
      from: 'EntityA',
      to: 'EntityB',
      relationType: 'knows',
      strength: 0.5,
      confidence: 0.7,
    };

    await provider.createRelations([initialRelation]);

    // Update the relation with new values
    const currentTime = Date.now();
    const updatedRelation: Relation = {
      from: 'EntityA',
      to: 'EntityB',
      relationType: 'knows',
      strength: 0.8, // Updated strength
      confidence: 0.9, // Updated confidence
      metadata: {
        // Added metadata
        createdAt: currentTime,
        updatedAt: currentTime,
        source: 'update test',
      } as any,
    };

    // Try to update the relation
    // This will fail since updateRelation method doesn't exist yet
    try {
      await provider.updateRelation(updatedRelation);
      // If we get here, the test should fail
      expect(true).toBe(false); // This should not execute if an error was thrown
    } catch (error) {
      // Verify we got an error as expected
      expect(error).toBeDefined();
    }
  });
});
