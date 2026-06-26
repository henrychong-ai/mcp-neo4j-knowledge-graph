/**
 * CLI tool: report knowledge-graph entities that are at risk of exceeding the
 * MCP `open_nodes` output cap, so they can be restructured before they become
 * unretrievable.
 *
 * Usage:
 *   npm run kg:oversized                 # table of WARN/CRITICAL entities
 *   npm run kg:oversized -- --include-ok # include OK entities too
 *   npm run kg:oversized -- --json       # machine-readable JSON
 *   npm run kg:oversized -- --limit 100  # scan the 100 largest
 *
 * Exit code is 1 when any CRITICAL entity exists (so a cron/CI job can alert),
 * 0 otherwise. This is the "ongoing basis" mechanism: schedule it on a recurring
 * cron alongside the embedding backfill.
 *
 * Requirements:
 *   - Neo4j connection configured (NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD)
 *   - No embedding provider needed — sizing is pure Cypher.
 */

import dotenv from 'dotenv';

import { getEntitySizeConfig } from '../config/entitySize.js';
import {
  type EntitySizeReport,
  estimateEntitySize,
  estimateFromCharCount,
  RESTRUCTURE_HINT,
} from '../maintenance/EntitySizeService.js';
import { Neo4jStorageProvider } from '../storage/neo4j/Neo4jStorageProvider.js';

dotenv.config();

interface ReportOptions {
  limit?: number;
  warnRatio?: number;
  includeOk: boolean;
  json: boolean;
}

function parseArgs(): ReportOptions {
  const args = process.argv.slice(2);
  const options: ReportOptions = { includeOk: false, json: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--limit': {
        options.limit = Number.parseInt(args[++i], 10);
        break;
      }
      case '--warn-ratio': {
        options.warnRatio = Number.parseFloat(args[++i]);
        break;
      }
      case '--include-ok': {
        options.includeOk = true;
        break;
      }
      case '--json': {
        options.json = true;
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
Report Oversized Entities CLI

Usage:
  npm run kg:oversized [options]

Options:
  --limit <n>        Scan and rank the N largest entities (default: 50)
  --warn-ratio <r>   Fraction of the cap (0.0-1.0) for the WARN threshold (default: 0.8)
  --include-ok       Include entities below the warn threshold
  --json             Output machine-readable JSON instead of a table
  --help             Show this help message

Environment Variables:
  MAX_MCP_OUTPUT_TOKENS     Assumed open_nodes cap in tokens (default: 25000)
  ENTITY_SIZE_WARN_RATIO    WARN threshold ratio (default: 0.8)
  ENTITY_SIZE_CRITICAL_RATIO CRITICAL threshold ratio (default: 1.0)
  ENTITY_SIZE_SCAN_LIMIT    Default scan size (default: 50)
  NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD / NEO4J_DATABASE

Exit code: 1 if any CRITICAL entity exists, else 0.
  `);
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

function printTable(reports: EntitySizeReport[], cap: number): void {
  if (reports.length === 0) {
    console.log('✅ No entities at or near the open_nodes cap.\n');
    return;
  }
  console.log(`\nAssumed open_nodes cap: ~${cap} tokens\n`);
  console.log(
    `${pad('STATE', 9)}${pad('~TOKENS', 10)}${pad('%CAP', 7)}${pad('OBS', 6)}${pad('TYPE', 18)}NAME`
  );
  console.log('-'.repeat(90));
  for (const r of reports) {
    const icon = r.state === 'CRITICAL' ? '🔴' : r.state === 'WARN' ? '🟡' : '🟢';
    console.log(
      `${pad(`${icon} ${r.state}`, 9)}${pad(String(r.estTokens), 10)}${pad(
        `${Math.round(r.ratio * 100)}%`,
        7
      )}${pad(String(r.obsCount), 6)}${pad((r.entityType || '-').slice(0, 16), 18)}${r.name}`
    );
  }
  console.log('');
}

async function run(): Promise<number> {
  const options = parseArgs();
  const cfg = getEntitySizeConfig({
    scanLimit: options.limit,
    warnRatio: options.warnRatio,
  });

  const storageProvider = new Neo4jStorageProvider({
    config: {
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD || '',
      database: process.env.NEO4J_DATABASE || 'neo4j',
    },
  });

  try {
    const rows = await storageProvider.scanEntitySizes(cfg.scanLimit);
    const names = rows.map(r => r.name);

    const entityByName = new Map<
      string,
      { name: string; entityType?: string; observations?: string[] }
    >();
    if (names.length > 0) {
      const graph = await storageProvider.openNodes(names);
      for (const e of graph.entities) {
        entityByName.set(e.name, e);
      }
    }

    let reports = rows.map(row => {
      const entity = entityByName.get(row.name);
      return entity ? estimateEntitySize(entity, cfg) : estimateFromCharCount(row, cfg);
    });
    reports.sort((a, b) => b.estTokens - a.estTokens);
    if (!options.includeOk) {
      reports = reports.filter(r => r.state !== 'OK');
    }

    const criticalCount = reports.filter(r => r.state === 'CRITICAL').length;

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            assumedCap: cfg.maxTokens,
            warnRatio: cfg.warnRatio,
            criticalRatio: cfg.criticalRatio,
            scanned: rows.length,
            flaggedCount: reports.filter(r => r.state !== 'OK').length,
            criticalCount,
            entities: reports,
            restructureHint: RESTRUCTURE_HINT,
          },
          null,
          2
        )
      );
    } else {
      printTable(reports, cfg.maxTokens);
      if (criticalCount > 0) {
        console.log(`⚠️  ${criticalCount} CRITICAL entity(ies) — ${RESTRUCTURE_HINT}\n`);
      }
    }

    return criticalCount > 0 ? 1 : 0;
  } finally {
    await storageProvider.close();
  }
}

run()
  .then(code => process.exit(code))
  .catch(error => {
    console.error('❌ report-oversized failed:', error instanceof Error ? error.message : error);
    process.exit(2);
  });
