/**
 * Tests for KnowledgeGraphManager.flagOversizedEntities:
 * - ranks and filters to WARN/CRITICAL (includeOk toggles)
 * - refines via openNodes; counts criticals/warns
 * - fail-open: a scan error is captured into `error`, never thrown
 * - in-memory fallback when the provider has no scanEntitySizes()
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeGraphManager } from '../KnowledgeGraphManager.js';
import { estimateEntitySize } from '../maintenance/EntitySizeService.js';
import type { EntitySizeScanRow, StorageProvider } from '../storage/StorageProvider.js';

interface MockEntity {
  name: string;
  entityType: string;
  observations: string[];
}

function rowFor(entity: MockEntity): EntitySizeScanRow {
  const obsChars = entity.observations.reduce((s, o) => s + o.length + 6, 0);
  return {
    name: entity.name,
    entityType: entity.entityType,
    obsChars,
    obsCount: entity.observations.length,
    relCount: 0,
    approxChars: obsChars + 200,
  };
}

function makeProvider(
  entities: MockEntity[],
  opts: { withScan?: boolean } = { withScan: true }
): StorageProvider {
  const base: Record<string, unknown> = {
    loadGraph: vi.fn().mockResolvedValue({ entities, relations: [] }),
    saveGraph: vi.fn().mockResolvedValue(undefined),
    searchNodes: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
    openNodes: vi.fn().mockResolvedValue({ entities, relations: [] }),
    getEntity: vi.fn().mockResolvedValue(null),
    createEntities: vi.fn(),
    createRelations: vi.fn(),
    addObservations: vi.fn(),
    deleteEntities: vi.fn(),
    deleteObservations: vi.fn(),
    deleteRelations: vi.fn(),
  };
  if (opts.withScan !== false) {
    base.scanEntitySizes = vi.fn().mockResolvedValue(entities.map(rowFor));
  }
  return base as unknown as StorageProvider;
}

const CRIT: MockEntity = { name: 'Crit', entityType: 'server', observations: ['z'.repeat(7000)] };
const WARN: MockEntity = { name: 'Warn', entityType: 'topic', observations: ['y'.repeat(3000)] };
const OK: MockEntity = { name: 'Ok', entityType: 'note', observations: ['hi'] };

// Calibrate the cap to the WARN entity so it lands ~90% (WARN band) regardless
// of the exact CHARS_PER_TOKEN divisor; CRIT is >2× larger so it exceeds the
// cap (CRITICAL) and OK is tiny (OK). estTokens is cap-independent, so probe it.
const PROBE = {
  maxTokens: 1,
  warnRatio: 0.8,
  criticalRatio: 1.0,
  warnOnWrite: true,
  scanLimit: 50,
};
const warnTokens = estimateEntitySize(
  { name: WARN.name, entityType: WARN.entityType, observations: WARN.observations },
  PROBE
).estTokens;
const CAP = Math.round(warnTokens / 0.9);
const SMALL_CAP = { maxTokens: CAP, warnRatio: 0.8, criticalRatio: 1.0 };

describe('KnowledgeGraphManager.flagOversizedEntities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only WARN/CRITICAL by default, ranked largest first', async () => {
    const provider = makeProvider([OK, WARN, CRIT]);
    const kgm = new KnowledgeGraphManager({ storageProvider: provider });

    const result = await kgm.flagOversizedEntities(SMALL_CAP);

    expect(result.error).toBeUndefined();
    expect(result.assumedCap).toBe(CAP);
    expect(result.scanned).toBe(3);
    expect(result.flaggedCount).toBe(2);
    expect(result.criticalCount).toBe(1);
    expect(result.warnCount).toBe(1);
    expect(result.entities.map(e => e.name)).toEqual(['Crit', 'Warn']);
    expect(result.entities[0].state).toBe('CRITICAL');
    expect(result.entities[1].state).toBe('WARN');
    expect(result.restructureHint).toContain('sibling');
  });

  it('includes OK entities when includeOk is true', async () => {
    const provider = makeProvider([OK, WARN, CRIT]);
    const kgm = new KnowledgeGraphManager({ storageProvider: provider });

    const result = await kgm.flagOversizedEntities({ ...SMALL_CAP, includeOk: true });

    expect(result.entities).toHaveLength(3);
    expect(result.entities.map(e => e.name)).toContain('Ok');
  });

  it('fails open: a scan error is captured into error, not thrown', async () => {
    const provider = makeProvider([CRIT]);
    (provider.scanEntitySizes as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('neo4j down')
    );
    const kgm = new KnowledgeGraphManager({ storageProvider: provider });

    const result = await kgm.flagOversizedEntities(SMALL_CAP);

    expect(result.error).toContain('neo4j down');
    expect(result.entities).toEqual([]);
    expect(result.scanned).toBe(0);
  });

  it('uses the in-memory fallback when scanEntitySizes is absent', async () => {
    const provider = makeProvider([OK, CRIT], { withScan: false });
    const kgm = new KnowledgeGraphManager({ storageProvider: provider });

    const result = await kgm.flagOversizedEntities(SMALL_CAP);

    expect(result.note).toContain('fallback');
    expect(result.entities.map(e => e.name)).toEqual(['Crit']);
    expect(provider.loadGraph).toHaveBeenCalled();
  });
});
