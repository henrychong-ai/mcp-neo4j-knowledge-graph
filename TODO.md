# TODO - Outstanding Tasks

## 🚨 Critical Priority

_(No critical priority items - all clear!)_

---

## 🚀 Open Items

_(No open items - all clear!)_

---

## ❌ Closed (Not Needed)

### SETUP.md Interactive Setup Guide

**Closed**: Shipped as `SETUP_AUTOMATION.md` in npm package. Branch deleted in v2.0.0 cleanup.

### Batch Operations API

**Closed**: Branch deleted in v2.0.0 cleanup. Existing `create_entities` already accepts arrays. Single-entity tools handle typical MCP usage. Can be revisited if bulk ingestion becomes a real need.

### Branch Testing & Preview Deployments

**Closed**: CI/CD (`ci-cd.yml`) already runs build+lint+typecheck+test on all pushes and PRs across Node 20.x/22.x/24.x. Preview npm packages not needed for a single-maintainer project.

### Cloud Testing Environments

**Closed**: Production Neo4j runs on a dedicated server. Local Docker covers development testing. CI uses GitHub Actions Neo4j service container. No need for Neo4j Aura or cloud testing environments.

---

## ✅ Completed

### v1.5.0 Query Result Caching (2025-11-05)

**Status**: ✅ **COMPLETE** - Ready for PR merge

**Implementation**:

- LRU cache for semantic search query results
- 500 unique queries cached with 5-minute TTL
- Sub-millisecond response for repeated queries
- Automatic cache invalidation on mutations
- Prometheus metrics integration

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

**Branch**: `claude/check-published-version-011CUq7WxEjcEqQsurmGap5j`

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

**Status**: ✅ **COMPLETED** - Running in production

**Goal**: Automated incremental vector embedding regeneration to keep semantic search accuracy high without manual intervention

**Solution Implemented**:

- **Daily Cron Schedule**: Runs at 3 AM Singapore time (19:00 UTC)
- **Incremental Regeneration**: `EmbeddingJobManager.scheduleIncrementalRegeneration()`
- **Smart Processing**: Checks all entities, schedules jobs only for those missing embeddings
- **Existing Infrastructure**: Integrates with existing 10-second job processor
- **Production Deployment**: Running via systemd service

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

8. **src/server/**vitest**/setup.test.ts** (lines 13, 16, 108, 111)
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

| File                       | Action                       | MIT Compliance                      |
| -------------------------- | ---------------------------- | ----------------------------------- |
| LICENSE                    | Add Henry's copyright        | Required: Keep Gannon's             |
| README.md                  | Remove fork narrative        | Optional: Credit in acknowledgments |
| CLAUDE.md                  | Reframe identity             | Optional                            |
| package.json               | Update metadata              | Optional: Add contributors field    |
| setup.ts                   | Update server name/publisher | Optional                            |
| setup.test.ts              | Update test assertions       | Optional                            |
| DefaultEmbeddingService.ts | Update mock model name       | Optional                            |
| assets/\*                  | Remove/replace logos         | Optional (not copyrighted)          |

**Expected Outcome**:
Professional standalone project identity with proper attribution to original work, full MIT license compliance, and clean public repository suitable for open-source community.

---

## 🔧 Medium Priority

_(No pending medium priority items)_

---

## ✅ Completed

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
# 2. Bump version in package.json
# 3. Commit, tag, and push
git tag vX.Y.Z
git push origin main --tags

# GitHub Actions automatically:
# - Builds and tests (834 tests) on Node 24.x
# - Publishes to npm via OIDC on v* tags
```

---

**Last Updated:** 2026-02-09

**Current State:** v2.2.0 — Neo4j-only architecture, ES2024/Node 24, 834 tests, pnpm/Vitest/Oxlint/Biome toolchain.
