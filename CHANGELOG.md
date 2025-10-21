# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.7] - 2025-10-21

### Changed

- **Dependency Updates**: Updated core dependencies for improved stability and security
  - @modelcontextprotocol/sdk: 1.11.0 → 1.20.1 (OAuth 2.1 framework, Streamable HTTP, bug fixes)
  - TypeScript: 5.8.2 → 5.9.3 (latest stable release)
  - Dev tooling: ESLint, Prettier, TypeScript ESLint, Vitest all updated to latest versions
  - Resolved 1 moderate security vulnerability in dev dependencies

### Technical Details

- **Dependencies Updated**:
  - Production: @modelcontextprotocol/sdk (1.20.1)
  - DevDependencies: typescript (5.9.3), eslint (9.38.0), prettier (3.6.2), @typescript-eslint/eslint-plugin (8.46.2), @typescript-eslint/parser (8.46.2), typescript-eslint (8.46.2), vitest (3.2.4), @vitest/coverage-v8 (3.2.4), eslint-config-prettier (10.1.8), eslint-plugin-prettier (5.5.4)
- **Security**: npm audit shows 0 vulnerabilities in production dependencies
- **Backward Compatibility**: All 293 unit tests passing, no breaking changes
- **MCP SDK Improvements**: OAuth 2.1 support, Streamable HTTP transport (replaces deprecated SSE), infinite recursion fix for 401 auth errors
- **Impact**: Improved security posture, future-proofing for MCP protocol evolution, enhanced type checking

## [1.1.6] - 2025-10-20

### Changed

- **Pre-Public Repository Cleanup**: Completed final documentation cleanup before public repository launch
  - Updated CONTRIBUTING.md to remove "Memento MCP" branding and legacy fork workflow instructions
  - Cleaned INVESTIGATION.md historical notes to remove "forked" language while preserving technical accuracy
  - Verified setup.test.ts already had correct assertions (no changes needed)
  - All remaining "gannonh" and "memento-mcp" references are appropriate (CHANGELOG history, README attribution, TODO documentation)

### Technical Details

- **Files Modified**:
  - `CONTRIBUTING.md` - Complete rewrite with updated repository URLs and branding
  - `INVESTIGATION.md` - Removed "forked" references, updated attribution language
- **Verification**: Comprehensive grep checks confirm only appropriate historical and attribution references remain
- **Status**: 14/14 pre-public cleanup items completed (9 from previous versions + 5 in this release)
- **Next Step**: Repository ready for public visibility

## [1.1.5] - 2025-10-20

### Added

- **Neo4j Version and Edition Detection**: Intelligent pre-flight checks for vector index compatibility
  - Added `getServerVersion()` method to query Neo4j Kernel version and edition
  - Filters specifically for 'Neo4j Kernel' component (avoids reading plugin versions like APOC)
  - Returns both version string (e.g., "5.13.0") and edition (enterprise/community)
  - Proactive Enterprise Edition detection with clear messaging for Community Edition users
  - Version-based feature detection prevents errors on older Neo4j installations

### Changed

- **Schema Initialization**: Enhanced `initializeSchema()` with comprehensive compatibility checks
  - Detects Community Edition and skips vector index creation with informative messages
  - Version detection prevents vector index attempts on Neo4j < 5.11
  - Warns about experimental support in Neo4j 5.11-5.12 (skips for stability)
  - Only attempts vector index creation on Neo4j 5.13+ Enterprise Edition
  - Improved error messages clearly explain why vector index was skipped
  - Graceful fallback ensures embeddings work regardless of Neo4j version/edition

### Technical Details

- **Files Modified**:
  - `src/storage/neo4j/Neo4jSchemaManager.ts` (lines 273-356)
  - `src/storage/__vitest__/neo4j/Neo4jSchemaManager.test.ts` (line 78)
- **New Method**: `getServerVersion()` queries `dbms.components()` with WHERE filter
- **Version Logic**:
  - < 5.11: Not supported (skip with message)
  - 5.11-5.12: Experimental (skip for stability)
  - 5.13+: Full support (attempt creation with try-catch)
- **Edition Logic**: Community Edition detected early, vector index skipped proactively
- **Validation**: Reviewed and approved by GPT-5-Codex (high reasoning) for production readiness
- **Impact**: Eliminates confusing vector index errors, provides clear user guidance
- **Tests**: All 293 unit tests passing (3 expected integration test failures)

### Fixed

- **HIGH**: Vector index creation no longer reads incorrect version from APOC or other plugins
- **MEDIUM**: Community Edition now detected proactively instead of relying on error handling
- **LOW**: Log messages clarified to indicate Neo4j 5.13+ requirement consistently

## [1.1.4] - 2025-10-20

### Changed

- **MCP Tool Descriptions**: Completed rebranding cleanup by removing remaining "Memento MCP" references
  - Updated all 18 MCP tool descriptions in `listToolsHandler.ts`
  - Changed "Memento MCP knowledge graph memory" → "knowledge graph"
  - Provides neutral, accurate tool descriptions
  - Completes branding transformation started in v1.1.0

### Technical Details

- **Files Modified**: `src/server/handlers/listToolsHandler.ts`, `src/cli/neo4j-setup.ts`
- **Tool Descriptions Updated**: 18 MCP operations (create_entities, create_relations, add_observations, delete_entities, delete_observations, delete_relations, get_relation, update_relation, read_graph, search_nodes, open_nodes, semantic_search, get_entity_embedding, get_entity_history, get_relation_history, get_graph_at_time, get_decayed_graph, force_generate_embedding, debug_embedding_config)
- **Impact**: MCP clients now see consistent, professional tool descriptions without legacy branding
- **Tests**: All 290 unit tests passing

## [1.1.3] - 2025-10-20

### Added

- **Schema Constraint Detection**: Automatic detection of conflicting Neo4j constraints during schema initialization
  - Detects old single-field `Entity.name` constraints that block temporal versioning
  - Provides clear warnings about constraint conflicts with actionable guidance
  - Auto-cleanup with `recreate=true` flag automatically removes conflicting constraints
  - Prevents schema issues that previously caused "Node already exists" errors

### Changed

- **Neo4jSchemaManager**: Enhanced `createEntityConstraints()` method with defensive programming
  - Added constraint conflict detection using existing `listConstraints()` method
  - Warns users about conflicting constraints before attempting schema operations
  - Leverages existing `dropConstraintIfExists()` method for safe cleanup
  - Improved user experience with clear, actionable error messages

### Technical Details

- **File Modified**: `src/storage/neo4j/Neo4jSchemaManager.ts`
- **Method Enhanced**: `createEntityConstraints()` (lines 102-164)
- **Detection Logic**: Filters Entity label constraints containing 'name' property
- **Compatibility**: Handles both 'labelsOrTypes' and 'entityType' field names across Neo4j versions
- **Impact**: Proactively prevents temporal versioning failures from schema misconfigurations

## [1.1.2] - 2025-10-20

### Changed

- **Repository Model**: Reverted to private GitHub repository with public npm package
  - Removed `--provenance` flag from publish workflow (requires public repos)
  - Maintained automated OIDC publishing to npm (fully functional with private repos)
  - GitHub Actions automated publish continues to work seamlessly

### Documentation

- **README.md**: Updated to reflect private repository + public npm package model
  - Removed git clone instructions from "Local Development" section
  - Replaced "Building and Development" with "Package Information" section
  - Added clear explanation that source code is private, npm package is public
  - Clarified that compiled code, docs, and type definitions available via npm
  - Updated installation instructions to focus on npm

### Technical Details

- **Repository Status**: Private on GitHub, public on npm
- **Published Package**: @henrychong-ai/mcp-neo4j-knowledge-graph
- **Automated Publishing**: Continues via GitHub Actions with OIDC authentication
- **Users**: Full functionality available via npm, source code remains private

## [1.1.1] - 2025-10-20

### Fixed

- **Critical MCP Response Bug**: Fixed empty observations array returned via MCP tools for migrated entities
  - Root cause: `nodeToEntity()` didn't handle array-type observations from Neo4j
  - Data existed in database but MCP server returned empty arrays to clients
  - Added array type handling alongside existing string (JSON) parsing
  - Affected 637 migrated entities (changedBy='migration_script_20251017')

- **Neo4j Integer Conversion Bug**: Fixed Neo4j Integer objects appearing as `{low, high}` in MCP responses
  - Added `convertNeo4jInt()` helper method for safe Integer-to-number conversion
  - Fixed `nodeToEntity()`: version, createdAt, updatedAt, validFrom, validTo fields
  - Fixed `relationshipToRelation()`: createdAt, updatedAt, strength, confidence fields
  - MCP clients now receive proper JavaScript numbers instead of driver Integer objects

### Changed

- Enhanced `nodeToEntity()` method with comprehensive type handling for observations
- Improved `relationshipToRelation()` method with explicit Neo4j Integer conversion
- All temporal and numeric fields now properly converted before returning to MCP clients

### Technical Details

- **Files Modified**: `src/storage/neo4j/Neo4jStorageProvider.ts`
- **Methods Updated**: `nodeToEntity()`, `relationshipToRelation()`, added `convertNeo4jInt()`
- **Impact**: All entity and relation retrieval operations now return correct data types
- **Testing**: Fix validated by Codex code review (gpt-5-codex high reasoning)

## [1.1.0] - 2025-10-19

### Changed

- **Project Identity Transformation**: Transitioned from fork narrative to independent maintained project
  - Updated all documentation to reflect maintenance by Henry Chong
  - Removed "fork" language while preserving proper attribution
  - Professional standalone project identity established

### Breaking Changes

- **MCP Server Metadata**: Server name changed from 'memento-mcp' to 'mcp-neo4j-knowledge-graph'
  - MCP server publisher changed from 'gannonh' to 'henrychong-ai'
  - Users with existing Claude Desktop configs will need to update server name references
  - This change provides clearer identity and prevents namespace conflicts

### Added

- **Dual Copyright**: Added Henry Chong copyright to LICENSE for enhancements and maintenance
  - Preserves original Gannon Hall copyright (MIT license requirement)
  - Contributors field added to package.json with proper attribution

### Removed

- **Branding Cleanup**: Removed Memento MCP branding and legacy references
  - Deleted memento-logo.svg, memento-logo-themed.svg, memento-logo-gray.svg
  - Removed fork-specific documentation sections
  - Updated all package descriptions and metadata

### Documentation

- **README.md**: Complete transformation with professional opening and acknowledgments section
- **CLAUDE.md**: Reframed project overview from fork to maintained package
- **CHANGELOG.md**: Updated project references and v1.0.0 entry
- **package.json**: Updated author, added contributors, refined description
- **Source Code**: Updated server name, publisher, and mock model names throughout

### Technical Details

- **Files Modified**: 11 source/documentation files updated
- **Tests**: All 287 unit tests passing
- **Build**: Clean compilation with no errors
- **Verification**: Grep validation confirms proper attribution preserved

## [1.0.6] - 2025-10-19

### Changed

- **Automated npm Publishing**: Enabled automated publishing via GitHub Actions on push to main branch
- **OIDC Trusted Publishing**: Migrated from access tokens to OpenID Connect authentication
  - Eliminated 90-day token rotation requirement
  - Enhanced security with ephemeral tokens (~1 hour expiration)
  - Added cryptographic build provenance via `--provenance` flag
  - Removed NPM_TOKEN secret dependency from GitHub Actions
- **Workflow Improvements**: Fixed package name references and added semver dependency for version comparison

### Infrastructure

- Added `permissions.id-token: write` to GitHub Actions publish job for OIDC
- Configured npm Trusted Publisher for GitHub Actions authentication
- Updated publish command to include `--provenance --access public`
- Added `semver` to devDependencies for automated version comparison

### Documentation

- Updated TODO.md with completed automation tasks and OIDC migration details
- Simplified publishing workflow documentation (now fully automated)

## [1.0.5] - 2025-10-17

### Fixed

- **Critical BigInt Conversion Bug in Temporal Versioning**: Fixed `Cannot mix BigInt and other types` error in version arithmetic operations
  - Fixed `Neo4jStorageProvider.ts:902` - addObservations entity version increment
  - Fixed `Neo4jStorageProvider.ts:1211` - deleteObservations entity version increment
  - Fixed `Neo4jStorageProvider.ts:1432` - updateRelation relation version increment
- Applied correct pattern: `(value ? Number(value) : 0) + 1` instead of `(value || 0) + 1`
- All 287 unit tests passing with temporal versioning fully functional

### Documentation

- Added comprehensive BigInt conversion documentation in CLAUDE.md
- Created schema constraint fix guide: `docs/SCHEMA_CONSTRAINT_FIX.md`
- Documented temporal versioning workflow and implementation patterns

## [1.0.4] - 2025-10-17

### Fixed

- **Partial BigInt Conversion Fix**: Applied Number() conversion to createdAt field assignments
  - Fixed line 985: Entity creation with existing createdAt
  - Fixed line 1026: Outgoing relation recreation during entity update
  - Fixed line 1065: Incoming relation recreation during entity update

### Known Issues

- Version arithmetic still had BigInt conversion issues (fixed in v1.0.5)

## [1.0.3] - 2025-10-17

### Changed

- Version bump for npm publication

## [1.0.2] - 2025-10-17

### Added

- Backward compatibility for legacy entities without temporal versioning

## [1.0.1] - 2025-10-17

### Fixed

- JSON parsing bug in addObservations and deleteObservations handlers

## [1.0.0] - 2025-10-17

### Changed

- **Initial Publication**: Published as @henrychong-ai/mcp-neo4j-knowledge-graph under maintenance by Henry Chong
- Fixed npm scope from @henrychong to @henrychong-ai to match npm username
- Built on foundational work by Gannon Hall with bug fixes and active maintenance

## [0.3.9] - 2025-05-08

### Changed

- Updated dependencies to latest versions:
  - @modelcontextprotocol/sdk from 1.8.0 to 1.11.0
  - axios from 1.8.4 to 1.9.0
  - dotenv from 16.4.7 to 16.5.0
  - eslint from 9.23.0 to 9.26.0
  - eslint-config-prettier from 10.1.1 to 10.1.3
  - glob from 11.0.1 to 11.0.2
  - openai from 4.91.1 to 4.97.0
  - tsx from 4.19.3 to 4.19.4
  - typescript from 5.8.2 to 5.8.3
  - vitest and @vitest/coverage-v8 from 3.1.1 to 3.1.3
  - zod from 3.24.2 to 3.24.4
  - @typescript-eslint/eslint-plugin and @typescript-eslint/parser from 8.29.0 to 8.32.0

## [0.3.8] - 2025-04-01

### Added

- Initial public release
- Knowledge graph memory system with entities and relations
- Neo4j storage backend with unified graph and vector storage
- Semantic search using OpenAI embeddings
- Temporal awareness with version history for all graph elements
- Time-based confidence decay for relations
- Rich metadata support for entities and relations
- MCP tools for entity and relation management
- Support for Claude Desktop, Cursor, and other MCP-compatible clients
- Docker support for Neo4j setup
- CLI utilities for database management
- Comprehensive documentation and examples

### Changed

- Migrated storage from SQLite + Chroma to unified Neo4j backend
- Enhanced vector search capabilities with Neo4j's native vector indexing
- Improved performance for large knowledge graphs

## [0.3.0] - [Unreleased]

### Added

- Initial beta version with Neo4j support
- Vector search integration
- Basic MCP server functionality

## [0.2.0] - [Unreleased]

### Added

- SQLite and Chroma storage backends
- Core knowledge graph data structures
- Basic entity and relation management

## [0.1.0] - [Unreleased]

### Added

- Project initialization
- Basic MCP server framework
- Core interfaces and types
