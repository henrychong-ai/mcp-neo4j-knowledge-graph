/**
 * Tests for getEntitySizeConfig: env parsing, defaults, clamping, overrides.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getEntitySizeConfig } from '../entitySize.js';

const ENV_KEYS = [
  'MAX_MCP_OUTPUT_TOKENS',
  'ENTITY_SIZE_WARN_RATIO',
  'ENTITY_SIZE_CRITICAL_RATIO',
  'ENTITY_SIZE_WARN_ON_WRITE',
  'ENTITY_SIZE_SCAN_LIMIT',
];

describe('getEntitySizeConfig', () => {
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

  it('returns the documented defaults when no env is set', () => {
    const cfg = getEntitySizeConfig();
    expect(cfg.maxTokens).toBe(25_000);
    expect(cfg.warnRatio).toBeCloseTo(0.8);
    expect(cfg.criticalRatio).toBeCloseTo(1.0);
    expect(cfg.warnOnWrite).toBe(true);
    expect(cfg.scanLimit).toBe(50);
  });

  it('reads values from environment variables', () => {
    process.env.MAX_MCP_OUTPUT_TOKENS = '40000';
    process.env.ENTITY_SIZE_WARN_RATIO = '0.7';
    process.env.ENTITY_SIZE_CRITICAL_RATIO = '0.95';
    process.env.ENTITY_SIZE_WARN_ON_WRITE = 'false';
    process.env.ENTITY_SIZE_SCAN_LIMIT = '100';

    const cfg = getEntitySizeConfig();
    expect(cfg.maxTokens).toBe(40_000);
    expect(cfg.warnRatio).toBeCloseTo(0.7);
    expect(cfg.criticalRatio).toBeCloseTo(0.95);
    expect(cfg.warnOnWrite).toBe(false);
    expect(cfg.scanLimit).toBe(100);
  });

  it('falls back to defaults for invalid numeric env', () => {
    process.env.MAX_MCP_OUTPUT_TOKENS = 'not-a-number';
    process.env.ENTITY_SIZE_SCAN_LIMIT = '-5';
    const cfg = getEntitySizeConfig();
    expect(cfg.maxTokens).toBe(25_000);
    expect(cfg.scanLimit).toBe(50);
  });

  it('keeps criticalRatio >= warnRatio even when env inverts them', () => {
    process.env.ENTITY_SIZE_WARN_RATIO = '0.9';
    process.env.ENTITY_SIZE_CRITICAL_RATIO = '0.5';
    const cfg = getEntitySizeConfig();
    expect(cfg.criticalRatio).toBeGreaterThanOrEqual(cfg.warnRatio);
  });

  it('applies per-call overrides on top of env', () => {
    process.env.ENTITY_SIZE_SCAN_LIMIT = '20';
    const cfg = getEntitySizeConfig({ scanLimit: 5, warnRatio: 0.6 });
    expect(cfg.scanLimit).toBe(5);
    expect(cfg.warnRatio).toBeCloseTo(0.6);
  });

  it('treats ENTITY_SIZE_WARN_ON_WRITE=1 as true', () => {
    process.env.ENTITY_SIZE_WARN_ON_WRITE = '1';
    expect(getEntitySizeConfig().warnOnWrite).toBe(true);
  });
});
