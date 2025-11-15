# TODO - Outstanding Tasks

## 🚨 Critical Priority

*(No critical priority items - all clear!)*

---

## 🚀 High Priority

### Complete Temporal History Tests

**Goal**: Implement the 5 skipped temporal versioning tests

**Status**: ⏳ **NOT STARTED** - Technical debt in test suite

**Problem**: Five tests in temporal history test files are currently stubbed with TODO comments:
- `src/storage/__vitest__/neo4j/Neo4jEntityHistoryTimestampConsistency.test.ts:121` - Timestamp consistency with delays
- `src/storage/__vitest__/neo4j/Neo4jEntityHistoryTimestampConsistency.test.ts:125` - Timestamp consistency with rapid operations
- `src/storage/__vitest__/neo4j/Neo4jEntityHistoryTracking.test.ts:118` - Entity update history
- `src/storage/__vitest__/neo4j/Neo4jEntityHistoryTracking.test.ts:122` - Entity creation timestamp
- `src/storage/__vitest__/neo4j/Neo4jEntityHistoryTracking.test.ts:126` - Version chain test

**Solution**:
- Implement Neo4j-specific versions of these tests
- Ensure temporal versioning logic is fully tested
- Validate timestamp consistency across operations

**Impact**: Improved test coverage and confidence in temporal versioning system

---

## 🏗️ Infrastructure & CI/CD

### Branch Testing & Preview Deployments

**Goal**: Enable testing of branches before merging to main to prevent production issues

**Status**: ⏳ **NOT STARTED** - Critical after v1.2.1 release

**Problem**: Currently we merge to main → publish to npm → discover issues. Need ability to test branches in production-like environments before merging.

**Solution Components**:

1. **Branch Build & Test Automation**:
   - GitHub Actions workflow for pull requests
   - Run full test suite on every branch push
   - Build package and verify no errors
   - Report test results in PR comments

2. **Preview NPM Packages** (Optional):
   - Publish branch builds to npm with alpha/beta tags
   - Example: `@henrychong-ai/mcp-neo4j-knowledge-graph@1.2.1-alpha.1`
   - Test in real Claude Desktop/Code environments
   - Clean up preview packages after merge/close

3. **Automated Testing Checklist**:
   - [ ] Unit tests (existing 333 tests)
   - [ ] Integration tests with Neo4j (currently manual)
   - [ ] Build verification (TypeScript compilation)
   - [ ] Package size check (detect bloat)
   - [ ] Dependency security audit

**Implementation Phases**:
1. Add `.github/workflows/pull-request.yml` workflow
2. Configure test reporting and status checks
3. Optional: Add preview package publishing
4. Document testing process in CONTRIBUTING.md

---

### Cloud Testing Environments

**Goal**: Set up cloud-based Neo4j instances for testing in Claude Code web and Codex web

**Status**: ⏳ **NOT STARTED** - Needed for comprehensive testing

**Problem**: Current testing limited to local Neo4j. Need cloud environments to test:
- Claude Code web (browser-based, different networking)
- Codex web (different authentication, environment)
- Public internet accessibility
- Production-like configurations

**Solution Options**:

1. **Neo4j Aura (Managed Cloud)**:
   - Free tier: 200K nodes, 400K relationships
   - Always-on, no Docker required
   - Test connectivity from web environments
   - Production-like performance characteristics

2. **VPS-Hosted Neo4j** (Current vps-2 production):
   - Full control over configuration
   - Already have vps-2 with Neo4j 5.26
   - Can create test database alongside production
   - Tailscale access or public endpoint

3. **Docker Cloud Environments**:
   - Fly.io, Railway, Render
   - On-demand Neo4j instances
   - Good for ephemeral testing
   - Cost: ~$5-10/month per instance

**Testing Matrix**:
```
Environment          | Neo4j Location    | Test Type
---------------------|-------------------|---------------------------
Local Claude Code    | Local Docker      | Development ✅
Local Claude Desktop | Local Docker      | Development ✅
Claude Code Web      | Neo4j Aura        | Production-like ⏳
Codex Web           | Neo4j Aura        | Integration ⏳
CI/CD Pipeline      | GitHub Actions    | Automated ⏳
```

**Implementation Steps**:
1. Set up Neo4j Aura free instance
2. Document connection configuration
3. Test from Claude Code web environment
4. Test from Codex web environment
5. Create testing playbook
6. Add cloud testing to SETUP.md

**Configuration Example**:
```bash
# Cloud Neo4j Aura
NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=secure_cloud_password
OPENAI_API_KEY=sk-proj-...
```

---

## 🔧 Medium Priority

*(No pending medium priority items)*

---

## ✅ Completed

### v1.7.1 Optional KG Usage Instructions (2025-11-07)

**Status**: ✅ **MERGED AND RELEASED** - Published to npm

**Implementation**:
- SETUP_AUTOMATION.md now offers to add Knowledge Graph usage instructions to user's `~/.claude/CLAUDE.md` file
- Three instruction variants: full (with semantic_search), commented (semantic_search as examples), minimal (search_nodes only)
- Automatic backup of existing CLAUDE.md file before modification
- Includes "kg" abbreviation definition and triggerword explanation
- Best practices for semantic_search vs search_nodes usage
- Sanitized, generic examples suitable for all users

**Files Changed**:
- `SETUP_AUTOMATION.md` - Section 8.3 added
- `CHANGELOG.md` - v1.7.1 entry

---

### v1.7.0 Automated Setup with Claude Code (2025-11-07)

**Status**: ✅ **MERGED AND RELEASED** - Published to npm

**Implementation**:
- Complete interactive setup automation via SETUP_AUTOMATION.md
- 596-line guide optimized for Claude Code interpretation
- Prerequisites check (Node.js ≥20.0.0, Docker)
- Neo4j setup (Docker or local installation paths)
- Automatic ~/.claude.json configuration with backup
- Optional Claude Desktop setup
- Critical restart instructions (/exit → claude --continue)
- Verification and testing workflows
- Setup summary file generation

**Files Changed**:
- `SETUP_AUTOMATION.md` - New file
- `README.md` - Quick Start section added
- `package.json` - Added SETUP_AUTOMATION.md to files array
- `CHANGELOG.md` - v1.7.0 entry

---

### v1.6.0 Batch Operations API (2025-11-06)

**Status**: ✅ **MERGED AND RELEASED** - Published to npm

**Implementation**:
- **New MCP Tools**: `create_entities_batch`, `create_relations_batch`, `add_observations_batch`, `update_entities_batch`
- **Performance**: 10-50x faster than individual operations for large datasets
- **Optimized UNWIND Operations**: True bulk operations using Neo4j UNWIND
- **Embedding Integration**: Automatic embedding generation for batch operations
- **Transaction Safety**: Automatic rollback on failures with per-item error tracking
- **Configuration Options**: maxBatchSize, enableParallel, onProgress callback

**Technical Implementation**:
- Storage layer: 4 new batch methods with UNWIND operations (~450 lines)
- Knowledge Graph Manager: Validation, orchestration, embedding integration (~240 lines)
- MCP Tool Handlers: 4 new handler files
- Full 5-phase production readiness implementation

**Files Changed**:
- `src/storage/neo4j/Neo4jStorageProvider.ts` - Batch methods
- `src/KnowledgeGraphManager.ts` - Batch wrappers and validation
- `src/server/handlers/toolHandlers/*.ts` - 4 new handler files
- `src/server/handlers/listToolsHandler.ts` - Tool registration
- `src/server/handlers/callToolHandler.ts` - Tool routing
- `README.md` - Batch API documentation
- `CHANGELOG.md` - v1.6.0 entry

**Testing**: Comprehensive validation and error handling

---

### v1.5.0 Query Result Caching (2025-11-05)

**Status**: ✅ **MERGED AND RELEASED** - Published to npm

**Implementation**:
- LRU cache for semantic search query results
- 500 unique queries cached with 5-minute TTL
- 10K entity limit across all cached results
- Sub-millisecond response for repeated queries
- Automatic cache invalidation on mutations
- Prometheus metrics integration (cache hits/misses)

**Documentation**:
- README.md updated with v1.2.0-v1.5.0 features
- Added "What's New" section with all recent releases
- Comprehensive Hybrid Retrieval System documentation
- Automated Embedding Generation section
- Query Result Caching section
- Updated semantic_search tool parameters

**Files Changed**:
- `src/storage/neo4j/Neo4jStorageProvider.ts` (+150/-21)
- `README.md` (+193/-7)
- `CHANGELOG.md` (+57 lines)
- `package.json` (v1.5.0)

**Testing**: 334 unit tests passing

---

### v1.4.0 Prometheus Metrics Integration (2025-11-05)

**Status**: ✅ **MERGED TO MAIN** - Feature branch archived

**Implementation**:
- Production-grade observability for MCP server
- HTTP metrics endpoint on port 9091
- Query performance tracking (loadGraph, searchNodes, semanticSearch)
- Cache metrics (hits, misses, invalidations)
- Default Node.js process metrics

**Branch**: Merged and deleted

---

### v1.3.1 Test Fixes - CI/Build Unblocked (2025-10-30)

**Status**: ✅ **COMPLETED** - Released to npm and fully operational

**Goal**: Fix v1.2.0 technical debt blocking GitHub Actions CI and npm publishing

**Problem**: Starting with v1.2.0 (hybrid retrieval system), 5 tests began failing in CI:
- 1 failure in ConnectionStrengthScorer.test.ts
- 4 failures in TemporalFreshnessScorer.test.ts
- Blocked 3 versions from publishing: v1.2.0, v1.2.1, v1.3.0
- Last successful publish was v1.1.7 (9 days ago)

**Root Causes**:
1. **ConnectionStrengthScorer**: Test expected "2/3 strong" but all 3 relations (0.9, 0.8, 0.7) met >= 0.7 threshold
2. **TemporalFreshnessScorer**: Test expectations didn't match actual scoring formula: `validityScore * 0.4 + recencyScore * 0.6`

**Solution**: Fixed test expectations (no functional code changes):
- ConnectionStrengthScorer.test.ts:115 - Changed "2/3 strong" → "3/3 strong"
- TemporalFreshnessScorer.test.ts - Fixed 4 floating-point precision assertions

**Impact**:
- ✅ All 340 unit tests passing (up from 335)
- ✅ GitHub Actions CI unblocked
- ✅ npm publishing restored (v1.3.1 successfully published)
- ✅ Jumped from v1.1.7 → v1.3.1 (first publish in 9 days)

**Files Modified**:
- `src/retrieval/__vitest__/ConnectionStrengthScorer.test.ts`
- `src/retrieval/__vitest__/TemporalFreshnessScorer.test.ts`
- `package.json` (version bump)
- `CHANGELOG.md` (comprehensive documentation)

---

### v1.3.0 Daily Embedding Automation (2025-10-29)

**Status**: ✅ **COMPLETED** - Running in production on vps-2

**Goal**: Automated incremental vector embedding regeneration to keep semantic search accuracy high without manual intervention

**Solution Implemented**:
- **Daily Cron Schedule**: Runs at 3 AM Singapore time (19:00 UTC)
- **Incremental Regeneration**: `EmbeddingJobManager.scheduleIncrementalRegeneration()`
- **Smart Processing**: Checks all entities, schedules jobs only for those missing embeddings
- **Existing Infrastructure**: Integrates with existing 10-second job processor
- **Production Deployment**: Running on vps-2 via systemd service `mcp-neo4j-kg.service`

**Implementation**:
- `src/index.ts:140-166` - Cron schedule setup
- `src/embeddings/EmbeddingJobManager.ts:780-857` - Incremental regeneration method
- Dependencies: node-cron@^3.0.3, @types/node-cron@^3.0.11
- Logging: Comprehensive info/debug logs via `journalctl -u mcp-neo4j-kg -f`

**Impact**:
- ✅ Automatic embedding for new entities
- ✅ No manual intervention needed
- ✅ Maintains >95% embedding coverage
- ✅ First run: 2025-10-30 03:00 SGT

**Note**: While this was technically released as v1.3.0, that version was blocked from npm publishing due to CI test failures. The feature was included in v1.3.1 release.

---

### Hybrid Retrieval System (2025-10-21)

**Status**: ✅ **COMPLETED** - Fully implemented and tested

**Goal**: Improve context relevance by combining vector similarity with graph structure and metadata

**What Was Delivered**:
- **Four Specialized Scorers** (`src/retrieval/scorers/`):
  - VectorSimilarityScorer: Cosine similarity from embeddings
  - GraphTraversalScorer: Graph centrality and connectivity analysis
  - TemporalFreshnessScorer: Recency with exponential decay (30-day half-life)
  - ConnectionStrengthScorer: Relation quality and diversity

- **HybridRetriever Orchestrator** (`src/retrieval/HybridRetriever.ts`):
  - Weighted scoring pipeline with configurable weights
  - Parallel scorer execution for performance
  - Score transparency with optional debug mode
  - Default weights: 50% vector, 20% graph, 15% temporal, 15% connection

- **Neo4j Integration** (`src/storage/neo4j/Neo4jStorageProvider.ts`):
  - Seamlessly integrated into existing semanticSearch method
  - Helper methods: getEntityRelations, getAllEntities, getAllRelations
  - Enabled by default with graceful fallback
  - Full backward compatibility

- **MCP Tool Enhancement** (`src/server/handlers/callToolHandler.ts`):
  - Extended semantic_search tool with hybrid configuration
  - Supports custom weights and decay parameters
  - Optional debug mode for score breakdowns

**Testing**: 57 comprehensive unit tests across 6 test files
- VectorSimilarityScorer.test.ts (12 tests)
- GraphTraversalScorer.test.ts (10 tests)
- TemporalFreshnessScorer.test.ts (12 tests)
- ConnectionStrengthScorer.test.ts (11 tests)
- HybridRetriever.test.ts (8 tests)
- HybridRetrieval.integration.test.ts (4 tests)

**Documentation**: Complete guide at `docs/HYBRID_RETRIEVAL.md`
- Architecture overview with detailed explanations
- Scoring formula breakdowns with examples
- Configuration options and use case profiles
- Performance tuning recommendations
- Troubleshooting guide

**Impact**:
- Dramatically improved AI response accuracy by combining semantic similarity with graph structure, temporal freshness, and connection quality
- 16 new files, 2,319 lines of code
- ~100-300ms per query overhead
- Tested with 10,000+ entity graphs

**Branch**: `claude/hybrid-retrieval-system-011CULBPoNLTTXub5UgHf4Up`

---


### Pre-Public Repository Cleanup (2025-10-20, v1.1.6)

**Status**: ✅ **COMPLETED** - All 14/14 cleanup items finished

**Goal**: Transition from "fork narrative" to "maintained by Henry Chong" identity while maintaining MIT license compliance.

**Timeline**: Complete cleanup → Release v1.0.7 → Make repository public

**License Decision** ⚖️

**✅ CONFIRMED: MIT License (Dual Copyright)**

Keeping the original MIT license with dual copyright for your enhancements.

**MUST KEEP** (Legal Requirement):
- `LICENSE` file with Gannon Hall's copyright notice (line 3)
- This is **non-negotiable** under MIT license terms

**MUST ADD** (Dual Copyright):
- Add Henry Chong copyright to LICENSE for modifications:
  ```
  Copyright (c) 2025 Gannon Hall
  Copyright (c) 2025 Henry Chong (enhancements and maintenance)
  ```

**Benefits:**
- ✅ Maximum adoption in npm ecosystem
- ✅ Clear MIT license compliance
- ✅ Simple legal framework
- ✅ MCP ecosystem standard
- ✅ Fork-friendly for community

**Comprehensive Cleanup Checklist**

**Documentation Files**:

1. **README.md** (HIGH IMPACT)
   - ❌ Remove: Fork notice section (lines 11-76)
   - ❌ Remove: GitHub Actions badge pointing to gannonh's repo (line 7)
   - ❌ Remove: "Memento MCP" branding
   - ❌ Remove: Comparative language ("this fork instead of upstream")
   - ✅ Add: Professional opening establishing Henry Chong as maintainer
   - ✅ Add: Acknowledgments section at bottom crediting Gannon Hall
   - ✅ Update: All URLs from `gannonh/memento-mcp` to `henrychong-ai/mcp-neo4j-knowledge-graph`

   **Suggested Opening**:
   ```markdown
   # Neo4j Knowledge Graph MCP Server

   Scalable, high-performance knowledge graph memory system with semantic retrieval,
   contextual recall, and temporal awareness. Provides any LLM client supporting MCP
   with resilient, adaptive, and persistent long-term ontological memory.

   **Maintained by** [Henry Chong](https://github.com/henrychong-ai)
   **Built on foundational work by** [Gannon Hall](https://github.com/gannonh)
   ```

2. **CLAUDE.md**
   - Update: Change "fork of @gannonh/memento-mcp" references
   - Reframe: Present as maintained package with original attribution
   - Keep: Technical bug fix documentation (accurate history)

3. **CHANGELOG.md**
   - Keep: All historical entries (accurate record)
   - Update: v1.0.0 entry to mention original work without "fork" language

4. **INVESTIGATION.md**
   - Keep as-is OR move to `docs/` directory (historical documentation)

5. **CONTRIBUTING.md**
   - Review and update contribution guidelines for new identity

**Package Metadata**:

6. **package.json**
   - Current: `"author": "Gannon Hall (original), Henry Chong (fork maintainer)"`
   - Update to: `"author": "Henry Chong <henry@henrychong.ai>"`
   - Add: `"contributors": ["Gannon Hall <gannon@example.com> (original author)"]`
   - Update: `"description"` to remove "fork" language
   - Update: `"homepage"` and repository URLs (already correct)

**Source Code Files**:

7. **src/server/setup.ts** (lines 17, 20)
   ```typescript
   // Change from:
   name: 'memento-mcp',
   publisher: 'gannonh',

   // To:
   name: 'mcp-neo4j-knowledge-graph',
   publisher: 'henrychong-ai',
   ```

8. **src/server/__vitest__/setup.test.ts** (lines 13, 16, 108, 111)
   - Update test assertions to match new metadata

9. **src/embeddings/DefaultEmbeddingService.ts** (line 24)
   ```typescript
   // Change from:
   modelName = 'memento-mcp-mock',

   // To:
   modelName = 'mcp-neo4j-knowledge-graph-mock',
   ```

10. **src/cli/cli-README.md** (line 105)
    - Update path reference from `memento-mcp` to actual package name

**Branding Assets**:

11. **assets/** directory
    - `memento-logo.svg` - Remove or replace
    - `memento-logo-themed.svg` - Remove or replace
    - `memento-logo-gray.svg` - Remove or replace (used in README line 3)

    **Options**:
    - A) Remove all logos, use text-only README header
    - B) Create custom Neo4j KG branding
    - C) Use simple Neo4j graph icon

**Testing & Verification**:

12. **Before Publishing v1.0.7**:
    ```bash
    # Verify all tests pass
    npm test

    # Verify build succeeds
    npm run build

    # Search for remaining references
    grep -r "gannonh" . --exclude-dir=node_modules --exclude-dir=.git
    grep -r "memento-mcp" . --exclude-dir=node_modules --exclude-dir=.git
    grep -r "Gannon Hall" . --exclude-dir=node_modules --exclude-dir=.git

    # Allowed results: LICENSE file only
    ```

**Post-Cleanup Actions**:

13. **Release v1.0.7**:
    - Update CHANGELOG.md with cleanup changes
    - Bump version: `npm version minor`
    - Test OIDC publish (without provenance, repo still private)
    - Verify package works correctly

14. **Make Repository Public**:
    - Review all files one final time
    - Settings → Change visibility to Public
    - Add back `--provenance` flag to workflow
    - Monitor npm package page and GitHub repo

**Files Summary**:

| File | Action | MIT Compliance |
|------|--------|----------------|
| LICENSE | Add Henry's copyright | Required: Keep Gannon's |
| README.md | Remove fork narrative | Optional: Credit in acknowledgments |
| CLAUDE.md | Reframe identity | Optional |
| package.json | Update metadata | Optional: Add contributors field |
| setup.ts | Update server name/publisher | Optional |
| setup.test.ts | Update test assertions | Optional |
| DefaultEmbeddingService.ts | Update mock model name | Optional |
| assets/* | Remove/replace logos | Optional (not copyrighted) |

**Expected Outcome**:
Professional standalone project identity with proper attribution to original work, full MIT license compliance, and clean public repository suitable for open-source community.

---

### Neo4j Vector Index Compatibility Enhancement (2025-10-20, v1.1.5)
- ✅ **Intelligent version and edition detection** for vector index compatibility
  - Added `getServerVersion()` method querying Neo4j Kernel component specifically
  - Filters for 'Neo4j Kernel' to avoid reading APOC or plugin versions
  - Returns both version string and edition (enterprise/community)
  - Proactive Enterprise Edition detection with clear messaging
- ✅ **Enhanced schema initialization** with comprehensive compatibility checks
  - Detects Community Edition early and skips vector index with informative message
  - Version-based feature detection for Neo4j 5.11, 5.12, 5.13+
  - Clear explanations when vector index is skipped
  - Graceful fallback ensures embeddings work on all Neo4j versions/editions
- ✅ **Production validation** by GPT-5-Codex (high reasoning)
  - Fixed HIGH: Kernel-specific component filtering
  - Fixed MEDIUM: Proactive edition detection
  - Fixed LOW: Clarified log messaging
- ✅ **Files modified**: `Neo4jSchemaManager.ts` (lines 273-356), test updated
- ✅ **Tests**: All 293 unit tests passing

### OIDC npm Publishing (2025-10-19)
- ✅ **GitHub Actions workflow configured** for automated npm publishing
  - Fixed package name in version comparison
  - Added `--access public` flag for scoped package
  - Added `semver` to devDependencies for version comparison
  - Enabled publish job to run on main branch pushes
- ✅ **OIDC Trusted Publishing** fully operational
  - Added `permissions.id-token: write` to workflow
  - Removed NPM_TOKEN secret dependency (no token rotation needed)
  - Removed `--provenance` flag (requires public repo, added to future plans)
  - **Status**: Publishing successfully via OIDC authentication

### Schema Constraint Detection (2025-10-20, v1.1.3)
- ✅ **Automatic conflict detection** in `Neo4jSchemaManager.ts`
  - Checks for conflicting Entity constraints on 'name' property
  - Warns about single-field constraints that block temporal versioning
  - Auto-cleanup with `recreate=true` flag
  - Prevents future "Node already exists" errors
- ✅ Implementation verified at lines 107-144
- ✅ Handles both 'labelsOrTypes' and 'entityType' field names (Neo4j version compatibility)

### Schema Constraint Fix (2025-10-17)
- ✅ Identified conflicting constraints blocking temporal versioning
- ✅ Dropped old single-field `entity_name_unique` constraint
- ✅ Verified composite `(name, validTo)` constraint working
- ✅ Tested all KG operations (287 tests passing)
- ✅ Validated temporal versioning (version chains creating correctly)
- ✅ Confirmed all 650 entities have proper `id` fields
- ✅ Updated documentation (CLAUDE.md, README.md, CHANGELOG.md)
- ✅ Created `docs/SCHEMA_CONSTRAINT_FIX.md` guide

### Vector Embeddings Generation (2025-10-20)
- ✅ **Production embeddings generated** for knowledge graph
  - Created `src/cli/generate-embeddings.ts` CLI tool
  - Added npm scripts: `embeddings:generate` and `embeddings:test`
  - Successfully embedded 630 entities (99.8% of database)
  - Model: OpenAI text-embedding-3-small (1536 dimensions)
  - Total cost: ~$0.0025 USD
- ✅ **Semantic search operational**
  - Verified with dietary and infrastructure queries
  - Sub-second query responses
  - Configuration: `limit=10`, `min_similarity=0.6`
- ✅ **Documentation updated**
  - Added "Vector Embeddings Status" section to CLAUDE.md
  - Updated AXIS.md v3.10.1 with KG Search Protocol
  - Synced across all platform instruction files

### Documentation Updates (2025-10-17)
- ✅ `CLAUDE.md`: Added comprehensive version history and BigInt fix patterns
- ✅ `README.md`: Updated "What's Fixed" section with v1.0.4-1.0.5 details
- ✅ `CHANGELOG.md`: Added complete version history from v1.0.0 to v1.0.5
- ✅ `docs/SCHEMA_CONSTRAINT_FIX.md`: Created diagnostic and fix guide
- ✅ `TODO.md`: Created task tracking and GitHub Actions setup guide

---

## 📝 Notes

### Version Publishing Workflow
**Automated via OIDC (no tokens needed!):**
```bash
# 1. Make changes and update CHANGELOG.md

# 2. Bump version
npm version patch  # or minor/major

# 3. Commit and push (automated publish triggers)
git commit -am "Release vX.Y.Z"
git push origin main --follow-tags

# GitHub Actions automatically:
# - Builds and tests (287 tests)
# - Checks version (current vs published)
# - Publishes to npm via OIDC with provenance
# - No token rotation ever needed!
```

### Testing GitHub Actions Locally
Use `act` to test workflows locally before pushing:
```bash
brew install act
act push -j build  # Test build job
act push -j publish --secret NPM_TOKEN=...  # Test publish job
```

---

**Last Updated:** 2025-11-15

**Current Version:** v1.7.1

**Session Context:**
- ✅ **v1.7.1** - Latest version published to npm
- ✅ **Automated Setup** - SETUP_AUTOMATION.md for Claude Code
- ✅ **Batch Operations API** - Fully implemented and released in v1.6.0
- ✅ **Query Result Caching** - Released in v1.5.0
- ✅ **All recent features merged** - v1.5.0 through v1.7.1 complete

**Current State:**
- Latest version: 1.7.1 published and operational
- All major features from v1.5.0-v1.7.1 merged and released
- Documentation up to date
- Outstanding: Temporal history tests, CI/CD improvements

**Next Priorities:**
1. Complete the 5 skipped temporal history tests
2. Implement Branch Testing & Preview Deployments for safer releases
3. Set up Cloud Testing Environments (Neo4j Aura)
4. Consider new features: Graph Analytics, Import/Export, Visualization UI
