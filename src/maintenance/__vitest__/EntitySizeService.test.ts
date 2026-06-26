/**
 * Tests for EntitySizeService: char→token estimate, indentation accounting,
 * state thresholds, largest-observation tracking, and the approximate path.
 */
import { describe, expect, it } from 'vitest';
import type { EntitySizeConfig } from '../../config/entitySize.js';
import {
  CHARS_PER_TOKEN,
  classifySize,
  estimateEntitySize,
  estimateFromCharCount,
  estimateTokensFromChars,
  serializedEntityChars,
} from '../EntitySizeService.js';

function cfg(overrides: Partial<EntitySizeConfig> = {}): EntitySizeConfig {
  return {
    maxTokens: 25_000,
    warnRatio: 0.8,
    criticalRatio: 1.0,
    warnOnWrite: true,
    scanLimit: 50,
    ...overrides,
  };
}

describe('estimateTokensFromChars', () => {
  it('rounds up chars / CHARS_PER_TOKEN (value-agnostic)', () => {
    expect(estimateTokensFromChars(0)).toBe(0);
    expect(estimateTokensFromChars(1)).toBe(1);
    expect(estimateTokensFromChars(CHARS_PER_TOKEN * 100)).toBe(100);
    expect(estimateTokensFromChars(CHARS_PER_TOKEN * 100 + 1)).toBe(101);
    // any positive sub-token char count rounds up to 1
    expect(estimateTokensFromChars(CHARS_PER_TOKEN - 0.5)).toBe(1);
  });

  it('errs toward over-estimating tokens (divisor below the ~4 chars/token prose rule)', () => {
    expect(CHARS_PER_TOKEN).toBeLessThan(4);
  });

  it('treats negative input as zero', () => {
    expect(estimateTokensFromChars(-100)).toBe(0);
  });
});

describe('calibration regression guard (sgo-mac-studio incident)', () => {
  it('flags an ~73k-char entity CRITICAL at the default 25k-token cap', () => {
    // The motivating failure: ~73k serialized chars EXCEEDED the 25k-token cap
    // (open_nodes failed closed). The estimate must classify that as CRITICAL,
    // not OK — the defect that the chars/4 divisor originally produced.
    const observations = Array.from({ length: 47 }, () => 'x'.repeat(1500));
    const report = estimateEntitySize(
      { name: 'sgo-like', entityType: 'host', observations },
      cfg()
    );
    expect(report.charCount).toBeGreaterThan(70_000);
    expect(report.state).toBe('CRITICAL');
  });
});

describe('classifySize', () => {
  const c = cfg({ maxTokens: 100, warnRatio: 0.8, criticalRatio: 1.0 });
  it('classifies OK below warn ratio', () => {
    expect(classifySize(79, c)).toBe('OK');
  });
  it('classifies WARN at/above warn ratio and below critical', () => {
    expect(classifySize(80, c)).toBe('WARN');
    expect(classifySize(99, c)).toBe('WARN');
  });
  it('classifies CRITICAL at/above critical ratio', () => {
    expect(classifySize(100, c)).toBe('CRITICAL');
    expect(classifySize(150, c)).toBe('CRITICAL');
  });
});

describe('serializedEntityChars', () => {
  it('grows with observation content', () => {
    const small = serializedEntityChars({ name: 'A', entityType: 't', observations: ['x'] });
    const large = serializedEntityChars({
      name: 'A',
      entityType: 't',
      observations: ['x'.repeat(1000)],
    });
    expect(large).toBeGreaterThan(small + 900);
  });

  it('accounts for 2-space indentation overhead per observation', () => {
    // Two observations should cost more than one of the same total content,
    // because each array element gets its own indented line + quotes + comma.
    const one = serializedEntityChars({ name: 'A', observations: ['aaaa'] });
    const two = serializedEntityChars({ name: 'A', observations: ['aa', 'aa'] });
    expect(two).toBeGreaterThan(one);
  });
});

describe('estimateEntitySize', () => {
  it('scales tokens with observation size and flags CRITICAL when over cap', () => {
    // ~120k chars of observations ≈ 30k tokens > 25k cap.
    const report = estimateEntitySize(
      { name: 'Big', entityType: 'server', observations: ['z'.repeat(120_000)] },
      cfg()
    );
    expect(report.estTokens).toBeGreaterThan(25_000);
    expect(report.state).toBe('CRITICAL');
    expect(report.ratio).toBeGreaterThan(1);
    expect(report.obsCount).toBe(1);
    expect(report.largestObservationChars).toBe(120_000);
  });

  it('flags a small entity OK', () => {
    const report = estimateEntitySize(
      { name: 'Tiny', entityType: 'note', observations: ['hello world'] },
      cfg()
    );
    expect(report.state).toBe('OK');
    // A tiny entity sits far below the cap (the floor is just the per-entity
    // envelope + temporal-field overhead open_nodes returns).
    expect(report.ratio).toBeLessThan(0.05);
  });

  it('hits WARN in the 80-100% band', () => {
    // estTokens is cap-independent; probe it, then pick a cap that lands the
    // entity at ~90% — robust against the exact serialization overhead.
    const entity = { name: 'Mid', observations: ['y'.repeat(300)] };
    const tokens = estimateEntitySize(entity, cfg({ maxTokens: 1 })).estTokens;
    const report = estimateEntitySize(
      entity,
      cfg({ maxTokens: Math.ceil(tokens / 0.9), warnRatio: 0.8, criticalRatio: 1.0 })
    );
    expect(report.state).toBe('WARN');
  });

  it('reports the single largest observation', () => {
    const report = estimateEntitySize(
      { name: 'M', observations: ['short', 'a'.repeat(500), 'mid-length'] },
      cfg()
    );
    expect(report.largestObservationChars).toBe(500);
    expect(report.obsCount).toBe(3);
  });

  it('handles an entity with no observations', () => {
    const report = estimateEntitySize({ name: 'Empty' }, cfg());
    expect(report.obsCount).toBe(0);
    expect(report.largestObservationChars).toBe(0);
    expect(report.state).toBe('OK');
  });
});

describe('estimateFromCharCount', () => {
  it('classifies from an approximate char count', () => {
    const report = estimateFromCharCount(
      { name: 'Approx', entityType: 'x', approxChars: 120_000, obsCount: 40 },
      cfg()
    );
    expect(report.state).toBe('CRITICAL');
    expect(report.obsCount).toBe(40);
    expect(report.largestObservationChars).toBe(0);
  });
});
