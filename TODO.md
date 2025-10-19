# TODO - Outstanding Tasks

## 🚀 High Priority

**No high priority tasks remaining - all completed!**

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

### Automated Publishing & OIDC Migration (2025-10-19)
- ✅ **Enabled automated npm publishing** via GitHub Actions
  - Fixed package name in version comparison
  - Added `--access public` flag for scoped package
  - Added `semver` to devDependencies
- ✅ **Migrated to OIDC Trusted Publishing**
  - Configured npm Trusted Publisher
  - Added `permissions.id-token: write` to workflow
  - Added `--provenance` flag for cryptographic attestation
  - Removed NPM_TOKEN dependency (no 90-day rotation needed)
  - Tested successfully - workflow runs and skips publish correctly
- ✅ **Benefits achieved:**
  - Zero token maintenance (ephemeral OIDC tokens)
  - Enhanced security (no long-lived secrets)
  - Cryptographic build provenance
  - Automatic publish on version bumps

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
**Session Context:** OIDC Trusted Publishing operational, automated npm publishing enabled
