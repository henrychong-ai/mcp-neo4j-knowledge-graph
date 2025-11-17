/**
 * API Client for Frontend
 * Wrapper around fetch with error handling
 */

import type { GraphData, SearchResult, EntityDetails, GraphStats } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'APIError';
  }
}

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.text();
    throw new APIError(response.status, error || response.statusText);
  }

  return response.json();
}

export const api = {
  /**
   * Fetch full knowledge graph
   */
  async getGraph(): Promise<GraphData> {
    return fetchJSON<GraphData>(`${API_BASE}/graph`);
  },

  /**
   * Search entities by query string
   */
  async search(query: string): Promise<SearchResult> {
    const params = new URLSearchParams({ q: query });
    return fetchJSON<SearchResult>(`${API_BASE}/search?${params}`);
  },

  /**
   * Get entity details by name
   */
  async getEntity(name: string): Promise<EntityDetails> {
    return fetchJSON<EntityDetails>(`${API_BASE}/entities/${encodeURIComponent(name)}`);
  },

  /**
   * Get graph statistics
   */
  async getStats(): Promise<GraphStats> {
    return fetchJSON<GraphStats>(`${API_BASE}/stats`);
  },
};

export { APIError };
