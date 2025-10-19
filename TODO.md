# TODO - Outstanding Tasks

## 🚀 High Priority

### 1. Enable Automated npm Publishing via GitHub Actions

**Current State:**
- GitHub Actions workflow exists at `.github/workflows/mcp-neo4j-knowledge-graph.yml`
- Publish job is disabled (line 117: `if: false`)
- Package name reference is incorrect (references old upstream package)

**Required Actions:**

#### Step 1: Update GitHub Actions Workflow
Edit `.github/workflows/mcp-neo4j-knowledge-graph.yml`:

```yaml
# Line 117: Change from
if: false  # Disabled - using manual npm publish workflow

# To
if: github.ref == 'refs/heads/main' && github.event_name == 'push'
```

#### Step 2: Fix Package Name in Version Check
Edit line 150 in the workflow:

```yaml
# Change from
if LATEST_VERSION=$(npm view @gannonh/memento-mcp version 2>/dev/null); then

# To
if LATEST_VERSION=$(npm view @henrychong-ai/mcp-neo4j-knowledge-graph version 2>/dev/null); then
```

#### Step 3: Configure GitHub Secrets
Add `NPM_TOKEN` secret to GitHub repository:

1. Go to https://github.com/henrychong-ai/mcp-neo4j-knowledge-graph/settings/secrets/actions
2. Click "New repository secret"
3. Name: `NPM_TOKEN`
4. Value: [Get from https://www.npmjs.com/settings/YOUR_USERNAME/tokens]
   - Create token with "Automation" type
   - Grant "Read and write" permissions

#### Step 4: Test Workflow
1. Make a version bump: `npm version patch` (or `minor`/`major`)
2. Update CHANGELOG.md with changes
3. Commit changes: `git commit -am "Bump version to X.Y.Z"`
4. Push to main: `git push origin main`
5. Monitor workflow: https://github.com/henrychong-ai/mcp-neo4j-knowledge-graph/actions

**Expected Behavior:**
- Pushes to `main` branch trigger workflow
- Build and tests run
- If version in `package.json` > published version → auto-publish to npm
- If version unchanged → skip publish step

**Documentation:**
- GitHub Actions npm publish: https://docs.github.com/en/actions/publishing-packages/publishing-nodejs-packages
- npm tokens: https://docs.npmjs.com/creating-and-viewing-access-tokens

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

## ✅ Completed This Session

### Schema Constraint Fix (2025-10-17)
- ✅ Identified conflicting constraints blocking temporal versioning
- ✅ Dropped old single-field `entity_name_unique` constraint
- ✅ Verified composite `(name, validTo)` constraint working
- ✅ Tested all KG operations (287 tests passing)
- ✅ Validated temporal versioning (version chains creating correctly)
- ✅ Confirmed all 650 entities have proper `id` fields
- ✅ Updated documentation (CLAUDE.md, README.md, CHANGELOG.md)
- ✅ Created `docs/SCHEMA_CONSTRAINT_FIX.md` guide

### Documentation Updates
- ✅ `CLAUDE.md`: Added comprehensive version history and BigInt fix patterns
- ✅ `README.md`: Updated "What's Fixed" section with v1.0.4-1.0.5 details
- ✅ `CHANGELOG.md`: Added complete version history from v1.0.0 to v1.0.5
- ✅ `docs/SCHEMA_CONSTRAINT_FIX.md`: Created diagnostic and fix guide

---

## 📝 Notes

### Version Publishing Workflow
Current manual process:
```bash
# 1. Make changes and update CHANGELOG.md
# 2. Bump version
npm version patch  # or minor/major

# 3. Build and test
npm run build
npm test

# 4. Publish
npm publish --access public

# 5. Push to GitHub
git push && git push --tags
```

Once GitHub Actions is enabled, steps 3-4 will be automated on push to `main`.

### Testing GitHub Actions Locally
Use `act` to test workflows locally before pushing:
```bash
brew install act
act push -j build  # Test build job
act push -j publish --secret NPM_TOKEN=...  # Test publish job
```

---

**Last Updated:** 2025-10-17
**Session Context:** Schema constraint fix and KG validation complete
