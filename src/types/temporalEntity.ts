/**
 * Interface for entities with temporal metadata
 */
import type { Entity } from '../KnowledgeGraphManager.js';

/**
 * Represents an entity with temporal awareness capabilities
 * Extends the base Entity interface with time-based properties
 */
export interface TemporalEntity extends Entity {
  /**
   * Unique identifier for the entity
   */
  id?: string;

  /**
   * Timestamp when the entity was created (milliseconds since epoch)
   */
  createdAt: number;

  /**
   * Timestamp when the entity was last updated (milliseconds since epoch)
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
 * TemporalEntityValidator class with validation methods
 */
export class TemporalEntityValidator {
  /**
   * Validates if an object conforms to the TemporalEntity interface
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static isTemporalEntity(obj: any): boolean {
    // First ensure it's a valid Entity
    if (
      !obj ||
      typeof obj.name !== 'string' ||
      typeof obj.entityType !== 'string' ||
      !Array.isArray(obj.observations)
    ) {
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
   * Checks if an entity has a valid temporal range
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static hasValidTimeRange(obj: any): boolean {
    if (!this.isTemporalEntity(obj)) {
      return false;
    }

    // If both are defined, validFrom must be before validTo
    if (obj.validFrom !== undefined && obj.validTo !== undefined) {
      return obj.validFrom <= obj.validTo;
    }

    return true;
  }
}
