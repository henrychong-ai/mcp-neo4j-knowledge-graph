# Knowledge Graph Visualization Dashboard

Interactive web dashboard for exploring and visualizing the Neo4j knowledge graph built with Next.js 14.

## Features

- **Interactive Graph Visualization**: Powered by Cytoscape.js with force-directed layout (cose-bilkent algorithm)
- **Real-time Search**: Filter entities by name, type, or observations
- **Entity Details Panel**: Click any node to view observations, incoming/outgoing relations, and metadata
- **Graph Statistics**: Modal overlay showing entity/relation counts, type distributions, and connectivity metrics
- **Responsive UI**: Modern three-panel layout with Next.js, React 18, and Tailwind CSS
- **Efficient Data Fetching**: React Query for client-side caching and background updates
- **Full-Stack Next.js**: API routes and frontend in one application (App Router architecture)
- **Comprehensive Test Coverage**: Vitest + React Testing Library for components and API routes

## Tech Stack

### Frontend
- **Next.js 14** - Full-stack React framework with App Router
- **React 18** - UI library with client components
- **TypeScript** - Type safety throughout
- **Tailwind CSS** - Utility-first styling
- **Cytoscape.js** - Graph visualization library
  - `cytoscape-cose-bilkent` - Force-directed layout algorithm
- **React Query (@tanstack/react-query)** - Data fetching, caching, and synchronization
- **Lucide React** - Modern icon library

### Backend
- **Next.js API Routes** - Server-side endpoints (nodejs runtime)
- **neo4j-driver** - Direct Neo4j database connection with singleton pattern
- **TypeScript** - Type-safe API implementations

### Testing
- **Vitest** - Fast unit test runner (matching parent project)
- **React Testing Library** - Component testing
- **MSW (Mock Service Worker)** - API mocking for tests
- **happy-dom** - Lightweight DOM environment

## Quick Start

### Prerequisites

- **Node.js 20+** installed
- **Neo4j database** running with knowledge graph data
- Environment variables configured (see below)

### Installation

From the dashboard directory:

```bash
# Install dependencies
npm install
```

### Environment Variables

Create a `.env.local` file in the dashboard directory (see `.env.local.example` for template):

```bash
# Neo4j Connection (same database as parent MCP server)
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password
NEO4J_DATABASE=neo4j  # Optional, defaults to "neo4j"
```

**Important**: The dashboard connects directly to the same Neo4j database used by the MCP server. Ensure your Neo4j instance is running before starting the dashboard.

### Running the Dashboard

**Development Mode (port 3000):**
```bash
npm run dev
```

Then open your browser to: **http://localhost:3000**

**Production Build:**
```bash
npm run build
npm start
```

## Architecture

Next.js 14 full-stack application with App Router:

```
dashboard/
├── app/                        # Next.js App Router
│   ├── page.tsx                # Main dashboard page (client component)
│   ├── layout.tsx              # Root layout
│   ├── globals.css             # Global styles
│   └── api/                    # API Routes (Server-side)
│       ├── graph/
│       │   └── route.ts        # GET /api/graph - Full graph data
│       ├── search/
│       │   └── route.ts        # GET /api/search?q=... - Search nodes
│       ├── entities/
│       │   └── [name]/
│       │       └── route.ts    # GET /api/entities/:name - Entity details
│       └── stats/
│           └── route.ts        # GET /api/stats - Graph statistics
├── components/                 # React Components (Client)
│   ├── GraphVisualization.tsx  # Cytoscape.js graph rendering
│   ├── SearchBar.tsx           # Search input with state management
│   ├── EntityPanel.tsx         # Entity details sidebar
│   └── StatsPanel.tsx          # Statistics modal overlay
├── lib/                        # Utilities and Services
│   ├── neo4j.ts                # Neo4j connection singleton
│   ├── types.ts                # Shared TypeScript types
│   ├── graph-utils.ts          # Data transformation utilities
│   └── api-client.ts           # Frontend API client
├── __tests__/                  # Test Suite
│   ├── api/
│   │   └── routes.test.ts      # API route tests (mocked Neo4j)
│   ├── lib/
│   │   ├── graph-utils.test.ts # Utility function tests
│   │   └── api-client.test.ts  # API client tests (MSW)
│   └── components/
│       ├── SearchBar.test.tsx
│       ├── EntityPanel.test.tsx
│       ├── StatsPanel.test.tsx
│       └── GraphVisualization.test.tsx
├── vitest.config.ts            # Vitest configuration
├── next.config.js              # Next.js + webpack config
├── tailwind.config.ts          # Tailwind CSS config
└── .env.local.example          # Environment variable template
```

## API Endpoints

Next.js API routes (server-side, port 3000):

- **`GET /api/graph`** - Returns full knowledge graph (all current entities and relations)
- **`GET /api/search?q=<query>`** - Search entities by name, type, or observations (max 100 results)
- **`GET /api/entities/[name]`** - Get entity details with incoming/outgoing relations
- **`GET /api/stats`** - Graph statistics (counts, distributions, connectivity metrics)

All API routes:
- Use **`runtime = 'nodejs'`** for Neo4j driver compatibility
- Use **`dynamic = 'force-dynamic'`** to disable caching (always fresh data)
- Query only current versions (`WHERE validTo IS NULL`) for temporal consistency
- Close Neo4j sessions in `finally` blocks to prevent connection leaks

## Development

### Running Tests

**All tests:**
```bash
npm test
```

**Watch mode (during development):**
```bash
npm run test:watch
```

**Coverage report:**
```bash
npm run test:coverage
```

**Run specific test file:**
```bash
npx vitest run __tests__/components/SearchBar.test.tsx
```

Test suite includes:
- **7 component tests** - SearchBar, EntityPanel, StatsPanel, GraphVisualization
- **4 API route tests** - All endpoints with mocked Neo4j driver
- **3 utility tests** - graph-utils, api-client

### Building for Production

**Build optimized production bundle:**
```bash
npm run build
```

Output will be in `.next/` directory.

**Run production server:**
```bash
npm start
```

**Linting:**
```bash
npm run lint
```

## Usage Guide

### Exploring the Graph

1. **Initial View**: On load, the full graph is displayed with force-directed layout
2. **Pan & Zoom**: Drag to pan, scroll to zoom
3. **Node Interaction**:
   - **Click** a node to view detailed information in the right panel
   - **Hover** over nodes to highlight connections

### Searching

1. Enter a search query in the left sidebar
2. Click "Search" or press Enter
3. Graph updates to show only matching entities
4. Click "×" to clear search and return to full graph

### Viewing Statistics

1. Click "Show Stats" button in the header
2. View:
   - Total entities and relations
   - Average connections per entity
   - Entity type distribution (top 5)
   - Relation type distribution (top 5)

### Entity Details

When you click a node:
- **Entity Info**: Name, type, version
- **Observations**: All knowledge fragments
- **Connected Entities**: Direct neighbors
- **Relations**: Incoming (←) and outgoing (→) relationships with confidence scores
- **Metadata**: Creation and update timestamps

## Troubleshooting

**"Error Loading Graph" message:**
- Ensure Next.js dev server is running (`npm run dev`)
- Check Neo4j database is running and accessible
- Verify `NEO4J_*` environment variables in `.env.local`
- Check browser console and terminal for error messages

**Graph not rendering:**
- Check browser console for JavaScript errors
- Ensure Cytoscape.js loaded correctly (check Network tab)
- Verify graph data is returned from `/api/graph` endpoint
- Try refreshing the page

**Search not working:**
- Ensure query is not empty (minimum 1 character)
- Check Network tab for API errors (`/api/search?q=...`)
- Verify Neo4j database has searchable entities
- Check search endpoint logs in terminal

**Blank dashboard:**
- Ensure Next.js server is running on port 3000
- Check if Neo4j database has data (`MATCH (e:Entity) RETURN count(e)`)
- Verify `.env.local` file exists with correct credentials
- Check terminal logs for API route errors

**Module not found errors:**
- Ensure all dependencies are installed (`npm install`)
- Check `tsconfig.json` path aliases are correct
- Try deleting `.next/` and `node_modules/`, then reinstall

**Neo4j connection errors:**
- Verify Neo4j is running (`docker ps` or check Neo4j Desktop)
- Test connection URI (`bolt://localhost:7687` or your custom URI)
- Check username/password in `.env.local`
- Ensure temporal schema constraints exist (see parent project `CLAUDE.md`)

## Performance Notes

- **Client-side Caching**: React Query caches data with 5-minute stale time
  - Full graph: `queryKey: ['graph']`
  - Search results: `queryKey: ['search', query]`
  - Entity details: `queryKey: ['entity', name]`
  - Statistics: `queryKey: ['stats']`
- **API Caching**: Disabled via `dynamic = 'force-dynamic'` (always fresh from Neo4j)
- **Large Graphs**: Graphs with 500+ nodes may have slower initial layout
- **Layout Algorithm**: `cose-bilkent` is optimized for readability but computationally intensive
  - `idealEdgeLength: 100` - Target distance between connected nodes
  - `nodeRepulsion: 4500` - Force pushing nodes apart
  - `numIter: 2500` - Layout calculation iterations
- **Optimization Strategies** for very large graphs (1000+ nodes):
  - Use search to filter entities before visualizing
  - Click entity neighborhoods instead of loading full graph
  - Adjust layout parameters in `GraphVisualization.tsx` (reduce `numIter`)
  - Consider implementing pagination or virtual scrolling

## License

MIT (same as parent project)

---

## Implementation Notes

### Neo4j Connection Pattern

The dashboard uses a **singleton pattern** for Neo4j connections to avoid creating new connections on every API request:

```typescript
// lib/neo4j.ts
class Neo4jConnection {
  private static instance: Neo4jConnection;
  private driver: Driver;

  private constructor() {
    this.driver = neo4j.driver(uri, auth);
  }

  public static getInstance(): Neo4jConnection {
    if (!Neo4jConnection.instance) {
      Neo4jConnection.instance = new Neo4jConnection();
    }
    return Neo4jConnection.instance;
  }
}
```

This is critical for serverless/edge environments where connections should be reused.

### Temporal Versioning Support

All API routes query only **current versions** of entities and relations:

```cypher
MATCH (e:Entity)
WHERE e.validTo IS NULL  -- Only current versions
```

This ensures consistency with the parent MCP server's temporal versioning system.

### Webpack Configuration

`next.config.js` includes polyfills for Neo4j driver compatibility:

```javascript
webpack: (config, { isServer }) => {
  if (!isServer) {
    config.resolve.fallback = {
      fs: false,
      net: false,
      tls: false,  // Neo4j driver needs these on server only
    };
  }
  return config;
}
```
