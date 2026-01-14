# Neo4j Upgrade Guide

**Version Upgrade Procedures for mcp-neo4j-knowledge-graph**

---

## Executive Summary

This guide provides comprehensive instructions for upgrading Neo4j database versions in Docker-based deployments of the mcp-neo4j-knowledge-graph MCP server. It covers planning, execution, verification, and rollback procedures.

**Target Audience:** DevOps engineers, system administrators, and developers managing Neo4j knowledge graph deployments

**Tested Upgrade Path:** Neo4j 5.13.0 → 5.26.13 LTS (2025-10-20, jp-vps-1)

**Note:** This upgrade was originally tested on jp-vps-1. Production Neo4j has since been migrated to **vps-2** (Singapore, 4C/12GB RAM). Historical references to jp-vps-1 in this document reflect the original upgrade testing environment.

---

## Table of Contents

1. [When to Upgrade](#when-to-upgrade)
2. [Upgrade Path Rationale](#upgrade-path-rationale)
3. [Prerequisites](#prerequisites)
4. [5-Phase Upgrade Procedure](#5-phase-upgrade-procedure)
5. [Configuration Management](#configuration-management)
6. [Troubleshooting](#troubleshooting)
7. [Rollback Procedure](#rollback-procedure)
8. [Real-World Example](#real-world-example)
9. [Lessons Learned](#lessons-learned)
10. [Monitoring Schedule](#monitoring-schedule)

---

## When to Upgrade

### Required Upgrades

- **Security patches**: Current version reaches End of Life (EOL)
- **Critical bugs**: Affecting data integrity or stability
- **Breaking dependencies**: MCP server requires newer Neo4j features

### Optional Upgrades

- **Performance improvements**: 5-20% gains (varies by workload)
- **New features**: LTS stability, enhanced vector search, improved Cypher
- **Long-term support**: Extending security patch timeline

### When NOT to Upgrade

- Knowledge graph actively in use for critical operations
- Less than 2 hours available for monitoring
- No tested backup and rollback plan
- Uncertain about driver compatibility

---

## Upgrade Path Rationale

### Why Choose LTS (Long-Term Support)?

**Neo4j 5.26 LTS vs. Latest Stable (2025.x series):**

| Factor                 | LTS (5.26)                           | Latest (2025.x)          |
| ---------------------- | ------------------------------------ | ------------------------ |
| **Support Timeline**   | Until June 2028 (3+ years)           | Shorter support window   |
| **Stability**          | Mature, fewer bugs                   | Bleeding-edge features   |
| **Update Frequency**   | Infrequent (patch only)              | Frequent minor versions  |
| **Performance Gains**  | Moderate (5-10%)                     | Higher (10-20%)          |
| **Maintenance Burden** | Low                                  | Higher                   |
| **Recommended For**    | Personal/production knowledge graphs | High-throughput services |

**Decision:** For personal knowledge graphs storing irreplaceable context data, **LTS stability > latest performance**.

### Compatibility Matrix

| Component                     | Neo4j 5.13      | Neo4j 5.26 LTS  | Neo4j 2025.x              |
| ----------------------------- | --------------- | --------------- | ------------------------- |
| **neo4j-driver**              | 5.x             | 5.x, 6.x        | 6.x required              |
| **Java Runtime**              | 17              | 17, 21          | 21 required               |
| **mcp-neo4j-knowledge-graph** | v1.0.0+         | v1.0.0+         | v1.0.0+ (with driver 6.x) |
| **APOC Plugin**               | Compatible      | Compatible      | Compatible                |
| **Vector Indexes**            | Enterprise only | Enterprise only | Enterprise only           |

**Key Insight:** neo4j-driver 5.x supports both Neo4j 5.13 and 5.26, no code changes required for 5.x → 5.26 upgrade.

---

## Prerequisites

### Required Access

- SSH access to Neo4j host server (via Tailscale or direct)
- Docker runtime and sufficient permissions (`docker ps`, `docker run`)
- Neo4j admin credentials (`NEO4J_AUTH` environment variable)

### Required Knowledge

- Basic Docker operations (container lifecycle, volumes, networking)
- Neo4j Cypher query language (for verification queries)
- Understanding of the MCP server architecture
- Familiarity with backup and restore procedures

### Required Time

- **Minimum:** 2 hours (for upgrade + monitoring)
- **Recommended:** 3-4 hours (including contingency)
- **Downtime:** ~20 minutes (database unavailable during upgrade)

### Required Disk Space

- **Backup:** 2-5x database size (for dump file + checksum)
- **Docker images:** ~1GB (old + new Neo4j images during transition)
- **Safety margin:** 10-20% additional free space

### System Requirements

- **Memory:** Current Neo4j memory configuration + 20% headroom
- **CPU:** No additional requirements (same as current deployment)
- **Network:** Stable connection for Docker image download (~500-600MB)

---

## 5-Phase Upgrade Procedure

### Phase 1: Pre-Upgrade Information Gathering

**Objective:** Document current state and establish baseline metrics

**Time Estimate:** 30 minutes
**Risk Level:** NONE (read-only operations)
**Rollback Complexity:** N/A

#### 1.1 Connect to Target Server

```bash
# Via Tailscale SSH (recommended for remote access)
ssh root@<hostname>

# Or via direct IP
ssh root@<ip-address>

# Verify you're on the correct host
hostname
```

#### 1.2 Document Current Docker Configuration

```bash
# List Neo4j containers
docker ps --filter "ancestor=neo4j:*-community" --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}"

# Save container name for later use
export NEO4J_CONTAINER=<container-name>
echo "Container: $NEO4J_CONTAINER"

# Backup container configuration to JSON
docker inspect $NEO4J_CONTAINER > /root/neo4j-backup-config-$(date +%Y%m%d).json

# Verify backup created
ls -lh /root/neo4j-backup-config-*.json

# List volumes
docker volume ls | grep neo4j

# Show current Neo4j image
docker images | grep neo4j
```

**Expected Output:**

- Container name identified and saved
- Configuration JSON backup created (typically 10-20KB)
- Volume names documented
- Current image version confirmed

#### 1.3 Gather Baseline Metrics

```bash
# Extract Neo4j credentials (adjust path if needed)
docker exec $NEO4J_CONTAINER printenv | grep NEO4J_AUTH
# Output format: NEO4J_AUTH=neo4j/<password>

# Store credentials for commands
export NEO4J_USER=neo4j
export NEO4J_PASS=<password-from-above>

# Check current Neo4j version
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "CALL dbms.components() YIELD name, versions RETURN name, versions;"

# Count current entities (for verification)
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "MATCH (e:Entity) WHERE e.validTo IS NULL RETURN count(e) as current_entities;"

# Count total relations
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "MATCH ()-[r]->() RETURN count(r) as total_relations;"

# Check indexes status
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "SHOW INDEXES;"

# Verify critical constraint exists
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "SHOW CONSTRAINTS;"
```

**Expected Output:**

- Neo4j version displayed (e.g., "5.13.0")
- Entity count returned (e.g., 686)
- Relation count returned (e.g., 934)
- Indexes shown as "ONLINE"
- Constraint `entity_name` on `(name, validTo)` verified

#### 1.4 Save Baseline Documentation

```bash
cat > /root/neo4j-upgrade-baseline-$(date +%Y%m%d).txt << EOF
Neo4j Upgrade Baseline Metrics
================================
Date: $(date -u +%Y-%m-%d)
Container: $NEO4J_CONTAINER
Current Version: [from step 1.3]

DATABASE METRICS:
- Current Entities: [from step 1.3]
- Total Relations: [from step 1.3]

INDEXES: [copy from step 1.3]

CONSTRAINTS: [copy from step 1.3]

DOCKER CONFIGURATION:
- Image: [from docker images]
- Volumes: [from docker volume ls]
- Ports: [from docker ps]

READY FOR UPGRADE TO: Neo4j 5.26 LTS
EOF

cat /root/neo4j-upgrade-baseline-$(date +%Y%m%d).txt
```

#### 1.5 Phase 1 Go/No-Go Checkpoint

✅ **PROCEED if:**

- Container identified successfully
- Configuration backed up to JSON
- Baseline metrics captured (entity/relation counts)
- Critical constraint `entity_name` on `(name, validTo)` exists
- All indexes showing "ONLINE" status

❌ **ABORT if:**

- Cannot connect to target server
- Neo4j container not found or not running
- Database queries failing or timing out
- Unexpected schema state (missing constraints)

---

### Phase 2: Backup and Verification

**Objective:** Create complete, verified backup of Neo4j database

**Time Estimate:** 15 minutes
**Risk Level:** LOW (database stopped during backup for consistency)
**Rollback Complexity:** LOW (just restart container if backup fails)

#### 2.1 Tag Current Docker Image for Rollback

```bash
# Create backup tag with today's date
docker tag neo4j:<current-version> neo4j:<current-version>-backup-$(date +%Y%m%d)

# Verify tag created
docker images | grep neo4j
```

**Expected Output:** Both original and backup-tagged images listed

#### 2.2 Stop Neo4j Container Gracefully

```bash
# Graceful shutdown (60 second timeout for flush)
docker stop --timeout=60 $NEO4J_CONTAINER

# Verify stopped (Exit code should be 0)
docker ps -a | grep $NEO4J_CONTAINER
```

**Expected Output:** Container status shows "Exited (0)"

**Note:** MCP server will lose connection to knowledge graph (expected during backup)

#### 2.3 Create Database Dump

```bash
# Create backup directory on host
mkdir -p /root/neo4j-backups

# Create backup directory inside container's data volume
docker run --rm --volumes-from $NEO4J_CONTAINER alpine mkdir -p /data/backups

# Create database dump using temporary container
docker run --rm \
  --volumes-from $NEO4J_CONTAINER \
  neo4j:<current-version> \
  neo4j-admin database dump neo4j --to-path=/data/backups

# Copy dump from volume to host filesystem
docker run --rm \
  --volumes-from $NEO4J_CONTAINER \
  -v /root/neo4j-backups:/host-backups \
  alpine cp /data/backups/neo4j.dump /host-backups/

# Verify dump created and check size
ls -lh /root/neo4j-backups/neo4j.dump
```

**Expected Output:**

- File `/root/neo4j-backups/neo4j.dump` created
- File size reasonable (typically 1-10MB per 1000 entities, varies)

#### 2.4 Generate Checksum for Integrity Verification

```bash
# Generate SHA256 checksum
sha256sum /root/neo4j-backups/neo4j.dump > /root/neo4j-backups/neo4j.dump.sha256

# Display checksum
cat /root/neo4j-backups/neo4j.dump.sha256
```

**Expected Output:** SHA256 hash displayed (64 hex characters)

#### 2.5 Restart Container (Temporary - Pre-Upgrade State)

```bash
# Restart container to verify backup didn't corrupt anything
docker start $NEO4J_CONTAINER

# Wait for Neo4j to start
sleep 30

# Verify database accessible
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "RETURN 1 as test;"
```

**Expected Output:** Query returns `1`, confirming database healthy

#### 2.6 Phase 2 Go/No-Go Checkpoint

✅ **PROCEED if:**

- Old Docker image tagged for rollback
- Database dump created successfully (file exists, reasonable size)
- Checksum generated and stored
- Container restarted successfully
- Database queries working after restart

❌ **ABORT if:**

- Dump creation failed or file suspiciously small (< 100KB)
- Cannot restart container
- Database queries failing after restart
- Checksum generation failed

**DECISION POINT:** If aborting, container is running on old version with no changes. Safe to stop here.

---

### Phase 3: Docker Upgrade Execution

**Objective:** Update Docker container to Neo4j 5.26 LTS

**Time Estimate:** 20 minutes
**Risk Level:** MEDIUM (making actual changes)
**Rollback Complexity:** MEDIUM (restore from backup if data issues)

#### 3.1 Stop Neo4j Container

```bash
# Stop container for upgrade
docker stop --timeout=60 $NEO4J_CONTAINER

# Verify stopped
docker ps -a | grep $NEO4J_CONTAINER
```

**Expected Output:** Container shows "Exited (0)"

#### 3.2 Pull Neo4j 5.26 LTS Image

```bash
# Pull latest LTS image
docker pull neo4j:5.26-community

# Verify download (typically ~500-600MB)
docker images | grep neo4j
```

**Expected Output:**

- Download complete
- Both old and new images listed

#### 3.3 Remove Old Container (Preserve Volumes)

```bash
# Remove container but KEEP volumes (data preserved)
docker rm $NEO4J_CONTAINER

# Verify container removed but volumes intact
docker volume ls | grep neo4j
```

**Expected Output:**

- Container removed
- Volumes still exist (CRITICAL - contains your data)

#### 3.4 Extract Original Configuration

Before creating new container, extract exact configuration from backup JSON:

```bash
# Extract environment variables
cat /root/neo4j-backup-config-$(date +%Y%m%d).json | grep -A 30 '"Env":'

# Extract volumes and port bindings
cat /root/neo4j-backup-config-$(date +%Y%m%d).json | \
  jq -r '.[] | {Binds: .HostConfig.Binds, PortBindings: .HostConfig.PortBindings}'
```

#### 3.5 Create New Container with Neo4j 5.26

**CRITICAL:** Adapt this command based on your configuration from step 3.4

```bash
# Standard configuration template (CUSTOMIZE based on your backup JSON)
docker run -d \
  --name $NEO4J_CONTAINER \
  --restart unless-stopped \
  -p <host-ip>:7474:7474 \
  -p <host-ip>:7687:7687 \
  -v <data-volume>:/data \
  -v <logs-volume>:/logs \
  -e NEO4J_AUTH=neo4j/<your-password> \
  -e "NEO4J_PLUGINS=[\"apoc\"]" \
  -e NEO4J_dbms_checkpoint_interval_time=30s \
  -e NEO4J_dbms_memory_heap_initial__size=512M \
  -e NEO4J_dbms_memory_heap_max__size=512M \
  -e NEO4J_dbms_memory_pagecache_size=256M \
  -e NEO4J_dbms_memory_transaction_max__size=128M \
  neo4j:5.26-community

# Wait for Neo4j to start
sleep 45

# Check container status
docker ps | grep $NEO4J_CONTAINER

# Check startup logs
docker logs --tail 50 $NEO4J_CONTAINER
```

**Expected Output:**

- Container running (status "Up")
- Logs show "Started." message
- No critical errors about incompatible store format

**CRITICAL:** If logs show "store format incompatible" or similar error, **STOP immediately** and proceed to rollback (Phase 6).

#### 3.6 Phase 3 Go/No-Go Checkpoint

✅ **PROCEED if:**

- Neo4j 5.26 image downloaded successfully
- New container created and running
- Logs show "Started." without compatibility errors
- No unexpected error messages

❌ **ROLLBACK if:**

- Container won't start or crashes immediately
- Logs show store format incompatibility errors
- Unexpected critical errors in startup logs

**DECISION POINT:** If rolling back, skip to Phase 6 (Rollback Procedures)

---

### Phase 4: Post-Upgrade Verification

**Objective:** Verify all data intact and functionality preserved

**Time Estimate:** 45 minutes
**Risk Level:** LOW (read-only verification)
**Rollback Complexity:** MEDIUM (requires restore from backup)

#### 4.1 Verify Database Connectivity and Version

```bash
# Test basic connectivity
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "RETURN 'Connected' as status;"

# Verify Neo4j version upgraded
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "CALL dbms.components() YIELD name, versions RETURN name, versions;"
```

**Expected Output:**

- Connection successful
- Neo4j version: 5.26.x (upgraded from 5.13.0)

#### 4.2 Verify Data Integrity

```bash
# Count entities (compare to Phase 1 baseline)
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "MATCH (e:Entity) WHERE e.validTo IS NULL RETURN count(e) as current_entities;"

# Count relations (compare to Phase 1 baseline)
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "MATCH ()-[r]->() RETURN count(r) as total_relations;"

# Sample entity retrieval
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "MATCH (e:Entity) WHERE e.validTo IS NULL RETURN e.name, e.entityType LIMIT 10;"
```

**Expected Output:**

- Entity count **EXACTLY MATCHES** Phase 1 baseline
- Relation count **EXACTLY MATCHES** Phase 1 baseline
- Sample entities retrieved successfully

**CRITICAL:** If counts don't match, **STOP** and evaluate rollback.

#### 4.3 Verify Schema Integrity

```bash
# Verify constraints preserved
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "SHOW CONSTRAINTS;"

# Verify indexes status
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "SHOW INDEXES;"
```

**Expected Output:**

- Constraint `entity_name` exists on `(name, validTo)`
- All indexes showing "ONLINE" status
- If vector index: may show "POPULATING" briefly, then "ONLINE"

#### 4.4 Test MCP Server Operations

**Switch to local machine** (exit SSH session):

```bash
exit
```

**Test MCP connectivity via Claude Code or Claude Desktop:**

1. Open Claude Desktop or continue in Claude Code
2. May need to restart Claude Desktop if connection stale
3. Run simple search query:

```
search kg for <common-term-in-your-graph>
```

4. Test semantic search:

```
semantically search kg for <concept-in-your-graph>
```

5. Test temporal versioning (add observations):

```
Add observation to entity <entity-name>: "Tested after Neo4j 5.26 upgrade (2025-10-20)"
```

**Expected Output:**

- MCP server reconnects successfully
- Search queries return results
- add_observations creates new version (increments version number)
- semantic_search returns relevant results

#### 4.5 Performance Baseline Check

**Reconnect to server:**

```bash
ssh root@<hostname>
```

```bash
# Run timed query (for reference)
time docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "MATCH (e:Entity) WHERE e.validTo IS NULL RETURN count(e);"

# Check memory usage
docker stats --no-stream $NEO4J_CONTAINER
```

**Expected Output:**

- Query response time reasonable (within ±20% of pre-upgrade if measured)
- Memory usage within configured limits (heap + pagecache)

#### 4.6 Save Post-Upgrade Metrics

```bash
cat > /root/neo4j-upgrade-post-verification-$(date +%Y%m%d).txt << EOF
Neo4j Post-Upgrade Verification
=================================
Date: $(date -u +%Y-%m-%d)
Container: $NEO4J_CONTAINER (new ID after upgrade)
New Version: [from step 4.1]

DATABASE METRICS:
- Current Entities: [from step 4.2] - MATCHES BASELINE: [YES/NO]
- Total Relations: [from step 4.2] - MATCHES BASELINE: [YES/NO]

INDEXES: [copy from step 4.3]

CONSTRAINTS: [copy from step 4.3]

UPGRADE STATUS: [SUCCESS/NEEDS ROLLBACK]

MCP OPERATIONS:
- Search: [PASS/FAIL]
- Semantic Search: [PASS/FAIL]
- Temporal Versioning: [PASS/FAIL]

NEXT: [Continue monitoring / Execute rollback]
EOF

cat /root/neo4j-upgrade-post-verification-$(date +%Y%m%d).txt
```

#### 4.7 Phase 4 Go/No-Go Checkpoint

✅ **DECLARE SUCCESS if:**

- Version confirmed as 5.26.x
- Data counts match Phase 1 baseline **EXACTLY**
- Schema constraints and indexes preserved
- All indexes showing "ONLINE"
- MCP operations working (search, semantic search, add_observations)
- Performance within acceptable range

⚠️ **EVALUATE ROLLBACK if:**

- Data counts don't match (missing entities or relations)
- Critical constraints missing or broken
- Indexes failed to migrate or stuck in error state
- MCP operations consistently failing
- Severe performance degradation (>50% slower)

**DECISION POINT:** If significant issues, proceed to Phase 6 (Rollback). Otherwise, continue to Phase 5 (Monitoring).

---

### Phase 5: Post-Upgrade Monitoring

**Objective:** Extended monitoring to catch latent issues

**Time Estimate:** 48 hours (periodic checks)
**Risk Level:** LOW
**Rollback Complexity:** MEDIUM (decreases over time as new data created)

#### Monitoring Schedule

| Checkpoint | Time After Upgrade | Priority | Commands                                             |
| ---------- | ------------------ | -------- | ---------------------------------------------------- |
| **T+6h**   | 6 hours            | HIGH     | Check logs, verify container running, count entities |
| **T+12h**  | 12 hours           | MEDIUM   | Check logs, memory usage, data integrity             |
| **T+24h**  | 24 hours           | MEDIUM   | Check logs, performance, relation count              |
| **T+48h**  | 48 hours           | HIGH     | **FINAL** verification, success declaration          |

#### Checkpoint Commands

```bash
# Check for errors in recent logs
ssh root@<hostname>
docker logs --since 6h $NEO4J_CONTAINER | grep -i error | head -20

# Verify container still running
docker ps | grep $NEO4J_CONTAINER

# Quick data integrity check
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "MATCH (e:Entity) WHERE e.validTo IS NULL RETURN count(e);"

# Memory and CPU usage
docker stats --no-stream $NEO4J_CONTAINER
```

**Expected Results at Each Checkpoint:**

- ✅ No critical errors in logs
- ✅ Container running continuously
- ✅ Entity count stable or increased (new data added)
- ✅ Memory usage stable within configured limits
- ✅ No performance degradation

#### Success Declaration Criteria

After **48 hours**, if all of the following are true:

- ✅ All 4 checkpoints passed
- ✅ No critical errors in logs
- ✅ Data integrity maintained (counts stable or growing)
- ✅ MCP operations working normally throughout period
- ✅ No performance degradation
- ✅ Memory usage stable

**Then:** Upgrade officially successful. Safe to remove old Docker image.

#### Optional Cleanup (After 48h Success)

```bash
# Remove old Docker image backup
docker rmi neo4j:<old-version>-backup-$(date +%Y%m%d)

# Verify only new version remains
docker images | grep neo4j
```

**Note:** Database dump in `/root/neo4j-backups/` should be kept for at least 30 days.

---

## Configuration Management

### Deprecated Settings in Neo4j 5.26

Neo4j 5.26 LTS renamed several configuration settings. **Old names still work** but generate deprecation warnings in logs.

#### Setting Name Changes

| Deprecated (5.13 format)                  | New (5.26 format)                        | Purpose              |
| ----------------------------------------- | ---------------------------------------- | -------------------- |
| `NEO4J_dbms_checkpoint_interval_time`     | `NEO4J_db_checkpoint_interval_time`      | Checkpoint interval  |
| `NEO4J_dbms_memory_heap_initial__size`    | `NEO4J_server_memory_heap_initial__size` | Initial heap size    |
| `NEO4J_dbms_memory_heap_max__size`        | `NEO4J_server_memory_heap_max__size`     | Maximum heap size    |
| `NEO4J_dbms_memory_pagecache_size`        | `NEO4J_server_memory_pagecache_size`     | Page cache size      |
| `NEO4J_dbms_memory_transaction_max__size` | `NEO4J_db_memory_transaction_max`        | Max transaction size |

#### How to Update Settings

After successful upgrade and 48-hour monitoring, update settings to eliminate warnings:

```bash
# Stop container
docker stop --timeout=60 $NEO4J_CONTAINER

# Remove old container
docker rm $NEO4J_CONTAINER

# Recreate with new setting names
docker run -d \
  --name $NEO4J_CONTAINER \
  --restart unless-stopped \
  -p <host-ip>:7474:7474 \
  -p <host-ip>:7687:7687 \
  -v <data-volume>:/data \
  -v <logs-volume>:/logs \
  -e NEO4J_AUTH=neo4j/<your-password> \
  -e "NEO4J_PLUGINS=[\"apoc\"]" \
  -e NEO4J_db_checkpoint_interval_time=30s \
  -e NEO4J_server_memory_heap_initial__size=512M \
  -e NEO4J_server_memory_heap_max__size=512M \
  -e NEO4J_server_memory_pagecache_size=256M \
  -e NEO4J_db_memory_transaction_max=128M \
  neo4j:5.26-community

# Verify startup logs show no deprecation warnings
docker logs $NEO4J_CONTAINER | grep -i "deprecated"
```

**Expected Output:** No deprecation warnings in logs

### Memory Tuning Guidance

Recommended memory configuration for knowledge graphs:

**For small graphs (<1000 entities):**

```bash
-e NEO4J_server_memory_heap_initial__size=512M
-e NEO4J_server_memory_heap_max__size=512M
-e NEO4J_server_memory_pagecache_size=256M
```

**For medium graphs (1000-10000 entities):**

```bash
-e NEO4J_server_memory_heap_initial__size=1G
-e NEO4J_server_memory_heap_max__size=1G
-e NEO4J_server_memory_pagecache_size=512M
```

**For large graphs (>10000 entities):**

```bash
-e NEO4J_server_memory_heap_initial__size=2G
-e NEO4J_server_memory_heap_max__size=2G
-e NEO4J_server_memory_pagecache_size=1G
```

**Rule of thumb:** Total memory = heap + pagecache + 512MB OS overhead

---

## Troubleshooting

### Common Issues and Solutions

#### Issue 1: "Store format incompatible" Error

**Symptoms:**

```
Neo4j cannot start because the database was created with an incompatible version
```

**Cause:** Major version jump without migration (e.g., 4.x → 5.x)

**Solution:**

- This should NOT occur for 5.13 → 5.26 upgrades (same major version)
- If encountered: Execute rollback procedure immediately
- Consider intermediate upgrade steps (4.x → 5.0 → 5.26)

#### Issue 2: Schema Constraint Conflicts

**Symptoms:**

```
Node already exists with label 'Entity' and property 'name' = '...'
```

**Cause:** Database has single-field constraint on `Entity.name` instead of composite `(name, validTo)` constraint

**Solution:** See detailed fix guide: [`docs/SCHEMA_CONSTRAINT_FIX.md`](SCHEMA_CONSTRAINT_FIX.md)

**Prevention:** Always verify constraint structure in Phase 1 (step 1.3)

#### Issue 3: Vector Index Not Working

**Symptoms:**

```
WARNING: Vector indexes require Neo4j Enterprise Edition
```

**Cause:** Vector indexes are Enterprise-only feature

**Solution:**

- Expected for Community Edition installations
- Embeddings still stored in entity properties
- Semantic search falls back to similarity calculation (slower but functional)
- No action required unless Enterprise license available

#### Issue 4: APOC Plugin Not Loading

**Symptoms:**

```
Failed to load APOC procedures
```

**Cause:** APOC plugin not configured in environment variables

**Solution:**

```bash
# Ensure APOC specified in docker run command
-e "NEO4J_PLUGINS=[\"apoc\"]"

# Verify plugin loaded
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "SHOW PROCEDURES YIELD name WHERE name STARTS WITH 'apoc' RETURN count(name);"
```

**Expected Output:** Count > 0 (typically 400+ APOC procedures)

#### Issue 5: High Memory Usage After Upgrade

**Symptoms:**

- Memory usage consistently above configured heap + pagecache
- Container approaching host memory limits

**Diagnosis:**

```bash
# Check actual memory usage
docker stats --no-stream $NEO4J_CONTAINER

# Review Neo4j memory metrics
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "CALL dbms.listConfig() YIELD name, value WHERE name CONTAINS 'memory' RETURN name, value;"
```

**Solution:**

- Verify heap and pagecache settings applied correctly
- Increase transaction max size if handling large operations
- Consider increasing host memory allocation
- Monitor for memory leaks (sustained growth over 48h)

#### Issue 6: Slow Query Performance

**Symptoms:**

- Queries taking significantly longer than pre-upgrade (>50% slower)
- Timeout errors from MCP server

**Diagnosis:**

```bash
# Check index status (ensure all ONLINE)
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "SHOW INDEXES;"

# Analyze slow query
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "EXPLAIN <your-slow-query>;"
```

**Solution:**

- Wait for indexes to fully populate (check for "POPULATING" status)
- Verify pagecache size sufficient for graph size
- Consider query optimization (add indexes, rewrite Cypher)
- If persistent: investigate with `PROFILE` command

---

## Rollback Procedure

**Use this section ONLY if verification fails or critical issues discovered**

### Rollback Decision Criteria

**Execute rollback immediately if:**

- ❌ Data counts don't match baseline (missing entities/relations)
- ❌ Database corruption detected or store format errors
- ❌ MCP server cannot connect or crashes repeatedly
- ❌ Critical functionality broken (temporal versioning, search)
- ❌ Severe performance degradation (>50% slower, sustained)

**Consider rollback if:**

- ⚠️ Minor performance regression (20-30% slower)
- ⚠️ Non-critical errors in logs
- ⚠️ Vector search slower than expected (Community Edition limitation)

### Rollback Execution

#### Step 1: Stop 5.26 Container

```bash
ssh root@<hostname>
docker stop --timeout=60 $NEO4J_CONTAINER
```

#### Step 2: Remove 5.26 Container

```bash
docker rm $NEO4J_CONTAINER
```

#### Step 3: Restore from Backup (if data corrupted)

**Only execute if data volumes corrupted. Otherwise skip to Step 4.**

```bash
# Remove corrupted volumes (CAUTION)
docker volume rm <data-volume> <logs-volume>

# Create fresh volumes
docker volume create <data-volume>
docker volume create <logs-volume>

# Restore database dump
docker run --rm \
  -v <data-volume>:/data \
  -v /root/neo4j-backups:/backups \
  neo4j:<old-version>-backup-$(date +%Y%m%d) \
  neo4j-admin database load neo4j --from-path=/backups
```

#### Step 4: Recreate Container with Old Version

```bash
# Use backed-up configuration from Phase 1
docker run -d \
  --name $NEO4J_CONTAINER \
  --restart unless-stopped \
  [... use exact command from Phase 1 backup JSON ...] \
  neo4j:<old-version>-backup-$(date +%Y%m%d)

# Wait for startup
sleep 45
```

#### Step 5: Verify Rollback Successful

```bash
# Verify old version running
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "CALL dbms.components() YIELD name, versions RETURN name, versions;"

# Verify data integrity
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "MATCH (e:Entity) WHERE e.validTo IS NULL RETURN count(e);"

# Compare to Phase 1 baseline
```

**Expected Output:**

- Neo4j version matches pre-upgrade (e.g., 5.13.0)
- Entity count matches Phase 1 baseline
- MCP server can reconnect

### Post-Rollback Analysis

**Document:**

- Why rollback was triggered
- Exact error messages encountered
- Data loss (if any)
- Lessons learned for next attempt

**Next Steps:**

- Investigate root cause before retry
- Consider testing upgrade locally first (Docker on development machine)
- Check Neo4j community forum for similar issues
- Review Neo4j upgrade notes for version-specific issues

---

## Real-World Example

### jp-vps-1: Neo4j 5.13.0 → 5.26.13 LTS Upgrade

**Date:** 2025-10-20
**Host:** jp-vps-1 VPS (Tailscale IP: 100.109.177.39)
**Executor:** Automated with human approval (Claude Code + sequential thinking)

#### Pre-Upgrade State

```
Neo4j Version: 5.13.0-community (23 months old, EOL)
Container: neo4j-kg (ID: 80e600d2c001)
Entities: 686 (current)
Relations: 934 (total)
Docker Image: neo4j:5.13-community (495MB)
Memory Config: 512M heap, 256M pagecache, 128M transaction max
Uptime: 13 hours before upgrade
```

#### Upgrade Execution Summary

| Phase       | Duration | Result         | Notes                                          |
| ----------- | -------- | -------------- | ---------------------------------------------- |
| **Phase 1** | 30 min   | ✅ Success     | Baseline: 686 entities, 934 relations          |
| **Phase 2** | 15 min   | ✅ Success     | Backup: 2.4MB dump, SHA256 verified            |
| **Phase 3** | 10 min   | ✅ Success     | Image: neo4j:5.26-community (524MB)            |
| **Phase 4** | 20 min   | ✅ Success     | Data: 100% match, MCP: all operations verified |
| **Phase 5** | 48 hours | 🔄 In Progress | Checkpoints: T+6h, T+12h, T+24h, T+48h         |
| **Total**   | ~75 min  | ✅ Success     | Downtime: ~20 minutes                          |

#### Key Findings

**Success Factors:**

- ✅ Comprehensive planning with go/no-go checkpoints at each phase
- ✅ Database dump backup (2.4MB) completed successfully
- ✅ Docker image tagging for instant rollback capability
- ✅ Zero data loss (686 entities, 934 relations preserved exactly)
- ✅ Schema integrity maintained (composite constraint on name+validTo)
- ✅ MCP operations verified: search, semantic search, temporal versioning
- ✅ Performance stable: ~3 second queries, 868MB memory usage

**Challenges Encountered:**

- ⚠️ Deprecation warnings for old setting names (dbms._ → db._ and server.\*)
  - **Impact:** Cosmetic only, logged warnings but fully functional
  - **Resolution:** Settings updated post-upgrade (see Configuration Management)

**Performance Improvements:**

- Query response time: Stable (~3 seconds for full entity count)
- Memory usage: 868MB (within 512M heap + 256M pagecache limits)
- Semantic search: Functional (Enterprise vector indexes not available in Community Edition)

#### Post-Upgrade Configuration

```bash
# Updated docker run command (deprecated settings renamed)
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

**Result:** No deprecation warnings after settings update

#### Lessons from jp-vps-1 Upgrade

1. **LTS Choice Validated:** 5.26 LTS provides stability without bleeding-edge risks
2. **Sequential Thinking Effective:** 20-thought analysis (s3) identified all risks upfront
3. **Backup Strategy Critical:** Database dump proved essential safety net
4. **MCP Compatibility:** neo4j-driver 5.28.1 supported both versions seamlessly
5. **Monitoring Period:** 48-hour checkpoints catch latent issues before declaring success

---

## Lessons Learned

### Key Takeaways from Production Upgrades

#### 1. LTS vs. Latest Stable Tradeoff

**Recommendation:** For personal knowledge graphs storing irreplaceable context, **choose LTS**.

**Rationale:**

- 3+ years of security patches (Neo4j 5.26 supported until June 2028)
- Lower maintenance burden (infrequent version bumps)
- Stability over performance (5-10% gain vs. 10-20%, but fewer bugs)
- Reduced risk of breaking changes

**When to choose Latest Stable:**

- High-throughput production services where 10-20% performance matters
- Organizations with dedicated DevOps managing frequent updates
- Need for cutting-edge features unavailable in LTS

#### 2. Backup Strategy: Dumps > Volume Snapshots

**Best Practice:** Always use `neo4j-admin database dump` over Docker volume snapshots.

**Why:**

- **Portable:** Dump files work across Neo4j versions and platforms
- **Verified:** Neo4j validates data integrity during dump creation
- **Compact:** Compressed format saves storage space
- **Version-independent:** Can restore dump on any compatible Neo4j version

**Volume snapshots limitations:**

- Tied to specific Neo4j version and configuration
- May not be consistent if database active during snapshot
- Larger storage footprint (entire volume copied)

#### 3. Driver Compatibility Matters

**Check driver compatibility BEFORE upgrading:**

| Driver Version   | Neo4j 5.13 | Neo4j 5.26 | Neo4j 2025.x |
| ---------------- | ---------- | ---------- | ------------ |
| neo4j-driver 5.x | ✅ Yes     | ✅ Yes     | ❌ No        |
| neo4j-driver 6.x | ✅ Yes     | ✅ Yes     | ✅ Yes       |

**Lesson:** For 5.x → 5.26 upgrade, neo4j-driver 5.x sufficient. For 5.x → 2025.x, upgrade driver first.

#### 4. Configuration Management: Old Settings Work

**Neo4j 5.26 maintains backward compatibility for deprecated setting names.**

**Implication:**

- Can upgrade first, update settings later
- Reduces upgrade complexity
- Eliminates forced configuration changes during critical upgrade window

**Best practice:**

- Upgrade database first with old setting names
- Complete 48-hour monitoring period
- Update settings in separate maintenance window

#### 5. Rollback Capability is Safety Net

**Essential rollback components:**

1. **Tagged Docker image:** Instant rollback to old version
2. **Database dump:** Recovery from data corruption
3. **Configuration backup:** Exact recreation of original setup
4. **Documented procedure:** Step-by-step rollback commands

**Real-world value:** Psychological safety enables faster decision-making during upgrade.

#### 6. Monitoring Catches Latent Issues

**48-hour monitoring schedule prevents premature success declaration:**

- **T+6h:** Immediate post-upgrade errors (startup issues, misconfigurations)
- **T+12h:** Short-term stability issues (memory leaks, performance degradation)
- **T+24h:** Medium-term operational issues (index corruption, query errors)
- **T+48h:** Confidence in long-term stability (no hidden issues)

**Pattern:** Most upgrade failures occur within first 24 hours. 48-hour period provides safety margin.

---

## Monitoring Schedule

### Comprehensive 48-Hour Monitoring Checklist

#### Checkpoint 1: T+6 Hours

**When:** 6 hours after upgrade completion

**Priority:** HIGH

**Commands:**

```bash
ssh root@<hostname>

# Check for errors in logs
docker logs --since 6h $NEO4J_CONTAINER | grep -iE "(error|fatal)" | head -20

# Verify container running continuously
docker ps | grep $NEO4J_CONTAINER

# Quick data integrity check
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "MATCH (e:Entity) WHERE e.validTo IS NULL RETURN count(e);"
```

**Expected Results:**

- ✅ No critical errors in logs (INFO and WARN acceptable)
- ✅ Container status: "Up" (running continuously)
- ✅ Entity count: Baseline or higher (new entities added = good sign)

**Red Flags:**

- ❌ Critical errors or stack traces in logs
- ❌ Container restarted (check restart count)
- ❌ Entity count lower than baseline

#### Checkpoint 2: T+12 Hours

**When:** 12 hours after upgrade completion

**Priority:** MEDIUM

**Commands:**

```bash
ssh root@<hostname>

# Check for errors since last checkpoint
docker logs --since 6h $NEO4J_CONTAINER | grep -iE "(error|fatal)"

# Memory and CPU usage
docker stats --no-stream $NEO4J_CONTAINER

# Data integrity check
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "MATCH (e:Entity) WHERE e.validTo IS NULL RETURN count(e);"
```

**Expected Results:**

- ✅ No new critical errors
- ✅ Memory usage stable (within configured heap + pagecache + ~200MB overhead)
- ✅ CPU usage low (<5% when idle, spikes during queries normal)
- ✅ Data integrity maintained

**Red Flags:**

- ❌ Memory usage growing continuously (memory leak)
- ❌ CPU usage sustained at >50% when idle
- ❌ Data integrity issues

#### Checkpoint 3: T+24 Hours

**When:** 24 hours after upgrade completion

**Priority:** MEDIUM

**Commands:**

```bash
ssh root@<hostname>

# Check for errors since last checkpoint
docker logs --since 12h $NEO4J_CONTAINER | grep -iE "(error|fatal)"

# Performance check
time docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "MATCH (e:Entity) WHERE e.validTo IS NULL RETURN count(e);"

# Relation count check
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "MATCH ()-[r]->() RETURN count(r);"
```

**Expected Results:**

- ✅ No errors in last 12 hours
- ✅ Query performance consistent with Phase 4 baseline
- ✅ Relation count stable or increased

**Red Flags:**

- ❌ Performance degraded significantly (>30% slower)
- ❌ Recurring errors in logs

#### Checkpoint 4: T+48 Hours (FINAL)

**When:** 48 hours after upgrade completion

**Priority:** HIGH

**Commands:**

```bash
ssh root@<hostname>

# Final log check
docker logs --since 24h $NEO4J_CONTAINER | grep -iE "(error|fatal)"

# Container health
docker ps | grep $NEO4J_CONTAINER
docker stats --no-stream $NEO4J_CONTAINER

# Final data integrity verification
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "MATCH (e:Entity) WHERE e.validTo IS NULL RETURN count(e) as entities;"

docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "MATCH ()-[r]->() RETURN count(r) as relations;"

# Check index status
docker exec $NEO4J_CONTAINER cypher-shell -u $NEO4J_USER -p "$NEO4J_PASS" \
  "SHOW INDEXES;"
```

**Expected Results:**

- ✅ No errors in last 24 hours
- ✅ Container running continuously (no restarts)
- ✅ Memory usage stable
- ✅ Data counts stable or growing
- ✅ All indexes ONLINE

**Success Declaration:** If all 4 checkpoints passed, upgrade is officially successful.

**Next Steps After Success:**

```bash
# Optional: Remove old backup image (keep database dump for 30 days)
docker rmi neo4j:<old-version>-backup-$(date +%Y%m%d)

# Verify only new version remains
docker images | grep neo4j

# Update monitoring notes
echo "Upgrade completed successfully: $(date -u)" >> /root/neo4j-upgrade-success.log
```

---

## Additional Resources

### Official Documentation

- **Neo4j 5.26 LTS Release Notes:** https://neo4j.com/release-notes/
- **Neo4j Operations Manual:** https://neo4j.com/docs/operations-manual/5/
- **Neo4j Docker Documentation:** https://neo4j.com/docs/operations-manual/5/docker/
- **Neo4j Upgrade Guide:** https://neo4j.com/docs/upgrade-migration-guide/

### MCP Server Documentation

- **mcp-neo4j-knowledge-graph:** https://github.com/henrychong-ai/mcp-neo4j-knowledge-graph
- **npm Package:** https://www.npmjs.com/package/@henrychong-ai/mcp-neo4j-knowledge-graph
- **Schema Constraint Fix:** [`docs/SCHEMA_CONSTRAINT_FIX.md`](SCHEMA_CONSTRAINT_FIX.md)

### Community Support

- **Neo4j Community Forum:** https://community.neo4j.com/
- **Neo4j Discord:** https://discord.gg/neo4j
- **GitHub Issues:** https://github.com/henrychong-ai/mcp-neo4j-knowledge-graph/issues

---

## Version History

| Version | Date       | Changes                                                 |
| ------- | ---------- | ------------------------------------------------------- |
| 1.0.0   | 2025-10-20 | Initial release based on jp-vps-1 upgrade (5.13 → 5.26) |

---

**Document maintained by:** Henry Chong (henry@henrychong.ai)
**Last Updated:** 2025-10-20
**Status:** Production-tested on jp-vps-1
