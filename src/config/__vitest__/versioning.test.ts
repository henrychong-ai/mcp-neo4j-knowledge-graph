/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  DEFAULT_MAX_LIVE_RELATIONSHIPS,
  DEFAULT_TX_TIMEOUT_MS,
  REPAIR_COMMAND_HINT,
  getVersioningConfig,
} from '../versioning';

describe('getVersioningConfig', () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.NEO4J_TX_TIMEOUT_MS;
    delete process.env.NEO4J_MAX_LIVE_RELATIONSHIPS;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it('falls back to the documented defaults', () => {
    const config = getVersioningConfig();
    expect(config.txTimeoutMs).toBe(DEFAULT_TX_TIMEOUT_MS);
    expect(config.txTimeoutMs).toBe(60_000);
    expect(config.maxLiveRelationships).toBe(DEFAULT_MAX_LIVE_RELATIONSHIPS);
    expect(config.maxLiveRelationships).toBe(5000);
  });

  it('reads both environment variables', () => {
    process.env.NEO4J_TX_TIMEOUT_MS = '30000';
    process.env.NEO4J_MAX_LIVE_RELATIONSHIPS = '250';
    const config = getVersioningConfig();
    expect(config.txTimeoutMs).toBe(30_000);
    expect(config.maxLiveRelationships).toBe(250);
  });

  it.each(['', 'not-a-number', '0', '-1'])(
    'ignores the invalid value %j rather than disabling the protection',
    value => {
      process.env.NEO4J_TX_TIMEOUT_MS = value;
      process.env.NEO4J_MAX_LIVE_RELATIONSHIPS = value;
      const config = getVersioningConfig();
      expect(config.txTimeoutMs).toBe(DEFAULT_TX_TIMEOUT_MS);
      expect(config.maxLiveRelationships).toBe(DEFAULT_MAX_LIVE_RELATIONSHIPS);
    }
  );

  it('returns a frozen object', () => {
    expect(Object.isFrozen(getVersioningConfig())).toBe(true);
  });

  it('names the repair command in the hint used by the guard error', () => {
    expect(REPAIR_COMMAND_HINT).toContain('kg:repair');
    expect(REPAIR_COMMAND_HINT).toContain('--apply');
  });
});
