/**
 * Comprehensive tests for TemporalRelation interface and validator
 * Covers: isTemporalRelation, hasValidTimeRange, isCurrentlyValid
 */

import { describe, it, expect } from 'vitest';
import { TemporalRelation, TemporalRelationValidator } from '../temporalRelation.js';

describe('TemporalRelation Interface', () => {
  const now = Date.now();

  // --------------------------------------------------------------------------
  // Basic Structure Tests
  // --------------------------------------------------------------------------

  describe('basic structure', () => {
    it('should define the basic temporal relation properties', () => {
      const relation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
      };

      expect(relation.from).toBe('EntityA');
      expect(relation.to).toBe('EntityB');
      expect(relation.relationType).toBe('RELATES_TO');
      expect(relation.createdAt).toBe(now);
      expect(relation.updatedAt).toBe(now);
      expect(relation.version).toBe(1);

      // Verify the TemporalRelation namespace exists
      expect(typeof TemporalRelation).toBe('object');
      expect(TemporalRelation.isTemporalRelation(relation)).toBe(true);
    });

    it('should support optional id property', () => {
      const relation = {
        id: 'uuid-123',
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
      };

      expect(relation.id).toBe('uuid-123');
      expect(TemporalRelation.isTemporalRelation(relation)).toBe(true);
    });

    it('should support strength and confidence properties', () => {
      const relation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        strength: 0.8,
        confidence: 0.95,
        createdAt: now,
        updatedAt: now,
        version: 1,
      };

      expect(TemporalRelation.isTemporalRelation(relation)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Optional Properties Tests
  // --------------------------------------------------------------------------

  describe('optional properties', () => {
    it('should support validity period properties', () => {
      const future = now + 86400000;

      const relation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
        validFrom: now,
        validTo: future,
      };

      expect(relation.validFrom).toBe(now);
      expect(relation.validTo).toBe(future);
      expect(TemporalRelation.isTemporalRelation(relation)).toBe(true);
    });

    it('should support changedBy property', () => {
      const relation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
        changedBy: 'user-123',
      };

      expect(relation.changedBy).toBe('user-123');
      expect(TemporalRelation.isTemporalRelation(relation)).toBe(true);
    });

    it('should support metadata property', () => {
      const relation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
        metadata: { key: 'value' },
      };

      expect(TemporalRelation.isTemporalRelation(relation)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // isTemporalRelation Validation Tests
  // --------------------------------------------------------------------------

  describe('isTemporalRelation', () => {
    it('should return false for null or undefined', () => {
      expect(TemporalRelation.isTemporalRelation(null)).toBe(false);
      expect(TemporalRelation.isTemporalRelation(undefined)).toBe(false);
    });

    it('should return false for non-objects', () => {
      expect(TemporalRelation.isTemporalRelation('string')).toBe(false);
      expect(TemporalRelation.isTemporalRelation(123)).toBe(false);
      expect(TemporalRelation.isTemporalRelation(true)).toBe(false);
    });

    it('should return false when missing required base relation properties', () => {
      const missingFrom = {
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
      };

      const missingTo = {
        from: 'EntityA',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
      };

      const missingRelationType = {
        from: 'EntityA',
        to: 'EntityB',
        createdAt: now,
        updatedAt: now,
        version: 1,
      };

      expect(TemporalRelation.isTemporalRelation(missingFrom)).toBe(false);
      expect(TemporalRelation.isTemporalRelation(missingTo)).toBe(false);
      expect(TemporalRelation.isTemporalRelation(missingRelationType)).toBe(false);
    });

    it('should return false when missing required temporal properties', () => {
      const missingCreatedAt = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        updatedAt: now,
        version: 1,
      };

      const missingUpdatedAt = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        version: 1,
      };

      const missingVersion = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
      };

      expect(TemporalRelation.isTemporalRelation(missingCreatedAt)).toBe(false);
      expect(TemporalRelation.isTemporalRelation(missingUpdatedAt)).toBe(false);
      expect(TemporalRelation.isTemporalRelation(missingVersion)).toBe(false);
    });

    it('should return false when temporal properties have wrong types', () => {
      const wrongCreatedAtType = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: 'not-a-number',
        updatedAt: now,
        version: 1,
      };

      const wrongUpdatedAtType = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: 'not-a-number',
        version: 1,
      };

      const wrongVersionType = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 'not-a-number',
      };

      expect(TemporalRelation.isTemporalRelation(wrongCreatedAtType)).toBe(false);
      expect(TemporalRelation.isTemporalRelation(wrongUpdatedAtType)).toBe(false);
      expect(TemporalRelation.isTemporalRelation(wrongVersionType)).toBe(false);
    });

    it('should return false when optional validFrom has wrong type', () => {
      const wrongValidFromType = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
        validFrom: 'not-a-number',
      };

      expect(TemporalRelation.isTemporalRelation(wrongValidFromType)).toBe(false);
    });

    it('should return false when optional validTo has wrong type', () => {
      const wrongValidToType = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
        validTo: 'not-a-number',
      };

      expect(TemporalRelation.isTemporalRelation(wrongValidToType)).toBe(false);
    });

    it('should return false when optional changedBy has wrong type', () => {
      const wrongChangedByType = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
        changedBy: 123,
      };

      expect(TemporalRelation.isTemporalRelation(wrongChangedByType)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // hasValidTimeRange Tests
  // --------------------------------------------------------------------------

  describe('hasValidTimeRange', () => {
    it('should return true for valid time range', () => {
      const past = now - 86400000;
      const future = now + 86400000;

      const relation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
        validFrom: past,
        validTo: future,
      };

      expect(TemporalRelation.hasValidTimeRange(relation)).toBe(true);
    });

    it('should return true when validFrom equals validTo', () => {
      const relation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
        validFrom: now,
        validTo: now,
      };

      expect(TemporalRelation.hasValidTimeRange(relation)).toBe(true);
    });

    it('should return false for invalid time range (validFrom after validTo)', () => {
      const past = now - 86400000;
      const future = now + 86400000;

      const relation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
        validFrom: future,
        validTo: past,
      };

      expect(TemporalRelation.hasValidTimeRange(relation)).toBe(false);
    });

    it('should return true when only validFrom is specified', () => {
      const relation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
        validFrom: now,
      };

      expect(TemporalRelation.hasValidTimeRange(relation)).toBe(true);
    });

    it('should return true when only validTo is specified', () => {
      const relation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
        validTo: now + 86400000,
      };

      expect(TemporalRelation.hasValidTimeRange(relation)).toBe(true);
    });

    it('should return true when neither validFrom nor validTo is specified', () => {
      const relation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
      };

      expect(TemporalRelation.hasValidTimeRange(relation)).toBe(true);
    });

    it('should return false for non-TemporalRelation objects', () => {
      const notARelation = {
        name: 'NotARelation',
      };

      expect(TemporalRelation.hasValidTimeRange(notARelation)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // isCurrentlyValid Tests
  // --------------------------------------------------------------------------

  describe('isCurrentlyValid', () => {
    it('should return true when current time is within validity period', () => {
      const past = now - 86400000;
      const future = now + 86400000;

      const relation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
        validFrom: past,
        validTo: future,
      };

      expect(TemporalRelation.isCurrentlyValid(relation, now)).toBe(true);
    });

    it('should return true when no validity period is specified', () => {
      const relation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
      };

      expect(TemporalRelation.isCurrentlyValid(relation, now)).toBe(true);
    });

    it('should return false when current time is before validFrom', () => {
      const future = now + 86400000;

      const relation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
        validFrom: future,
      };

      expect(TemporalRelation.isCurrentlyValid(relation, now)).toBe(false);
    });

    it('should return false when current time is after validTo', () => {
      const past = now - 86400000;

      const relation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
        validTo: past,
      };

      expect(TemporalRelation.isCurrentlyValid(relation, now)).toBe(false);
    });

    it('should return true when current time equals validFrom', () => {
      const relation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
        validFrom: now,
      };

      expect(TemporalRelation.isCurrentlyValid(relation, now)).toBe(true);
    });

    it('should return true when current time equals validTo', () => {
      const relation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
        validTo: now,
      };

      expect(TemporalRelation.isCurrentlyValid(relation, now)).toBe(true);
    });

    it('should return false for non-TemporalRelation objects', () => {
      const notARelation = {
        name: 'NotARelation',
      };

      expect(TemporalRelation.isCurrentlyValid(notARelation, now)).toBe(false);
    });

    it('should use Date.now() as default when no time is provided', () => {
      const past = Date.now() - 86400000;
      const future = Date.now() + 86400000;

      const validRelation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
        validFrom: past,
        validTo: future,
      };

      // Should use current time automatically
      expect(TemporalRelation.isCurrentlyValid(validRelation)).toBe(true);
    });

    it('should return false when only validTo is in the past', () => {
      const distantPast = now - 172800000; // 48 hours ago

      const relation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
        validTo: distantPast,
      };

      expect(TemporalRelation.isCurrentlyValid(relation, now)).toBe(false);
    });

    it('should return false when only validFrom is in the future', () => {
      const distantFuture = now + 172800000; // 48 hours from now

      const relation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
        validFrom: distantFuture,
      };

      expect(TemporalRelation.isCurrentlyValid(relation, now)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // TemporalRelationValidator Direct Tests
  // --------------------------------------------------------------------------

  describe('TemporalRelationValidator', () => {
    it('should be accessible directly', () => {
      expect(typeof TemporalRelationValidator).toBe('object');
      expect(typeof TemporalRelationValidator.isTemporalRelation).toBe('function');
      expect(typeof TemporalRelationValidator.hasValidTimeRange).toBe('function');
      expect(typeof TemporalRelationValidator.isCurrentlyValid).toBe('function');
    });

    it('isTemporalRelation should work directly on validator', () => {
      const relation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
      };

      expect(TemporalRelationValidator.isTemporalRelation(relation)).toBe(true);
    });

    it('hasValidTimeRange should work directly on validator', () => {
      const relation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
        validFrom: now - 1000,
        validTo: now + 1000,
      };

      expect(TemporalRelationValidator.hasValidTimeRange(relation)).toBe(true);
    });

    it('isCurrentlyValid should work directly on validator', () => {
      const relation = {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
        createdAt: now,
        updatedAt: now,
        version: 1,
        validFrom: now - 1000,
        validTo: now + 1000,
      };

      expect(TemporalRelationValidator.isCurrentlyValid(relation, now)).toBe(true);
    });
  });
});
