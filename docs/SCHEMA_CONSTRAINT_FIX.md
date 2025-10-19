# Schema Constraint Fix for Temporal Versioning

## Problem

**Error**: `Node(593) already exists with label 'Entity' and property 'name' = 'Dietary Framework'`

**Root Cause**: Old UNIQUE constraint on `Entity.name` prevents temporal versioning from creating new entity versions with the same name.

## Current Schema Issue

The codebase expects a **composite constraint** on `(name, validTo)`:
```cypher
CREATE CONSTRAINT entity_name IF NOT EXISTS
FOR (e:Entity)
REQUIRE (e.name, e.validTo) IS UNIQUE
```

However, if an old single-field constraint exists, the `IF NOT EXISTS` clause prevents replacement:
```cypher
-- OLD (blocks temporal versioning)
CREATE CONSTRAINT entity_name
FOR (e:Entity)
REQUIRE e.name IS UNIQUE

-- NEW (allows temporal versioning)
CREATE CONSTRAINT entity_name
FOR (e:Entity)
REQUIRE (e.name, e.validTo) IS UNIQUE
```

## Diagnosis Steps

### 1. Check Current Constraints

Run in Neo4j Browser:
```cypher
SHOW CONSTRAINTS;
```

Look for `entity_name` constraint and check if it's:
- ✅ Composite: `(e.name, e.validTo)` - Correct
- ❌ Single-field: `e.name` - Needs fix

### 2. Check Dietary Framework Entities

```cypher
MATCH (e:Entity {name: "Dietary Framework"})
RETURN e.id, e.version, e.validFrom, e.validTo
ORDER BY e.validFrom;
```

Expected:
- Multiple entities with same name
- Different `validTo` values (NULL for current, timestamp for old)

## Fix Instructions

### Option A: Automated Fix (Recommended)

1. **Create fix script**:
```bash
cd /path/to/mcp-neo4j-knowledge-graph
cat << 'EOF' > fix_constraints.cypher
// Drop old constraint if exists
DROP CONSTRAINT entity_name IF EXISTS;

// Create proper composite constraint
CREATE CONSTRAINT entity_name
FOR (e:Entity)
REQUIRE (e.name, e.validTo) IS UNIQUE;

// Verify constraint
SHOW CONSTRAINTS;
EOF
```

2. **Run via Neo4j Browser**:
   - Open Neo4j Browser
   - Copy/paste contents of `fix_constraints.cypher`
   - Execute

3. **Verify fix**:
```cypher
// Should show composite constraint
SHOW CONSTRAINTS WHERE name = 'entity_name';
```

### Option B: Manual Fix

1. **Drop old constraint**:
```cypher
DROP CONSTRAINT entity_name IF EXISTS;
```

2. **Create composite constraint**:
```cypher
CREATE CONSTRAINT entity_name
FOR (e:Entity)
REQUIRE (e.name, e.validTo) IS UNIQUE;
```

3. **Verify**:
```cypher
SHOW CONSTRAINTS WHERE name = 'entity_name';
```

## Verification

After fixing constraints, test `add_observations`:

```bash
# In Claude Code
mcp__kg__add_observations({
  observations: [{
    entityName: "Dietary Framework",
    contents: ["Test observation after constraint fix"]
  }]
})
```

**Expected Result**: Success - should create new entity version

**Error Result**: If still failing, check:
1. Constraint is actually composite (run `SHOW CONSTRAINTS`)
2. No duplicate entities with `validTo=NULL` (run entity check query above)

## Prevention

To prevent this issue when initializing new databases:

1. **Use `createEntityConstraints(recreate=true)`**:
```typescript
await schemaManager.createEntityConstraints(true);
```

2. **Or manually recreate during init**:
```typescript
// In Neo4jSchemaManager.ts initializeSchema()
await this.createEntityConstraints(recreate);  // Pass recreate param
```

## Technical Details

### Why Composite Constraint?

Temporal versioning creates multiple entity nodes with:
- Same `name` (e.g., "Dietary Framework")
- Different `id` (UUID for each version)
- Different `validFrom/validTo` (version validity period)
- Different `version` (1, 2, 3, ...)

**Single-field constraint** (`name` only):
- ❌ Blocks: Can't have multiple entities with same name
- ❌ Prevents temporal versioning entirely

**Composite constraint** (`name, validTo`):
- ✅ Allows: Multiple entities with same name
- ✅ Requires: Each (name, validTo) combo is unique
- ✅ Enables: Temporal versioning with history

### Example Valid State

With composite constraint:
```
Entity 1: name="Dietary Framework", validTo=NULL,        version=2  ← Current
Entity 2: name="Dietary Framework", validTo=1760713600,  version=1  ← Historical
Entity 3: name="Habit Stack",       validTo=NULL,        version=1  ← Current
```

All valid - no constraint violations!

## Next Steps After Fix

1. ✅ Run constraint fix
2. ✅ Verify with `SHOW CONSTRAINTS`
3. ✅ Test `add_observations` with migrated entity
4. ✅ Confirm new version created successfully
5. ✅ Check entity history: `MATCH (e:Entity {name: "Dietary Framework"}) RETURN e ORDER BY e.version`

## Related

- **BigInt Fix**: v1.0.5 (completed)
- **Temporal Versioning**: See `src/storage/neo4j/Neo4jStorageProvider.ts` lines 900-1200
- **Schema Manager**: See `src/storage/neo4j/Neo4jSchemaManager.ts` lines 102-125
