# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**@henrychong-ai/mcp-neo4j-knowledge-graph** is a Model Context Protocol (MCP) server implementing a Neo4j-based knowledge graph with temporal versioning and semantic search capabilities. Maintained by Henry Chong, built on foundational work by Gannon Hall.

**Key Features:**
- Temporal versioning for entities and relations (track historical changes)
- Neo4j graph database as primary storage backend
- Vector embeddings and semantic search via OpenAI
- MCP server for Claude Desktop and Claude Code integration
- Full test coverage with Vitest

## Development Commands

### Build & Development
```bash
npm run build              # TypeScript compilation + executable permissions
npm run dev               # Watch mode for development
npm run prepare           # Pre-publish build (runs automatically)
```

### Testing
```bash
npm test                  # Run all tests
npm run test:watch        # Watch mode
npm run test:verbose      # Detailed output
npm run test:coverage     # Coverage report
npm run test:integration  # Integration tests (requires Neo4j)
```

### Code Quality
```bash
npm run lint              # ESLint check
npm run lint:fix          # Auto-fix linting issues
npm run format            # Prettier formatting
npm run fix               # lint:fix + format
```

### Neo4j Setup
```bash
npm run neo4j:init        # Initialize Neo4j schema
npm run neo4j:test        # Test Neo4j connection
```

### Running Single Tests
```bash
# Run specific test file
npx vitest run src/storage/__vitest__/Neo4jStorageProvider.test.ts

# Run tests matching pattern
npx vitest run --grep "temporal versioning"
```

## Architecture

### Core Components

**KnowledgeGraphManager** (`src/KnowledgeGraphManager.ts`)
- Central orchestrator for all graph operations
- Manages entities, relations, and observations
- Coordinates between storage provider, vector store, and embedding service
- Handles both file-based (deprecated) and database storage

**Neo4j Storage Layer** (`src/storage/neo4j/`)
- **Neo4jStorageProvider**: Main storage implementation with temporal versioning
- **Neo4jConnectionManager**: Connection pooling and session management
- **Neo4jSchemaManager**: Constraint and index management
- **Neo4jVectorStore**: Vector similarity search with Neo4j vector indexes
- **Neo4jConfig**: Configuration defaults and types

**MCP Server** (`src/server/`)
- **setup.ts**: Server initialization and tool registration
- **handlers/**: Tool handlers for MCP protocol (create_entities, add_observations, etc.)
- Standard input/output transport for Claude integration

**Embedding System** (`src/embeddings/`)
- **EmbeddingServiceFactory**: Creates OpenAI or mock embedding services
- **EmbeddingJobManager**: Async job queue for entity embedding generation
- **EmbeddingRateLimiter**: Token bucket rate limiting for OpenAI API

### Data Model

**Entities**: Nodes with name, type, observations, and optional embeddings
```typescript
{
  name: string;           // Unique identifier
  entityType: string;     // Category/classification
  observations: string[]; // Knowledge fragments
  embedding?: EntityEmbedding;
}
```

**Relations**: Directed edges between entities with temporal metadata
```typescript
{
  from: string;
  to: string;
  relationType: string;
  strength?: number;      // 0.0-1.0
  confidence?: number;    // 0.0-1.0
  metadata?: Record<string, unknown>;
}
```

**Temporal Versioning**: All entities and relations have temporal fields
```typescript
{
  id: string;             // UUID for version
  version: number;        // Incrementing version number
  validFrom: number;      // Timestamp when version became active
  validTo: number | null; // Timestamp when version was superseded (NULL = current)
  createdAt: number;      // Original creation timestamp
  updatedAt: number;      // Last modification timestamp
  changedBy: string | null;
}
```

### Critical Implementation Details

**BigInt Conversion (v1.0.5 Fix)**
Neo4j driver returns integers as BigInt. Always convert before arithmetic:
```typescript
// CORRECT
const newVersion = (currentNode.version ? Number(currentNode.version) : 0) + 1;

// WRONG - throws "Cannot mix BigInt and other types"
const newVersion = (currentNode.version || 0) + 1;
```

**Affected locations:**
- `Neo4jStorageProvider.ts:902` - addObservations entity versioning
- `Neo4jStorageProvider.ts:1211` - deleteObservations entity versioning
- `Neo4jStorageProvider.ts:1432` - updateRelation relation versioning

**Temporal Versioning Workflow**
When updating an entity/relation:
1. Query current version (WHERE validTo IS NULL)
2. Calculate newVersion with BigInt conversion
3. Mark old version as invalid (SET validTo = now)
4. Create new version with incremented version number
5. Recreate all relationships for new entity version

**Schema Constraint Requirement**
Neo4j database MUST have composite constraint for temporal versioning:
```cypher
CREATE CONSTRAINT entity_name
FOR (e:Entity)
REQUIRE (e.name, e.validTo) IS UNIQUE;
```

If database has old single-field constraint on `name` only, temporal versioning will fail with "Node already exists" error. See `docs/SCHEMA_CONSTRAINT_FIX.md` for diagnosis and fix instructions.

## Known Issues & Solutions

### Schema Constraint Issue
**Symptom**: `Node(X) already exists with label 'Entity' and property 'name' = '...'`
**Cause**: Database has single-field `Entity.name` constraint instead of composite `(name, validTo)`
**Fix**: See `docs/SCHEMA_CONSTRAINT_FIX.md` for complete instructions

### Integration Tests Require Neo4j
Tests in `src/storage/__vitest__/Neo4jIntegration.test.ts` require running Neo4j instance. These are skipped by default unless `TEST_INTEGRATION=true`.

### Environment Variables
Required for full functionality:
```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password
OPENAI_API_KEY=sk-...              # Optional: for real embeddings
OPENAI_EMBEDDING_MODEL=text-embedding-3-small  # Optional
```

## Testing Strategy

**Unit Tests**: Mock storage providers and services
**Integration Tests**: Require live Neo4j instance
**Test Location**: `src/**/__vitest__/*.test.ts`

Test files use Vitest with comprehensive mocking:
- Storage providers can be mocked or use real Neo4j
- Embedding service has mock implementation for testing
- File system operations mocked via `src/utils/fs.ts`

## Version History & Recent Bugfixes

### v1.0.5 (2025-10-17) - BigInt Version Arithmetic Fix

**Problem**: `Cannot mix BigInt and other types, use explicit conversions` error when using `add_observations`, `delete_observations`, or `update_relation` with migrated entities.

**Root Cause**: Neo4j driver returns integer fields (`version`, `createdAt`, `updatedAt`, `validFrom`, `validTo`) as JavaScript BigInt, not Number. Arithmetic operations like `(version || 0) + 1` fail because `||` doesn't convert BigInt to Number.

**Solution**: Applied explicit `Number()` conversion before arithmetic in 3 locations:
1. `Neo4jStorageProvider.ts:902` - `addObservations` entity version increment
2. `Neo4jStorageProvider.ts:1211` - `deleteObservations` entity version increment
3. `Neo4jStorageProvider.ts:1432` - `updateRelation` relation version increment

**Pattern Used**:
```typescript
// CORRECT - converts BigInt before arithmetic
const newVersion = (currentNode.version ? Number(currentNode.version) : 0) + 1;

// WRONG - throws error with BigInt values
const newVersion = (currentNode.version || 0) + 1;
```

**Testing**: 287 unit tests passing, BigInt arithmetic errors resolved.

**Status**: ✅ Published to npm, fully functional with temporal versioning

### v1.0.4 (2025-10-17) - BigInt CreatedAt Field Fix

**Problem**: Same BigInt conversion error, but only affecting `createdAt` field assignments.

**Solution**: Applied `Number()` conversion to 3 `createdAt` assignments:
1. Line 985: Entity creation with existing createdAt
2. Line 1026: Outgoing relation recreation during entity update
3. Line 1065: Incoming relation recreation during entity update

**Status**: ✅ Published to npm, but incomplete (missed version field arithmetic)

### Known Issue: Neo4j Schema Constraint

**Problem**: After fixing v1.0.5 BigInt issues, discovered separate schema constraint problem:
```
Neo4jError: Node(636) already exists with label 'Entity' and property 'name' = '...'
```

**Root Cause**: Database has old **single-field UNIQUE constraint** on `Entity.name` instead of required **composite constraint** on `(name, validTo)`.

**Why This Matters**:
- Temporal versioning creates multiple entity nodes with same name but different validTo timestamps
- Single-field constraint: Blocks all duplicate names (prevents temporal versioning)
- Composite constraint: Allows same name with different validTo values (enables temporal versioning)

**Example Valid State with Composite Constraint**:
```
Entity 1: name="Framework", validTo=NULL,        version=2  ← Current
Entity 2: name="Framework", validTo=1760713600,  version=1  ← Historical
```

**Solution**: Database-level constraint fix (NOT a code issue):
```cypher
DROP CONSTRAINT entity_name IF EXISTS;
CREATE CONSTRAINT entity_name
FOR (e:Entity)
REQUIRE (e.name, e.validTo) IS UNIQUE;
```

**Documentation**: Complete diagnosis and fix guide in `docs/SCHEMA_CONSTRAINT_FIX.md`

**Status**: ⚠️ Requires manual database update per installation

### Historical Context

**Original Implementation Issues**: Earlier versions of the codebase had JSON parsing errors and subprocess-based Neo4j operations causing failures.

**Key Improvements Made**:
- ✅ Direct `neo4j-driver` usage (no subprocess)
- ✅ Proper transaction management
- ✅ Parameterized queries
- ✅ Professional error handling
- ✅ Connection pooling

See `INVESTIGATION.md` for detailed technical analysis.

## Production Deployment

### Neo4j Docker Configuration (jp-vps-1)

**Current Production Setup:**
- Host: jp-vps-1 (Tailscale IP: 100.109.177.39)
- Container: neo4j-kg
- Neo4j Version: 5.26.13 LTS (community edition)
- Memory: 512M heap, 256M pagecache, 128M transaction max
- Database: 686 entities, 934 relations (as of 2025-10-20)

**Production Docker Run Command:**
```bash
docker run -d \
  --name neo4j-kg \
  --restart unless-stopped \
  -p 100.109.177.39:7474:7474 \
  -p 100.109.177.39:7687:7687 \
  -v neo4j-kg_neo4j_data:/data \
  -v neo4j-kg_neo4j_logs:/logs \
  -v /opt/neo4j-kg/backups:/backups \
  -e NEO4J_AUTH=neo4j/<password> \
  -e "NEO4J_PLUGINS=[\"apoc\"]" \
  -e NEO4J_db_checkpoint_interval_time=30s \
  -e NEO4J_server_memory_heap_initial__size=512M \
  -e NEO4J_server_memory_heap_max__size=512M \
  -e NEO4J_server_memory_pagecache_size=256M \
  -e NEO4J_db_memory_transaction_max=128M \
  neo4j:5.26-community
```

**Configuration Notes:**
- Environment variables use Neo4j 5.26 naming convention (updated 2025-10-20)
- Old deprecated settings (NEO4J_dbms_*) replaced with new format (NEO4J_db_*, NEO4J_server_*)
- Zero deprecation warnings in logs after configuration update
- Volumes preserve data across container recreations

**For upgrade procedures**, see [docs/UPGRADE.md](docs/UPGRADE.md) which covers:
- When and why to upgrade Neo4j versions
- Complete 5-phase upgrade procedure with go/no-go checkpoints
- Configuration management and deprecated settings migration
- Troubleshooting and rollback procedures
- Real-world example with verified commands

### Vector Embeddings Status

**Production Embeddings:**
- Generated: 2025-10-20
- Total entities embedded: 630 entities (99.8% of database)
- Failed: 1 entity (VECTOR KO - deleted, empty observations)
- Model: OpenAI text-embedding-3-small (1536 dimensions)
- Total cost: ~$0.0025 USD
- Status: ✅ Operational

**Semantic Search:**
- Method: `mcp__kg__semantic_search`
- Configuration: `limit=10`, `min_similarity=0.6` (default)
- Performance: Sub-second query responses
- Neo4j index: ONLINE (Enterprise feature not available in Community Edition, but embeddings stored)
- Fallback: Standard property search when vector index unavailable

**Usage Guidelines:**
- **Default**: Use `semantic_search` for exploration, discovery, natural language queries
- **Precision**: Use `search_nodes` for exact term lookups
- **Hybrid**: Start semantic → refine with keywords
- See AXIS.md v3.10.1 for complete KG Search Protocol

**Maintenance:**
- New entities: Embeddings generated via `npm run embeddings:generate`
- Test subset: `npm run embeddings:test` (processes 5 entities)
- Regenerate all: `npm run embeddings:generate -- --force`
- Cost per run: ~$0.02 per 1M tokens

## Critical Implementation Patterns

### BigInt Handling in Neo4j Operations

**All temporal fields from Neo4j are BigInt and require conversion**:
```typescript
// Temporal fields that are BigInt from Neo4j:
// - version, createdAt, updatedAt, validFrom, validTo

// ALWAYS convert before arithmetic or assignment
const version = currentNode.version ? Number(currentNode.version) : 0;
const createdAt = Number(currentNode.createdAt);
const validFrom = props.validFrom ? Number(props.validFrom) : null;
```

**Where to Apply Conversions**:
- Before arithmetic: `(value ? Number(value) : default) + 1`
- In assignments: `createdAt: Number(node.createdAt)`
- In comparisons: `timestamp > Number(node.validFrom)`

### Temporal Versioning Update Workflow

When any entity/relation changes (via `addObservations`, `deleteObservations`, `updateRelation`):

1. **Query current version** (WHERE validTo IS NULL)
2. **Calculate new version** with BigInt conversion
3. **Mark old version invalid** (SET validTo = now)
4. **Create new version** with incremented version
5. **Recreate relationships** pointing to new entity version

**Transaction boundaries are critical** - all 5 steps must succeed or rollback together.

See `CHANGELOG.md` for complete history.

## Publishing

Package is published to npm as `@henrychong-ai/mcp-neo4j-knowledge-graph`:
```bash
npm run build              # Build first
npm version patch          # Bump version
npm publish --access public
git push && git push --tags
```

**Pre-publish checklist:**
1. All tests passing
2. BigInt conversions verified
3. Schema constraints documented
4. CHANGELOG.md updated
5. Clear npx cache after publishing: `rm -rf ~/.npm/_npx/*/node_modules/@henrychong-ai`
