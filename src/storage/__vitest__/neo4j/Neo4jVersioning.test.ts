/**
 * @vitest-environment node
 *
 * Regression tests for the v2.9.0 temporal-versioning fixes.
 *
 * These run against a small in-memory graph that interprets the exact Cypher
 * the shared versioning helper emits. A pure call-assertion mock cannot answer
 * the questions that matter here — "did the relationship count stay constant?",
 * "is there still exactly one live version?" — because those are properties of
 * the resulting graph, not of any single query.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { Neo4jStorageProvider } from '../../neo4j/Neo4jStorageProvider';

vi.mock('../../neo4j/Neo4jSchemaManager', () => ({
  Neo4jSchemaManager: vi.fn().mockImplementation(function () {
    return {
      initializeSchema: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock('../../neo4j/Neo4jVectorStore', () => ({
  Neo4jVectorStore: vi.fn().mockImplementation(function () {
    return {
      initialize: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

interface FakeNode {
  id: string | null;
  name: string;
  entityType: string;
  domain: string | null;
  observations: unknown;
  version: number;
  createdAt: number;
  updatedAt: number;
  validFrom: number;
  validTo: number | null;
  embedding?: number[] | null;
}

interface FakeRel {
  id: string | null;
  fromNodeId: string;
  toNodeId: string;
  relationType: string;
  validTo: number | null;
  props: Record<string, unknown>;
}

const record = (values: Record<string, unknown>) => ({
  get: (key: string) => (key in values ? values[key] : null),
});

/**
 * An in-memory graph that answers the specific queries the versioning helper
 * issues. Anything it does not recognise returns no records, which surfaces as
 * an obvious test failure rather than a silent pass.
 */
class FakeGraph {
  nodes: FakeNode[] = [];
  rels: FakeRel[] = [];
  queries: string[] = [];
  beginTransactionArgs: unknown[] = [];

  addNode(node: Partial<FakeNode> & { name: string }): FakeNode {
    const now = node.validFrom ?? 1000;
    const created: FakeNode = {
      id: node.id ?? `${node.name}-v${node.version ?? 1}`,
      name: node.name,
      entityType: node.entityType ?? 'test',
      domain: node.domain ?? null,
      observations: node.observations ?? JSON.stringify([]),
      version: node.version ?? 1,
      createdAt: node.createdAt ?? now,
      updatedAt: node.updatedAt ?? now,
      validFrom: now,
      validTo: node.validTo ?? null,
      embedding: node.embedding ?? null,
    };
    this.nodes.push(created);
    return created;
  }

  addRel(fromName: string, toName: string, relationType: string, id: string): FakeRel {
    const from = this.liveNode(fromName);
    const to = this.liveNode(toName);
    if (!from?.id || !to?.id) {
      throw new Error(`Cannot create ${fromName}->${toName}: missing live endpoint`);
    }
    const rel: FakeRel = {
      id,
      fromNodeId: from.id,
      toNodeId: to.id,
      relationType,
      validTo: null,
      props: { relationType, strength: 0.9, confidence: 0.95 },
    };
    this.rels.push(rel);
    return rel;
  }

  liveNodes(name: string): FakeNode[] {
    return this.nodes.filter(node => node.name === name && node.validTo === null);
  }

  liveNode(name: string): FakeNode | undefined {
    return [...this.liveNodes(name)].sort((a, b) => b.validFrom - a.validFrom)[0];
  }

  nodeById(id: string): FakeNode | undefined {
    return this.nodes.find(node => node.id === id);
  }

  /** Live relationships incident to the live version(s) of `name`. */
  liveRelsFor(name: string): FakeRel[] {
    const ids = new Set(this.liveNodes(name).map(node => node.id));
    return this.rels.filter(
      rel => rel.validTo === null && (ids.has(rel.fromNodeId) || ids.has(rel.toNodeId))
    );
  }

  /** Every live relationship in the graph, whatever it is attached to. */
  allLiveRels(): FakeRel[] {
    return this.rels.filter(rel => rel.validTo === null);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run = async (query: string, params: any = {}): Promise<{ records: any[] }> => {
    this.queries.push(query);

    // --- pre-flight relationship budget -----------------------------------
    if (query.includes('AS relCount')) {
      return {
        records: (params.names as string[])
          .filter(name => this.liveNodes(name).length > 0)
          .map(name => record({ name, relCount: this.liveRelsFor(name).length })),
      };
    }

    // --- fetch every live version of each name ----------------------------
    if (query.includes('AS versions')) {
      return {
        records: (params.names as string[])
          .filter(name => this.liveNodes(name).length > 0)
          .map(name =>
            record({
              name,
              versions: this.liveNodes(name).map(node => ({
                id: node.id,
                entityType: node.entityType,
                domain: node.domain,
                observations: node.observations,
                version: node.version,
                createdAt: node.createdAt,
                validFrom: node.validFrom,
              })),
            })
          ),
      };
    }

    // --- which names already have a live version --------------------------
    if (query.includes('RETURN DISTINCT name AS name')) {
      return {
        records: (params.names as string[])
          .filter(name => this.liveNodes(name).length > 0)
          .map(name => record({ name })),
      };
    }

    // --- collect live relationships of the versions being superseded ------
    if (query.includes('RETURN row.newId AS newId')) {
      const outgoing = query.includes('MATCH (e)-[r:RELATES_TO]->(other:Entity)');
      const records = [];
      for (const row of params.rows as { newId: string; oldId: string }[]) {
        const node = this.nodeById(row.oldId);
        if (!node?.id) {
          continue;
        }
        for (const rel of this.rels) {
          if (rel.validTo !== null) {
            continue;
          }
          const matches = outgoing ? rel.fromNodeId === node.id : rel.toNodeId === node.id;
          if (!matches) {
            continue;
          }
          const otherId = outgoing ? rel.toNodeId : rel.fromNodeId;
          const other = this.nodeById(otherId);
          if (!other) {
            continue;
          }
          records.push(
            record({
              newId: row.newId,
              otherName: other.name,
              relId: rel.id,
              props: rel.props,
            })
          );
        }
      }
      return { records };
    }

    // --- close old versions and their live relationships ------------------
    if (query.includes('SET e.validTo = row.now')) {
      for (const row of params.rows as { oldId: string; now: number }[]) {
        const node = this.nodeById(row.oldId);
        if (!node) {
          continue;
        }
        node.validTo = row.now;
        for (const rel of this.rels) {
          if (
            rel.validTo === null &&
            (rel.fromNodeId === row.oldId || rel.toNodeId === row.oldId)
          ) {
            rel.validTo = row.now;
          }
        }
      }
      return { records: [] };
    }

    // --- create the new versions ------------------------------------------
    if (query.includes('id: upd.newId')) {
      for (const upd of params.updates as Record<string, never>[]) {
        const u = upd as unknown as {
          newId: string;
          name: string;
          entityType: string;
          domain: string | null;
          observations: string;
          version: number;
          createdAt: number;
          changedBy: string | null;
          embedding: number[] | null;
          now: number;
        };
        this.nodes.push({
          id: u.newId,
          name: u.name,
          entityType: u.entityType,
          domain: u.domain,
          observations: u.observations,
          version: u.version,
          createdAt: u.createdAt,
          updatedAt: u.now,
          validFrom: u.now,
          validTo: null,
          embedding: u.embedding,
        });
      }
      return { records: [] };
    }

    // --- resolve each counterpart's newest live version -------------------
    if (query.includes('collect(e.id)[0] AS id')) {
      return {
        records: (params.names as string[])
          .map(name => ({ name, node: this.liveNode(name) }))
          .filter(entry => entry.node !== undefined)
          .map(entry => record({ name: entry.name, id: entry.node?.id })),
      };
    }

    // --- MERGE the relationship copies onto the new versions --------------
    if (query.includes('MERGE (newE)-[r:RELATES_TO {id: row.relId}]->(other)')) {
      this.mergeCopies(params.rows, 'outgoing');
      return { records: [] };
    }
    if (query.includes('MERGE (other)-[r:RELATES_TO {id: row.relId}]->(newE)')) {
      this.mergeCopies(params.rows, 'incoming');
      return { records: [] };
    }

    // --- legacy in-place observation update -------------------------------
    if (query.includes('SET e.observations = $observations')) {
      const node = this.liveNode(params.name as string);
      if (node) {
        node.observations = params.observations;
      }
      return { records: [] };
    }

    // --- createEntities fresh CREATE --------------------------------------
    if (query.includes('CREATE (e:Entity {') && query.includes('id: $id')) {
      const node = this.addNode({
        id: params.id,
        name: params.name,
        entityType: params.entityType,
        domain: params.domain,
        observations: params.observations,
        version: params.version,
        createdAt: params.createdAt,
        validFrom: params.validFrom,
      });
      return { records: [record({ e: { properties: node } })] };
    }

    // --- createEntitiesBatch fresh CREATE ---------------------------------
    if (query.includes('UNWIND $entities AS entity') && query.includes('CREATE (e:Entity {')) {
      for (const entity of params.entities as Partial<FakeNode> & { name: string }[]) {
        this.addNode(entity as Partial<FakeNode> & { name: string });
      }
      return { records: [] };
    }

    return { records: [] };
  };

  private mergeCopies(
    rows: { newId: string; otherId: string; relId: string; props: Record<string, unknown> }[],
    direction: 'outgoing' | 'incoming'
  ): void {
    for (const row of rows) {
      const fromId = direction === 'outgoing' ? row.newId : row.otherId;
      const toId = direction === 'outgoing' ? row.otherId : row.newId;
      const existing = this.rels.find(
        rel => rel.id === row.relId && rel.fromNodeId === fromId && rel.toNodeId === toId
      );
      if (existing) {
        // MERGE matched: ON CREATE does not fire, nothing changes.
        continue;
      }
      this.rels.push({
        id: row.relId,
        fromNodeId: fromId,
        toNodeId: toId,
        relationType: (row.props.relationType as string) ?? 'related-to',
        validTo: null,
        props: row.props,
      });
    }
  }

  session() {
    return {
      beginTransaction: vi.fn().mockImplementation((config?: unknown) => {
        this.beginTransactionArgs.push(config);
        return {
          run: this.run,
          commit: vi.fn().mockResolvedValue(undefined),
          rollback: vi.fn().mockResolvedValue(undefined),
        };
      }),
      run: this.run,
      close: vi.fn().mockResolvedValue(undefined),
    };
  }

  connectionManager() {
    return {
      getSession: vi.fn().mockImplementation(async () => this.session()),
      executeQuery: vi.fn().mockResolvedValue({ records: [] }),
      close: vi.fn().mockResolvedValue(undefined),
    };
  }
}

function makeProvider(graph: FakeGraph): Neo4jStorageProvider {
  return new Neo4jStorageProvider({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connectionManager: graph.connectionManager() as any,
    config: {
      uri: 'bolt://localhost:7687',
      username: 'neo4j',
      password: 'test',
      database: 'neo4j',
      vectorIndexName: 'entity_embeddings',
      vectorDimensions: 1536,
      similarityFunction: 'cosine',
    },
  });
}

describe('Neo4j temporal versioning (v2.9.0)', () => {
  let graph: FakeGraph;
  let provider: Neo4jStorageProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEO4J_MAX_LIVE_RELATIONSHIPS;
    delete process.env.NEO4J_TX_TIMEOUT_MS;
    graph = new FakeGraph();
    provider = makeProvider(graph);
  });

  describe('relationship carry-over', () => {
    it('keeps the live relationship count constant when an entity is versioned twice', async () => {
      graph.addNode({ name: 'Alpha', observations: JSON.stringify(['seed']) });
      graph.addNode({ name: 'Beta' });
      graph.addNode({ name: 'Gamma' });
      graph.addRel('Alpha', 'Beta', 'relates-to', 'rel-out');
      graph.addRel('Gamma', 'Alpha', 'relates-to', 'rel-in');

      expect(graph.liveRelsFor('Alpha')).toHaveLength(2);

      await provider.addObservations([{ entityName: 'Alpha', contents: ['first'] }]);
      expect(graph.liveRelsFor('Alpha')).toHaveLength(2);

      await provider.addObservations([{ entityName: 'Alpha', contents: ['second'] }]);
      expect(graph.liveRelsFor('Alpha')).toHaveLength(2);

      // ...and the whole graph, not just Alpha's view of it.
      expect(graph.allLiveRels()).toHaveLength(2);
    });

    it('copies a relationship exactly once when BOTH of its ends are versioned in one batch', async () => {
      graph.addNode({ name: 'Alpha' });
      graph.addNode({ name: 'Beta' });
      graph.addRel('Alpha', 'Beta', 'relates-to', 'rel-shared');

      await provider.addObservationsBatch([
        { entityName: 'Alpha', observations: ['a1'] },
        { entityName: 'Beta', observations: ['b1'] },
      ]);

      expect(graph.allLiveRels()).toHaveLength(1);
      expect(graph.allLiveRels()[0].id).toBe('rel-shared');

      // Repeating the joint batch must not double it either — this is the
      // exact loop that reached 39,382 physical edges in production.
      await provider.addObservationsBatch([
        { entityName: 'Alpha', observations: ['a2'] },
        { entityName: 'Beta', observations: ['b2'] },
      ]);
      expect(graph.allLiveRels()).toHaveLength(1);

      await provider.addObservationsBatch([
        { entityName: 'Alpha', observations: ['a3'] },
        { entityName: 'Beta', observations: ['b3'] },
      ]);
      expect(graph.allLiveRels()).toHaveLength(1);
    });

    it('copies relationships with MERGE keyed on the relation id, never CREATE', async () => {
      graph.addNode({ name: 'Alpha' });
      graph.addNode({ name: 'Beta' });
      graph.addRel('Alpha', 'Beta', 'relates-to', 'rel-1');

      await provider.addObservations([{ entityName: 'Alpha', contents: ['x'] }]);

      const copyQueries = graph.queries.filter(query => query.includes('row.relId'));
      expect(copyQueries.length).toBeGreaterThan(0);
      for (const query of copyQueries) {
        expect(query).toContain('MERGE');
        expect(query).toContain('{id: row.relId}');
        expect(query).toContain('ON CREATE SET r += row.props');
        expect(query).not.toMatch(/CREATE\s*\(newE\)-\[/);
      }
    });

    it('carries relationships through deleteObservations (previously stranded on the stale version)', async () => {
      graph.addNode({ name: 'Alpha', observations: JSON.stringify(['keep', 'drop']) });
      graph.addNode({ name: 'Beta' });
      graph.addRel('Alpha', 'Beta', 'relates-to', 'rel-1');

      await provider.deleteObservations([{ entityName: 'Alpha', observations: ['drop'] }]);

      const live = graph.liveNode('Alpha');
      expect(live).toBeDefined();
      expect(JSON.parse(live?.observations as string)).toEqual(['keep']);
      // The surviving edge must hang off the NEW version, not the closed one.
      expect(graph.liveRelsFor('Alpha')).toHaveLength(1);
      expect(graph.allLiveRels()[0].fromNodeId).toBe(live?.id);
    });

    it('carries relationships through updateEntitiesBatch', async () => {
      graph.addNode({ name: 'Alpha', entityType: 'old-type' });
      graph.addNode({ name: 'Beta' });
      graph.addRel('Alpha', 'Beta', 'relates-to', 'rel-1');

      await provider.updateEntitiesBatch([{ name: 'Alpha', entityType: 'new-type' }]);

      const live = graph.liveNode('Alpha');
      expect(live?.entityType).toBe('new-type');
      expect(graph.liveNodes('Alpha')).toHaveLength(1);
      expect(graph.allLiveRels()).toHaveLength(1);
      expect(graph.allLiveRels()[0].fromNodeId).toBe(live?.id);
    });
  });

  describe('single live version per name', () => {
    it('closes the prior live version when createEntities upserts an existing name', async () => {
      graph.addNode({ name: 'Alpha', observations: JSON.stringify(['old']) });
      graph.addNode({ name: 'Beta' });
      graph.addRel('Alpha', 'Beta', 'relates-to', 'rel-1');

      const created = await provider.createEntities([
        { name: 'Alpha', entityType: 'person', observations: ['new'] },
      ]);

      expect(graph.liveNodes('Alpha')).toHaveLength(1);
      expect(graph.nodes.filter(node => node.name === 'Alpha')).toHaveLength(2);
      expect(created).toHaveLength(1);
      expect(created[0].name).toBe('Alpha');
      expect(created[0].observations).toEqual(['new']);
      // The upsert must not orphan the relationship.
      expect(graph.allLiveRels()).toHaveLength(1);
    });

    it('creates rather than versions a name with no live version', async () => {
      const created = await provider.createEntities([
        { name: 'Fresh', entityType: 'person', observations: ['hello'] },
      ]);

      expect(created).toHaveLength(1);
      expect(graph.liveNodes('Fresh')).toHaveLength(1);
      expect(graph.liveNodes('Fresh')[0].version).toBe(1);
    });

    it('closes ALL pre-existing live versions of a name, not just the newest', async () => {
      // The corrupt production state: two rows with validTo IS NULL, which the
      // composite (name, validTo) constraint does not reject.
      graph.addNode({ name: 'Alpha', id: 'alpha-a', version: 1, validFrom: 1000 });
      graph.addNode({ name: 'Alpha', id: 'alpha-b', version: 2, validFrom: 2000 });
      expect(graph.liveNodes('Alpha')).toHaveLength(2);

      await provider.addObservations([{ entityName: 'Alpha', contents: ['repair me'] }]);

      expect(graph.liveNodes('Alpha')).toHaveLength(1);
      expect(graph.nodeById('alpha-a')?.validTo).not.toBeNull();
      expect(graph.nodeById('alpha-b')?.validTo).not.toBeNull();
      // Version number continues past the highest live version, not the newest.
      expect(graph.liveNodes('Alpha')[0].version).toBe(3);
    });

    it('folds duplicate inputs for one name into a single new version', async () => {
      graph.addNode({ name: 'Alpha', observations: JSON.stringify([]) });

      const results = await provider.addObservations([
        { entityName: 'Alpha', contents: ['one'] },
        { entityName: 'Alpha', contents: ['two'] },
      ]);

      expect(graph.liveNodes('Alpha')).toHaveLength(1);
      expect(JSON.parse(graph.liveNode('Alpha')?.observations as string)).toEqual(['one', 'two']);
      expect(results).toHaveLength(1);
      expect(results[0].addedObservations).toEqual(['one', 'two']);
    });

    it('reports names with no live version as not found without writing anything', async () => {
      const results = await provider.addObservations([{ entityName: 'Ghost', contents: ['x'] }]);

      expect(results).toEqual([]);
      expect(graph.nodes).toHaveLength(0);
    });
  });

  describe('live-relationship guard', () => {
    it('throws, naming the entity and the repair command, above the configured limit', async () => {
      process.env.NEO4J_MAX_LIVE_RELATIONSHIPS = '3';
      const guarded = makeProvider(graph);

      graph.addNode({ name: 'Hub' });
      for (let i = 0; i < 5; i++) {
        graph.addNode({ name: `Spoke${i}` });
        graph.addRel('Hub', `Spoke${i}`, 'relates-to', `rel-${i}`);
      }

      await expect(
        guarded.addObservations([{ entityName: 'Hub', contents: ['boom'] }])
      ).rejects.toThrow(/Hub/);
      await expect(
        guarded.addObservations([{ entityName: 'Hub', contents: ['boom'] }])
      ).rejects.toThrow(/5 live relationships/);
      await expect(
        guarded.addObservations([{ entityName: 'Hub', contents: ['boom'] }])
      ).rejects.toThrow(/kg:repair/);
    });

    it('allows a count at exactly the limit', async () => {
      process.env.NEO4J_MAX_LIVE_RELATIONSHIPS = '2';
      const guarded = makeProvider(graph);

      graph.addNode({ name: 'Hub' });
      graph.addNode({ name: 'A' });
      graph.addNode({ name: 'B' });
      graph.addRel('Hub', 'A', 'relates-to', 'rel-a');
      graph.addRel('Hub', 'B', 'relates-to', 'rel-b');

      await expect(
        guarded.addObservations([{ entityName: 'Hub', contents: ['ok'] }])
      ).resolves.toBeDefined();
      expect(graph.allLiveRels()).toHaveLength(2);
    });

    it('runs before any relationship is loaded into transaction memory', async () => {
      process.env.NEO4J_MAX_LIVE_RELATIONSHIPS = '1';
      const guarded = makeProvider(graph);

      graph.addNode({ name: 'Hub' });
      graph.addNode({ name: 'A' });
      graph.addNode({ name: 'B' });
      graph.addRel('Hub', 'A', 'relates-to', 'rel-a');
      graph.addRel('Hub', 'B', 'relates-to', 'rel-b');
      graph.queries.length = 0;

      await expect(
        guarded.addObservations([{ entityName: 'Hub', contents: ['boom'] }])
      ).rejects.toThrow();

      expect(graph.queries.some(query => query.includes('AS relCount'))).toBe(true);
      expect(graph.queries.some(query => query.includes('RETURN row.newId AS newId'))).toBe(false);
    });
  });

  describe('transaction timeout', () => {
    it('passes the timeout config to every beginTransaction call', async () => {
      graph.addNode({ name: 'Alpha' });
      graph.addNode({ name: 'Beta' });

      await provider.createEntities([{ name: 'Gamma', entityType: 'test', observations: [] }]);
      await provider.addObservations([{ entityName: 'Alpha', contents: ['x'] }]);
      await provider.deleteObservations([{ entityName: 'Alpha', observations: ['x'] }]);
      await provider.addObservationsBatch([{ entityName: 'Beta', observations: ['y'] }]);
      await provider.updateEntitiesBatch([{ name: 'Beta', entityType: 'changed' }]);

      expect(graph.beginTransactionArgs.length).toBeGreaterThan(0);
      for (const config of graph.beginTransactionArgs) {
        expect(config).toEqual({ timeout: 60_000 });
      }
    });

    it('honours NEO4J_TX_TIMEOUT_MS', async () => {
      process.env.NEO4J_TX_TIMEOUT_MS = '12345';
      const custom = makeProvider(graph);
      graph.addNode({ name: 'Alpha' });

      await custom.addObservations([{ entityName: 'Alpha', contents: ['x'] }]);

      expect(graph.beginTransactionArgs).toContainEqual({ timeout: 12_345 });
    });
  });
});
