import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { api, APIError } from '@/lib/api-client';

// Mock API server
const server = setupServer(
  http.get('/api/graph', () => {
    return HttpResponse.json({
      entities: [{ name: 'Test', entityType: 'test', observations: [] }],
      relations: [],
      total: 1,
    });
  }),

  http.get('/api/search', ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');

    if (!query) {
      return new HttpResponse(null, { status: 400 });
    }

    return HttpResponse.json({
      entities: [{ name: query, entityType: 'test', observations: [] }],
      relations: [],
      query,
      resultCount: 1,
    });
  }),

  http.get('/api/entities/:name', ({ params }) => {
    const { name } = params;

    if (name === 'NotFound') {
      return new HttpResponse('Entity not found', { status: 404 });
    }

    return HttpResponse.json({
      name,
      entityType: 'test',
      observations: [],
      incomingRelations: [],
      outgoingRelations: [],
      neighbors: [],
    });
  }),

  http.get('/api/stats', () => {
    return HttpResponse.json({
      entityCount: 100,
      relationCount: 150,
      avgConnectionsPerEntity: 1.5,
      entityTypes: [],
      relationTypes: [],
    });
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('api-client', () => {
  describe('getGraph', () => {
    it('should fetch full graph data', async () => {
      const data = await api.getGraph();

      expect(data.entities).toHaveLength(1);
      expect(data.entities[0].name).toBe('Test');
    });
  });

  describe('search', () => {
    it('should search entities with query', async () => {
      const data = await api.search('TestQuery');

      expect(data.query).toBe('TestQuery');
      expect(data.resultCount).toBe(1);
      expect(data.entities[0].name).toBe('TestQuery');
    });
  });

  describe('getEntity', () => {
    it('should fetch entity details', async () => {
      const data = await api.getEntity('TestEntity');

      expect(data.name).toBe('TestEntity');
      expect(data).toHaveProperty('incomingRelations');
      expect(data).toHaveProperty('outgoingRelations');
    });

    it('should handle 404 errors', async () => {
      await expect(api.getEntity('NotFound')).rejects.toThrow(APIError);
    });
  });

  describe('getStats', () => {
    it('should fetch graph statistics', async () => {
      const data = await api.getStats();

      expect(data.entityCount).toBe(100);
      expect(data.relationCount).toBe(150);
      expect(data.avgConnectionsPerEntity).toBe(1.5);
    });
  });
});
