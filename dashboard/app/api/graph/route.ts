/**
 * GET /api/graph
 * Returns the full knowledge graph (all current entities and relations)
 */

import { NextResponse } from 'next/server';
import { getNeo4jSession, extractNodeProperties } from '@/lib/neo4j';
import type { GraphData, Entity, Relation } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = getNeo4jSession();

  try {
    const startTime = Date.now();

    // Query all current entities and their relations
    const result = await session.run(`
      MATCH (e:Entity)
      WHERE e.validTo IS NULL
      OPTIONAL MATCH (e)-[r:RELATES_TO]->(e2:Entity)
      WHERE e2.validTo IS NULL AND r.validTo IS NULL
      RETURN e, r, e2
    `);

    // Process entities
    const entityMap = new Map<string, Entity>();
    const relations: Relation[] = [];

    for (const record of result.records) {
      const sourceNode = record.get('e');
      if (sourceNode) {
        const props = extractNodeProperties(sourceNode);
        if (!entityMap.has(props.name)) {
          entityMap.set(props.name, {
            name: props.name,
            entityType: props.entityType || 'unknown',
            observations: props.observations || [],
            id: props.id,
            version: props.version,
            createdAt: props.createdAt,
            updatedAt: props.updatedAt,
            validFrom: props.validFrom,
            validTo: props.validTo,
          });
        }
      }

      const targetNode = record.get('e2');
      if (targetNode) {
        const props = extractNodeProperties(targetNode);
        if (!entityMap.has(props.name)) {
          entityMap.set(props.name, {
            name: props.name,
            entityType: props.entityType || 'unknown',
            observations: props.observations || [],
            id: props.id,
            version: props.version,
            createdAt: props.createdAt,
            updatedAt: props.updatedAt,
            validFrom: props.validFrom,
            validTo: props.validTo,
          });
        }
      }

      const relation = record.get('r');
      if (relation && sourceNode && targetNode) {
        const relProps = extractNodeProperties(relation);
        relations.push({
          from: extractNodeProperties(sourceNode).name,
          to: extractNodeProperties(targetNode).name,
          relationType: relation.type || 'RELATES_TO',
          strength: relProps.strength,
          confidence: relProps.confidence,
          metadata: relProps.metadata,
          id: relProps.id,
          version: relProps.version,
          createdAt: relProps.createdAt,
          updatedAt: relProps.updatedAt,
        });
      }
    }

    const entities = Array.from(entityMap.values());
    const timeTaken = Date.now() - startTime;

    const response: GraphData = {
      entities,
      relations,
      total: entities.length,
      timeTaken,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching graph:', error);
    return NextResponse.json(
      { error: 'Failed to fetch graph data' },
      { status: 500 }
    );
  } finally {
    await session.close();
  }
}
