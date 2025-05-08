/**
 * Interface for relations with temporal metadata
 */
import type { Relation } from './relation.js';
import { RelationValidator } from './relation.js';

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

/**
 * TemporalRelationValidator class with validation methods
 */
export class TemporalRelationValidator {
  /**
   * Validates if an object conforms to the TemporalRelation interface
   */
  static isTemporalRelation(obj: any): boolean {
    // First ensure it's a valid Relation
    if (!RelationValidator.isRelation(obj)) {
      return false;
    }

    // Then check temporal properties
    if (
      typeof obj.createdAt !== 'number' ||
      typeof obj.updatedAt !== 'number' ||
      typeof obj.version !== 'number'
    ) {
      return false;
    }

    // Optional properties type checking
    if (obj.validFrom !== undefined && typeof obj.validFrom !== 'number') {
      return false;
    }

    if (obj.validTo !== undefined && typeof obj.validTo !== 'number') {
      return false;
    }

    if (obj.changedBy !== undefined && typeof obj.changedBy !== 'string') {
      return false;
    }

    return true;
  }

  /**
   * Checks if a relation has a valid temporal range
   */
  static hasValidTimeRange(obj: any): boolean {
    if (!this.isTemporalRelation(obj)) {
      return false;
    }

    // If both are defined, validFrom must be before validTo
    if (obj.validFrom !== undefined && obj.validTo !== undefined) {
      return obj.validFrom <= obj.validTo;
    }

    return true;
  }

  /**
   * Checks if a relation is currently valid based on its temporal range
   */
  static isCurrentlyValid(obj: any, now = Date.now()): boolean {
    if (!this.isTemporalRelation(obj)) {
      return false;
    }

    // Check if current time is within validity period
    if (obj.validFrom !== undefined && now < obj.validFrom) {
      return false; // Before valid period
    }

    if (obj.validTo !== undefined && now > obj.validTo) {
      return false; // After valid period
    }

    return true;
  }
}
