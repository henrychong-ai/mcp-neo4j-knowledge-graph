/**
 * Test file for the TemporalEntity interface
 * Migrated from Jest to Vitest and converted to TypeScript
 */
import { describe, it, expect } from 'vitest';
import { TemporalEntity } from '../temporalEntity.js';

describe('TemporalEntity Interface', () => {
  // Basic structure tests
  it('should define the basic temporal entity properties', () => {
    // Define a minimal temporal entity object
    const now = Date.now();
    const entity = {
      name: 'TestEntity',
      entityType: 'TestType',
      observations: ['observation 1'],
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    // Verify required properties
    expect(entity.name).toBe('TestEntity');
    expect(entity.entityType).toBe('TestType');
    expect(Array.isArray(entity.observations)).toBe(true);
    expect(entity.createdAt).toBe(now);
    expect(entity.updatedAt).toBe(now);
    expect(entity.version).toBe(1);

    // Verify the TemporalEntity namespace exists and can be imported
    expect(typeof TemporalEntity).toBe('object'); // The interface should have validator functions as a namespace
    expect(TemporalEntity.isTemporalEntity(entity)).toBe(true);
  });

  // Optional properties tests
  it('should support optional validity period properties', () => {
    const now = Date.now();
    const future = now + 86400000; // 24 hours in the future

    const entity = {
      name: 'TimeLimitedEntity',
      entityType: 'TemporalTest',
      observations: ['limited time validity'],
      createdAt: now,
      updatedAt: now,
      version: 1,
      validFrom: now,
      validTo: future,
    };

    expect(entity.validFrom).toBe(now);
    expect(entity.validTo).toBe(future);
    expect(TemporalEntity.isTemporalEntity(entity)).toBe(true);
    expect(TemporalEntity.hasValidTimeRange(entity)).toBe(true);
  });

  it('should support changedBy property', () => {
    const now = Date.now();

    const entity = {
      name: 'EntityWithChangeInfo',
      entityType: 'TemporalTest',
      observations: ['has change tracking'],
      createdAt: now,
      updatedAt: now,
      version: 1,
      changedBy: 'system',
    };

    expect(entity.changedBy).toBe('system');
    expect(TemporalEntity.isTemporalEntity(entity)).toBe(true);
  });

  // Validation tests
  it('should validate temporal entity structure', () => {
    const validEntity = {
      name: 'ValidEntity',
      entityType: 'Test',
      observations: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    };

    const invalidEntity1 = {
      // Missing required properties
      name: 'Invalid',
      entityType: 'Test',
      observations: [],
      // No temporal properties
    };

    const invalidEntity2 = {
      name: 'Invalid',
      entityType: 'Test',
      observations: [],
      createdAt: 'not-a-number', // Wrong type
      updatedAt: Date.now(),
      version: 1,
    };

    expect(TemporalEntity.isTemporalEntity(validEntity)).toBe(true);
    expect(TemporalEntity.isTemporalEntity(invalidEntity1)).toBe(false);
    expect(TemporalEntity.isTemporalEntity(invalidEntity2)).toBe(false);
    expect(TemporalEntity.isTemporalEntity(null)).toBe(false);
    expect(TemporalEntity.isTemporalEntity(undefined)).toBe(false);
  });

  it('should validate temporal range correctly', () => {
    const now = Date.now();
    const past = now - 86400000; // 24 hours in the past
    const future = now + 86400000; // 24 hours in the future

    const validEntity1 = {
      name: 'ValidRange1',
      entityType: 'Test',
      observations: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
      validFrom: past,
      validTo: future,
    };

    const validEntity2 = {
      name: 'ValidRange2',
      entityType: 'Test',
      observations: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
      validFrom: now,
      validTo: now, // Same time is considered valid
    };

    const invalidEntity = {
      name: 'InvalidRange',
      entityType: 'Test',
      observations: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
      validFrom: future,
      validTo: past, // Future before past is invalid
    };

    expect(TemporalEntity.hasValidTimeRange(validEntity1)).toBe(true);
    expect(TemporalEntity.hasValidTimeRange(validEntity2)).toBe(true);
    expect(TemporalEntity.hasValidTimeRange(invalidEntity)).toBe(false);
  });

  // Add more comprehensive validation tests for isTemporalEntity
  it('should validate optional properties types correctly', () => {
    const now = Date.now();

    // Test invalid validFrom type
    const invalidValidFrom = {
      name: 'InvalidValidFrom',
      entityType: 'Test',
      observations: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
      validFrom: 'not-a-number', // Wrong type - should be a number
    };

    // Test invalid validTo type
    const invalidValidTo = {
      name: 'InvalidValidTo',
      entityType: 'Test',
      observations: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
      validTo: 'not-a-number', // Wrong type - should be a number
    };

    // Test invalid changedBy type
    const invalidChangedBy = {
      name: 'InvalidChangedBy',
      entityType: 'Test',
      observations: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
      changedBy: 123, // Wrong type - should be a string
    };

    expect(TemporalEntity.isTemporalEntity(invalidValidFrom)).toBe(false);
    expect(TemporalEntity.isTemporalEntity(invalidValidTo)).toBe(false);
    expect(TemporalEntity.isTemporalEntity(invalidChangedBy)).toBe(false);
  });

  // Add tests for edge cases in hasValidTimeRange
  it('should validate time range for non-TemporalEntity objects', () => {
    // Test with object that will fail isTemporalEntity check
    const notAnEntity = {
      name: 'NotAnEntity',
      // Missing required properties
    };

    expect(TemporalEntity.hasValidTimeRange(notAnEntity)).toBe(false);
  });

  it('should handle partial time ranges correctly', () => {
    const now = Date.now();

    // Entity with only validFrom
    const onlyValidFrom = {
      name: 'OnlyValidFrom',
      entityType: 'Test',
      observations: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
      validFrom: now,
      // No validTo
    };

    // Entity with only validTo
    const onlyValidTo = {
      name: 'OnlyValidTo',
      entityType: 'Test',
      observations: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
      // No validFrom
      validTo: now + 86400000,
    };

    expect(TemporalEntity.hasValidTimeRange(onlyValidFrom)).toBe(true);
    expect(TemporalEntity.hasValidTimeRange(onlyValidTo)).toBe(true);
  });
});
