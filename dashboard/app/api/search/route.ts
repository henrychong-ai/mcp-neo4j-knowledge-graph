/**
 * GET /api/search?q=query
 * Search entities by name, type, or observations
 */

import { NextRequest, NextResponse } from 'next/server';
import { getNeo4jSession, extractNodeProperties } from '@/lib/neo4j';
import type { SearchResult, Entity, Relation } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');

  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: 'Query parameter "q" is required' },
      { status: 400 }
    );
  }

  const session = getNeo4jSession();

  try {
    // Search for entities that match the query in name, type, or observations
    const result = await session.run(
      `
      MATCH (e:Entity)
      WHERE e.validTo IS NULL
        AND (
          toLower(e.name) CONTAINS toLower($query)
          OR toLower(e.entityType) CONTAINS toLower($query)
          OR any(obs IN e.observations WHERE toLower(obs) CONTAINS toLower($query))
        )
      OPTIONAL MATCH (e)-[r:RELATES_TO]->(e2:Entity)
      WHERE e2.validTo IS NULL AND r.validTo IS NULL
      RETURN e, r, e2
      LIMIT 100
      `,
      { query: query.trim() }
    );

    // Process results
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
        });
      }
    }

    const entities = Array.from(entityMap.values());

    const response: SearchResult = {
      entities,
      relations,
      query: query.trim(),
      resultCount: entities.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error searching:', error);
    return NextResponse.json(
      { error: 'Failed to search entities' },
      { status: 500 }
    );
  } finally {
    await session.close();
  }
}
