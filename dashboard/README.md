# Knowledge Graph Visualization Dashboard

Interactive web dashboard for exploring and visualizing the Neo4j knowledge graph.

## Features

- **Interactive Graph Visualization**: Powered by Cytoscape.js with force-directed layout
- **Real-time Search**: Filter entities by name with instant results
- **Entity Details**: Click any node to view observations, connections, and metadata
- **Graph Statistics**: View entity/relation counts, type distributions, and connectivity metrics
- **Responsive UI**: Modern interface built with React and Tailwind CSS
- **Efficient Data Fetching**: React Query for caching and background updates

## Quick Start

### Prerequisites

- Node.js 20+ installed
- Neo4j database running (with knowledge graph data)
- MCP server environment variables configured

### Installation

From the dashboard directory:

```bash
# Install server dependencies (if not already installed from root)
cd ../..
npm install

# Install client dependencies
cd dashboard/client
npm install
```

### Running the Dashboard

You need to run both the backend API server and the frontend dev server:

**Terminal 1 - Backend API Server (port 3001):**
```bash
npm run dashboard:server
```

**Terminal 2 - Frontend Dev Server (port 5173):**
```bash
cd dashboard/client
npm run dev
```

Then open your browser to: **http://localhost:5173**

## Architecture

```
dashboard/
├── server/              # Express API backend
│   ├── index.ts        # Server entry point
│   ├── routes/         # API route handlers
│   │   └── graph.ts    # Graph data endpoints
│   └── __vitest__/     # Backend tests (22 tests)
└── client/             # React frontend
    ├── src/
    │   ├── components/ # React components
    │   │   ├── GraphVisualization.tsx
    │   │   ├── SearchBar.tsx
    │   │   ├── EntityDetailPanel.tsx
    │   │   └── StatsPanel.tsx
    │   ├── hooks/      # Custom React hooks
    │   ├── services/   # API client
    │   └── types/      # TypeScript types
    └── __tests__/      # Frontend tests (12 tests)
```

## API Endpoints

The backend server (port 3001) provides:

- `GET /health` - Health check
- `GET /api/graph` - Full knowledge graph
- `GET /api/graph/search?q=...` - Search nodes
- `GET /api/entities/:name` - Entity details
- `GET /api/entities/:name/neighbors?depth=N` - Entity neighborhood
- `GET /api/stats` - Graph statistics

## Configuration

### Backend (.env)

```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password
DASHBOARD_PORT=3001                    # Optional, defaults to 3001
DASHBOARD_CORS_ORIGIN=*                # Optional, defaults to *
```

### Frontend (dashboard/client/.env)

```bash
VITE_API_URL=http://localhost:3001/api  # Optional, defaults to /api (proxied)
```

## Development

### Running Tests

**Backend tests:**
```bash
npm test -- dashboard/server/__vitest__/api.test.ts
```

**Frontend tests:**
```bash
cd dashboard/client
npm test
```

### Building for Production

**Frontend build:**
```bash
cd dashboard/client
npm run build
```

Output will be in `dashboard/client/dist/`

**Serving production build:**
```bash
cd dashboard/client
npm run preview
```

## Tech Stack

### Backend
- **Express.js** - HTTP API server
- **TypeScript** - Type safety
- **Vitest + Supertest** - Testing framework

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **Cytoscape.js** - Graph visualization library
  - `cytoscape-cose-bilkent` - Force-directed layout algorithm
- **React Query (@tanstack/react-query)** - Data fetching and caching
- **Tailwind CSS** - Utility-first CSS framework
- **Vitest + React Testing Library** - Component testing

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
- Ensure backend server is running on port 3001
- Check Neo4j connection in backend logs
- Verify `NEO4J_*` environment variables are set

**Graph not rendering:**
- Check browser console for JavaScript errors
- Ensure Cytoscape.js loaded correctly
- Try refreshing the page

**Search not working:**
- Ensure query is not empty
- Check network tab for API errors
- Verify backend `/api/graph/search` endpoint responds

**Blank dashboard:**
- Ensure both servers are running (backend on 3001, frontend on 5173)
- Check if Neo4j database has data
- Verify proxy configuration in `vite.config.ts`

## Performance Notes

- **Caching**: Search results are cached for 2 minutes, full graph for 5 minutes
- **Large Graphs**: Graphs with 500+ nodes may have slower initial layout
- **Layout Algorithm**: `cose-bilkent` is optimized for readability but computationally intensive
- For very large graphs (1000+ nodes), consider:
  - Using search to filter before visualizing
  - Exploring entity neighborhoods instead of full graph
  - Adjusting layout parameters in `GraphVisualization.tsx`

## License

MIT (same as parent project)
