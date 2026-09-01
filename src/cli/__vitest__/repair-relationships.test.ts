/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest';

import {
  buildRepairSteps,
  parseArgs,
  runRepair,
  type RepairSession,
} from '../repair-relationships';

/** Cypher clauses that mutate the graph. A dry run must emit none of them. */
const WRITE_CLAUSE = /\b(CREATE|MERGE|DELETE|DETACH|SET|REMOVE)\b/;

function makeSession(affectedPerStep = 0) {
  const queries: string[] = [];
  const session: RepairSession = {
    run: vi.fn().mockImplementation((query: string) => {
      queries.push(query);
      return Promise.resolve({
        records: [{ get: () => affectedPerStep }],
        summary: {
          counters: {
            updates: () => ({
              relationshipsDeleted: 3,
              relationshipsCreated: 2,
              propertiesSet: 4,
              nodesCreated: 0,
            }),
          },
        },
      });
    }),
  };
  return { session, queries };
}

describe('repair-relationships CLI', () => {
  describe('parseArgs', () => {
    it('defaults to a dry run', () => {
      expect(parseArgs([])).toEqual({ apply: false, batchSize: 5000, json: false });
    });

    it('enables writes only with --apply', () => {
      expect(parseArgs(['--apply']).apply).toBe(true);
      expect(parseArgs(['--json']).apply).toBe(false);
    });

    it('accepts a custom batch size and ignores a nonsensical one', () => {
      expect(parseArgs(['--batch-size', '250']).batchSize).toBe(250);
      expect(parseArgs(['--batch-size', '0']).batchSize).toBe(5000);
      expect(parseArgs(['--batch-size', 'nope']).batchSize).toBe(5000);
    });
  });

  describe('buildRepairSteps', () => {
    it('produces the five steps in repair order', () => {
      const steps = buildRepairSteps(5000);
      expect(steps.map(step => step.id)).toEqual([1, 2, 3, 4, 5]);
    });

    it('never collects a relationship group — the pattern that blew the 512 MiB cap', () => {
      for (const step of buildRepairSteps(5000)) {
        for (const query of [step.countQuery, ...step.applyQueries]) {
          expect(query).not.toMatch(/collect\(\s*r\s*\)/);
          expect(query).not.toMatch(/collect\(\s*d\s*\)/);
        }
      }
    });

    it('aggregates duplicate groups by elementId only', () => {
      const dedupeSteps = buildRepairSteps(5000).filter(step => step.id === 1 || step.id === 3);
      expect(dedupeSteps).toHaveLength(2);
      for (const step of dedupeSteps) {
        expect(step.applyQueries[0]).toContain('min(elementId(r)) AS keepId');
        expect(step.applyQueries[0]).toContain('count(r) AS n');
        expect(step.applyQueries[0]).toContain('elementId(d) <> keepId');
      }
    });

    it('batches every write with CALL … IN TRANSACTIONS at the requested size', () => {
      for (const step of buildRepairSteps(1234)) {
        for (const query of step.applyQueries) {
          expect(query).toContain('IN TRANSACTIONS OF 1234 ROWS');
        }
      }
    });

    it('copies relationships with MERGE on the relation id so a re-run is a no-op', () => {
      const steps = buildRepairSteps(5000).filter(step => step.id === 4 || step.id === 5);
      for (const step of steps) {
        const merging = step.applyQueries.filter(query => query.includes('MERGE'));
        expect(merging.length).toBeGreaterThan(0);
        for (const query of merging) {
          expect(query).toContain('RELATES_TO {id: r.id}');
          expect(query).toContain('ON CREATE SET nr += properties(r)');
        }
      }
    });
  });

  describe('runRepair', () => {
    it('issues no write query at all in dry-run mode', async () => {
      const { session, queries } = makeSession(7);

      const report = await runRepair(session, { apply: false, batchSize: 5000, json: false });

      expect(queries).toHaveLength(5);
      for (const query of queries) {
        expect(query).not.toMatch(WRITE_CLAUSE);
      }
      expect(report.apply).toBe(false);
      expect(report.steps).toHaveLength(5);
    });

    it('reports pending work per step in dry-run mode', async () => {
      const { session } = makeSession(7);

      const report = await runRepair(session, { apply: false, batchSize: 5000, json: false });

      // Step 5's count query is a UNION ALL of two rows; the mock returns one
      // record per query, so every step reports the single mocked value.
      expect(report.steps.every(step => step.affected === 7)).toBe(true);
      expect(report.totalAffected).toBe(35);
    });

    it('reports a clean graph as zero pending work', async () => {
      const { session } = makeSession(0);

      const report = await runRepair(session, { apply: false, batchSize: 5000, json: false });

      expect(report.totalAffected).toBe(0);
    });

    it('runs every write query and reports Neo4j counters in apply mode', async () => {
      const { session, queries } = makeSession();

      const report = await runRepair(session, { apply: true, batchSize: 5000, json: false });

      // 1 + 1 + 1 + 3 + 2 write queries.
      expect(queries).toHaveLength(8);
      expect(queries.some(query => query.includes('IN TRANSACTIONS OF 5000 ROWS'))).toBe(true);
      expect(report.apply).toBe(true);
      expect(report.steps[0].counters?.relationshipsDeleted).toBe(3);
      expect(report.steps[0].affected).toBe(3);
    });

    it('passes a boundary timestamp to the write queries', async () => {
      const { session } = makeSession();

      await runRepair(session, { apply: true, batchSize: 5000, json: false });

      const calls = (session.run as ReturnType<typeof vi.fn>).mock.calls;
      for (const [, params] of calls) {
        expect(typeof params.now).toBe('number');
      }
    });
  });
});
