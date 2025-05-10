/**
 * Metadata for relations providing additional context and information
 */
export interface RelationMetadata {
  /**
   * Array of relation IDs that this relation was inferred from
   */
  inferredFrom?: string[];

  /**
   * Timestamp when the relation was last accessed/retrieved
   */
  lastAccessed?: number;

  /**
   * Timestamp when the relation was created
   */
  createdAt: number;

  /**
   * Timestamp when the relation was last updated
   */
  updatedAt: number;
}

/**
 * Represents a relationship between two entities in the knowledge graph
 */
export interface Relation {
  /**
   * The source entity name (where the relation starts)
   */
  from: string;

  /**
   * The target entity name (where the relation ends)
   */
  to: string;

  /**
   * The type of relationship between the entities
   */
  relationType: string;

  /**
   * Optional strength of the relationship (0.0-1.0)
   * Higher values indicate stronger relationships
   */
  strength?: number;

  /**
   * Optional confidence score (0.0-1.0)
   * Represents how confident the system is about this relationship
   * Particularly useful for inferred relations
   */
  confidence?: number;

  /**
   * Optional metadata providing additional context about the relation
   */
  metadata?: RelationMetadata;
}

// Concrete class for JavaScript tests
export class RelationValidator {
  /**
   * Validates if an object conforms to the Relation interface
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static isRelation(obj: any): boolean {
    return (
      obj &&
      typeof obj.from === 'string' &&
      typeof obj.to === 'string' &&
      typeof obj.relationType === 'string' &&
      (obj.strength === undefined || typeof obj.strength === 'number') &&
      (obj.confidence === undefined || typeof obj.confidence === 'number') &&
      (obj.metadata === undefined || typeof obj.metadata === 'object')
    );
  }

  /**
   * Checks if a relation has a strength value
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static hasStrength(obj: any): boolean {
    return (
      this.isRelation(obj) &&
      typeof obj.strength === 'number' &&
      obj.strength >= 0 &&
      obj.strength <= 1
    );
  }

  /**
   * Checks if a relation has a confidence value
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static hasConfidence(obj: any): boolean {
    return (
      this.isRelation(obj) &&
      typeof obj.confidence === 'number' &&
      obj.confidence >= 0 &&
      obj.confidence <= 1
    );
  }

  /**
   * Checks if a relation has valid metadata
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static hasValidMetadata(obj: any): boolean {
    if (!this.isRelation(obj) || !obj.metadata) {
      return false;
    }

    const metadata = obj.metadata;

    // Required fields
    if (typeof metadata.createdAt !== 'number' || typeof metadata.updatedAt !== 'number') {
      return false;
    }

    // Optional fields
    if (metadata.lastAccessed !== undefined && typeof metadata.lastAccessed !== 'number') {
      return false;
    }

    if (metadata.inferredFrom !== undefined) {
      if (!Array.isArray(metadata.inferredFrom)) {
        return false;
      }

      // Verify all items in inferredFrom are strings
      for (const id of metadata.inferredFrom) {
        if (typeof id !== 'string') {
          return false;
        }
      }
    }

    return true;
  }
}
