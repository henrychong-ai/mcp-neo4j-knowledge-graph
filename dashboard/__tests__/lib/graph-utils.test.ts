import { describe, it, expect } from 'vitest';
import {
  toCytoscapeFormat,
  getEntityTypes,
  getRelationTypes,
  filterByEntityType,
  calculateStats,
} from '@/lib/graph-utils';
import type { GraphData } from '@/lib/types';

describe('graph-utils', () => {
  const mockGraphData: GraphData = {
    entities: [
      {
        name: 'Entity1',
        entityType: 'person',
        observations: ['obs1', 'obs2'],
        version: 1,
      },
      {
        name: 'Entity2',
        entityType: 'organization',
        observations: ['obs3'],
        version: 1,
      },
      {
        name: 'Entity3',
        entityType: 'person',
        observations: [],
        version: 1,
      },
    ],
    relations: [
      {
        from: 'Entity1',
        to: 'Entity2',
        relationType: 'works_at',
        strength: 0.9,
        confidence: 0.95,
      },
      {
        from: 'Entity1',
        to: 'Entity3',
        relationType: 'knows',
        strength: 0.7,
        confidence: 0.8,
      },
    ],
  };

  describe('toCytoscapeFormat', () => {
    it('should convert graph data to Cytoscape format', () => {
      const result = toCytoscapeFormat(mockGraphData);

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);

      expect(result.nodes[0].data.id).toBe('Entity1');
      expect(result.nodes[0].data.label).toBe('Entity1');
      expect(result.nodes[0].data.type).toBe('person');

      expect(result.edges[0].data.source).toBe('Entity1');
      expect(result.edges[0].data.target).toBe('Entity2');
      expect(result.edges[0].data.type).toBe('works_at');
    });
  });

  describe('getEntityTypes', () => {
    it('should return unique entity types sorted', () => {
      const types = getEntityTypes(mockGraphData);
      expect(types).toEqual(['organization', 'person']);
    });
  });

  describe('getRelationTypes', () => {
    it('should return unique relation types sorted', () => {
      const types = getRelationTypes(mockGraphData);
      expect(types).toEqual(['knows', 'works_at']);
    });
  });

  describe('filterByEntityType', () => {
    it('should filter entities and relations by type', () => {
      const filtered = filterByEntityType(mockGraphData, 'person');

      expect(filtered.entities).toHaveLength(2);
      expect(filtered.entities.every(e => e.entityType === 'person')).toBe(true);

      // Only relation between two person entities
      expect(filtered.relations).toHaveLength(1);
      expect(filtered.relations[0].from).toBe('Entity1');
      expect(filtered.relations[0].to).toBe('Entity3');
    });
  });

  describe('calculateStats', () => {
    it('should calculate graph statistics', () => {
      const stats = calculateStats(mockGraphData);

      expect(stats.entityCount).toBe(3);
      expect(stats.relationCount).toBe(2);
      expect(stats.avgConnectionsPerEntity).toBe(0.67);

      expect(stats.entityTypes).toHaveLength(2);
      expect(stats.entityTypes[0]).toEqual({ type: 'person', count: 2 });

      expect(stats.relationTypes).toHaveLength(2);
    });

    it('should handle empty graph', () => {
      const stats = calculateStats({ entities: [], relations: [] });

      expect(stats.entityCount).toBe(0);
      expect(stats.relationCount).toBe(0);
      expect(stats.avgConnectionsPerEntity).toBe(0);
    });
  });
});
