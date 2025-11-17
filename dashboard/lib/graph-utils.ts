/**
 * Utility functions for graph data transformation
 */

import type { GraphData, CytoscapeData, CytoscapeElement } from './types';

/**
 * Convert graph data to Cytoscape.js format
 */
export function toCytoscapeFormat(data: GraphData): CytoscapeData {
  const nodes: CytoscapeElement[] = data.entities.map((entity) => ({
    data: {
      id: entity.name,
      label: entity.name,
      type: entity.entityType,
      observations: entity.observations,
      observationCount: entity.observations.length,
      version: entity.version,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    },
    classes: `entity-type-${entity.entityType.toLowerCase().replace(/\s+/g, '-')}`,
  }));

  const edges: CytoscapeElement[] = data.relations.map((relation, index) => ({
    data: {
      id: `${relation.from}-${relation.to}-${index}`,
      source: relation.from,
      target: relation.to,
      label: relation.relationType,
      type: relation.relationType,
      strength: relation.strength,
      confidence: relation.confidence,
    },
    classes: `relation-type-${relation.relationType.toLowerCase().replace(/\s+/g, '-')}`,
  }));

  return { nodes, edges };
}

/**
 * Get unique entity types from graph data
 */
export function getEntityTypes(data: GraphData): string[] {
  const types = new Set(data.entities.map((e) => e.entityType));
  return Array.from(types).sort();
}

/**
 * Get unique relation types from graph data
 */
export function getRelationTypes(data: GraphData): string[] {
  const types = new Set(data.relations.map((r) => r.relationType));
  return Array.from(types).sort();
}

/**
 * Filter graph data by entity type
 */
export function filterByEntityType(data: GraphData, type: string): GraphData {
  const filteredEntities = data.entities.filter((e) => e.entityType === type);
  const entityNames = new Set(filteredEntities.map((e) => e.name));

  const filteredRelations = data.relations.filter(
    (r) => entityNames.has(r.from) && entityNames.has(r.to)
  );

  return {
    entities: filteredEntities,
    relations: filteredRelations,
  };
}

/**
 * Calculate statistics from graph data
 */
export function calculateStats(data: GraphData) {
  const entityCount = data.entities.length;
  const relationCount = data.relations.length;

  const avgConnections = entityCount > 0
    ? relationCount / entityCount
    : 0;

  const entityTypeCounts = data.entities.reduce((acc, e) => {
    acc[e.entityType] = (acc[e.entityType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const relationTypeCounts = data.relations.reduce((acc, r) => {
    acc[r.relationType] = (acc[r.relationType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    entityCount,
    relationCount,
    avgConnectionsPerEntity: Number(avgConnections.toFixed(2)),
    entityTypes: Object.entries(entityTypeCounts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
    relationTypes: Object.entries(relationTypeCounts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
  };
}
