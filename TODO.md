# TODO - Outstanding Tasks

## 🚀 High Priority

### 1. OIDC npm Publishing - Private Repository Limitation

**Status**: ✅ **RESOLVED** - Issue identified, solution ready to implement

**Root Cause**:
The `--provenance` flag requires a **public GitHub repository**. Current error:
```
npm error 422 Unprocessable Entity - Error verifying sigstore provenance bundle:
Unsupported GitHub Actions source repository visibility: "private".
Only public source repositories are supported when publishing with provenance.
```

**Resolution**:
Repository is intentionally kept **private** until pre-public cleanup is complete (see task #2).

**Immediate Fix for v1.0.6**:
Remove `--provenance` flag from workflow. OIDC publishing will work perfectly without it.

```yaml
# Change from:
run: npm publish --provenance --access public

# To:
run: npm publish --access public
```

**What We Keep Without Provenance**:
- ✅ OIDC authentication (no token rotation)
- ✅ Automated publishing via GitHub Actions
- ✅ Secure, ephemeral OIDC tokens
- ✅ Public package access

**What We Lose Without Provenance**:
- ❌ Cryptographic build attestation
- ❌ Sigstore verification linking package to source

**Future**: After making repo public (task #2), can re-enable `--provenance` flag.

---

### 2. Pre-Public Repository Cleanup

**Status**: 📋 **PLANNED** - For v1.0.7 release before making repository public

**Goal**: Transition from "fork narrative" to "maintained by Henry Chong" identity while maintaining MIT license compliance.

**Timeline**: Complete cleanup → Release v1.0.7 → Make repository public

**MIT License Compliance Requirements** ⚖️

**MUST KEEP** (Legal Requirement):
- `LICENSE` file with Gannon Hall's copyright notice (line 3)
- This is **non-negotiable** under MIT license terms

**MUST ADD** (Best Practice):
- Add Henry Chong copyright to LICENSE for modifications:
  ```
  Copyright (c) 2025 Gannon Hall
  Copyright (c) 2025 Henry Chong (enhancements and maintenance)
  ```

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

### 2. Improve Schema Constraint Detection

**Issue:**
During schema fix, discovered that old single-field constraint `entity_name_unique` coexisted with new composite constraint, blocking temporal versioning.

**Proposed Enhancement:**
Add constraint validation to `Neo4jSchemaManager.ts`:

```typescript
// In createEntityConstraints() method
async createEntityConstraints(recreate = false): Promise<void> {
  this.log('Creating entity name constraint...');

  const constraintName = 'entity_name';

  // NEW: Check for conflicting constraints
  const allConstraints = await this.listConstraints();
  const entityConstraints = allConstraints.filter(c =>
    c.labelsOrTypes === 'Entity' &&
    Array.isArray(c.properties) &&
    c.properties.includes('name')
  );

  // Warn about conflicts
  for (const constraint of entityConstraints) {
    if (constraint.name !== constraintName) {
      this.log(`⚠️  WARNING: Found conflicting Entity constraint: ${constraint.name}`);
      this.log(`   Properties: ${JSON.stringify(constraint.properties)}`);
      if (recreate) {
        this.log(`   Dropping conflicting constraint: ${constraint.name}`);
        await this.dropConstraintIfExists(constraint.name);
      } else {
        this.log(`   Run with recreate=true to automatically remove conflicting constraints`);
      }
    }
  }

  if (recreate) {
    await this.dropConstraintIfExists(constraintName);
  }

  // ... rest of existing code
}
```

**Benefits:**
- Detects conflicting constraints automatically
- Prevents future schema issues
- Provides clear warnings and resolution steps

**Files to Modify:**
- `src/storage/neo4j/Neo4jSchemaManager.ts` (lines 102-125)

---

### 3. Neo4j Vector Index Compatibility

**Issue:**
During schema initialization, vector index creation failed with syntax error:
```
Invalid input 'VECTOR': expected "(", "ALL", "ANY" or "SHORTEST"
```

**Analysis:**
- Remote Neo4j instance appears to be older version (< 5.13)
- `CREATE VECTOR INDEX` syntax not supported
- Code has fallback for checking indexes, but not for creating them

**Current Workaround:**
Vector search operations gracefully handle missing indexes, but may have degraded performance.

**Proposed Enhancement:**
Add Neo4j version detection and compatibility handling:

```typescript
// In Neo4jSchemaManager.ts
async getServerVersion(): Promise<string> {
  const result = await this.connectionManager.executeQuery(
    'CALL dbms.components() YIELD name, versions RETURN name, versions[0] as version',
    {}
  );
  return result.records[0]?.get('version') || 'unknown';
}

async createVectorIndex(/* params */): Promise<void> {
  const version = await this.getServerVersion();
  const [major, minor] = version.split('.').map(Number);

  if (major >= 5 && minor >= 13) {
    // Use native VECTOR INDEX syntax
  } else if (major >= 5 && minor >= 11) {
    // Use alternative syntax for Neo4j 5.11-5.12
  } else {
    this.log(`⚠️  Neo4j version ${version} does not support vector indexes`);
    this.log(`   Vector search will use fallback implementation`);
    return; // Skip index creation
  }
}
```

**Files to Modify:**
- `src/storage/neo4j/Neo4jSchemaManager.ts`
- `src/storage/neo4j/Neo4jConfig.ts` (add min version requirements)

**Resources:**
- Neo4j Vector Index docs: https://neo4j.com/docs/cypher-manual/current/indexes-for-vector-search/

---

## ✅ Completed

### Automated Publishing Setup (2025-10-19)
- ✅ **GitHub Actions workflow configured** for automated npm publishing
  - Fixed package name in version comparison
  - Added `--access public` flag for scoped package
  - Added `semver` to devDependencies for version comparison
  - Enabled publish job to run on main branch pushes
- ⚠️ **OIDC Trusted Publishing** (partially complete - blocked)
  - Added `permissions.id-token: write` to workflow
  - Added `--provenance` flag for cryptographic attestation
  - Removed NPM_TOKEN secret dependency
  - ❌ **BLOCKED**: Authentication/authorization failing (see High Priority task #1)
  - **Status**: Workflow runs successfully but publish fails with 404/auth errors

### Schema Constraint Fix (2025-10-17)
- ✅ Identified conflicting constraints blocking temporal versioning
- ✅ Dropped old single-field `entity_name_unique` constraint
- ✅ Verified composite `(name, validTo)` constraint working
- ✅ Tested all KG operations (287 tests passing)
- ✅ Validated temporal versioning (version chains creating correctly)
- ✅ Confirmed all 650 entities have proper `id` fields
- ✅ Updated documentation (CLAUDE.md, README.md, CHANGELOG.md)
- ✅ Created `docs/SCHEMA_CONSTRAINT_FIX.md` guide

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

**Last Updated:** 2025-10-19
**Session Context:** v1.0.6 prepared, OIDC private repo limitation identified. Comprehensive pre-public cleanup plan documented for v1.0.7. Repository will remain private until cleanup complete, then make public with full provenance support.
