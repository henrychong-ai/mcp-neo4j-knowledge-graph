# Next.js Visualization Dashboard - Implementation Plan

## Overview

Build a full-stack Next.js dashboard for visualizing and exploring the Neo4j knowledge graph with direct database access via Cypher queries.

## Architecture

```
dashboard/ (Next.js App)
├── app/
│   ├── api/                    # Backend API Routes (Server-side)
│   │   ├── graph/route.ts      # GET /api/graph - Full graph data
│   │   ├── search/route.ts     # GET /api/search?q=... - Search nodes
│   │   ├── entities/
│   │   │   └── [name]/route.ts # GET /api/entities/:name - Entity details
│   │   └── stats/route.ts      # GET /api/stats - Graph statistics
│   ├── page.tsx                # Main dashboard page
│   ├── layout.tsx              # Root layout with providers
│   └── globals.css             # Tailwind CSS
├── components/                  # React Components
│   ├── GraphVisualization.tsx   # Cytoscape.js graph renderer
│   ├── SearchBar.tsx           # Search interface
│   ├── EntityPanel.tsx         # Entity details panel
│   └── StatsPanel.tsx          # Statistics display
├── lib/
│   ├── neo4j.ts                # Neo4j connection manager (server-side)
│   ├── api-client.ts           # Frontend API client
│   └── types.ts                # Shared TypeScript types
├── __tests__/
│   ├── api/                    # API route tests
│   └── components/             # Component tests
└── package.json
```

## Tech Stack

### Core
- **Next.js 14+** - App Router with React Server Components
- **TypeScript** - Full type safety
- **Tailwind CSS** - Styling

### Backend (API Routes)
- **neo4j-driver** - Direct Neo4j connection (reuse from parent project)
- **Cypher queries** - Direct database access
- **Connection pooling** - Singleton pattern for Neo4j driver

### Frontend
- **Cytoscape.js** - Graph visualization
- **React 18** - UI components
- **React Query (@tanstack/react-query)** - Data fetching and caching
- **Lucide React** - Icons

### Testing
- **Vitest** - Test runner (matches parent project)
- **@testing-library/react** - Component testing
- **MSW (Mock Service Worker)** - API mocking

## Implementation Phases

### Phase 1: Project Setup ✓
1. Create Next.js project structure in `dashboard/`
2. Configure TypeScript, Tailwind, ESLint
3. Set up package.json with dependencies
4. Configure vitest for testing

### Phase 2: Neo4j Integration
1. Create `lib/neo4j.ts` - Connection manager
   - Singleton pattern for driver instance
   - Environment variable configuration
   - Session management
   - Error handling
2. Create shared types in `lib/types.ts`
   - Entity, Relation, GraphData interfaces
   - API response types

### Phase 3: API Routes
1. **GET /api/graph**
   - Fetch all current entities and relations
   - Cypher: `MATCH (e:Entity)-[r]->(e2:Entity) WHERE e.validTo IS NULL RETURN e, r, e2`
   - Return formatted graph data

2. **GET /api/search?q=...**
   - Search entities by name/type/observations
   - Cypher: Use CONTAINS or regex matching
   - Return matching entities and their relations

3. **GET /api/entities/:name**
   - Get single entity with full details
   - Include all relations (incoming and outgoing)
   - Return entity metadata, observations, neighbors

4. **GET /api/stats**
   - Count entities and relations
   - Calculate type distributions
   - Average connections per entity
   - Return statistics object

### Phase 4: Frontend Components
1. **GraphVisualization.tsx**
   - Initialize Cytoscape instance
   - Force-directed layout (cose-bilkent)
   - Node click handlers
   - Pan and zoom controls
   - Loading and error states

2. **SearchBar.tsx**
   - Search input with debouncing
   - Clear button
   - Loading indicator
   - Error handling

3. **EntityPanel.tsx**
   - Display selected entity details
   - Show observations list
   - Display relations (incoming/outgoing)
   - Show metadata (timestamps, version)

4. **StatsPanel.tsx**
   - Display graph statistics
   - Entity count, relation count
   - Type distributions
   - Average connections

### Phase 5: Main Dashboard Page
1. **app/page.tsx**
   - Layout: Search sidebar + Graph + Entity panel
   - React Query setup for data fetching
   - State management for selected entity
   - Responsive design

2. **app/layout.tsx**
   - React Query provider
   - Global styles
   - Metadata configuration

### Phase 6: Testing
1. **API Route Tests**
   - Mock Neo4j driver responses
   - Test all endpoints
   - Test error handling
   - Test query parameters

2. **Component Tests**
   - Test GraphVisualization initialization
   - Test SearchBar interactions
   - Test EntityPanel rendering
   - Test StatsPanel display

3. **Integration Tests**
   - Test full data flow (API → Components)
   - Test user interactions
   - Test error scenarios

### Phase 7: Documentation & Polish
1. Update dashboard/README.md
2. Add inline code comments
3. Create example .env file
4. Add deployment instructions

## Key Design Decisions

### 1. Direct Neo4j Access
- API routes connect directly to Neo4j using `neo4j-driver`
- Reuse `Neo4jConnectionManager` from parent project via import
- No dependency on MCP server (independent operation)

### 2. Connection Pooling
```typescript
// Singleton pattern for Next.js
let connectionManager: Neo4jConnectionManager | null = null;

export function getNeo4jConnection() {
  if (!connectionManager) {
    connectionManager = new Neo4jConnectionManager({
      uri: process.env.NEO4J_URI!,
      username: process.env.NEO4J_USERNAME!,
      password: process.env.NEO4J_PASSWORD!,
    });
  }
  return connectionManager;
}
```

### 3. API Route Configuration
```typescript
// Force Node.js runtime (Neo4j driver requires it)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // No caching
```

### 4. Client-Side State Management
- React Query for server state (graph data, search results)
- Local state for UI (selected entity, panel visibility)
- No complex state management library needed

### 5. Graph Rendering Strategy
- Fetch initial data on mount
- Update graph when search results change
- Debounce search to avoid excessive API calls
- Cache search results with React Query

## Environment Variables

```bash
# Shared with MCP server (same .env file)
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password
NEO4J_DATABASE=neo4j

# Dashboard specific (optional)
NEXT_PUBLIC_API_URL=/api  # For client-side API calls
```

## Development Workflow

```bash
# Terminal 1: MCP Server (optional, runs independently)
npm start

# Terminal 2: Dashboard
cd dashboard
npm run dev  # Starts at http://localhost:3000
```

## Testing Strategy

### Unit Tests
- Test API routes with mocked Neo4j responses
- Test components in isolation with mocked API calls
- Test utility functions

### Integration Tests
- Test full data flow from API to UI
- Test user interactions (search, click, pan/zoom)
- Test error handling across stack

### Coverage Goals
- API routes: 90%+ coverage
- Components: 80%+ coverage
- Overall: 85%+ coverage

## Performance Considerations

1. **Connection Pooling**: Reuse Neo4j connections across requests
2. **Query Optimization**: Limit result sets, use indexes
3. **Client Caching**: React Query caches for 5 minutes
4. **Debouncing**: Search input debounced to 300ms
5. **Code Splitting**: Next.js automatic code splitting
6. **Graph Rendering**: Only render visible nodes for large graphs

## Security Considerations

1. **No Client-Side Credentials**: Neo4j credentials only in API routes (server-side)
2. **Input Validation**: Sanitize search queries to prevent injection
3. **Rate Limiting**: Consider adding rate limiting for production
4. **CORS**: Next.js API routes handle CORS automatically

## Deployment Options

### Option 1: Vercel (Recommended for Dev)
```bash
cd dashboard
vercel deploy
```
- Automatic HTTPS, CDN
- Serverless functions for API routes
- Free tier available

### Option 2: Self-Hosted (Docker)
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY dashboard/ .
RUN npm install && npm run build
CMD ["npm", "start"]
EXPOSE 3000
```

### Option 3: Alongside MCP Server (Same VPS)
```bash
# On vps-2
cd dashboard
npm run build
npm start  # Port 3000
# Nginx reverse proxy to expose dashboard
```

## Success Criteria

- ✅ Dashboard loads and displays full graph
- ✅ Search filters graph in real-time
- ✅ Clicking nodes shows entity details
- ✅ Statistics panel shows accurate counts
- ✅ All API routes return correct data
- ✅ All tests pass with 85%+ coverage
- ✅ Responsive on desktop and tablet
- ✅ Loads graphs with 1000+ nodes without freezing

## Timeline Estimate

- Phase 1 (Setup): 30 minutes
- Phase 2 (Neo4j): 30 minutes
- Phase 3 (API Routes): 1 hour
- Phase 4 (Components): 2 hours
- Phase 5 (Dashboard Page): 1 hour
- Phase 6 (Testing): 2 hours
- Phase 7 (Documentation): 30 minutes

**Total: ~7.5 hours** for complete implementation with tests

## Next Steps

1. Create feature branch: `claude/dashboard-nextjs-implementation-[session-id]`
2. Initialize Next.js project in dashboard/
3. Implement each phase sequentially
4. Commit incrementally with clear messages
5. Push to remote and create PR
