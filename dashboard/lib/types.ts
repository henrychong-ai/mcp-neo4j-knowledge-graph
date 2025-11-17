/**
 * Shared TypeScript types for the dashboard
 */

export interface Entity {
  name: string;
  entityType: string;
  observations: string[];
  id?: string;
  version?: number;
  createdAt?: number;
  updatedAt?: number;
  validFrom?: number;
  validTo?: number | null;
}

export interface Relation {
  from: string;
  to: string;
  relationType: string;
  strength?: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
  id?: string;
  version?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface GraphData {
  entities: Entity[];
  relations: Relation[];
  total?: number;
  timeTaken?: number;
}

export interface EntityDetails extends Entity {
  incomingRelations: Relation[];
  outgoingRelations: Relation[];
  neighbors: Entity[];
}

export interface GraphStats {
  entityCount: number;
  relationCount: number;
  avgConnectionsPerEntity: number;
  entityTypes: Array<{ type: string; count: number }>;
  relationTypes: Array<{ type: string; count: number }>;
}

export interface SearchResult {
  entities: Entity[];
  relations: Relation[];
  query: string;
  resultCount: number;
}

/**
 * Cytoscape.js compatible data format
 */
export interface CytoscapeElement {
  data: {
    id: string;
    label?: string;
    type?: string;
    source?: string;
    target?: string;
    [key: string]: unknown;
  };
  classes?: string;
}

export interface CytoscapeData {
  nodes: CytoscapeElement[];
  edges: CytoscapeElement[];
}
