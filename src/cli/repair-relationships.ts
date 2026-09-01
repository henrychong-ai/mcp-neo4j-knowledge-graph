/**
 * CLI tool: repair a knowledge graph damaged by the pre-v2.9.0 versioning
 * defects — duplicated relationships and multiple live versions per entity.
 *
 * Usage:
 *   pnpm kg:repair                    # dry run (default) — reports, writes nothing
 *   pnpm kg:repair -- --apply         # execute the repair
 *   pnpm kg:repair -- --json          # machine-readable output
 *   pnpm kg:repair -- --batch-size 2000
 *
 * Exit code is 1 when a DRY RUN finds work to do (so a cron/CI job can alert),
 * 0 when the graph is clean or `--apply` completed, 2 on failure.
 *
 * Design constraints, both learned the hard way on the production graph:
 *
 *   - **ID-only aggregation.** Never `collect(r)` over a relationship group. A
 *     `collect()` across a 39,382-edge group exceeds `db.memory.transaction.max`
 *     (512 MiB) on its own, even when the deletes that follow are batched. The
 *     grouping stage therefore carries `min(elementId(r))` and `count(r)` only,
 *     and the rows to delete are re-matched afterwards.
 *   - **One implicit transaction per step.** `CALL … IN TRANSACTIONS` is only
 *     legal in an auto-commit transaction, so every step runs as its own
 *     `session.run`, never inside an explicit transaction.
 *
 * Every step is idempotent: running the repair twice is a no-op the second time.
 * Steps must run in the listed order — step 5 assumes step 4 has collapsed each
 * name to a single live version.
 *
 * Requirements:
 *   - Neo4j connection configured (NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD)
 *   - No embedding provider needed — the repair is pure Cypher.
 */

import dotenv from 'dotenv';

import { Neo4jConnectionManager } from '../storage/neo4j/Neo4jConnectionManager.js';

dotenv.config();

/** Minimal query result surface the repair needs (mockable in tests). */
export interface RepairQueryResult {
  records: { get(key: string): unknown }[];
  summary?: {
    counters?: {
      updates(): Record<string, number>;
    };
  };
}

/** Minimal session surface the repair needs (mockable in tests). */
export interface RepairSession {
  run(query: string, parameters?: Record<string, unknown>): Promise<RepairQueryResult>;
}

/** Options for one repair run. */
export interface RepairOptions {
  /** Execute the writes. When false (the default) nothing is written. */
  apply: boolean;
  /** Rows per inner transaction for `CALL … IN TRANSACTIONS`. */
  batchSize: number;
  /** Emit JSON instead of a table. */
  json: boolean;
}

/** Outcome of one repair step. */
export interface RepairStepResult {
  id: number;
  name: string;
  /** Dry run: rows that WOULD change. Apply: rows that DID change. */
  affected: number;
  /** Raw Neo4j update counters, apply mode only. */
  counters?: Record<string, number>;
}

/** Outcome of a whole repair run. */
export interface RepairReport {
  apply: boolean;
  batchSize: number;
  steps: RepairStepResult[];
  totalAffected: number;
}

/**
 * A repair step: one counting query for the dry run, one or more write queries
 * for `--apply`, and the update counters that make up its headline number.
 */
interface RepairStep {
  id: number;
  name: string;
  countQuery: string;
  applyQueries: string[];
  /** Counter keys summed into the step's headline `affected` number. */
  metrics: string[];
}

/**
 * Head of every "duplicate live version" query: names with more than one
 * `validTo IS NULL` node, the newest kept and the rest treated as losers.
 *
 * `collect(elementId(v))` is bounded by the number of live versions of ONE name
 * (two or three in practice), never by relationship count.
 */
const DUPLICATE_LIVE_VERSION_HEAD = `
  MATCH (e:Entity)
  WHERE e.validTo IS NULL
  WITH e.name AS name, count(e) AS liveVersions
  WHERE liveVersions > 1
  MATCH (v:Entity {name: name})
  WHERE v.validTo IS NULL
  WITH name, v ORDER BY coalesce(v.validFrom, 0) DESC, elementId(v)
  WITH name, collect(elementId(v)) AS ids
  WITH ids[0] AS keepId, ids[1..] AS loserIds
`;

/**
 * Build the ordered repair steps for a given batch size.
 *
 * @param batchSize Rows per inner transaction
 * @returns The five repair steps, in the order they must run
 */
export function buildRepairSteps(batchSize: number): RepairStep[] {
  const rows = `${batchSize} ROWS`;

  return [
    {
      id: 1,
      name: 'Delete duplicate LIVE relationships between live versions',
      countQuery: `
        MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity)
        WHERE r.validTo IS NULL AND a.validTo IS NULL AND b.validTo IS NULL
        WITH a, b, r.relationType AS t, count(r) AS n
        WHERE n > 1
        RETURN coalesce(sum(n - 1), 0) AS affected
      `,
      applyQueries: [
        `
        MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity)
        WHERE r.validTo IS NULL AND a.validTo IS NULL AND b.validTo IS NULL
        WITH a, b, r.relationType AS t, min(elementId(r)) AS keepId, count(r) AS n
        WHERE n > 1
        MATCH (a)-[d:RELATES_TO {relationType: t}]->(b)
        WHERE d.validTo IS NULL AND elementId(d) <> keepId
        CALL { WITH d DELETE d } IN TRANSACTIONS OF ${rows}
        `,
      ],
      metrics: ['relationshipsDeleted'],
    },
    {
      id: 2,
      name: 'Delete stale-attached LIVE relationships that already have a live-live equivalent',
      countQuery: `
        MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity)
        WHERE r.validTo IS NULL AND (a.validTo IS NOT NULL OR b.validTo IS NOT NULL)
          AND EXISTS {
            MATCH (la:Entity {name: a.name})-[lr:RELATES_TO {relationType: r.relationType}]
                  ->(lb:Entity {name: b.name})
            WHERE lr.validTo IS NULL AND la.validTo IS NULL AND lb.validTo IS NULL
          }
        RETURN count(r) AS affected
      `,
      applyQueries: [
        `
        MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity)
        WHERE r.validTo IS NULL AND (a.validTo IS NOT NULL OR b.validTo IS NOT NULL)
          AND EXISTS {
            MATCH (la:Entity {name: a.name})-[lr:RELATES_TO {relationType: r.relationType}]
                  ->(lb:Entity {name: b.name})
            WHERE lr.validTo IS NULL AND la.validTo IS NULL AND lb.validTo IS NULL
          }
        CALL { WITH r DELETE r } IN TRANSACTIONS OF ${rows}
        `,
      ],
      metrics: ['relationshipsDeleted'],
    },
    {
      id: 3,
      name: 'Delete duplicate HISTORICAL relationships',
      countQuery: `
        MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity)
        WHERE r.validTo IS NOT NULL
        WITH a, b, r.relationType AS t, count(r) AS n
        WHERE n > 1
        RETURN coalesce(sum(n - 1), 0) AS affected
      `,
      applyQueries: [
        `
        MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity)
        WHERE r.validTo IS NOT NULL
        WITH a, b, r.relationType AS t, min(elementId(r)) AS keepId, count(r) AS n
        WHERE n > 1
        MATCH (a)-[d:RELATES_TO {relationType: t}]->(b)
        WHERE d.validTo IS NOT NULL AND elementId(d) <> keepId
        CALL { WITH d DELETE d } IN TRANSACTIONS OF ${rows}
        `,
      ],
      metrics: ['relationshipsDeleted'],
    },
    {
      id: 4,
      name: 'Close duplicate LIVE entity versions, carrying their relationships to the survivor',
      countQuery: `
        MATCH (e:Entity)
        WHERE e.validTo IS NULL
        WITH e.name AS name, count(e) AS liveVersions
        WHERE liveVersions > 1
        RETURN coalesce(sum(liveVersions - 1), 0) AS affected
      `,
      applyQueries: [
        // 4a: carry the losers' outgoing live relationships onto the survivor,
        // then close the originals. MERGE on {id} makes a re-run a no-op.
        `
        ${DUPLICATE_LIVE_VERSION_HEAD}
        UNWIND loserIds AS loserId
        MATCH (keep:Entity) WHERE elementId(keep) = keepId
        MATCH (loser:Entity) WHERE elementId(loser) = loserId
        MATCH (loser)-[r:RELATES_TO]->(other:Entity)
        WHERE r.validTo IS NULL AND r.id IS NOT NULL
        CALL {
          WITH keep, r, other
          MERGE (keep)-[nr:RELATES_TO {id: r.id}]->(other)
          ON CREATE SET nr += properties(r)
          SET r.validTo = $now
        } IN TRANSACTIONS OF ${rows}
        `,
        // 4b: same for incoming.
        `
        ${DUPLICATE_LIVE_VERSION_HEAD}
        UNWIND loserIds AS loserId
        MATCH (keep:Entity) WHERE elementId(keep) = keepId
        MATCH (loser:Entity) WHERE elementId(loser) = loserId
        MATCH (other:Entity)-[r:RELATES_TO]->(loser)
        WHERE r.validTo IS NULL AND r.id IS NOT NULL
        CALL {
          WITH keep, r, other
          MERGE (other)-[nr:RELATES_TO {id: r.id}]->(keep)
          ON CREATE SET nr += properties(r)
          SET r.validTo = $now
        } IN TRANSACTIONS OF ${rows}
        `,
        // 4c: close the loser versions themselves. Must run last — it is what
        // makes the name single-live, which 4a/4b's head depends on.
        //
        // The `entity_name` constraint is UNIQUE on (name, validTo), so two
        // losers of the SAME name cannot both close at `$now`: loser i gets
        // `$now - i` (milliseconds; losers are ordered newest-first, so the
        // older a loser, the earlier its close). Relationships (4a/4b) carry
        // no such constraint and keep the plain boundary.
        `
        ${DUPLICATE_LIVE_VERSION_HEAD}
        UNWIND range(0, size(loserIds) - 1) AS i
        WITH loserIds[i] AS loserId, i
        MATCH (loser:Entity) WHERE elementId(loser) = loserId
        CALL { WITH loser, i SET loser.validTo = $now - i } IN TRANSACTIONS OF ${rows}
        `,
      ],
      metrics: ['relationshipsCreated', 'propertiesSet'],
    },
    {
      id: 5,
      name: 'Re-point remaining stale-attached LIVE relationships onto the live version',
      countQuery: `
        MATCH (stale:Entity)-[r:RELATES_TO]->(other:Entity)
        WHERE r.validTo IS NULL AND stale.validTo IS NOT NULL AND r.id IS NOT NULL
        RETURN count(r) AS affected
        UNION ALL
        MATCH (other:Entity)-[r:RELATES_TO]->(stale:Entity)
        WHERE r.validTo IS NULL AND stale.validTo IS NOT NULL AND r.id IS NOT NULL
          AND other.validTo IS NULL
        RETURN count(r) AS affected
      `,
      applyQueries: [
        // 5a: start node is stale. Grouping by r guarantees one row per
        // relationship, so the DELETE can never fire twice for the same edge.
        `
        MATCH (stale:Entity)-[r:RELATES_TO]->(other:Entity)
        WHERE r.validTo IS NULL AND stale.validTo IS NOT NULL AND r.id IS NOT NULL
        MATCH (live:Entity {name: stale.name}) WHERE live.validTo IS NULL
        MATCH (target:Entity {name: other.name}) WHERE target.validTo IS NULL
        WITH r, live, target
          ORDER BY coalesce(live.validFrom, 0) DESC, coalesce(target.validFrom, 0) DESC
        WITH r, collect(elementId(live))[0] AS liveId, collect(elementId(target))[0] AS targetId
        MATCH (live:Entity) WHERE elementId(live) = liveId
        MATCH (target:Entity) WHERE elementId(target) = targetId
        CALL {
          WITH r, live, target
          MERGE (live)-[nr:RELATES_TO {id: r.id}]->(target)
          ON CREATE SET nr += properties(r)
          DELETE r
        } IN TRANSACTIONS OF ${rows}
        `,
        // 5b: end node is stale (start already live — the both-stale case was
        // handled by 5a, which deleted the original).
        `
        MATCH (other:Entity)-[r:RELATES_TO]->(stale:Entity)
        WHERE r.validTo IS NULL AND stale.validTo IS NOT NULL AND r.id IS NOT NULL
          AND other.validTo IS NULL
        MATCH (live:Entity {name: stale.name}) WHERE live.validTo IS NULL
        WITH r, other, live ORDER BY coalesce(live.validFrom, 0) DESC
        WITH r, other, collect(elementId(live))[0] AS liveId
        MATCH (live:Entity) WHERE elementId(live) = liveId
        CALL {
          WITH r, other, live
          MERGE (other)-[nr:RELATES_TO {id: r.id}]->(live)
          ON CREATE SET nr += properties(r)
          DELETE r
        } IN TRANSACTIONS OF ${rows}
        `,
      ],
      metrics: ['relationshipsCreated', 'relationshipsDeleted'],
    },
  ];
}

/**
 * Coerce a Neo4j numeric (Integer, BigInt, or number) to a JS number.
 */
function toNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value) || 0;
}

/**
 * Run the repair.
 *
 * In dry-run mode (`options.apply === false`) ONLY the counting queries are
 * issued; no write query is ever sent to the server.
 *
 * @param session Session-like runner (auto-commit — required by `CALL … IN TRANSACTIONS`)
 * @param options Run options
 * @returns Per-step report
 */
export async function runRepair(
  session: RepairSession,
  options: RepairOptions
): Promise<RepairReport> {
  const steps = buildRepairSteps(options.batchSize);
  const results: RepairStepResult[] = [];

  for (const step of steps) {
    if (!options.apply) {
      const result = await session.run(step.countQuery);
      const affected = result.records.reduce(
        (total, record) => total + toNumber(record.get('affected')),
        0
      );
      results.push({ id: step.id, name: step.name, affected });
      continue;
    }

    const counters: Record<string, number> = {};
    for (const query of step.applyQueries) {
      const result = await session.run(query, { now: Date.now() });
      const updates = result.summary?.counters?.updates() ?? {};
      for (const [key, value] of Object.entries(updates)) {
        counters[key] = (counters[key] ?? 0) + toNumber(value);
      }
    }
    const affected = step.metrics.reduce((total, key) => total + (counters[key] ?? 0), 0);
    results.push({ id: step.id, name: step.name, affected, counters });
  }

  return {
    apply: options.apply,
    batchSize: options.batchSize,
    steps: results,
    totalAffected: results.reduce((total, step) => total + step.affected, 0),
  };
}

/**
 * Parse CLI arguments.
 *
 * @param argv Arguments after the script name
 * @returns Resolved options
 */
export function parseArgs(argv: string[]): RepairOptions {
  const options: RepairOptions = { apply: false, batchSize: 5000, json: false };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--apply': {
        options.apply = true;
        break;
      }
      case '--json': {
        options.json = true;
        break;
      }
      case '--batch-size': {
        const parsed = Number.parseInt(argv[++i], 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          options.batchSize = parsed;
        }
        break;
      }
      case '--help': {
        printHelp();
        process.exit(0);
      }
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Repair Knowledge-Graph Relationships CLI

Collapses the damage left by the pre-v2.9.0 versioning defects: relationships
duplicated on every batch that versioned both of their endpoints, entity names
left with more than one live version, and live relationships stranded on stale
versions.

Usage:
  pnpm kg:repair [options]

Options:
  --apply             Execute the repair. WITHOUT THIS FLAG NOTHING IS WRITTEN.
  --batch-size <n>    Rows per inner transaction (default: 5000)
  --json              Output machine-readable JSON instead of a table
  --help              Show this help message

Environment Variables:
  NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD / NEO4J_DATABASE

Exit code: 1 if a dry run finds work to do, 0 if clean or applied, 2 on error.
`);
}

function printReport(report: RepairReport): void {
  console.log(
    `\n${report.apply ? '🔧 APPLIED' : '🔍 DRY RUN (nothing written)'} — batch size ${report.batchSize}\n`
  );
  for (const step of report.steps) {
    const label = report.apply ? 'changed' : 'pending';
    console.log(`  ${step.id}. ${step.name}`);
    console.log(`     ${step.affected} ${label}`);
    if (step.counters) {
      const nonZero = Object.entries(step.counters).filter(([, value]) => value > 0);
      if (nonZero.length > 0) {
        console.log(`     counters: ${nonZero.map(([k, v]) => `${k}=${v}`).join(', ')}`);
      }
    }
  }
  console.log(`\n  Total: ${report.totalAffected}\n`);
  if (!report.apply && report.totalAffected > 0) {
    console.log('  Re-run with `--apply` to execute the repair.\n');
  }
  if (!report.apply && report.totalAffected === 0) {
    console.log('  ✅ Nothing to repair.\n');
  }
}

/**
 * CLI entry point.
 *
 * @returns Process exit code
 */
export async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));

  const connectionManager = new Neo4jConnectionManager({
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || '',
    database: process.env.NEO4J_DATABASE || 'neo4j',
  });

  // A raw session, deliberately NOT connectionManager.executeQuery: the repair
  // needs an auto-commit transaction with no client-side timeout, because
  // `CALL … IN TRANSACTIONS` is illegal inside an explicit transaction and a
  // large repair legitimately runs longer than NEO4J_TX_TIMEOUT_MS.
  const session = await connectionManager.getSession();
  try {
    const report = await runRepair(session as unknown as RepairSession, options);

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printReport(report);
    }

    return !report.apply && report.totalAffected > 0 ? 1 : 0;
  } finally {
    await session.close();
    await connectionManager.close();
  }
}

// Check if this file is being run directly (ESM and CommonJS safe).
const isMainModule = (): boolean => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return typeof require !== 'undefined' && require.main === module;
  }
};

if (isMainModule()) {
  main()
    .then(code => process.exit(code))
    .catch(error => {
      console.error(
        '❌ repair-relationships failed:',
        error instanceof Error ? error.message : error
      );
      process.exit(2);
    });
}
