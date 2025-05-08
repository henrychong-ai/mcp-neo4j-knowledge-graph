/**
 * Test file for the TemporalRelation interface
 * Migrated from Jest to Vitest and converted to TypeScript
 */
import { describe, it, expect } from 'vitest';
import { TemporalRelation } from '../temporalRelation.js';
import { Relation } from '../relation.js';

describe('TemporalRelation Interface', () => {
  // Basic structure tests
  it('should define the basic temporal relation properties', () => {
    // Define a timestamp for testing
    const now = Date.now();

    // Define a minimal temporal relation object
    const relation = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    // Verify required properties from Relation interface
    expect(relation.from).toBe('entityA');
    expect(relation.to).toBe('entityB');
    expect(relation.relationType).toBe('knows');

    // Verify temporal properties
    expect(relation.createdAt).toBe(now);
    expect(relation.updatedAt).toBe(now);
    expect(relation.version).toBe(1);

    // Verify the TemporalRelation interface exists and can be imported
    expect(typeof TemporalRelation).toBe('function');
    expect(TemporalRelation.isTemporalRelation(relation)).toBe(true);
  });

  // Validation tests
  it('should validate temporal relation structure', () => {
    const now = Date.now();

    const validRelation = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    const invalidRelation1 = {
      // Missing required Relation properties
      from: 'entityA',
      to: 'entityB',
      // No relationType
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    const invalidRelation2 = {
      // Missing required temporal properties
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      // No temporal properties
    };

    const invalidRelation3 = {
      // Invalid type for a property
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      createdAt: 'not-a-number',
      updatedAt: now,
      version: 1,
    };

    expect(TemporalRelation.isTemporalRelation(validRelation)).toBe(true);
    expect(TemporalRelation.isTemporalRelation(invalidRelation1)).toBe(false);
    expect(TemporalRelation.isTemporalRelation(invalidRelation2)).toBe(false);
    expect(TemporalRelation.isTemporalRelation(invalidRelation3)).toBe(false);
    expect(TemporalRelation.isTemporalRelation(null)).toBe(false);
    expect(TemporalRelation.isTemporalRelation(undefined)).toBe(false);
  });

  // Optional properties tests
  it('should support optional validity period properties', () => {
    const now = Date.now();
    const future = now + 86400000; // 24 hours in the future

    const relation = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      createdAt: now,
      updatedAt: now,
      version: 1,
      validFrom: now,
      validTo: future,
    };

    expect(relation.validFrom).toBe(now);
    expect(relation.validTo).toBe(future);
    expect(TemporalRelation.isTemporalRelation(relation)).toBe(true);
    expect(TemporalRelation.hasValidTimeRange(relation)).toBe(true);
  });

  it('should support optional relation properties alongside temporal properties', () => {
    const now = Date.now();

    const relation = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      strength: 0.8,
      confidence: 0.9,
      metadata: {
        inferredFrom: ['relation1'],
        lastAccessed: now - 1000,
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
      version: 1,
      changedBy: 'system',
    };

    // Verify optional Relation properties
    expect(relation.strength).toBe(0.8);
    expect(relation.confidence).toBe(0.9);
    expect(relation.metadata).toBeDefined();

    // Verify optional temporal properties
    expect(relation.changedBy).toBe('system');

    // Verify validation works with all optional properties
    expect(TemporalRelation.isTemporalRelation(relation)).toBe(true);
  });

  // Time range validation tests
  it('should validate temporal range correctly', () => {
    const now = Date.now();
    const past = now - 86400000; // 24 hours in the past
    const future = now + 86400000; // 24 hours in the future

    const validRelation1 = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      createdAt: now,
      updatedAt: now,
      version: 1,
      validFrom: past,
      validTo: future,
    };

    const validRelation2 = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      createdAt: now,
      updatedAt: now,
      version: 1,
      validFrom: now,
      validTo: now, // Same time is considered valid
    };

    const invalidRelation = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      createdAt: now,
      updatedAt: now,
      version: 1,
      validFrom: future,
      validTo: past, // Future before past is invalid
    };

    expect(TemporalRelation.hasValidTimeRange(validRelation1)).toBe(true);
    expect(TemporalRelation.hasValidTimeRange(validRelation2)).toBe(true);
    expect(TemporalRelation.hasValidTimeRange(invalidRelation)).toBe(false);
  });

  it('should handle partial time ranges correctly', () => {
    const now = Date.now();

    // Relation with only validFrom
    const onlyValidFrom = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      createdAt: now,
      updatedAt: now,
      version: 1,
      validFrom: now,
      // No validTo
    };

    // Relation with only validTo
    const onlyValidTo = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      createdAt: now,
      updatedAt: now,
      version: 1,
      // No validFrom
      validTo: now + 86400000,
    };

    expect(TemporalRelation.hasValidTimeRange(onlyValidFrom)).toBe(true);
    expect(TemporalRelation.hasValidTimeRange(onlyValidTo)).toBe(true);
  });

  // Comprehensive validation for isTemporalRelation
  it('should validate optional properties types correctly', () => {
    const now = Date.now();

    // Test invalid validFrom type
    const invalidValidFrom = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      createdAt: now,
      updatedAt: now,
      version: 1,
      validFrom: 'not-a-number', // Wrong type - should be a number
    };

    // Test invalid validTo type
    const invalidValidTo = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      createdAt: now,
      updatedAt: now,
      version: 1,
      validTo: 'not-a-number', // Wrong type - should be a number
    };

    // Test invalid changedBy type
    const invalidChangedBy = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      createdAt: now,
      updatedAt: now,
      version: 1,
      changedBy: 123, // Wrong type - should be a string
    };

    // Test invalid version type
    const invalidVersion = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      createdAt: now,
      updatedAt: now,
      version: '1', // Wrong type - should be a number
    };

    expect(TemporalRelation.isTemporalRelation(invalidValidFrom)).toBe(false);
    expect(TemporalRelation.isTemporalRelation(invalidValidTo)).toBe(false);
    expect(TemporalRelation.isTemporalRelation(invalidChangedBy)).toBe(false);
    expect(TemporalRelation.isTemporalRelation(invalidVersion)).toBe(false);
  });

  // Edge cases for hasValidTimeRange
  it('should validate time range for non-TemporalRelation objects', () => {
    // Test with object that will fail isTemporalRelation check
    const notARelation = {
      from: 'entityA',
      // Missing required properties
    };

    expect(TemporalRelation.hasValidTimeRange(notARelation)).toBe(false);
  });

  // Test relationship between strength/confidence and temporal properties
  it('should properly handle strength and confidence alongside temporal properties', () => {
    const now = Date.now();

    // Create relation with strength and temporal properties
    const relationWithStrength = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      strength: 0.7,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    // Create relation with confidence and temporal properties
    const relationWithConfidence = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      confidence: 0.85,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    // Check validity
    expect(TemporalRelation.isTemporalRelation(relationWithStrength)).toBe(true);
    expect(TemporalRelation.isTemporalRelation(relationWithConfidence)).toBe(true);

    // Check that strength/confidence validations still work
    // Use Relation methods for these checks
    expect(Relation.hasStrength(relationWithStrength)).toBe(true);
    expect(Relation.hasConfidence(relationWithConfidence)).toBe(true);

    // Check invalid strength/confidence values
    const invalidStrength = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      strength: 1.5, // Invalid: greater than 1.0
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    const invalidConfidence = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      confidence: -0.2, // Invalid: less than 0.0
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    // Should be valid temporal relations but invalid strength/confidence
    expect(TemporalRelation.isTemporalRelation(invalidStrength)).toBe(true);
    expect(TemporalRelation.isTemporalRelation(invalidConfidence)).toBe(true);

    expect(Relation.hasStrength(invalidStrength)).toBe(false);
    expect(Relation.hasConfidence(invalidConfidence)).toBe(false);
  });

  // Test for metadata combined with temporal properties
  it('should properly validate metadata alongside temporal properties', () => {
    const now = Date.now();

    // Valid metadata and temporal properties
    const validRelation = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      metadata: {
        createdAt: now - 1000, // Different from the relation's createdAt
        updatedAt: now - 1000, // Different from the relation's updatedAt
        lastAccessed: now,
        inferredFrom: ['relation1', 'relation2'],
      },
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    // Invalid metadata type
    const invalidMetadataType = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      metadata: 'not-an-object',
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    // Invalid metadata content (lastAccessed not a number)
    const invalidMetadataContent = {
      from: 'entityA',
      to: 'entityB',
      relationType: 'knows',
      metadata: {
        createdAt: now,
        updatedAt: now,
        lastAccessed: 'recently', // Invalid type - should be a number
      },
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    expect(TemporalRelation.isTemporalRelation(validRelation)).toBe(true);
    expect(Relation.hasValidMetadata(validRelation)).toBe(true);

    expect(TemporalRelation.isTemporalRelation(invalidMetadataType)).toBe(false);

    expect(TemporalRelation.isTemporalRelation(invalidMetadataContent)).toBe(true);
    expect(Relation.hasValidMetadata(invalidMetadataContent)).toBe(false);
  });
});
