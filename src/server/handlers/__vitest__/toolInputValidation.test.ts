/**
 * Tool input validation: the schema table in src/schemas, the gate in
 * validateToolInput, and its wiring into handleCallToolRequest.
 *
 * The parity tests are generated from the ADVERTISED tool list, so a tool added
 * to listToolsHandler without a schema entry (or the reverse) fails here.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';

import { testBatches, testEntities, testRelations } from '../../../__test-utils__/fixtures.js';
import { toolInputSchemas } from '../../../schemas/index.js';
import { setupServer } from '../../setup.js';
import { handleCallToolRequest } from '../callToolHandler.js';
import { handleListToolsRequest } from '../listToolsHandler.js';
import { assertValidToolInput } from '../validateToolInput.js';

// =============================================================================
// Helpers
// =============================================================================

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
}

interface AdvertisedTool {
  name: string;
  inputSchema: JsonSchema;
}

type Path = (string | number)[];

/**
 * The full advertised tool list, including the tools only listed when DEBUG is on.
 */
async function loadAdvertisedTools(): Promise<AdvertisedTool[]> {
  const previous = process.env.DEBUG;
  process.env.DEBUG = 'true';
  try {
    const { tools } = await handleListToolsRequest();
    return tools as unknown as AdvertisedTool[];
  } finally {
    if (previous === undefined) {
      delete process.env.DEBUG;
    } else {
      process.env.DEBUG = previous;
    }
  }
}

/**
 * Build an input from an advertised JSON schema. `minimal` fills only the
 * required keys at every level; `full` fills every advertised key.
 */
function sampleFromSchema(schema: JsonSchema, mode: 'minimal' | 'full'): unknown {
  switch (schema.type) {
    case 'string': {
      return 'sample';
    }
    case 'number': {
      return 1;
    }
    case 'boolean': {
      return true;
    }
    case 'array': {
      return [sampleFromSchema(schema.items ?? {}, mode)];
    }
    case 'object': {
      const required = new Set(schema.required ?? []);
      const result: Record<string, unknown> = {};
      for (const [key, property] of Object.entries(schema.properties ?? {})) {
        if (mode === 'full' || required.has(key)) {
          result[key] = sampleFromSchema(property, mode);
        }
      }
      return result;
    }
    default: {
      throw new Error(`Unhandled advertised type: ${String(schema.type)}`);
    }
  }
}

/**
 * Every advertised key at every nesting level, as a path into the `full` sample
 * (array items are addressed at index 0), with whether its parent requires it.
 */
function advertisedPaths(
  schema: JsonSchema,
  base: Path = []
): { path: Path; schema: JsonSchema; required: boolean }[] {
  if (schema.type === 'array' && schema.items) {
    return advertisedPaths(schema.items, [...base, 0]);
  }
  if (schema.type !== 'object') {
    return [];
  }
  const found: { path: Path; schema: JsonSchema; required: boolean }[] = [];
  const required = new Set(schema.required ?? []);
  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    found.push({ path: [...base, key], schema: property, required: required.has(key) });
    found.push(...advertisedPaths(property, [...base, key]));
  }
  return found;
}

/** The advertised required keys, at every nesting level. */
function requiredPaths(schema: JsonSchema): { path: Path; schema: JsonSchema }[] {
  return advertisedPaths(schema).filter(entry => entry.required);
}

/** The advertised optional keys, at every nesting level. */
function optionalPaths(schema: JsonSchema): { path: Path; schema: JsonSchema }[] {
  return advertisedPaths(schema).filter(entry => !entry.required);
}

/** Render a path the way validateToolInput does: `entities[0].name`. */
function pathText(path: Path): string {
  let text = '';
  for (const segment of path) {
    if (typeof segment === 'number') {
      text += `[${segment}]`;
    } else {
      text += text ? `.${segment}` : segment;
    }
  }
  return text;
}

/** Clone `input` and replace (or, with `remove`, delete) the value at `path`. */
function mutate(input: unknown, path: Path, change: { remove: true } | { value: unknown }) {
  const clone = structuredClone(input) as Record<string, unknown>;
  let parent: Record<string | number, unknown> = clone;
  for (const segment of path.slice(0, -1)) {
    parent = parent[segment] as Record<string | number, unknown>;
  }
  const last = path.at(-1) as string | number;
  if ('remove' in change) {
    delete parent[last];
  } else {
    parent[last] = change.value;
  }
  return clone;
}

/** A value no handler tolerates in place of the advertised type. */
function wrongTypedValue(schema: JsonSchema): unknown {
  return schema.type === 'object' ? 'not-an-object' : { unexpected: 'shape' };
}

/**
 * A manager mock covering every method any tool handler can reach.
 */
function createMockManager() {
  return {
    readGraph: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    createEntities: vi.fn().mockResolvedValue([]),
    createRelations: vi.fn().mockResolvedValue([]),
    addObservations: vi.fn().mockResolvedValue([]),
    deleteEntities: vi.fn().mockResolvedValue(undefined),
    deleteObservations: vi.fn().mockResolvedValue(undefined),
    deleteRelations: vi.fn().mockResolvedValue(undefined),
    getRelation: vi.fn().mockResolvedValue(null),
    updateRelation: vi.fn().mockResolvedValue(undefined),
    searchNodes: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    openNodes: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    search: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    flagOversizedEntities: vi.fn().mockResolvedValue({ scanned: 0, entities: [] }),
    getEntityHistory: vi.fn().mockResolvedValue([]),
    getRelationHistory: vi.fn().mockResolvedValue([]),
    getGraphAtTime: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    getDecayedGraph: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    createEntitiesBatch: vi.fn().mockResolvedValue({ successful: [], failed: [] }),
    createRelationsBatch: vi.fn().mockResolvedValue({ successful: [], failed: [] }),
    addObservationsBatch: vi.fn().mockResolvedValue({ successful: [], failed: [] }),
    updateEntitiesBatch: vi.fn().mockResolvedValue({ successful: [], failed: [] }),
    storageProvider: {
      getEntityEmbedding: vi.fn().mockResolvedValue(null),
      getEntityById: vi.fn().mockResolvedValue(null),
      diagnoseVectorSearch: vi.fn().mockResolvedValue({ status: 'ok' }),
      getConnectionManager: vi.fn().mockReturnValue({}),
      countEntitiesWithEmbeddings: vi.fn().mockResolvedValue(0),
      storeEntityVector: vi.fn().mockResolvedValue(undefined),
    },
    embeddingJobManager: null,
  };
}

type MockManager = ReturnType<typeof createMockManager>;

/** Assert that neither the manager nor its storage provider was touched. */
function expectNothingCalled(manager: MockManager): void {
  const { storageProvider, embeddingJobManager: _unused, ...methods } = manager;
  for (const [name, mock] of [...Object.entries(methods), ...Object.entries(storageProvider)]) {
    expect(mock, `${name} must not be called`).not.toHaveBeenCalled();
  }
}

function callTool(name: string, args: unknown, manager: MockManager = createMockManager()) {
  return handleCallToolRequest(
    { params: { name, arguments: args as Record<string, unknown> } },
    manager
  );
}

const advertisedTools = await loadAdvertisedTools();
const advertisedByName = new Map(advertisedTools.map(tool => [tool.name, tool]));

/**
 * Keys the advertised schema marks `required` that the gate nevertheless lets
 * through when they are ABSENT, because the code already deals with the absence
 * and the call succeeds today (tool -> path -> what the code does).
 *
 * This is an exception list, not a weaker rule: every advertised required key
 * that is not listed here must be rejected when missing, and an entry that no
 * longer matches an advertised required key fails the table tests below.
 */
const TOLERATED_WHEN_ABSENT: Record<string, Record<string, string>> = {
  create_entities: {
    'entities[0].observations': 'Neo4jStorageProvider.createEntities stores the entity with []',
  },
  delete_observations: {
    'deletions[0].observations':
      'Neo4jStorageProvider.deleteObservations skips that deletion and carries on with the rest',
  },
  add_observations: {
    observations: 'handleAddObservations reports "Invalid observations: must be an array"',
    'observations[0].entityName':
      'handleAddObservations reports "Missing required parameter: entityName"',
    'observations[0].contents':
      'handleAddObservations reports "Missing required parameter: contents (must be an array)"',
  },
};

/**
 * Advertised required keys whose WRONG-TYPED value the handler reports itself in
 * the tool result. The gate lets those through so that result shape is kept.
 * Every other advertised required key must be rejected when wrong-typed.
 */
const REPORTED_BY_HANDLER_WHEN_WRONG_TYPED: Record<string, Record<string, string>> = {
  add_observations: {
    observations: 'handleAddObservations reports "Invalid observations: must be an array"',
    'observations[0].contents':
      'handleAddObservations reports "Missing required parameter: contents (must be an array)"',
  },
};

// =============================================================================
// Realistic inputs per tool: [minimal, full]
// =============================================================================

const BASE_TIMESTAMP = 1_700_000_000_000;
const relationKey = { from: 'John Doe', to: 'Acme Corp', relationType: 'WORKS_AT' };

const realisticInputs: Record<string, { minimal: unknown; full: unknown }> = {
  create_entities: {
    minimal: { entities: [{ ...testEntities.person }] },
    full: {
      entities: [
        {
          ...testEntities.withDomain,
          id: 'entity-id-1',
          version: 1,
          createdAt: BASE_TIMESTAMP,
          updatedAt: BASE_TIMESTAMP,
          validFrom: BASE_TIMESTAMP,
          validTo: BASE_TIMESTAMP + 1000,
          changedBy: 'test-suite',
        },
        { ...testEntities.organization, domain: null },
      ],
    },
  },
  create_relations: {
    minimal: { relations: [{ ...testRelations.basic }] },
    full: {
      relations: [
        {
          ...testRelations.withMetadata,
          metadata: { ...testRelations.withMetadata.metadata, source: 'import', tags: ['a'] },
          id: 'relation-id-1',
          version: 1,
          createdAt: BASE_TIMESTAMP,
          updatedAt: BASE_TIMESTAMP,
          validFrom: BASE_TIMESTAMP,
          validTo: BASE_TIMESTAMP + 1000,
          changedBy: 'test-suite',
        },
        { ...testRelations.weak, metadata: null },
      ],
    },
  },
  add_observations: {
    minimal: { observations: [{ entityName: 'Entity1', contents: ['New observation'] }] },
    full: {
      observations: [
        {
          entityName: 'entity1',
          contents: ['New observation 1', 'New observation 2'],
          strength: 0.8,
          confidence: 0.9,
          metadata: { source: 'meeting notes' },
        },
        { entityName: 'entity2', contents: [] },
      ],
      strength: 0.7,
      confidence: 0.6,
      metadata: { source: 'bulk import' },
    },
  },
  delete_entities: {
    minimal: { entityNames: [] },
    full: { entityNames: ['Entity1', 'Entity2'] },
  },
  delete_observations: {
    minimal: { deletions: [] },
    full: { deletions: [{ entityName: 'Entity1', observations: ['Observation to delete'] }] },
  },
  delete_relations: {
    minimal: { relations: [] },
    full: { relations: [{ from: 'Entity1', to: 'Entity2', relationType: 'KNOWS' }] },
  },
  get_relation: {
    minimal: { from: 'A', to: 'B', relationType: 'KNOWS' },
    full: { ...relationKey },
  },
  update_relation: {
    minimal: { relation: { ...relationKey } },
    full: {
      relation: {
        ...relationKey,
        strength: 0.9,
        confidence: null,
        metadata: { reviewed: true },
        id: 'relation-id-1',
        version: 3,
        createdAt: BASE_TIMESTAMP,
        updatedAt: BASE_TIMESTAMP,
        validFrom: BASE_TIMESTAMP,
        validTo: null,
        changedBy: 'test-suite',
      },
    },
  },
  read_graph: {
    minimal: {},
    full: { random_string: '' },
  },
  search_nodes: {
    minimal: { query: 'test query' },
    full: { query: 'test', domain: 'my-domain', include_null_domain: false },
  },
  open_nodes: {
    minimal: { names: [] },
    full: { names: ['entity1', 'entity2'] },
  },
  flag_oversized_entities: {
    minimal: {},
    full: { limit: 20, warn_ratio: 0.5, include_ok: true },
  },
  semantic_search: {
    minimal: { query: 'test query' },
    full: {
      query: 'test query',
      limit: 0,
      min_similarity: 0,
      entity_types: ['person', 'organization'],
      hybrid_search: false,
      semantic_weight: 0.6,
      domain: 'work',
      include_null_domain: false,
      // Read by the handler but not advertised.
      hybrid_config: { vector_weight: 0.7, temporal_weight: 0.3, enable_score_debug: true },
      enable_hybrid_retrieval: false,
    },
  },
  get_entity_embedding: {
    minimal: { entity_name: 'entity1' },
    full: { entity_name: 'entity1' },
  },
  create_entities_batch: {
    minimal: { entities: testBatches.entities.map(entity => ({ ...entity })) },
    full: {
      entities: [
        { name: 'Entity1', entityType: 'Person', domain: 'work', observations: ['Observation 1'] },
        { name: 'Entity2', entityType: 'Thing', domain: null, observations: [] },
      ],
      config: { maxBatchSize: 50, enableParallel: true },
    },
  },
  create_relations_batch: {
    minimal: { relations: testBatches.relations.map(relation => ({ ...relation })) },
    full: {
      relations: [{ ...testRelations.withMetadata }, { ...testRelations.weak }],
      config: { maxBatchSize: 50, enableParallel: false },
    },
  },
  add_observations_batch: {
    minimal: { observations: [{ entityName: 'entity1', observations: ['New observation 1'] }] },
    full: {
      observations: [
        {
          entityName: 'entity1',
          observations: ['New observation 1', 'New observation 2'],
          metadata: { source: 'sync' },
          confidence: 0.9,
          strength: 0.8,
        },
      ],
      config: { maxBatchSize: 25, enableParallel: true },
    },
  },
  update_entities_batch: {
    minimal: { updates: [{ name: 'entity3', entityType: 'updated-type' }] },
    full: {
      updates: [
        { name: 'entity1', addObservations: ['Added observation'] },
        { name: 'entity2', removeObservations: ['Old observation'] },
        { name: 'entity3', entityType: 'updated-type', domain: null },
        { name: 'entity4', entityType: null, domain: 'work', removeObservations: null },
      ],
      config: null,
    },
  },
  get_entity_history: {
    minimal: { entityName: 'Entity1' },
    full: { entityName: 'Entity1' },
  },
  get_relation_history: {
    minimal: { from: 'A', to: 'B', relationType: 'KNOWS' },
    full: { ...relationKey },
  },
  get_graph_at_time: {
    minimal: { timestamp: BASE_TIMESTAMP },
    full: { timestamp: BASE_TIMESTAMP + 0.5 },
  },
  get_decayed_graph: {
    minimal: {},
    full: { reference_time: 1_234_567_890_000, decay_factor: 0.8 },
  },
  force_generate_embedding: {
    minimal: { entity_name: 'entity1' },
    full: { entity_name: '123e4567-e89b-12d3-a456-426614174000' },
  },
  debug_embedding_config: {
    minimal: {},
    full: { random_string: 'anything' },
  },
  diagnose_vector_search: {
    minimal: {},
    full: { random_string: 'anything' },
  },
};

// =============================================================================
// Tests
// =============================================================================

describe('tool input schema table', () => {
  it('has exactly one schema per advertised tool (DEBUG tools included)', () => {
    const advertisedNames = advertisedTools.map(tool => tool.name).sort();
    const schemaNames = [...toolInputSchemas.keys()].sort();

    expect(advertisedNames).toHaveLength(25);
    expect(new Set(advertisedNames).size).toBe(advertisedNames.length);
    expect(schemaNames).toEqual(advertisedNames);
  });

  it('has realistic test inputs for every advertised tool', () => {
    expect(Object.keys(realisticInputs).sort()).toEqual(
      advertisedTools.map(tool => tool.name).sort()
    );
  });

  it.each([
    ['TOLERATED_WHEN_ABSENT', TOLERATED_WHEN_ABSENT],
    ['REPORTED_BY_HANDLER_WHEN_WRONG_TYPED', REPORTED_BY_HANDLER_WHEN_WRONG_TYPED],
  ])('%s lists only advertised required keys, each with a reason', (_label, exceptions) => {
    for (const [name, paths] of Object.entries(exceptions)) {
      const required = requiredPaths(advertisedByName.get(name)?.inputSchema ?? {}).map(entry =>
        pathText(entry.path)
      );
      for (const [path, reason] of Object.entries(paths)) {
        expect(required, `${name}: ${path}`).toContain(path);
        expect(reason.length, `${name}: ${path} needs a reason`).toBeGreaterThan(10);
      }
    }
  });

  it('dispatches every tool in the table (none falls through to "Unknown tool")', async () => {
    for (const name of toolInputSchemas.keys()) {
      await expect(callTool(name, realisticInputs[name].minimal)).resolves.toMatchObject({
        content: [{ type: 'text' }],
      });
    }
  });
});

describe.each(advertisedTools.map(tool => [tool.name, tool] as const))(
  'tool input validation: %s',
  (name, tool) => {
    const advertisedMinimal = sampleFromSchema(tool.inputSchema, 'minimal');
    const advertisedFull = sampleFromSchema(tool.inputSchema, 'full');
    const required = requiredPaths(tool.inputSchema).map(
      entry => [pathText(entry.path), entry] as const
    );
    const optional = optionalPaths(tool.inputSchema).map(
      entry => [pathText(entry.path), entry] as const
    );

    it('accepts an input holding only the advertised required keys', () => {
      // Also proves no key the advertised schema marks optional is required here.
      expect(() => assertValidToolInput(name, advertisedMinimal as never)).not.toThrow();
    });

    it('accepts an input holding every advertised key with its advertised type', () => {
      expect(() => assertValidToolInput(name, advertisedFull as never)).not.toThrow();
    });

    it('accepts a realistic minimal input and calls the handler', async () => {
      await expect(callTool(name, realisticInputs[name].minimal)).resolves.toBeDefined();
    });

    it('accepts a realistic full input and calls the handler', async () => {
      await expect(callTool(name, realisticInputs[name].full)).resolves.toBeDefined();
    });

    it('accepts unknown extra keys at every level and leaves the arguments untouched', async () => {
      const args = structuredClone(realisticInputs[name].full) as Record<string, unknown>;
      args.unknown_top_level = { nested: ['kept'] };
      for (const value of Object.values(args)) {
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item && typeof item === 'object') {
              (item as Record<string, unknown>).unknown_item_key = 'kept';
            }
          }
        } else if (value && typeof value === 'object') {
          (value as Record<string, unknown>).unknown_nested_key = 'kept';
        }
      }
      // The add_observations full input sets `strength`: its handler writes a
      // default onto the arguments object when that key is absent.
      const before = structuredClone(args);

      await expect(callTool(name, args)).resolves.toBeDefined();

      expect(args).toEqual(before);
    });

    const toleratedWhenAbsent = TOLERATED_WHEN_ABSENT[name] ?? {};
    const reportedByHandler = REPORTED_BY_HANDLER_WHEN_WRONG_TYPED[name] ?? {};

    // `it.each` over an empty list registers no test, so a tool simply gets none
    // of the cases below that do not apply to it.
    it.each(optional)('accepts an input without the advertised optional %s', (_path, entry) => {
      const args = mutate(advertisedFull, entry.path, { remove: true });

      expect(() => assertValidToolInput(name, args)).not.toThrow();
    });

    it.each(required.filter(([path]) => !(path in toleratedWhenAbsent)))(
      'rejects a missing required %s before any storage call',
      async (path, entry) => {
        const manager = createMockManager();
        const args = mutate(advertisedFull, entry.path, { remove: true });

        await expect(callTool(name, args, manager)).rejects.toThrow(
          `Invalid arguments for tool ${name}: Missing required parameter: ${path}`
        );
        expectNothingCalled(manager);
      }
    );

    it.each(required.filter(([path]) => path in toleratedWhenAbsent))(
      'lets a missing %s through, because the code already deals with it',
      async (_path, entry) => {
        const args = mutate(advertisedFull, entry.path, { remove: true });

        await expect(callTool(name, args)).resolves.toMatchObject({ content: [{ type: 'text' }] });
      }
    );

    it.each(required.filter(([path]) => !(path in reportedByHandler)))(
      'rejects a wrong-typed required %s before any storage call',
      async (path, entry) => {
        const manager = createMockManager();
        const args = mutate(advertisedFull, entry.path, { value: wrongTypedValue(entry.schema) });

        const error = await callTool(name, args, manager).then(
          () => undefined,
          (caught: unknown) => caught as Error
        );

        expect(error).toBeInstanceOf(Error);
        expect(error?.message).toContain(`Invalid arguments for tool ${name}: `);
        expect(error?.message).toContain(`${path}: Invalid input: expected `);
        expectNothingCalled(manager);
      }
    );

    it.each(required.filter(([path]) => path in reportedByHandler))(
      'leaves a wrong-typed %s to the handler, which reports it in the tool result',
      async (_path, entry) => {
        const manager = createMockManager();
        const args = mutate(advertisedFull, entry.path, { value: wrongTypedValue(entry.schema) });

        const result = await callTool(name, args, manager);

        expect(JSON.parse(result.content[0].text)).toEqual({ error: expect.any(String) });
        expectNothingCalled(manager);
      }
    );
  }
);

describe('tools without required arguments', () => {
  it.each([
    'read_graph',
    'flag_oversized_entities',
    'get_decayed_graph',
    'debug_embedding_config',
    'diagnose_vector_search',
  ])('%s advertises no required key, so an empty object is accepted', async name => {
    expect(requiredPaths(advertisedByName.get(name)?.inputSchema ?? {})).toEqual([]);
    await expect(callTool(name, {})).resolves.toBeDefined();
  });

  it('flag_oversized_entities still defaults missing arguments to {}', async () => {
    const manager = createMockManager();

    await handleCallToolRequest(
      { params: { name: 'flag_oversized_entities', arguments: undefined } },
      manager
    );

    expect(manager.flagOversizedEntities).toHaveBeenCalledWith({
      scanLimit: undefined,
      warnRatio: undefined,
      includeOk: false,
    });
  });
});

describe('validation is a gate, not a transform', () => {
  it('passes the original nested objects through to the manager', async () => {
    const manager = createMockManager();
    const entities = [{ name: 'A', entityType: 'Person', observations: ['x'], custom: { a: 1 } }];
    const relation = { ...relationKey, strength: 0.4, note: 'kept' };
    const updates = [{ name: 'A', domain: null, addObservations: ['y'], custom: true }];
    const config = { maxBatchSize: 10, onProgress: 'ignored-by-validation' };

    await callTool('create_entities', { entities }, manager);
    await callTool('update_relation', { relation }, manager);
    await callTool('update_entities_batch', { updates, config }, manager);

    expect(manager.createEntities.mock.calls[0][0]).toBe(entities);
    expect(manager.updateRelation.mock.calls[0][0]).toBe(relation);
    expect(manager.updateEntitiesBatch.mock.calls[0][0]).toBe(updates);
    expect(manager.updateEntitiesBatch.mock.calls[0][1]).toBe(config);
    expect(entities[0]).toEqual({
      name: 'A',
      entityType: 'Person',
      observations: ['x'],
      custom: { a: 1 },
    });
  });

  it('applies no defaults: absent optional values stay undefined', async () => {
    const manager = createMockManager();

    await callTool('semantic_search', { query: 'q' }, manager);
    await callTool('create_entities_batch', { entities: [] }, manager);

    expect(manager.search).toHaveBeenCalledWith(
      'q',
      expect.objectContaining({ limit: undefined, minSimilarity: undefined })
    );
    expect(manager.createEntitiesBatch).toHaveBeenCalledWith([], undefined);
  });

  it('does not coerce: values the handler coerces arrive as sent', async () => {
    const manager = createMockManager();

    await callTool('get_decayed_graph', { reference_time: '1700000000000' }, manager);
    await callTool('semantic_search', { query: 42 }, manager);
    await callTool('search_nodes', { query: 42, domain: null }, manager);

    // The handlers, not the gate, do the coercion.
    expect(manager.getDecayedGraph).toHaveBeenCalledWith({ referenceTime: 1_700_000_000_000 });
    expect(manager.search).toHaveBeenCalledWith('42', expect.anything());
    expect(manager.searchNodes).toHaveBeenCalledWith(42, expect.objectContaining({ domain: null }));
  });

  it('accepts any value for advertised keys that cannot change the outcome', async () => {
    const manager = createMockManager();

    await callTool('read_graph', { random_string: 42 }, manager);
    await callTool('flag_oversized_entities', { limit: '20', include_ok: 'yes' }, manager);
    await callTool(
      'add_observations',
      { observations: [{ entityName: 'A', contents: ['x'], strength: 'high' }], metadata: 'n/a' },
      manager
    );
    await callTool(
      'create_relations_batch',
      { relations: [{ ...relationKey }], config: { enableParallel: 'true' } },
      manager
    );

    expect(manager.readGraph).toHaveBeenCalledTimes(1);
    expect(manager.flagOversizedEntities).toHaveBeenCalledWith({
      scanLimit: undefined,
      warnRatio: undefined,
      includeOk: false,
    });
    expect(manager.addObservations).toHaveBeenCalledTimes(1);
    expect(manager.createRelationsBatch).toHaveBeenCalledTimes(1);
  });

  it('does not enforce the entityType naming convention or any value range', async () => {
    const manager = createMockManager();

    await callTool(
      'create_entities',
      { entities: [{ name: '', entityType: 'Not Kebab_Case', observations: [] }] },
      manager
    );
    await callTool(
      'create_relations',
      { relations: [{ from: 'a', to: 'b', relationType: '', strength: 7, confidence: -1 }] },
      manager
    );

    expect(manager.createEntities).toHaveBeenCalledTimes(1);
    expect(manager.createRelations).toHaveBeenCalledTimes(1);
  });
});

describe('calls that work today keep working', () => {
  it('create_entities: an entity without observations reaches the handler unchanged', async () => {
    const manager = createMockManager();
    const entities = [
      { name: 'No Observations', entityType: 'person' },
      { name: 'Null Observations', entityType: 'person', observations: null, domain: '' },
    ];

    await callTool('create_entities', { entities }, manager);

    expect(manager.createEntities.mock.calls[0][0]).toBe(entities);
    expect(entities[0]).toEqual({ name: 'No Observations', entityType: 'person' });
    expect(Object.keys(entities[0])).not.toContain('observations');
  });

  it('create_entities_batch still requires observations (the manager throws without it)', async () => {
    const manager = createMockManager();

    await expect(
      callTool(
        'create_entities_batch',
        { entities: [{ name: 'A', entityType: 'person' }] },
        manager
      )
    ).rejects.toThrow(
      'Invalid arguments for tool create_entities_batch: Missing required parameter: entities[0].observations'
    );
    expectNothingCalled(manager);
  });

  it('delete_observations: a deletion without observations is left for storage to skip', async () => {
    const manager = createMockManager();
    const deletions = [{ entityName: 'A', observations: ['x'] }, { entityName: 'B' }];

    await callTool('delete_observations', { deletions }, manager);

    expect(manager.deleteObservations.mock.calls[0][0]).toBe(deletions);
  });

  it('accepts every value for keys the code reads by truthiness or normalises itself', async () => {
    const manager = createMockManager();

    await callTool('search_nodes', { query: 'q', include_null_domain: 'true' }, manager);
    await callTool(
      'semantic_search',
      {
        query: 'q',
        limit: '5',
        hybrid_search: 'true',
        semantic_weight: '0.6',
        include_null_domain: 1,
      },
      manager
    );
    await callTool(
      'get_decayed_graph',
      { reference_time: { at: 'noon' }, decay_factor: true },
      manager
    );

    expect(manager.searchNodes).toHaveBeenCalledWith(
      'q',
      expect.objectContaining({ includeNullDomain: 'true' })
    );
    expect(manager.search).toHaveBeenCalledWith(
      'q',
      expect.objectContaining({ limit: '5', hybridSearch: 'true', includeNullDomain: 1 })
    );
    expect(manager.getDecayedGraph).toHaveBeenCalledTimes(1);
  });

  it('accepts any falsy value where the code falls back on a falsy value', async () => {
    const manager = createMockManager();

    await callTool('search_nodes', { query: 'q', domain: false }, manager);
    await callTool('semantic_search', { query: 'q', domain: 0, entity_types: '' }, manager);
    await callTool(
      'create_entities',
      { entities: [{ name: 'A', entityType: 't', domain: 0, createdAt: '', changedBy: false }] },
      manager
    );
    await callTool(
      'create_relations',
      { relations: [{ ...relationKey, strength: '', confidence: false, metadata: 0 }] },
      manager
    );
    await callTool(
      'update_entities_batch',
      { updates: [{ name: 'A', entityType: 0, removeObservations: '', domain: 'work' }] },
      manager
    );

    expect(manager.searchNodes).toHaveBeenCalledTimes(1);
    expect(manager.search).toHaveBeenCalledTimes(1);
    expect(manager.createEntities).toHaveBeenCalledTimes(1);
    expect(manager.createRelations).toHaveBeenCalledTimes(1);
    expect(manager.updateEntitiesBatch).toHaveBeenCalledTimes(1);
  });

  it('accepts a numeric string for a relation strength or confidence', async () => {
    const manager = createMockManager();

    await callTool(
      'create_relations',
      { relations: [{ ...relationKey, strength: '0.9', confidence: '1' }] },
      manager
    );
    await callTool(
      'create_relations_batch',
      { relations: [{ ...relationKey, strength: '0.9', confidence: null }] },
      manager
    );
    await callTool(
      'update_relation',
      { relation: { ...relationKey, strength: '0.5', confidence: null } },
      manager
    );

    expect(manager.createRelations).toHaveBeenCalledTimes(1);
    expect(manager.createRelationsBatch).toHaveBeenCalledTimes(1);
    expect(manager.updateRelation).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a non-object config', 'ignored'],
    ['a zero maxBatchSize', { maxBatchSize: 0 }],
    ['a fractional maxBatchSize', { maxBatchSize: 0.5 }],
    ['a positive-integer string maxBatchSize', { maxBatchSize: '50' }],
  ])('batch tools accept %s, which the chunking code handles today', async (_label, config) => {
    const manager = createMockManager();

    await callTool('create_entities_batch', { entities: [], config }, manager);

    expect(manager.createEntitiesBatch).toHaveBeenCalledWith([], config);
  });
});

describe('wrong-typed optional values that are still rejected', () => {
  it.each([
    [
      'search_nodes',
      { query: 'q', domain: 5 },
      'domain: Invalid input: expected string, received number',
    ],
    [
      'semantic_search',
      { query: 'q', entity_types: 'person' },
      'entity_types: Invalid input: expected array, received string',
    ],
    [
      'semantic_search',
      { query: 'q', min_similarity: '0.5' },
      'min_similarity: Invalid input: expected number, received string',
    ],
    [
      'create_relations',
      { relations: [{ from: 'a', to: 'b', relationType: 'r', strength: 'high' }] },
      'relations[0].strength: Invalid input: expected number',
    ],
    [
      'create_entities',
      { entities: [{ name: 'A', entityType: 't', observations: 'one observation' }] },
      'entities[0].observations: Invalid input: expected array, received string',
    ],
    [
      'update_entities_batch',
      { updates: [{ name: 'A', addObservations: null }] },
      'updates[0].addObservations: Invalid input: expected array, received null',
    ],
  ])('%s rejects %j', async (name, args, detail) => {
    const manager = createMockManager();

    await expect(callTool(name, args, manager)).rejects.toThrow(
      `Invalid arguments for tool ${name}: ${detail}`
    );
    expectNothingCalled(manager);
  });

  it.each([
    'create_entities_batch',
    'create_relations_batch',
    'add_observations_batch',
    'update_entities_batch',
  ])('%s rejects a maxBatchSize the chunking loop cannot terminate on or cover', async name => {
    const manager = createMockManager();
    const key = advertisedByName.get(name)?.inputSchema.required?.[0] ?? '';

    for (const maxBatchSize of [-1, -0.5, '-5', 'many']) {
      await expect(
        callTool(name, { [key]: [], config: { maxBatchSize } }, manager)
      ).rejects.toThrow(
        `Invalid arguments for tool ${name}: config.maxBatchSize: Invalid input: expected a positive number`
      );
    }
    expectNothingCalled(manager);
  });
});

describe('add_observations keeps reporting its own input errors in the tool result', () => {
  it.each([
    [{}, 'Invalid observations: must be an array'],
    [{ observations: 'not-an-array' }, 'Invalid observations: must be an array'],
    [{ observations: [{ contents: ['x'] }] }, 'Missing required parameter: entityName'],
    [
      { observations: [{ entityName: '', contents: ['x'] }] },
      'Missing required parameter: entityName',
    ],
    [{ observations: ['not-an-object'] }, 'Missing required parameter: entityName'],
    [
      { observations: [{ entityName: 'A' }] },
      'Missing required parameter: contents (must be an array)',
    ],
    [
      { observations: [{ entityName: 'A', contents: 'not-an-array' }] },
      'Missing required parameter: contents (must be an array)',
    ],
  ])('%j -> { error: %j }', async (args, error) => {
    const manager = createMockManager();

    const result = await callTool('add_observations', args, manager);

    expect(result).toEqual({
      content: [{ type: 'text', text: JSON.stringify({ error }, null, 2) }],
    });
    expectNothingCalled(manager);
  });

  it.each([
    [
      { observations: [{ entityName: 123, contents: ['x'] }] },
      'observations[0].entityName: Invalid input: expected string, received number',
    ],
    [
      { observations: [{ entityName: 'A', contents: ['x', 2] }] },
      'observations[0].contents[1]: Invalid input: expected string, received number',
    ],
  ])('rejects %j, which the handler would pass on to storage', async (args, detail) => {
    const manager = createMockManager();

    await expect(callTool('add_observations', args, manager)).rejects.toThrow(
      `Invalid arguments for tool add_observations: ${detail}`
    );
    expectNothingCalled(manager);
  });
});

describe('validation failures', () => {
  it('never puts argument values in the message', async () => {
    const manager = createMockManager();
    const args = {
      entities: [
        { name: 918_273_645, entityType: 'SECRET-TYPE', observations: 'SECRET-OBSERVATION' },
        { name: 'SECRET-NAME', entityType: ['SECRET-ARRAY'], observations: [{ SECRET: 1 }] },
      ],
    };

    const error = await callTool('create_entities', args, manager).then(
      () => undefined,
      (caught: unknown) => caught as Error
    );

    expect(error?.message).toBe(
      'Invalid arguments for tool create_entities: ' +
        'entities[0].name: Invalid input: expected string, received number; ' +
        'entities[0].observations: Invalid input: expected array, received string; ' +
        'entities[1].entityType: Invalid input: expected string, received array; ' +
        'entities[1].observations[0]: Invalid input: expected string, received object'
    );
    expect(error?.message).not.toMatch(/SECRET|918273645/);
    expectNothingCalled(manager);
  });

  it('reports a rejected null for a required key by path, not as missing', async () => {
    await expect(callTool('open_nodes', { names: null })).rejects.toThrow(
      'Invalid arguments for tool open_nodes: names: Invalid input: expected array, received null'
    );
  });

  it('caps the number of issues spelled out in one message', async () => {
    const entities = Array.from({ length: 25 }, () => ({ entityType: 't', observations: [] }));

    const error = await callTool('create_entities_batch', { entities }).then(
      () => undefined,
      (caught: unknown) => caught as Error
    );

    expect(error?.message).toContain('Missing required parameter: entities[9].name; and 15 more');
    expect(error?.message).not.toContain('entities[10]');
  });

  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])(
    'treats the inherited property name %s as an unknown tool',
    async name => {
      const manager = createMockManager();

      await expect(callTool(name, {}, manager)).rejects.toThrow(`Unknown tool: ${name}`);
      expect(() => assertValidToolInput(name, {})).toThrow(`Unknown tool: ${name}`);
      expectNothingCalled(manager);
    }
  );

  it('reaches an MCP client as a JSON-RPC internal error carrying the message', async () => {
    const manager = createMockManager();
    const server = setupServer(manager);
    const client = new Client({ name: 'validation-test-client', version: '0.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      await expect(
        client.callTool({ name: 'create_entities', arguments: { entities: 'not-an-array' } })
      ).rejects.toMatchObject({
        code: -32_603,
        message: expect.stringContaining(
          'Invalid arguments for tool create_entities: entities: Invalid input: expected array, received string'
        ),
      });
      expectNothingCalled(manager);

      const accepted = await client.callTool({
        name: 'create_entities',
        arguments: { entities: [{ ...testEntities.person, extra: 'kept' }] },
      });
      expect(accepted.isError).toBeUndefined();
      expect(manager.createEntities).toHaveBeenCalledWith([
        { ...testEntities.person, extra: 'kept' },
      ]);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
