/**
 * Zod schemas for MCP tool input validation
 * Uses Zod 4 for runtime validation with TypeScript type inference
 */

import { z } from 'zod';

// =============================================================================
// ENTITY SCHEMAS
// =============================================================================

/**
 * Schema for creating a new entity
 */
export const EntityInputSchema = z.object({
  name: z.string().min(1, 'Entity name is required'),
  entityType: z
    .string()
    .min(1, 'Entity type is required')
    .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, {
      message: 'Entity type must be lowercase-kebab-case (e.g., person, medical-condition)',
    }),
  domain: z.string().nullish(),
  observations: z.array(z.string()).default([]),
});

export type EntityInput = z.infer<typeof EntityInputSchema>;

/**
 * Schema for entity with temporal metadata (from database)
 */
export const TemporalEntitySchema = EntityInputSchema.extend({
  id: z.string().uuid().optional(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  validFrom: z.number().int().positive().optional(),
  validTo: z.number().int().positive().nullable().optional(),
  version: z.number().int().min(0),
  changedBy: z.string().optional(),
});

export type TemporalEntity = z.infer<typeof TemporalEntitySchema>;

// =============================================================================
// RELATION SCHEMAS
// =============================================================================

/**
 * Schema for relation metadata
 */
export const RelationMetadataSchema = z.object({
  inferredFrom: z.array(z.string()).optional(),
  lastAccessed: z.number().int().positive().optional(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});

export type RelationMetadata = z.infer<typeof RelationMetadataSchema>;

/**
 * Schema for creating a relation between entities
 */
export const RelationInputSchema = z.object({
  from: z.string().min(1, 'Source entity name is required'),
  to: z.string().min(1, 'Target entity name is required'),
  relationType: z.string().min(1, 'Relation type is required'),
  strength: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type RelationInput = z.infer<typeof RelationInputSchema>;

/**
 * Schema for relation with full metadata
 */
export const RelationSchema = RelationInputSchema.extend({
  metadata: RelationMetadataSchema.optional(),
});

export type Relation = z.infer<typeof RelationSchema>;

// =============================================================================
// OBSERVATION SCHEMAS
// =============================================================================

/**
 * Schema for adding observations to an entity
 */
export const AddObservationsInputSchema = z.object({
  entityName: z.string().min(1, 'Entity name is required'),
  observations: z.array(z.string().min(1)).min(1, 'At least one observation is required'),
});

export type AddObservationsInput = z.infer<typeof AddObservationsInputSchema>;

/**
 * Schema for batch observation additions
 */
export const AddObservationsBatchInputSchema = z.object({
  observations: z
    .array(AddObservationsInputSchema)
    .min(1, 'At least one observation entry is required'),
});

export type AddObservationsBatchInput = z.infer<typeof AddObservationsBatchInputSchema>;

// =============================================================================
// SEARCH SCHEMAS
// =============================================================================

/**
 * Schema for search_nodes tool input
 */
export const SearchNodesInputSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  limit: z.number().int().positive().max(100).default(10),
  domain: z.string().optional(),
});

export type SearchNodesInput = z.infer<typeof SearchNodesInputSchema>;

/**
 * Schema for semantic_search tool input
 */
export const SemanticSearchInputSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  limit: z.number().int().positive().max(100).default(10),
  minSimilarity: z.number().min(0).max(1).default(0.6),
  domain: z.string().optional(),
});

export type SemanticSearchInput = z.infer<typeof SemanticSearchInputSchema>;

// =============================================================================
// BATCH OPERATION SCHEMAS
// =============================================================================

/**
 * Schema for batch entity creation
 */
export const CreateEntitiesBatchInputSchema = z.object({
  entities: z.array(EntityInputSchema).min(1, 'At least one entity is required'),
});

export type CreateEntitiesBatchInput = z.infer<typeof CreateEntitiesBatchInputSchema>;

/**
 * Schema for batch relation creation
 */
export const CreateRelationsBatchInputSchema = z.object({
  relations: z.array(RelationInputSchema).min(1, 'At least one relation is required'),
});

export type CreateRelationsBatchInput = z.infer<typeof CreateRelationsBatchInputSchema>;

/**
 * Schema for entity update
 */
export const UpdateEntityInputSchema = z.object({
  name: z.string().min(1, 'Entity name is required'),
  entityType: z
    .string()
    .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, {
      message: 'Entity type must be lowercase-kebab-case',
    })
    .optional(),
  domain: z.string().nullish(),
  observations: z.array(z.string()).optional(),
});

export type UpdateEntityInput = z.infer<typeof UpdateEntityInputSchema>;

/**
 * Schema for batch entity updates
 */
export const UpdateEntitiesBatchInputSchema = z.object({
  entities: z.array(UpdateEntityInputSchema).min(1, 'At least one entity update is required'),
});

export type UpdateEntitiesBatchInput = z.infer<typeof UpdateEntitiesBatchInputSchema>;

// =============================================================================
// DELETE SCHEMAS
// =============================================================================

/**
 * Schema for deleting entities
 */
export const DeleteEntitiesInputSchema = z.object({
  entityNames: z.array(z.string().min(1)).min(1, 'At least one entity name is required'),
});

export type DeleteEntitiesInput = z.infer<typeof DeleteEntitiesInputSchema>;

/**
 * Schema for deleting relations
 */
export const DeleteRelationsInputSchema = z.object({
  relations: z
    .array(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        relationType: z.string().min(1),
      })
    )
    .min(1, 'At least one relation is required'),
});

export type DeleteRelationsInput = z.infer<typeof DeleteRelationsInputSchema>;

/**
 * Schema for deleting observations
 */
export const DeleteObservationsInputSchema = z.object({
  entityName: z.string().min(1, 'Entity name is required'),
  observations: z.array(z.string().min(1)).min(1, 'At least one observation is required'),
});

export type DeleteObservationsInput = z.infer<typeof DeleteObservationsInputSchema>;

// =============================================================================
// GRAPH QUERY SCHEMAS
// =============================================================================

/**
 * Schema for read_graph tool input
 */
export const ReadGraphInputSchema = z.object({
  domain: z.string().optional(),
});

export type ReadGraphInput = z.infer<typeof ReadGraphInputSchema>;

/**
 * Schema for open_nodes tool input
 */
export const OpenNodesInputSchema = z.object({
  names: z.array(z.string().min(1)).min(1, 'At least one entity name is required'),
});

export type OpenNodesInput = z.infer<typeof OpenNodesInputSchema>;

/**
 * Schema for get_relation tool input
 */
export const GetRelationInputSchema = z.object({
  from: z.string().min(1, 'Source entity name is required'),
  to: z.string().min(1, 'Target entity name is required'),
  relationType: z.string().optional(),
});

export type GetRelationInput = z.infer<typeof GetRelationInputSchema>;

// =============================================================================
// TEMPORAL SCHEMAS
// =============================================================================

/**
 * Schema for get_entity_history tool input
 */
export const GetEntityHistoryInputSchema = z.object({
  entityName: z.string().min(1, 'Entity name is required'),
  limit: z.number().int().positive().max(100).default(10),
});

export type GetEntityHistoryInput = z.infer<typeof GetEntityHistoryInputSchema>;

/**
 * Schema for get_relation_history tool input
 */
export const GetRelationHistoryInputSchema = z.object({
  from: z.string().min(1, 'Source entity name is required'),
  to: z.string().min(1, 'Target entity name is required'),
  relationType: z.string().min(1, 'Relation type is required'),
  limit: z.number().int().positive().max(100).default(10),
});

export type GetRelationHistoryInput = z.infer<typeof GetRelationHistoryInputSchema>;

/**
 * Schema for get_graph_at_time tool input
 */
export const GetGraphAtTimeInputSchema = z.object({
  timestamp: z.number().int().positive('Timestamp must be a positive integer'),
  domain: z.string().optional(),
});

export type GetGraphAtTimeInput = z.infer<typeof GetGraphAtTimeInputSchema>;

/**
 * Schema for get_decayed_graph tool input
 */
export const GetDecayedGraphInputSchema = z.object({
  referenceTime: z.number().int().positive().optional(),
  decayFactor: z.number().min(0).max(1).default(0.5),
  domain: z.string().optional(),
});

export type GetDecayedGraphInput = z.infer<typeof GetDecayedGraphInputSchema>;

// =============================================================================
// EMBEDDING SCHEMAS
// =============================================================================

/**
 * Schema for get_entity_embedding tool input
 */
export const GetEntityEmbeddingInputSchema = z.object({
  entityName: z.string().min(1, 'Entity name is required'),
});

export type GetEntityEmbeddingInput = z.infer<typeof GetEntityEmbeddingInputSchema>;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Validates input against a schema and returns typed result or throws
 */
export function validateInput<T>(schema: z.ZodSchema<T>, input: unknown): T {
  return schema.parse(input);
}

/**
 * Safely validates input, returning result with success/error
 */
export function safeValidateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
