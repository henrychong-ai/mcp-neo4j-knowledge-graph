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

## Tech Stack

| Layer           | Technology                         |
| --------------- | ---------------------------------- |
| Runtime         | Node.js >=18 LTS                   |
| Language        | TypeScript 5.x (ES2022 target)     |
| Package Manager | pnpm 10.28.2                       |
| Database        | Neo4j 5.13+ (Community/Enterprise) |
| Protocol        | MCP SDK 1.x                        |
| Validation      | Zod 4.x                            |
| Embeddings      | OpenAI text-embedding-3-small      |
| Testing         | Vitest 4.x                         |
| Coverage        | @vitest/coverage-v8                |
| Linting         | ESLint 9 (strictTypeChecked)       |
| Formatting      | Prettier                           |
| Git Hooks       | Husky + lint-staged                |

## Getting Started

**First time setup?** See **[SETUP_AUTOMATION.md](SETUP_AUTOMATION.md)** for complete step-by-step instructions covering:

- Prerequisites (Node.js, Neo4j, Docker)
- Environment configuration
- MCP server installation
- Claude Desktop and Claude Code configuration
- First entity creation and verification
- Troubleshooting common issues

This guide ensures new users can get the MCP server running in 10-15 minutes.

## Development Commands

### Build & Development

```bash
pnpm run build              # TypeScript compilation + executable permissions
pnpm run dev               # Watch mode for development
pnpm run prepare           # Pre-publish build (runs automatically)
```

### Testing

```bash
pnpm test                  # Run all tests
pnpm run test:watch        # Watch mode
pnpm run test:verbose      # Detailed output
pnpm run test:coverage     # Coverage report
pnpm run test:integration  # Integration tests (requires Neo4j)
```

### Code Quality

```bash
pnpm run lint              # ESLint check
pnpm run lint:fix          # Auto-fix linting issues
pnpm run format            # Prettier formatting
pnpm run fix               # lint:fix + format
```

### Neo4j Setup

```bash
pnpm run neo4j:init        # Initialize Neo4j schema
pnpm run neo4j:test        # Test Neo4j connection
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
- Manages entities, relations, and observations via Neo4j storage provider
- Coordinates between storage provider, vector store, and embedding service

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

**Entities**: Nodes with name, type, domain, observations, and optional embeddings

```typescript
{
  name: string;           // Unique identifier
  entityType: string;     // Category/classification (lowercase-kebab-case)
  domain?: string | null; // Optional user-defined namespace for organization
  observations: string[]; // Knowledge fragments
  embedding?: EntityEmbedding;
}
```

**EntityType Convention**: Use `lowercase-kebab-case` format (e.g., `person`, `medical-condition`, `claude-code-skill`). No uppercase, spaces, or underscores.

**Domain Property**: Optional user-defined string for logical organization of entities:

- **Type**: Any string value (user-defined, e.g., `medical`, `work`, `personal`)
- **Default**: `null` (uncategorized)
- **Query behavior**: Omit domain parameter to query across all domains; specify domain to filter
- **Migration**: Existing entities without domain continue to work unchanged

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
  id: string; // UUID for version
  version: number; // Incrementing version number
  validFrom: number; // Timestamp when version became active
  validTo: number | null; // Timestamp when version was superseded (NULL = current)
  createdAt: number; // Original creation timestamp
  updatedAt: number; // Last modification timestamp
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

## CI/CD Pipeline

### GitHub Actions (`ci-cd.yml`)

| Job                | Trigger           | Node Versions    |
| ------------------ | ----------------- | ---------------- |
| **Build and Test** | All pushes, PRs   | 20.x, 22.x, 24.x |
| **Publish to npm** | Tags matching v\* | 24.x             |

**Build Job Steps:**

1. Checkout code
2. Install pnpm 10
3. Setup Node.js with pnpm cache
4. Install dependencies
5. Lint (`pnpm lint`)
6. Type check (`pnpm typecheck`)
7. Build project
8. Initialize Neo4j schema (service container)
9. Run tests
10. Run test coverage

**Publish Job:**

- **Trigger**: Only on version tags (e.g., `v1.12.3`)
- **Authentication**: OIDC (scoped packages @henrychong-ai/\* support automatic auth)
- **Version Check**: Tag must match `package.json` version

## Version History & Recent Bugfixes

### v1.13.0 (2026-02-02) - Tech Stack Modernization

**Major Tech Stack Updates:**

- Zod 4.x for runtime validation with comprehensive schemas (`src/schemas/index.ts`)
- ESLint 9 with strictTypeChecked configuration
- Vitest 4.x testing framework
- pnpm 10.28.2 package manager
- TypeScript ES2022 target with isolatedModules

**Dependency Updates:**

- @modelcontextprotocol/sdk 1.25.3
- @typescript-eslint/\* 8.54.0
- prettier 3.8.1
- All packages updated to latest minor/patch versions

**CI/CD Improvements:**

- Fixed flaky rate limiter timing test
- Adjusted coverage thresholds for CI environment variance

---

### v1.12.5 (2026-02-02) - Dependency Updates

**Updated to Latest Minor/Patch Versions:**

- @modelcontextprotocol/sdk: 1.25.2 → 1.25.3
- @stylistic/eslint-plugin: 5.7.0 → 5.7.1
- @typescript-eslint/\*: 8.53.0 → 8.54.0
- @vitest/coverage-v8: 4.0.17 → 4.0.18
- axios: 1.13.2 → 1.13.4
- eslint-plugin-sonarjs: 3.0.5 → 3.0.6
- lru-cache: 11.2.4 → 11.2.5
- prettier: 3.7.4 → 3.8.1
- typescript-eslint: 8.53.0 → 8.54.0
- vitest: 4.0.17 → 4.0.18

---

### v1.12.4 (2026-02-02) - Zod 4, ESLint strictTypeChecked, Dependency Updates

**Validation & Type Safety:**

- Added Zod 4.x for runtime input validation (`src/schemas/index.ts`)
- Comprehensive schemas for all MCP tool inputs (entities, relations, observations, search)
- Type-safe validation helpers with error handling

**ESLint strictTypeChecked Compliance:**

- Upgraded from `recommendedTypeChecked` to `strictTypeChecked`
- 13 rules set to 'warn' for gradual adoption (no-unsafe-\*, restrict-template-expressions, etc.)
- 6 rules disabled with documented justifications (no-unnecessary-condition, no-extraneous-class, etc.)
- Build passes with 0 errors, 1068 warnings for incremental improvement

**Dependency Updates:**

- Updated pnpm from 10.0.0 to 10.28.2 (latest stable)
- Updated TypeScript target from ES2020 to ES2022
- Updated Node.js engines from >=24 to >=18 (broader compatibility)
- Removed dead dependencies: hono, openai, ts-node, glob, rimraf, semver

**Security:**

- Resolved 5 Dependabot alerts by removing unused dependencies with vulnerabilities

---

### v1.12.3 (2026-01-31) - Lint Stack & Ironclad Stack Alignment

**Lint Stack Alignment:**

- Added `format:check` script for CI format validation
- Added `check` script combining lint + format:check + typecheck
- Created `.prettierignore` with comprehensive exclusion patterns
- Created `.vscode/settings.json` for format-on-save integration
- Added format:check step to CI/CD workflow
- Fixed pre-commit hook executable permissions
- Fixed Prettier formatting in 4 config files

**Ironclad Stack Compliance:**

- Updated `.nvmrc` to explicit version `24.13.0`
- Added `engine-strict=true` to `.npmrc`
- Added `packageManager` field to package.json (now pnpm@10.28.2)
- Added `isolatedModules: true` to tsconfig.json (ESM compatibility)
- Added `useUnknownInCatchVariables: true` to tsconfig.json (type safety)

**Coverage Thresholds:** Current thresholds (40-45%) are intentionally lower than ironclad standard (80%) as this is an existing codebase with incremental improvement planned. See vitest.config.ts for details.

---

### v1.12.2 (2026-01-31) - CI/CD Improvements

**Changes:**

- Expanded test matrix to Node 20.x, 22.x, 24.x
- Added lint and typecheck steps before build
- Publish uses Node 24.x (current LTS)
- Renamed workflow from `mcp-neo4j-knowledge-graph.yml` to `ci-cd.yml`

---

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

### Neo4j Docker Configuration (vps-2)

**Current Production Setup:**

- Host: vps-2 (Singapore VPS, 4C/12GB RAM)
- Container: neo4j-kg
- Neo4j Version: 5.26.13 LTS (community edition)
- Memory: 512M heap, 256M pagecache, 128M transaction max
- Database: 686 entities, 934 relations (as of 2025-10-20)

**Production Docker Run Command:**

```bash
docker run -d \
  --name neo4j-kg \
  --restart unless-stopped \
  -p 7474:7474 \
  -p 7687:7687 \
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
- Old deprecated settings (NEO4J*dbms*_) replaced with new format (NEO4J*db*_, NEO4J*server*\*)
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

**Automated Maintenance (v1.3.0+):**

- **Daily Cron**: Automatic incremental embedding generation at 3 AM Singapore time (19:00 UTC)
- **Method**: `EmbeddingJobManager.scheduleIncrementalRegeneration()`
- **Behavior**: Checks all entities, schedules jobs only for those missing embeddings
- **Execution**: Processed by existing 10-second job queue
- **Deployment**: Running on vps-2 production via systemd service `mcp-neo4j-kg.service`
- **Logging**: Info/debug logs in service journal (`journalctl -u mcp-neo4j-kg -f`)
- **Status**: Active since 2025-10-29

**Manual Maintenance:**

- On-demand generation: `pnpm run embeddings:generate`
- Test subset: `pnpm run embeddings:test` (processes 5 entities)
- Regenerate all: `pnpm run embeddings:generate -- --force`
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
pnpm run build              # Build first
pnpm version patch          # Bump version
pnpm publish --access public
git push && git push --tags
```

**Pre-publish checklist:**

1. All tests passing
2. BigInt conversions verified
3. Schema constraints documented
4. CHANGELOG.md updated
5. Clear npx cache after publishing: `rm -rf ~/.npm/_npx/*/node_modules/@henrychong-ai`
