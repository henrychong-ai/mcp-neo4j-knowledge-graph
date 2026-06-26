/**
 * Tests for the on-write size-warning helpers:
 * - extractWrittenNames handles the three write arg shapes
 * - collectWriteSizeWarnings flags WARN/CRITICAL and is strictly fail-open
 * - warnOnWrite=false suppresses; openNodes errors never propagate
 * - attachWriteWarnings is additive and non-mutating
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachWriteWarnings,
  collectWriteSizeWarnings,
  extractWrittenNames,
} from '../writeSizeWarnings.js';

const ENV_KEYS = ['MAX_MCP_OUTPUT_TOKENS', 'ENTITY_SIZE_WARN_ON_WRITE'];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
});

describe('extractWrittenNames', () => {
  it('extracts entityName from add_observations_batch args', () => {
    const names = extractWrittenNames({
      observations: [
        { entityName: 'A', contents: ['x'] },
        { entityName: 'B', contents: ['y'] },
      ],
    });
    expect(names).toEqual(['A', 'B']);
  });

  it('extracts name from update_entities_batch and create_entities_batch args', () => {
    expect(extractWrittenNames({ updates: [{ name: 'U' }] })).toEqual(['U']);
    expect(extractWrittenNames({ entities: [{ name: 'C', observations: [] }] })).toEqual(['C']);
  });

  it('returns empty for unrelated args', () => {
    expect(extractWrittenNames({ foo: 'bar' })).toEqual([]);
  });
});

describe('collectWriteSizeWarnings', () => {
  it('flags a CRITICAL entity the write just grew', async () => {
    process.env.MAX_MCP_OUTPUT_TOKENS = '100';
    const kgm = {
      openNodes: vi.fn().mockResolvedValue({
        entities: [{ name: 'Big', entityType: 'server', observations: ['z'.repeat(800)] }],
        relations: [],
      }),
    };

    const warnings = await collectWriteSizeWarnings(kgm, ['Big']);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].name).toBe('Big');
    expect(warnings[0].state).toBe('CRITICAL');
    expect(warnings[0].message).toContain('split');
  });

  it('returns no warnings for a small entity', async () => {
    const kgm = {
      openNodes: vi.fn().mockResolvedValue({
        entities: [{ name: 'Tiny', entityType: 'note', observations: ['hi'] }],
        relations: [],
      }),
    };
    expect(await collectWriteSizeWarnings(kgm, ['Tiny'])).toEqual([]);
  });

  it('is suppressed when ENTITY_SIZE_WARN_ON_WRITE=false (never calls openNodes)', async () => {
    process.env.ENTITY_SIZE_WARN_ON_WRITE = 'false';
    process.env.MAX_MCP_OUTPUT_TOKENS = '100';
    const kgm = { openNodes: vi.fn() };

    const warnings = await collectWriteSizeWarnings(kgm, ['Big']);

    expect(warnings).toEqual([]);
    expect(kgm.openNodes).not.toHaveBeenCalled();
  });

  it('fails open when openNodes throws (no warnings, no throw)', async () => {
    const kgm = { openNodes: vi.fn().mockRejectedValue(new Error('boom')) };
    await expect(collectWriteSizeWarnings(kgm, ['X'])).resolves.toEqual([]);
  });

  it('returns empty when no names are written', async () => {
    const kgm = { openNodes: vi.fn() };
    expect(await collectWriteSizeWarnings(kgm, [])).toEqual([]);
    expect(kgm.openNodes).not.toHaveBeenCalled();
  });
});

describe('attachWriteWarnings', () => {
  it('attaches warnings additively without mutating the original', () => {
    const result = { successful: [], failed: [] };
    const warnings = [
      { name: 'Big', estTokens: 30000, ratio: 1.2, state: 'CRITICAL' as const, message: 'split' },
    ];
    const out = attachWriteWarnings(result, warnings) as Record<string, unknown>;
    expect(out.warnings).toEqual(warnings);
    expect(out.successful).toEqual([]);
    expect(result).not.toHaveProperty('warnings');
  });

  it('returns the original result unchanged when there are no warnings', () => {
    const result = { successful: [] };
    expect(attachWriteWarnings(result, [])).toBe(result);
  });
});
