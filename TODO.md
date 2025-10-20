# TODO - Outstanding Tasks

## 🚀 High Priority

### Hybrid Retrieval System (Semantic + Graph Context)

**Goal**: Improve context relevance by combining vector similarity with graph structure and metadata

**Problem**: Pure vector search misses important graph relationships, temporal freshness, and connection strength. Current semantic search returns results based only on embedding similarity without considering how entities relate in the knowledge graph.

**Solution**:
- Implement reranking pipeline combining multiple signals:
  - Vector similarity (current implementation)
  - Graph traversal scoring (relation types, path distance)
  - Temporal freshness (recency of updates)
  - Connection strength (relation confidence, usage frequency)
- Add configurable scoring weights per signal type
- Expose via enhanced `semantic_search` MCP tool with scoring transparency

**Impact**:
- **User Value**: Dramatically improved AI response accuracy and context relevance
- **Technical Complexity**: Medium (reranking service + feature engineering)
- **Prioritization**: Both Claude and Codex analyses identified as top priority
- **Files Affected**: `Neo4jVectorStore.ts`, new `HybridRetriever.ts`, semantic search handler

**Implementation Phases**:
1. Baseline metrics collection on current semantic search quality
2. Graph scoring functions (leverage Neo4j APOC/GDS if available)
3. Reranking pipeline with configurable weights
4. A/B testing framework to validate improvements
5. Production deployment with monitoring

---

### Batch Operations API

**Goal**: Enable efficient bulk operations for knowledge graph ingestion and updates

**Problem**: Creating/updating many entities requires multiple MCP tool calls with individual transactions. This is slow for AI workflows that need to ingest large context dumps or process document batches.

**Solution**:
- New MCP tools for batch operations:
  - `create_entities_batch(entities: Entity[])`
  - `create_relations_batch(relations: Relation[])`
  - `add_observations_batch(observations: ObservationBatch[])`
  - `update_entities_batch(updates: EntityUpdate[])`
- Single transaction per batch with partial success handling
- Progress reporting for long-running batches
- Configurable batch size limits (default: 100 items)

**Impact**:
- **User Value**: 10-100x faster bulk operations, enables new use cases (document ingestion, context migration)
- **Technical Complexity**: Low (extend existing transaction patterns)
- **Prioritization**: Quick win with high ROI, practical user need
- **Files Affected**: `Neo4jStorageProvider.ts`, new batch handlers in `src/server/handlers/`

**Implementation Phases**:
1. Design batch API interfaces and error handling strategy
2. Implement batch storage methods with transaction management
3. Add MCP tool handlers with progress tracking
4. Comprehensive testing (partial failures, transaction rollback, large batches)
5. Documentation and usage examples

**Success Metrics**:
- < 5ms per entity for batches of 100+ entities
- Graceful partial failure handling with detailed error reports
- Zero transaction leaks or orphaned data

---

### Automated Vector Embeddings Regeneration (v1.2.0)

**Goal**: Implement scheduled and threshold-based automation for vector embedding regeneration to keep semantic search accuracy high without manual intervention

**Problem**: Current embeddings are static from initial generation (2025-10-20). New entities and modified observations create embedding gaps:
- New entities created via MCP tools lack embeddings
- Observation additions/deletions make existing embeddings stale
- Manual regeneration is error-prone and often forgotten
- Semantic search quality degrades as knowledge graph evolves

**Solution**:
1. **Scheduled Regeneration**:
   - Docker-compose service or GitHub Actions cron job
   - Configurable frequency (daily recommended for production)
   - Off-peak execution (2 AM local time)
   - Automatic retry with exponential backoff on API failures

2. **Threshold-Based Auto-Triggering**:
   - Monitor entities without embeddings via Neo4j query
   - Auto-trigger when `missing_embeddings > 50` threshold
   - Track embedding coverage percentage via dashboard query
   - Alert when coverage drops below 95%

3. **Monitoring & Observability**:
   - Add MCP tool: `get_embedding_coverage()` returns stats
   - New diagnostic MCP tool: `analyze_embedding_gaps()` identifies problematic entities
   - Structured logging for audit trail
   - Expose metrics: coverage %, missing entities, last regeneration timestamp

4. **Incremental & Smart Regeneration**:
   - Track `lastEmbeddingUpdate` timestamp per entity
   - Only regenerate entities with modified observations (future optimization)
   - Support targeted regeneration for high-value entities
   - Preserve successful embeddings during partial failures

5. **Cost Optimization**:
   - Batch entities to minimize API round-trips
   - Skip embedding for entities with empty observations
   - Daily runs cost ~$0.08/month (negligible)
   - Provide cost tracking and budget alerts

**Implementation Phases**:
1. Add embedding coverage monitoring (Neo4j queries + MCP tools)
2. Implement scheduled regeneration:
   - Docker: Cron container alongside neo4j-kg
   - VPS: systemd timer or GitHub Actions scheduled workflow
   - Local: npm script with optional cron/launchd integration
3. Add threshold-based auto-triggering logic
4. Create diagnostic tools (coverage analysis, gap detection)
5. Comprehensive logging and alerting
6. Documentation with deployment guide for different environments

**Configuration Options**:
```typescript
// New config in .env or environment variables
EMBEDDING_SCHEDULE="0 2 * * *"          // Cron format (daily 2 AM)
EMBEDDING_THRESHOLD=50                   // Auto-trigger when X entities missing
EMBEDDING_COVERAGE_TARGET=95             // Alert if below this %
EMBEDDING_BATCH_SIZE=100                 // Entities per API call
EMBEDDING_RETRY_MAX=3                    // Retry attempts on failure
EMBEDDING_TIMEOUT_MS=30000               // Per-entity timeout
```

**Monitoring Queries**:
```cypher
// Embedding coverage dashboard
MATCH (e:Entity)
RETURN
  count(e) as total_entities,
  count(e.embedding) as with_embeddings,
  count(e) - count(e.embedding) as missing_embeddings,
  round(100.0 * count(e.embedding) / count(e), 2) as coverage_percent,
  max(e.updatedAt) as last_entity_update

// Entities without embeddings
MATCH (e:Entity) WHERE e.embedding IS NULL
RETURN e.name, e.entityType, e.updatedAt, size(e.observations) as observation_count
ORDER BY e.updatedAt DESC
LIMIT 20
```

**Files Affected**:
- `src/cli/generate-embeddings.ts`: Add scheduling + threshold logic
- New: `src/services/EmbeddingScheduler.ts`: Orchestrates regeneration
- `src/server/handlers/`: New MCP tools for monitoring
- `docker-compose.yml`: Add optional cron service
- `package.json`: New npm scripts for scheduling
- `.github/workflows/`: Optional scheduled action
- Documentation: Deployment guide

**Deployment Strategies**:
1. **Docker (Current jp-vps-1)**:
   ```yaml
   # Add to docker-compose.yml
   embeddings-scheduler:
     image: mcr.microsoft.com/cron:latest
     volumes:
       - /path/to/project:/app
     entrypoint: "0 2 * * * npm run embeddings:generate"
   ```

2. **systemd Timer (Alternative)**:
   ```ini
   # /etc/systemd/system/neo4j-embeddings.timer
   [Timer]
   OnCalendar=daily
   OnCalendar=*-*-* 02:00:00
   ```

3. **GitHub Actions (Backup)**:
   ```yaml
   # .github/workflows/embeddings-schedule.yml
   schedule:
     - cron: "0 2 * * *"  # Daily 2 AM UTC
   ```

**Success Metrics**:
- Embedding coverage consistently > 95%
- < 2 seconds to detect and report coverage issues
- Zero missed regenerations (100% scheduled job success rate)
- Cost tracking within budget (<$10/month)
- Comprehensive audit log of all regeneration events

**Version Target**: v1.2.0 (after Hybrid Retrieval and Batch Operations)

**Complexity**: Medium (scheduling, monitoring, error handling)

**ROI**: High (keeps semantic search accurate without manual work, enables dynamic knowledge graphs)

---

---

## ✅ Completed

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

## 🔧 Medium Priority

*(No pending medium priority items)*

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

**Last Updated:** 2025-10-20
**Session Context:** v1.1.6 released with pre-public repository cleanup completed. Added three new high priority future enhancements scheduled for v1.2.0: (1) Hybrid Retrieval System combining semantic search with graph context, (2) Batch Operations API for efficient bulk knowledge graph operations, (3) Automated Vector Embeddings Regeneration with scheduled and threshold-based automation. Embedding automation ensures semantic search accuracy remains high as knowledge graph evolves. All identified through dual analysis (Claude + GPT-5-Codex high reasoning) and strategic planning sessions.
