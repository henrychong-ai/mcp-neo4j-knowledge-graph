/**
 * GET /api/stats
 * Get knowledge graph statistics
 */

import { NextResponse } from 'next/server';
import { getNeo4jSession, toNumber } from '@/lib/neo4j';
import type { GraphStats } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = getNeo4jSession();

  try {
    // Count entities and relations
    const countsResult = await session.run(`
      MATCH (e:Entity)
      WHERE e.validTo IS NULL
      WITH count(e) as entityCount
      MATCH ()-[r:RELATES_TO]->()
      WHERE r.validTo IS NULL
      RETURN entityCount, count(r) as relationCount
    `);

    const countsRecord = countsResult.records[0];
    const entityCount = toNumber(countsRecord?.get('entityCount')) || 0;
    const relationCount = toNumber(countsRecord?.get('relationCount')) || 0;

    // Get entity type distribution
    const entityTypesResult = await session.run(`
      MATCH (e:Entity)
      WHERE e.validTo IS NULL
      RETURN e.entityType as type, count(*) as count
      ORDER BY count DESC
      LIMIT 10
    `);

    const entityTypes = entityTypesResult.records.map((record) => ({
      type: record.get('type') || 'unknown',
      count: toNumber(record.get('count')),
    }));

    // Get relation type distribution
    const relationTypesResult = await session.run(`
      MATCH ()-[r:RELATES_TO]->()
      WHERE r.validTo IS NULL
      RETURN type(r) as type, count(*) as count
      ORDER BY count DESC
      LIMIT 10
    `);

    const relationTypes = relationTypesResult.records.map((record) => ({
      type: record.get('type') || 'RELATES_TO',
      count: toNumber(record.get('count')),
    }));

    // Calculate average connections per entity
    const avgConnectionsPerEntity = entityCount > 0
      ? Number((relationCount / entityCount).toFixed(2))
      : 0;

    const response: GraphStats = {
      entityCount,
      relationCount,
      avgConnectionsPerEntity,
      entityTypes,
      relationTypes,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  } finally {
    await session.close();
  }
}
