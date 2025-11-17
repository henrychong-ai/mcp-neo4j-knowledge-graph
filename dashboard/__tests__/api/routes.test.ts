import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as getGraph } from '@/app/api/graph/route';
import { GET as getSearch } from '@/app/api/search/route';
import { GET as getEntity } from '@/app/api/entities/[name]/route';
import { GET as getStats } from '@/app/api/stats/route';

// Mock Neo4j session
const mockRun = vi.fn();
const mockClose = vi.fn();
const mockSession = {
  run: mockRun,
  close: mockClose,
};

vi.mock('@/lib/neo4j', () => ({
  getNeo4jSession: () => mockSession,
  extractNodeProperties: (node: any) => node.properties || node,
}));

describe('API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/graph', () => {
    it('should return full graph data', async () => {
      const mockRecords = [
        {
          get: (key: string) => {
            if (key === 'e') {
              return {
                properties: {
                  name: 'Entity1',
                  entityType: 'person',
                  observations: ['obs1'],
                  id: 'id1',
                  version: 1,
                  validTo: null,
                },
              };
            }
            if (key === 'e2') {
              return {
                properties: {
                  name: 'Entity2',
                  entityType: 'organization',
                  observations: ['obs2'],
                  id: 'id2',
                  version: 1,
                  validTo: null,
                },
              };
            }
            if (key === 'r') {
              return {
                type: 'RELATES_TO',
                properties: {
                  strength: 0.9,
                  confidence: 0.95,
                },
              };
            }
            return null;
          },
        },
      ];

      mockRun.mockResolvedValue({ records: mockRecords });

      const response = await getGraph();
      const data = await response.json();

      expect(mockRun).toHaveBeenCalled();
      expect(mockClose).toHaveBeenCalled();
      expect(data.entities).toBeDefined();
      expect(data.relations).toBeDefined();
    });

    it('should handle database errors gracefully', async () => {
      mockRun.mockRejectedValue(new Error('Database connection failed'));

      const response = await getGraph();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch graph data');
      expect(mockClose).toHaveBeenCalled();
    });
  });

  describe('GET /api/search', () => {
    it('should search entities by query', async () => {
      const mockRecords = [
        {
          get: (key: string) => {
            if (key === 'e') {
              return {
                properties: {
                  name: 'SearchResult',
                  entityType: 'test',
                  observations: ['contains search term'],
                  validTo: null,
                },
              };
            }
            return null;
          },
        },
      ];

      mockRun.mockResolvedValue({ records: mockRecords });

      const request = new Request('http://localhost/api/search?q=search');
      const response = await getSearch(request);
      const data = await response.json();

      expect(mockRun).toHaveBeenCalled();
      expect(data.query).toBe('search');
      expect(data.entities).toBeDefined();
      expect(mockClose).toHaveBeenCalled();
    });

    it('should return 400 for empty query', async () => {
      const request = new Request('http://localhost/api/search?q=');
      const response = await getSearch(request);

      expect(response.status).toBe(400);
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('should return 400 for missing query parameter', async () => {
      const request = new Request('http://localhost/api/search');
      const response = await getSearch(request);

      expect(response.status).toBe(400);
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockRun.mockRejectedValue(new Error('Search failed'));

      const request = new Request('http://localhost/api/search?q=test');
      const response = await getSearch(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to search entities');
      expect(mockClose).toHaveBeenCalled();
    });
  });

  describe('GET /api/entities/[name]', () => {
    it('should return entity details with relations', async () => {
      const mockRecords = [
        {
          get: (key: string) => {
            if (key === 'e') {
              return {
                properties: {
                  name: 'TestEntity',
                  entityType: 'person',
                  observations: ['obs1', 'obs2'],
                  version: 1,
                },
              };
            }
            if (key === 'outgoing') {
              return [
                {
                  relationType: 'works_at',
                  to: 'Company',
                  confidence: 0.95,
                },
              ];
            }
            if (key === 'incoming') {
              return [
                {
                  relationType: 'knows',
                  from: 'Person2',
                  confidence: 0.8,
                },
              ];
            }
            return null;
          },
        },
      ];

      mockRun.mockResolvedValue({ records: mockRecords });

      const response = await getEntity(
        new Request('http://localhost/api/entities/TestEntity'),
        { params: { name: 'TestEntity' } }
      );
      const data = await response.json();

      expect(mockRun).toHaveBeenCalled();
      expect(data.name).toBe('TestEntity');
      expect(data.entityType).toBe('person');
      expect(data.observations).toHaveLength(2);
      expect(mockClose).toHaveBeenCalled();
    });

    it('should return 404 when entity not found', async () => {
      mockRun.mockResolvedValue({ records: [] });

      const response = await getEntity(
        new Request('http://localhost/api/entities/NonExistent'),
        { params: { name: 'NonExistent' } }
      );

      expect(response.status).toBe(404);
      expect(mockClose).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockRun.mockRejectedValue(new Error('Query failed'));

      const response = await getEntity(
        new Request('http://localhost/api/entities/TestEntity'),
        { params: { name: 'TestEntity' } }
      );
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch entity details');
      expect(mockClose).toHaveBeenCalled();
    });
  });

  describe('GET /api/stats', () => {
    it('should return graph statistics', async () => {
      const mockStatsRecords = [
        {
          get: (key: string) => {
            if (key === 'entityCount') return 100;
            if (key === 'relationCount') return 150;
            if (key === 'avgConnections') return 1.5;
            return null;
          },
        },
      ];

      const mockEntityTypeRecords = [
        {
          get: (key: string) => {
            if (key === 'type') return 'person';
            if (key === 'count') return 60;
            return null;
          },
        },
        {
          get: (key: string) => {
            if (key === 'type') return 'organization';
            if (key === 'count') return 40;
            return null;
          },
        },
      ];

      const mockRelationTypeRecords = [
        {
          get: (key: string) => {
            if (key === 'type') return 'works_at';
            if (key === 'count') return 80;
            return null;
          },
        },
        {
          get: (key: string) => {
            if (key === 'type') return 'knows';
            if (key === 'count') return 70;
            return null;
          },
        },
      ];

      mockRun
        .mockResolvedValueOnce({ records: mockStatsRecords })
        .mockResolvedValueOnce({ records: mockEntityTypeRecords })
        .mockResolvedValueOnce({ records: mockRelationTypeRecords });

      const response = await getStats();
      const data = await response.json();

      expect(mockRun).toHaveBeenCalledTimes(3);
      expect(data.entityCount).toBe(100);
      expect(data.relationCount).toBe(150);
      expect(data.avgConnectionsPerEntity).toBe(1.5);
      expect(data.entityTypes).toHaveLength(2);
      expect(data.relationTypes).toHaveLength(2);
      expect(mockClose).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockRun.mockRejectedValue(new Error('Stats query failed'));

      const response = await getStats();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch statistics');
      expect(mockClose).toHaveBeenCalled();
    });
  });
});
