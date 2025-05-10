/**
 * Interface for relations with temporal metadata
 */
import { RelationValidator, type Relation } from './relation.js';

/**
 * Represents a relationship with temporal awareness capabilities
 * Extends the base Relation interface with time-based properties
 */
export interface TemporalRelation extends Relation {
  /**
   * Unique identifier for the relation
   */
  id?: string;

  /**
   * Timestamp when the relation was created (milliseconds since epoch)
   */
  createdAt: number;

  /**
   * Timestamp when the relation was last updated (milliseconds since epoch)
   */
  updatedAt: number;

  /**
   * Optional start time for the validity period (milliseconds since epoch)
   */
  validFrom?: number;

  /**
   * Optional end time for the validity period (milliseconds since epoch)
   */
  validTo?: number;

  /**
   * Version number, incremented with each update
   */
  version: number;

  /**
   * Optional identifier of the system or user that made the change
   */
  changedBy?: string;
}

// Add static methods to the TemporalRelation interface for JavaScript tests
// This allows tests to access validation methods directly from the interface
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace TemporalRelation {
  export function isTemporalRelation(obj: unknown): boolean {
    return TemporalRelationValidator.isTemporalRelation(obj);
  }

  export function hasValidTimeRange(obj: unknown): boolean {
    return TemporalRelationValidator.hasValidTimeRange(obj);
  }

  export function isCurrentlyValid(obj: unknown, now = Date.now()): boolean {
    return TemporalRelationValidator.isCurrentlyValid(obj, now);
  }
}

/**
 * TemporalRelationValidator class with validation methods
 */
export class TemporalRelationValidator {
  /**
   * Validates if an object conforms to the TemporalRelation interface
   */
  static isTemporalRelation(obj: unknown): boolean {
    // First ensure it's a valid Relation
    if (!RelationValidator.isRelation(obj)) {
      return false;
    }

    // Use type assertion after validation
    const temporalObj = obj as TemporalRelation;

    // Then check temporal properties
    if (
      typeof temporalObj.createdAt !== 'number' ||
      typeof temporalObj.updatedAt !== 'number' ||
      typeof temporalObj.version !== 'number'
    ) {
      return false;
    }

    // Optional properties type checking
    if (temporalObj.validFrom !== undefined && typeof temporalObj.validFrom !== 'number') {
      return false;
    }

    if (temporalObj.validTo !== undefined && typeof temporalObj.validTo !== 'number') {
      return false;
    }

    if (temporalObj.changedBy !== undefined && typeof temporalObj.changedBy !== 'string') {
      return false;
    }

    return true;
  }

  /**
   * Checks if a relation has a valid temporal range
   */
  static hasValidTimeRange(obj: unknown): boolean {
    if (!this.isTemporalRelation(obj)) {
      return false;
    }

    // Use type assertion after validation
    const temporalObj = obj as TemporalRelation;

    // If both are defined, validFrom must be before validTo
    if (temporalObj.validFrom !== undefined && temporalObj.validTo !== undefined) {
      return temporalObj.validFrom <= temporalObj.validTo;
    }

    return true;
  }

  /**
   * Checks if a relation is currently valid based on its temporal range
   */
  static isCurrentlyValid(obj: unknown, now = Date.now()): boolean {
    if (!this.isTemporalRelation(obj)) {
      return false;
    }

    // Use type assertion after validation
    const temporalObj = obj as TemporalRelation;

    // Check if current time is within validity period
    if (temporalObj.validFrom !== undefined && now < temporalObj.validFrom) {
      return false; // Before valid period
    }

    if (temporalObj.validTo !== undefined && now > temporalObj.validTo) {
      return false; // After valid period
    }

    return true;
  }
}
