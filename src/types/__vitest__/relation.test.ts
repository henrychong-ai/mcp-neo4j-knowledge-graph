/**
 * Test file for the Relation interface
 * Migrated from Jest to Vitest and converted to TypeScript
 */
import { describe, it, expect } from 'vitest';
import { Relation } from '../relation.js';

// Single, focused test for the smallest unit of functionality
describe('Relation Interface', () => {
  it('should define the basic relation properties', () => {
    // Define a minimal relation object that should conform to the interface
    const relation = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
    };

    // Verify required properties
    expect(relation.from).toBe('entityA');
    expect(relation.to).toBe('entityB');
    expect(relation.relationType).toBe('knows');

    // Verify the Relation interface exists and can be imported
    expect(typeof Relation).toBe('function'); // The interface should have a validator function
  });

  it('should define optional strength property', () => {
    // Define a relation with strength
    const relation = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      strength: 0.8,
    };

    // Verify the strength property
    expect(relation.strength).toBe(0.8);

    // Verify that object with strength is still a valid Relation
    expect(Relation.isRelation(relation)).toBe(true);

    // Check that the validator properly handles the optional strength property
    expect(Relation.hasStrength(relation)).toBe(true);
  });

  it('should define optional confidence property', () => {
    // Define a relation with confidence
    const relation = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      confidence: 0.9,
    };

    // Verify the confidence property
    expect(relation.confidence).toBe(0.9);

    // Verify that object with confidence is still a valid Relation
    expect(Relation.isRelation(relation)).toBe(true);

    // Check that the validator properly handles the optional confidence property
    expect(Relation.hasConfidence(relation)).toBe(true);
  });

  it('should define optional metadata property with timestamps', () => {
    // Define a timestamp for testing
    const now = Date.now();

    // Define a relation with metadata
    const relation = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      metadata: {
        createdAt: now,
        updatedAt: now,
      },
    };

    // Verify the metadata property
    expect(relation.metadata).toBeDefined();
    expect(relation.metadata.createdAt).toBe(now);
    expect(relation.metadata.updatedAt).toBe(now);

    // Verify that object with metadata is still a valid Relation
    expect(Relation.isRelation(relation)).toBe(true);

    // Check that the validator properly handles the metadata
    expect(Relation.hasValidMetadata(relation)).toBe(true);

    // Test with complete metadata
    const fullRelation = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      metadata: {
        createdAt: now,
        updatedAt: now,
        lastAccessed: now - 1000,
        inferredFrom: ['relationId1', 'relationId2'],
      },
    };

    // Verify optional metadata properties
    expect(Relation.hasValidMetadata(fullRelation)).toBe(true);
    expect(fullRelation.metadata.lastAccessed).toBe(now - 1000);
    expect(fullRelation.metadata.inferredFrom).toEqual(['relationId1', 'relationId2']);
  });

  // Additional tests to cover edge cases for isRelation
  describe('isRelation validation', () => {
    it('should return falsy for null or undefined input', () => {
      expect(Relation.isRelation(null)).toBeFalsy();
      expect(Relation.isRelation(undefined)).toBeFalsy();
    });

    it('should return false when required properties are missing', () => {
      expect(Relation.isRelation({ to: 'entityB', relationType: 'knows' })).toBe(false); // Missing 'from'
      expect(Relation.isRelation({ from: 'entityA', relationType: 'knows' })).toBe(false); // Missing 'to'
      expect(Relation.isRelation({ from: 'entityA', to: 'entityB' })).toBe(false); // Missing 'relationType'
    });

    it('should return false when properties have incorrect types', () => {
      expect(Relation.isRelation({ from: 123, to: 'entityB', relationType: 'knows' })).toBe(false); // 'from' not string
      expect(Relation.isRelation({ from: 'entityA', to: 123, relationType: 'knows' })).toBe(false); // 'to' not string
      expect(Relation.isRelation({ from: 'entityA', to: 'entityB', relationType: 123 })).toBe(
        false
      ); // 'relationType' not string
      expect(
        Relation.isRelation({
          from: 'entityA',
          to: 'entityB',
          relationType: 'knows',
          strength: 'high',
        })
      ).toBe(false); // 'strength' not number
      expect(
        Relation.isRelation({
          from: 'entityA',
          to: 'entityB',
          relationType: 'knows',
          confidence: 'maybe',
        })
      ).toBe(false); // 'confidence' not number
      expect(
        Relation.isRelation({
          from: 'entityA',
          to: 'entityB',
          relationType: 'knows',
          metadata: 'invalid',
        })
      ).toBe(false); // 'metadata' not object
    });
  });

  // Additional tests to cover edge cases for hasStrength
  describe('hasStrength validation', () => {
    it('should return falsy for non-relation input', () => {
      expect(Relation.hasStrength(null)).toBeFalsy();
      expect(Relation.hasStrength({ from: 'entityA' })).toBeFalsy(); // Not a valid relation
    });

    it('should return false when strength is missing, not a number, or out of range', () => {
      // Valid relation without strength
      expect(
        Relation.hasStrength({
          from: 'entityA',
          to: 'entityB',
          relationType: 'knows',
        })
      ).toBe(false);

      // With invalid strength values
      expect(
        Relation.hasStrength({
          from: 'entityA',
          to: 'entityB',
          relationType: 'knows',
          strength: -0.1,
        })
      ).toBe(false); // Below range

      expect(
        Relation.hasStrength({
          from: 'entityA',
          to: 'entityB',
          relationType: 'knows',
          strength: 1.1,
        })
      ).toBe(false); // Above range
    });
  });

  // Additional tests to cover edge cases for hasConfidence
  describe('hasConfidence validation', () => {
    it('should return falsy for non-relation input', () => {
      expect(Relation.hasConfidence(null)).toBeFalsy();
      expect(Relation.hasConfidence({ to: 'entityB' })).toBeFalsy(); // Not a valid relation
    });

    it('should return false when confidence is missing, not a number, or out of range', () => {
      // Valid relation without confidence
      expect(
        Relation.hasConfidence({
          from: 'entityA',
          to: 'entityB',
          relationType: 'knows',
        })
      ).toBe(false);

      // With invalid confidence values
      expect(
        Relation.hasConfidence({
          from: 'entityA',
          to: 'entityB',
          relationType: 'knows',
          confidence: -0.1,
        })
      ).toBe(false); // Below range

      expect(
        Relation.hasConfidence({
          from: 'entityA',
          to: 'entityB',
          relationType: 'knows',
          confidence: 1.1,
        })
      ).toBe(false); // Above range
    });
  });

  // Additional tests to cover edge cases for hasValidMetadata
  describe('hasValidMetadata validation', () => {
    it('should return false for non-relation input or missing metadata', () => {
      expect(Relation.hasValidMetadata(null)).toBe(false);
      expect(
        Relation.hasValidMetadata({
          from: 'entityA',
          to: 'entityB',
          relationType: 'knows',
        })
      ).toBe(false); // No metadata
    });

    it('should return false when required metadata fields are missing or invalid', () => {
      // Missing createdAt
      expect(
        Relation.hasValidMetadata({
          from: 'entityA',
          to: 'entityB',
          relationType: 'knows',
          metadata: { updatedAt: Date.now() },
        })
      ).toBe(false);

      // Missing updatedAt
      expect(
        Relation.hasValidMetadata({
          from: 'entityA',
          to: 'entityB',
          relationType: 'knows',
          metadata: { createdAt: Date.now() },
        })
      ).toBe(false);

      // Invalid type for createdAt
      expect(
        Relation.hasValidMetadata({
          from: 'entityA',
          to: 'entityB',
          relationType: 'knows',
          metadata: { createdAt: '2023-01-01', updatedAt: Date.now() },
        })
      ).toBe(false);

      // Invalid type for updatedAt
      expect(
        Relation.hasValidMetadata({
          from: 'entityA',
          to: 'entityB',
          relationType: 'knows',
          metadata: { createdAt: Date.now(), updatedAt: '2023-01-01' },
        })
      ).toBe(false);
    });

    it('should return false when optional metadata fields have invalid types', () => {
      const now = Date.now();

      // Invalid lastAccessed type
      expect(
        Relation.hasValidMetadata({
          from: 'entityA',
          to: 'entityB',
          relationType: 'knows',
          metadata: {
            createdAt: now,
            updatedAt: now,
            lastAccessed: '1 hour ago', // Not a number
          },
        })
      ).toBe(false);

      // Invalid inferredFrom type
      expect(
        Relation.hasValidMetadata({
          from: 'entityA',
          to: 'entityB',
          relationType: 'knows',
          metadata: {
            createdAt: now,
            updatedAt: now,
            inferredFrom: 'relation1', // Not an array
          },
        })
      ).toBe(false);

      // Invalid items in inferredFrom array
      expect(
        Relation.hasValidMetadata({
          from: 'entityA',
          to: 'entityB',
          relationType: 'knows',
          metadata: {
            createdAt: now,
            updatedAt: now,
            inferredFrom: ['relation1', 123], // Contains non-string
          },
        })
      ).toBe(false);
    });
  });
});
