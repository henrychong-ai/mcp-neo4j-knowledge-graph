/**
 * GET /api/entities/:name
 * Get detailed information about a specific entity
 */

import { NextRequest, NextResponse } from 'next/server';
import { getNeo4jSession, extractNodeProperties } from '@/lib/neo4j';
import type { EntityDetails, Entity, Relation } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { name: string } }
) {
  const entityName = decodeURIComponent(params.name);

  if (!entityName) {
    return NextResponse.json(
      { error: 'Entity name is required' },
      { status: 400 }
    );
  }

  const session = getNeo4jSession();

  try {
    // Get entity with all its relations
    const result = await session.run(
      `
      MATCH (e:Entity {name: $name})
      WHERE e.validTo IS NULL
      OPTIONAL MATCH (e)-[rOut:RELATES_TO]->(e2:Entity)
      WHERE e2.validTo IS NULL AND rOut.validTo IS NULL
      OPTIONAL MATCH (e3:Entity)-[rIn:RELATES_TO]->(e)
      WHERE e3.validTo IS NULL AND rIn.validTo IS NULL
      RETURN e,
        collect(DISTINCT {rel: rOut, entity: e2}) as outgoing,
        collect(DISTINCT {rel: rIn, entity: e3}) as incoming
      `,
      { name: entityName }
    );

    if (result.records.length === 0) {
      return NextResponse.json(
        { error: 'Entity not found' },
        { status: 404 }
      );
    }

    const record = result.records[0];
    const entityNode = record.get('e');
    const entityProps = extractNodeProperties(entityNode);

    // Process outgoing relations
    const outgoingData = record.get('outgoing') || [];
    const outgoingRelations: Relation[] = [];
    const neighbors = new Map<string, Entity>();

    for (const item of outgoingData) {
      if (item.rel && item.entity) {
        const relProps = extractNodeProperties(item.rel);
        const targetProps = extractNodeProperties(item.entity);

        outgoingRelations.push({
          from: entityName,
          to: targetProps.name,
          relationType: item.rel.type || 'RELATES_TO',
          strength: relProps.strength,
          confidence: relProps.confidence,
          metadata: relProps.metadata,
          id: relProps.id,
          version: relProps.version,
        });

        neighbors.set(targetProps.name, {
          name: targetProps.name,
          entityType: targetProps.entityType || 'unknown',
          observations: targetProps.observations || [],
        });
      }
    }

    // Process incoming relations
    const incomingData = record.get('incoming') || [];
    const incomingRelations: Relation[] = [];

    for (const item of incomingData) {
      if (item.rel && item.entity) {
        const relProps = extractNodeProperties(item.rel);
        const sourceProps = extractNodeProperties(item.entity);

        incomingRelations.push({
          from: sourceProps.name,
          to: entityName,
          relationType: item.rel.type || 'RELATES_TO',
          strength: relProps.strength,
          confidence: relProps.confidence,
          metadata: relProps.metadata,
          id: relProps.id,
          version: relProps.version,
        });

        neighbors.set(sourceProps.name, {
          name: sourceProps.name,
          entityType: sourceProps.entityType || 'unknown',
          observations: sourceProps.observations || [],
        });
      }
    }

    const response: EntityDetails = {
      name: entityProps.name,
      entityType: entityProps.entityType || 'unknown',
      observations: entityProps.observations || [],
      id: entityProps.id,
      version: entityProps.version,
      createdAt: entityProps.createdAt,
      updatedAt: entityProps.updatedAt,
      validFrom: entityProps.validFrom,
      validTo: entityProps.validTo,
      incomingRelations,
      outgoingRelations,
      neighbors: Array.from(neighbors.values()),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching entity:', error);
    return NextResponse.json(
      { error: 'Failed to fetch entity details' },
      { status: 500 }
    );
  } finally {
    await session.close();
  }
}
