/**
 * Zod schemas for MCP tool input validation (Zod 4).
 *
 * These schemas are a GATE, not a transform. `handleCallToolRequest` checks the
 * arguments against the schema for the tool and, on success, hands the handler
 * the ORIGINAL arguments object — never the parsed copy. Nothing here may
 * therefore rely on a default, a coercion, or key stripping taking effect.
 *
 * The rule: the gate must never turn a call that succeeds and does something
 * meaningful today into a failure. It rejects only what already fails deeper in
 * the stack, silently does nothing, or stores a value of the wrong type. So a
 * schema is as lenient as the code that reads the value:
 *
 * - A key the advertised `inputSchema` lists as `required` is required here,
 *   unless the code already deals with its absence (defaults it, skips the item,
 *   or reports it in the tool result). Those exceptions are listed in the parity
 *   test in `toolInputValidation.test.ts`.
 * - A value read behind a truthiness guard (`x || fallback`, `if (x)`) accepts
 *   every falsy value, because the code treats them all as absent (`whenTruthy`).
 * - A value the code acts on whatever its type accepts any value (`anyValue`):
 *   keys read purely by truthiness, keys the handler type-guards or normalises
 *   itself, and keys that cannot change what is stored or returned.
 * - A value the code coerces (`String(x)`, `Number(x)`) accepts the coercible
 *   type too.
 * - Unknown keys pass at every object level (`z.looseObject`).
 * - No length, range, or pattern rules beyond one: a negative
 *   `config.maxBatchSize` is rejected, because the batch chunking loop never
 *   terminates on it. Empty strings and empty arrays pass, and the handler or
 *   manager keeps its own handling of them. The lowercase-kebab-case
 *   `entityType` convention is documentation only: no write path enforces it,
 *   so neither does this file.
 *
 * `toolInputSchemas` maps every tool name to its schema. A tool without an entry
 * is rejected as unknown, so a new tool cannot skip validation silently.
 */

import { z } from 'zod';

// =============================================================================
// FIELD BUILDING BLOCKS
// =============================================================================

/** Optional string; the code reading it treats `null` like an absent value. */
const optionalString = z.string().nullish();

const stringArray = z.array(z.string());

/**
 * Any value is accepted: the code acts on this key whatever its type (it is read
 * purely by truthiness, type-guarded or normalised by the handler, or never
 * able to change what is stored or returned).
 */
const anyValue = z.unknown().optional();

/**
 * Check `schema` only when the code would actually use the value. `handled`
 * says when the code deals with the value itself (treats it as absent, or
 * reports it in the tool result); those values pass. Issues keep their path.
 */
function unless(handled: (value: unknown) => boolean, schema: z.ZodType) {
  return z
    .unknown()
    .superRefine((value, ctx) => {
      if (handled(value)) {
        return;
      }
      const result = schema.safeParse(value);
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({ code: 'custom', path: [...issue.path], message: issue.message });
        }
      }
    })
    .optional();
}

const isFalsy = (value: unknown): boolean => !value;
const isNotArray = (value: unknown): boolean => !Array.isArray(value);
const isNotPlainObject = (value: unknown): boolean =>
  value === null || typeof value !== 'object' || Array.isArray(value);

/**
 * For a value read behind a truthiness guard: every falsy value is treated as
 * absent by the code, so only a truthy value has to match `schema`.
 */
function whenTruthy(schema: z.ZodType) {
  return unless(isFalsy, schema);
}

/**
 * Advertised as a string, but the handler coerces it with `String(...)` (or
 * interpolates it into a pattern), so a number is accepted as well.
 */
const stringOrNumber = z.union([z.string(), z.number()], {
  error: 'Invalid input: expected string',
});

/**
 * A relation `strength` / `confidence`. Stored as given and converted with
 * `Number(...)` on every read, so a numeric string round-trips as a number.
 */
const EXPECTED_NUMBER = 'Invalid input: expected number';
const numberLike = z.union(
  [
    z.number(),
    z.string().refine(text => text.trim() !== '' && Number.isFinite(Number(text)), {
      error: EXPECTED_NUMBER,
    }),
  ],
  { error: EXPECTED_NUMBER }
);

/** Free-form object (advertised `type: 'object'`), e.g. relation metadata. */
const plainObject = z.looseObject({});

// =============================================================================
// ENTITY SCHEMAS
// =============================================================================

/**
 * One entity in `create_entities`.
 *
 * `observations` is advertised as required, but the storage provider accepts an
 * entity without it (a new entity is stored with `[]`; an existing one keeps
 * its observations), so only a truthy value has to be an array.
 * `id`, `version`, and `validTo` are advertised but never read: the storage
 * provider always generates the id, starts at version 1, and writes a live
 * (`validTo` null) version. The remaining optional keys are read as
 * `value || fallback`.
 */
export const EntityInputSchema = z.looseObject({
  name: z.string(),
  entityType: z.string(),
  domain: whenTruthy(z.string()),
  observations: whenTruthy(stringArray),
  id: anyValue,
  version: anyValue,
  createdAt: whenTruthy(z.number()),
  updatedAt: whenTruthy(z.number()),
  validFrom: whenTruthy(z.number()),
  validTo: anyValue,
  changedBy: whenTruthy(z.string()),
});

export type EntityInput = z.infer<typeof EntityInputSchema>;

/**
 * Schema for entity with temporal metadata (from database). Not a tool input.
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

/**
 * Schema for `create_entities` tool input
 */
export const CreateEntitiesInputSchema = z.looseObject({
  entities: z.array(EntityInputSchema),
});

export type CreateEntitiesInput = z.infer<typeof CreateEntitiesInputSchema>;

// =============================================================================
// RELATION SCHEMAS
// =============================================================================

/**
 * Schema for relation metadata (from database). Not a tool input.
 */
export const RelationMetadataSchema = z.object({
  inferredFrom: z.array(z.string()).optional(),
  lastAccessed: z.number().int().positive().optional(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});

export type RelationMetadata = z.infer<typeof RelationMetadataSchema>;

/**
 * One relation in `create_relations`.
 *
 * Every optional key is read as `value || fallback`. `id`, `version`, and
 * `validTo` are advertised but never read by the storage provider.
 */
export const RelationInputSchema = z.looseObject({
  from: z.string(),
  to: z.string(),
  relationType: z.string(),
  strength: whenTruthy(numberLike),
  confidence: whenTruthy(numberLike),
  metadata: whenTruthy(plainObject),
  id: anyValue,
  version: anyValue,
  createdAt: whenTruthy(z.number()),
  updatedAt: whenTruthy(z.number()),
  validFrom: whenTruthy(z.number()),
  validTo: anyValue,
  changedBy: whenTruthy(z.string()),
});

export type RelationInput = z.infer<typeof RelationInputSchema>;

/**
 * Schema for relation with full metadata (from database). Not a tool input.
 */
export const RelationSchema = RelationInputSchema.extend({
  metadata: RelationMetadataSchema.optional(),
});

export type Relation = z.infer<typeof RelationSchema>;

/**
 * Schema for `create_relations` tool input
 */
export const CreateRelationsInputSchema = z.looseObject({
  relations: z.array(RelationInputSchema),
});

export type CreateRelationsInput = z.infer<typeof CreateRelationsInputSchema>;

/** The `from` / `to` / `relationType` triple that identifies a relation. */
const RelationKeySchema = z.looseObject({
  from: z.string(),
  to: z.string(),
  relationType: z.string(),
});

/**
 * Schema for `get_relation` tool input
 */
export const GetRelationInputSchema = RelationKeySchema;

export type GetRelationInput = z.infer<typeof GetRelationInputSchema>;

/**
 * Schema for `update_relation` tool input.
 *
 * Only the identifying triple, `strength`, `confidence`, `metadata`, and
 * `changedBy` are read; the other advertised temporal fields are regenerated.
 * `strength` and `confidence` are written unless undefined, so `null` clears
 * the stored value.
 */
export const UpdateRelationInputSchema = z.looseObject({
  relation: z.looseObject({
    from: z.string(),
    to: z.string(),
    relationType: z.string(),
    strength: numberLike.nullish(),
    confidence: numberLike.nullish(),
    metadata: whenTruthy(plainObject),
    id: anyValue,
    version: anyValue,
    createdAt: anyValue,
    updatedAt: anyValue,
    validFrom: anyValue,
    validTo: anyValue,
    changedBy: whenTruthy(z.string()),
  }),
});

export type UpdateRelationInput = z.infer<typeof UpdateRelationInputSchema>;

// =============================================================================
// OBSERVATION SCHEMAS
// =============================================================================

/**
 * Schema for `add_observations` tool input.
 *
 * The handler validates this input itself and reports problems in the tool
 * result (`{ "error": ... }`): `observations` not being an array, an item
 * without `entityName`, and an item whose `contents` is not an array. Those
 * inputs pass the gate so that result shape is kept; the gate only rejects what
 * the handler would hand on to storage (a non-string name, non-string contents).
 *
 * `strength`, `confidence`, and `metadata` (top level and per observation) are
 * forwarded to the manager, which drops them before storage.
 */
export const AddObservationsInputSchema = z.looseObject({
  observations: unless(
    isNotArray,
    z.array(
      unless(
        isNotPlainObject,
        z.looseObject({
          entityName: whenTruthy(z.string()),
          contents: unless(isNotArray, stringArray),
          strength: anyValue,
          confidence: anyValue,
          metadata: anyValue,
        })
      )
    )
  ),
  strength: anyValue,
  confidence: anyValue,
  metadata: anyValue,
});

export type AddObservationsInput = z.infer<typeof AddObservationsInputSchema>;

/**
 * Batch configuration shared by the four batch tools.
 *
 * The batch methods read it as `config?.maxBatchSize || 100`, so anything that
 * is not an object, and any falsy `maxBatchSize`, falls back to 100. A truthy
 * `maxBatchSize` drives `for (i = 0; i < n; i += maxBatchSize)`: a positive
 * number or a positive-integer string chunks every item, while a negative
 * number loops forever, so that is rejected. `enableParallel` has no effect in
 * any batch method.
 */
const EXPECTED_POSITIVE_NUMBER = 'Invalid input: expected a positive number';
const BatchConfigInputSchema = unless(
  isNotPlainObject,
  z.looseObject({
    maxBatchSize: whenTruthy(
      z.union(
        [
          z.number().positive({ error: EXPECTED_POSITIVE_NUMBER }),
          z.string().regex(/^[1-9]\d*$/, { error: EXPECTED_POSITIVE_NUMBER }),
        ],
        { error: EXPECTED_POSITIVE_NUMBER }
      )
    ),
    enableParallel: anyValue,
  })
);

/**
 * Schema for `add_observations_batch` tool input. The manager throws for a
 * missing name or a non-array `observations`, so both are required here. The
 * per-entity `metadata`, `confidence`, and `strength` are never read.
 */
export const AddObservationsBatchInputSchema = z.looseObject({
  observations: z.array(
    z.looseObject({
      entityName: z.string(),
      observations: stringArray,
      metadata: anyValue,
      confidence: anyValue,
      strength: anyValue,
    })
  ),
  config: BatchConfigInputSchema,
});

export type AddObservationsBatchInput = z.infer<typeof AddObservationsBatchInputSchema>;

// =============================================================================
// SEARCH SCHEMAS
// =============================================================================

/**
 * Schema for `search_nodes` tool input. `query` is interpolated into a regex
 * pattern, so a number works as well as a string. `domain` is used only when
 * truthy, and `include_null_domain` is read purely by truthiness.
 */
export const SearchNodesInputSchema = z.looseObject({
  query: stringOrNumber,
  domain: whenTruthy(z.string()),
  include_null_domain: anyValue,
});

export type SearchNodesInput = z.infer<typeof SearchNodesInputSchema>;

/**
 * Schema for `semantic_search` tool input.
 *
 * No defaults and no ranges: an absent `limit` or `min_similarity` stays
 * undefined through the handler and the manager resolves it reranker-aware
 * (limit: 10 plain / RERANK_TOP_K reranked; min_similarity: 0).
 *
 * - `limit`: the manager floors and clamps a finite number and treats anything
 *   else as "no limit given".
 * - `min_similarity`: read as `value ?? 0` and compared with scores in Cypher,
 *   so it must be a number when present.
 * - `entity_types`, `domain`: used only when truthy.
 * - `hybrid_search`, `include_null_domain`: read by truthiness or strict
 *   comparison, never by type.
 * - `semantic_weight`: only reaches the search cache key.
 *
 * The handler also reads the unadvertised `hybrid_config` and
 * `enable_hybrid_retrieval`; they pass through unvalidated as unknown keys.
 */
export const SemanticSearchInputSchema = z.looseObject({
  query: stringOrNumber,
  limit: anyValue,
  min_similarity: z.number().nullish(),
  entity_types: whenTruthy(stringArray),
  hybrid_search: anyValue,
  semantic_weight: anyValue,
  domain: whenTruthy(z.string()),
  include_null_domain: anyValue,
});

export type SemanticSearchInput = z.infer<typeof SemanticSearchInputSchema>;

// =============================================================================
// BATCH OPERATION SCHEMAS
// =============================================================================

/**
 * Schema for `create_entities_batch` tool input. The batch tool advertises only
 * these four entity keys; anything else passes through as an unknown key.
 * Unlike `create_entities`, `observations` is required: the manager throws for
 * an entity whose `observations` is not an array.
 */
export const CreateEntitiesBatchInputSchema = z.looseObject({
  entities: z.array(
    z.looseObject({
      name: z.string(),
      entityType: z.string(),
      domain: whenTruthy(z.string()),
      observations: stringArray,
    })
  ),
  config: BatchConfigInputSchema,
});

export type CreateEntitiesBatchInput = z.infer<typeof CreateEntitiesBatchInputSchema>;

/**
 * Schema for `create_relations_batch` tool input. The batch tool advertises only
 * these six relation keys; anything else passes through as an unknown key.
 * `strength` and `confidence` are read as `value ?? null`.
 */
export const CreateRelationsBatchInputSchema = z.looseObject({
  relations: z.array(
    z.looseObject({
      from: z.string(),
      to: z.string(),
      relationType: z.string(),
      strength: numberLike.nullish(),
      confidence: numberLike.nullish(),
      metadata: whenTruthy(plainObject),
    })
  ),
  config: BatchConfigInputSchema,
});

export type CreateRelationsBatchInput = z.infer<typeof CreateRelationsBatchInputSchema>;

/**
 * One update in `update_entities_batch`.
 *
 * `entityType` and `removeObservations` are used only when truthy. `domain` is
 * written unless undefined, so `null` clears it. `addObservations` must be an
 * array when present: the storage provider reads its length whenever it is not
 * undefined.
 */
export const UpdateEntityInputSchema = z.looseObject({
  name: z.string(),
  entityType: whenTruthy(z.string()),
  domain: optionalString,
  addObservations: stringArray.optional(),
  removeObservations: whenTruthy(stringArray),
});

export type UpdateEntityInput = z.infer<typeof UpdateEntityInputSchema>;

/**
 * Schema for `update_entities_batch` tool input
 */
export const UpdateEntitiesBatchInputSchema = z.looseObject({
  updates: z.array(UpdateEntityInputSchema),
  config: BatchConfigInputSchema,
});

export type UpdateEntitiesBatchInput = z.infer<typeof UpdateEntitiesBatchInputSchema>;

// =============================================================================
// DELETE SCHEMAS
// =============================================================================

/**
 * Schema for `delete_entities` tool input
 */
export const DeleteEntitiesInputSchema = z.looseObject({
  entityNames: stringArray,
});

export type DeleteEntitiesInput = z.infer<typeof DeleteEntitiesInputSchema>;

/**
 * Schema for `delete_relations` tool input
 */
export const DeleteRelationsInputSchema = z.looseObject({
  relations: z.array(RelationKeySchema),
});

export type DeleteRelationsInput = z.infer<typeof DeleteRelationsInputSchema>;

/**
 * Schema for `delete_observations` tool input. `observations` is advertised as
 * required, but the storage provider skips a deletion without it (and goes on
 * with the others), so only a truthy value has to be an array.
 */
export const DeleteObservationsInputSchema = z.looseObject({
  deletions: z.array(
    z.looseObject({
      entityName: z.string(),
      observations: whenTruthy(stringArray),
    })
  ),
});

export type DeleteObservationsInput = z.infer<typeof DeleteObservationsInputSchema>;

// =============================================================================
// GRAPH QUERY SCHEMAS
// =============================================================================

/**
 * Schema for the tools that take no real arguments (`read_graph`,
 * `debug_embedding_config`, `diagnose_vector_search`). `random_string` is an
 * advertised dummy parameter that no handler reads.
 */
const NoArgumentsInputSchema = z.looseObject({
  random_string: anyValue,
});

/**
 * Schema for `read_graph` tool input
 */
export const ReadGraphInputSchema = NoArgumentsInputSchema;

export type ReadGraphInput = z.infer<typeof ReadGraphInputSchema>;

/**
 * Schema for `open_nodes` tool input
 */
export const OpenNodesInputSchema = z.looseObject({
  names: stringArray,
});

export type OpenNodesInput = z.infer<typeof OpenNodesInputSchema>;

/**
 * Schema for `flag_oversized_entities` tool input. The handler type-guards each
 * argument itself (a non-number `limit` or `warn_ratio` falls back to the
 * default, and `include_ok` counts only when it is exactly `true`).
 */
export const FlagOversizedEntitiesInputSchema = z.looseObject({
  limit: anyValue,
  warn_ratio: anyValue,
  include_ok: anyValue,
});

export type FlagOversizedEntitiesInput = z.infer<typeof FlagOversizedEntitiesInputSchema>;

// =============================================================================
// TEMPORAL SCHEMAS
// =============================================================================

/**
 * Schema for `get_entity_history` tool input
 */
export const GetEntityHistoryInputSchema = z.looseObject({
  entityName: z.string(),
});

export type GetEntityHistoryInput = z.infer<typeof GetEntityHistoryInputSchema>;

/**
 * Schema for `get_relation_history` tool input
 */
export const GetRelationHistoryInputSchema = RelationKeySchema;

export type GetRelationHistoryInput = z.infer<typeof GetRelationHistoryInputSchema>;

/**
 * Schema for `get_graph_at_time` tool input. The timestamp is compared with
 * stored integers in Cypher, so it must be a number.
 */
export const GetGraphAtTimeInputSchema = z.looseObject({
  timestamp: z.number(),
});

export type GetGraphAtTimeInput = z.infer<typeof GetGraphAtTimeInputSchema>;

/**
 * Schema for `get_decayed_graph` tool input. The handler coerces both values
 * with `Number(...)` and the manager then ignores them, so nothing a client
 * sends here can make the call fail.
 */
export const GetDecayedGraphInputSchema = z.looseObject({
  reference_time: anyValue,
  decay_factor: anyValue,
});

export type GetDecayedGraphInput = z.infer<typeof GetDecayedGraphInputSchema>;

// =============================================================================
// EMBEDDING SCHEMAS
// =============================================================================

/**
 * Schema for the tools addressed by `entity_name` (`get_entity_embedding`,
 * `force_generate_embedding`). Both handlers coerce it with `String(...)`.
 */
const EntityNameInputSchema = z.looseObject({
  entity_name: stringOrNumber,
});

/**
 * Schema for `get_entity_embedding` tool input
 */
export const GetEntityEmbeddingInputSchema = EntityNameInputSchema;

export type GetEntityEmbeddingInput = z.infer<typeof GetEntityEmbeddingInputSchema>;

/**
 * Schema for `force_generate_embedding` tool input (DEBUG only)
 */
export const ForceGenerateEmbeddingInputSchema = EntityNameInputSchema;

export type ForceGenerateEmbeddingInput = z.infer<typeof ForceGenerateEmbeddingInputSchema>;

/**
 * Schema for `debug_embedding_config` tool input (DEBUG only)
 */
export const DebugEmbeddingConfigInputSchema = NoArgumentsInputSchema;

export type DebugEmbeddingConfigInput = z.infer<typeof DebugEmbeddingConfigInputSchema>;

/**
 * Schema for `diagnose_vector_search` tool input (DEBUG only)
 */
export const DiagnoseVectorSearchInputSchema = NoArgumentsInputSchema;

export type DiagnoseVectorSearchInput = z.infer<typeof DiagnoseVectorSearchInputSchema>;

// =============================================================================
// TOOL NAME -> SCHEMA TABLE
// =============================================================================

/**
 * The input schema for every tool `handleCallToolRequest` dispatches, keyed by
 * tool name. A Map, so a tool name such as `toString` cannot resolve to an
 * inherited object property.
 */
export const toolInputSchemas: ReadonlyMap<string, z.ZodType> = new Map<string, z.ZodType>([
  ['create_entities', CreateEntitiesInputSchema],
  ['create_relations', CreateRelationsInputSchema],
  ['add_observations', AddObservationsInputSchema],
  ['delete_entities', DeleteEntitiesInputSchema],
  ['delete_observations', DeleteObservationsInputSchema],
  ['delete_relations', DeleteRelationsInputSchema],
  ['get_relation', GetRelationInputSchema],
  ['update_relation', UpdateRelationInputSchema],
  ['read_graph', ReadGraphInputSchema],
  ['search_nodes', SearchNodesInputSchema],
  ['open_nodes', OpenNodesInputSchema],
  ['flag_oversized_entities', FlagOversizedEntitiesInputSchema],
  ['semantic_search', SemanticSearchInputSchema],
  ['get_entity_embedding', GetEntityEmbeddingInputSchema],
  ['create_entities_batch', CreateEntitiesBatchInputSchema],
  ['create_relations_batch', CreateRelationsBatchInputSchema],
  ['add_observations_batch', AddObservationsBatchInputSchema],
  ['update_entities_batch', UpdateEntitiesBatchInputSchema],
  ['get_entity_history', GetEntityHistoryInputSchema],
  ['get_relation_history', GetRelationHistoryInputSchema],
  ['get_graph_at_time', GetGraphAtTimeInputSchema],
  ['get_decayed_graph', GetDecayedGraphInputSchema],
  ['force_generate_embedding', ForceGenerateEmbeddingInputSchema],
  ['debug_embedding_config', DebugEmbeddingConfigInputSchema],
  ['diagnose_vector_search', DiagnoseVectorSearchInputSchema],
]);

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
