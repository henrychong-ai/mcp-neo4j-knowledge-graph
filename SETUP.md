# Setup Guide - Neo4j Knowledge Graph MCP Server

Complete step-by-step guide for getting the MCP server running with Claude Desktop and Claude Code.

## Quick Setup Checklist

- [ ] Node.js 20+ installed
- [ ] Neo4j database running (Docker or local)
- [ ] Environment variables configured
- [ ] MCP server installed
- [ ] Claude Desktop/Code configured
- [ ] First entity created and verified

**Expected setup time:** 10-15 minutes

---

## 1. Prerequisites Check

### Required Software

**Node.js** (version 20.0.0 or higher)
```bash
node --version  # Should show v20.x.x or higher
```

If not installed:
- **macOS**: `brew install node`
- **Linux**: Use [nvm](https://github.com/nvm-sh/nvm) or package manager
- **Windows**: Download from [nodejs.org](https://nodejs.org/)

**Docker & Docker Compose** (recommended for Neo4j)
```bash
docker --version
docker compose version
```

If not installed:
- **macOS**: Install [Docker Desktop](https://www.docker.com/products/docker-desktop)
- **Linux**: Follow [Docker Engine installation](https://docs.docker.com/engine/install/)
- **Windows**: Install [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)

### System Requirements

- **Disk space**: 2GB minimum (Neo4j database + node_modules)
- **Memory**: 2GB RAM minimum (512MB for Neo4j)
- **OS**: macOS, Linux, or Windows (WSL2 recommended)

---

## 2. Neo4j Database Setup

### Option A: Docker Compose (Recommended)

**Fastest setup method - single command:**

1. Create a `docker-compose.yml` file:

```yaml
version: '3.8'
services:
  neo4j:
    image: neo4j:5.26-community
    container_name: neo4j-kg
    restart: unless-stopped
    ports:
      - "7474:7474"  # Browser UI
      - "7687:7687"  # Bolt protocol
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
    environment:
      - NEO4J_AUTH=neo4j/your_secure_password_here
      - NEO4J_PLUGINS=["apoc"]
      - NEO4J_server_memory_heap_initial__size=512M
      - NEO4J_server_memory_heap_max__size=512M
      - NEO4J_server_memory_pagecache_size=256M

volumes:
  neo4j_data:
  neo4j_logs:
```

2. Start Neo4j:

```bash
docker compose up -d
```

3. Verify it's running:

```bash
docker compose ps  # Should show "running"
docker compose logs neo4j  # Check for "Started."
```

4. Access Neo4j Browser at `http://localhost:7474`
   - Username: `neo4j`
   - Password: `your_secure_password_here` (from docker-compose.yml)

### Option B: Local Installation (macOS)

```bash
# Install via Homebrew
brew install neo4j

# Start Neo4j service
neo4j start

# Set initial password
neo4j-admin set-initial-password your_secure_password
```

Access Neo4j Browser at `http://localhost:7474`

### Option C: Local Installation (Linux)

Follow the [official Neo4j installation guide](https://neo4j.com/docs/operations-manual/current/installation/linux/) for your distribution.

### Initial Schema Creation

The MCP server automatically creates required constraints and indexes on first connection. You can verify manually:

```cypher
// In Neo4j Browser, run:
SHOW CONSTRAINTS;

// You should see:
// - entity_name: UNIQUE (name, validTo) on Entity nodes
// - relation_unique: UNIQUE (from, to, relationType, validTo) on Relation nodes
```

If schema creation fails, see [Troubleshooting](#8-troubleshooting-guide) below.

---

## 3. Environment Configuration

Create a `.env` file in your project directory (or set system environment variables):

```bash
# Neo4j Connection (REQUIRED)
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_secure_password_here

# OpenAI API (OPTIONAL - for vector embeddings and semantic search)
OPENAI_API_KEY=sk-proj-...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Server Configuration (OPTIONAL)
LOG_LEVEL=info
```

**Important notes:**
- Replace `your_secure_password_here` with your actual Neo4j password
- OpenAI API key is optional - server works without it (no semantic search)
- If using Docker on a different machine, update `NEO4J_URI` to the correct host

**Verify connection:**

```bash
# Install the MCP server first (see next section)
npm run neo4j:test
```

---

## 4. MCP Server Installation

### Install from npm

```bash
# Global installation (recommended)
npm install -g @henrychong-ai/mcp-neo4j-knowledge-graph

# Verify installation
mcp-neo4j-knowledge-graph --version
```

**Note**: The global executable is named `mcp-neo4j-knowledge-graph`.

### Verify Server Starts Correctly

```bash
mcp-neo4j-knowledge-graph

# Expected: Server starts and waits for input (press Ctrl+C to exit)
```

If you see errors, check:
- Neo4j is running (`docker compose ps` or `neo4j status`)
- Environment variables are set correctly
- Neo4j credentials are correct

---

## 5. Claude Desktop Setup

### Locate Configuration File

**macOS:**
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Linux:**
```bash
~/.config/Claude/claude_desktop_config.json
```

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

### Add MCP Server Configuration

Edit `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "neo4j-knowledge-graph": {
      "command": "npx",
      "args": [
        "-y",
        "@henrychong-ai/mcp-neo4j-knowledge-graph"
      ],
      "env": {
        "NEO4J_URI": "bolt://localhost:7687",
        "NEO4J_USERNAME": "neo4j",
        "NEO4J_PASSWORD": "your_secure_password_here",
        "OPENAI_API_KEY": "sk-proj-..."
      }
    }
  }
}
```

**Important:**
- Replace `your_secure_password_here` with your actual Neo4j password
- Add your OpenAI API key if you want semantic search (optional)

### Restart Claude Desktop

After editing the config file:
1. Quit Claude Desktop completely
2. Restart Claude Desktop
3. Look for the MCP server icon in the bottom-left corner
4. Click it to verify tools are loaded

---

## 6. Claude Code Setup

### Add to Claude Code Configuration

Edit `~/.claude.json` (create if it doesn't exist):

```json
{
  "mcpServers": {
    "neo4j-knowledge-graph": {
      "command": "npx",
      "args": [
        "-y",
        "@henrychong-ai/mcp-neo4j-knowledge-graph"
      ],
      "env": {
        "NEO4J_URI": "bolt://localhost:7687",
        "NEO4J_USERNAME": "neo4j",
        "NEO4J_PASSWORD": "your_secure_password_here",
        "OPENAI_API_KEY": "sk-proj-..."
      }
    }
  }
}
```

### Verify MCP Tools Available

In a Claude Code session, ask:

```
Show me the available MCP tools for the knowledge graph
```

You should see:
- `mcp__kg__create_entities`
- `mcp__kg__create_relations`
- `mcp__kg__add_observations`
- `mcp__kg__search_nodes`
- `mcp__kg__semantic_search`
- `mcp__kg__open_nodes`
- And more...

---

## 7. First MCP Tool Test

### Step 1: Create Your First Entity

In Claude Desktop or Claude Code, say:

```
Use the knowledge graph to create an entity named "Python"
of type "Programming Language" with the observation
"General-purpose, high-level programming language known for readability"
```

Claude will use the `mcp__kg__create_entities` tool.

### Step 2: Search for the Entity

```
Search the knowledge graph for "Python"
```

Claude will use the `mcp__kg__search_nodes` tool and should find your entity.

### Step 3: Add More Observations

```
Add these observations to the Python entity:
- Created by Guido van Rossum in 1991
- Popular for data science, web development, and automation
- Dynamic typing with interpreted execution
```

Claude will use the `mcp__kg__add_observations` tool.

### Step 4: Verify in Neo4j Browser

Open `http://localhost:7474` and run:

```cypher
MATCH (e:Entity {name: "Python"})
WHERE e.validTo IS NULL
RETURN e
```

You should see your entity with all observations.

### Step 5: Test Semantic Search (If OpenAI API Key Configured)

```
Generate embeddings for the Python entity, then perform
a semantic search for "programming languages for beginners"
```

Expected workflow:
1. Claude generates embeddings using `npm run embeddings:generate` or similar
2. Claude performs semantic search using `mcp__kg__semantic_search`
3. Python entity should appear in results

---

## 8. Troubleshooting Guide

### Neo4j Connection Refused

**Symptom:** `Error: Connection refused to bolt://localhost:7687`

**Solutions:**
1. Check Neo4j is running: `docker compose ps` or `neo4j status`
2. Verify port 7687 is accessible: `telnet localhost 7687`
3. Check Docker container logs: `docker compose logs neo4j`
4. Ensure no firewall blocking port 7687

### MCP Server Won't Start

**Symptom:** Claude Desktop shows "MCP server failed to start"

**Solutions:**
1. Verify environment variables in `claude_desktop_config.json`
2. Test credentials manually in Neo4j Browser
3. Check Claude Desktop logs:
   - **macOS**: `~/Library/Logs/Claude/`
   - **Linux**: `~/.config/Claude/logs/`
4. Try running server manually: `npx @henrychong-ai/mcp-neo4j-knowledge-graph`

### OpenAI API Key Errors

**Symptom:** `Error: Invalid API key` or `Error: Rate limit exceeded`

**Solutions:**
1. Verify API key starts with `sk-proj-` or `sk-`
2. Check API key is active at [platform.openai.com](https://platform.openai.com/api-keys)
3. Verify billing is enabled on your OpenAI account
4. For rate limits, wait a few minutes or upgrade OpenAI tier

### Claude Can't Find MCP Server

**Symptom:** No MCP tools available in Claude

**Solutions:**
1. Restart Claude Desktop completely (quit and reopen)
2. Verify `claude_desktop_config.json` has correct JSON syntax
3. Check absolute paths are used (no `~/` or relative paths)
4. Look for the MCP server icon in Claude Desktop's bottom-left corner
5. Click the icon to see connection status and errors

### Schema Constraint Errors

**Symptom:** `Node already exists with label 'Entity' and property 'name'`

**Cause:** Old single-field constraint blocks temporal versioning. This can happen when upgrading from older versions.

**Complete Fix:** Run these commands in Neo4j Browser (`http://localhost:7474`):

```cypher
// Step 1: Check current constraints
SHOW CONSTRAINTS;

// Step 2: Drop old single-field constraint if it exists
DROP CONSTRAINT entity_name IF EXISTS;

// Step 3: Create correct composite constraint for temporal versioning
CREATE CONSTRAINT entity_name
FOR (e:Entity)
REQUIRE (e.name, e.validTo) IS UNIQUE;

// Step 4: Verify the fix
SHOW CONSTRAINTS;
// You should see: UNIQUE (name, validTo) for Entity nodes
```

**Why this is needed:** Temporal versioning creates multiple entity versions with the same name but different `validTo` timestamps. The composite constraint allows this, while a single-field constraint on `name` would block it.

### Embedding Generation Fails

**Symptom:** `npm run embeddings:generate` errors

**Solutions:**
1. Verify `OPENAI_API_KEY` is set in environment
2. Check entities exist: `MATCH (e:Entity) WHERE e.validTo IS NULL RETURN count(e)`
3. Test with subset first: `npm run embeddings:test` (processes 5 entities)
4. Check OpenAI API status at [status.openai.com](https://status.openai.com)

### Query Timeouts or Slow Performance

**Symptom:** MCP operations take > 5 seconds

**Solutions:**
1. Check Neo4j memory settings in docker-compose.yml
2. Verify indexes exist: `SHOW INDEXES` in Neo4j Browser
3. Monitor Neo4j resource usage: `docker stats neo4j-kg`
4. Consider increasing heap size for large databases (>10k entities)

### Permission Errors

**Symptom:** `EACCES: permission denied` when running commands

**Solutions:**
1. For global npm install: Use `sudo npm install -g` (Linux/macOS)
2. For local development: Ensure build directory is writable
3. For Docker: Verify volume permissions match user

---

## 9. Next Steps

### Advanced Features
- **Vector Embeddings**: Generate semantic search embeddings with `npm run embeddings:generate`
- **Temporal Versioning**: All entities/relations track historical changes automatically
- **Batch Operations**: Efficiently process multiple entities in single operations

### Example Workflows

**Build a Personal Knowledge Graph:**
```
Create entities for:
- Skills I want to learn (type: Skill)
- Books I'm reading (type: Book)
- Projects I'm working on (type: Project)

Then create relations like:
- Book "Clean Code" -> teaches -> Skill "Software Design"
- Project "My App" -> requires -> Skill "React"
```

**Track Technical Concepts:**
```
Create entities for frameworks, libraries, and tools you use.
Add observations about versions, features, gotchas, and best practices.
Use semantic search to find related concepts when learning new technologies.
```

---

## Quick Reference

### Common Commands

```bash
# Start Neo4j
docker compose up -d

# Stop Neo4j
docker compose down

# View Neo4j logs
docker compose logs -f neo4j

# Test Neo4j connection
npm run neo4j:test

# Generate embeddings
npm run embeddings:generate

# Run tests
npm test

# Build project (local dev)
npm run build
```

### Common Cypher Queries

```cypher
// Count all entities
MATCH (e:Entity) WHERE e.validTo IS NULL
RETURN count(e)

// Show all entity types
MATCH (e:Entity) WHERE e.validTo IS NULL
RETURN DISTINCT e.entityType, count(e) as count
ORDER BY count DESC

// Find entities without embeddings
MATCH (e:Entity) WHERE e.validTo IS NULL AND e.embedding IS NULL
RETURN e.name, e.entityType

// Show recent changes
MATCH (e:Entity)
WHERE e.validTo IS NULL
RETURN e.name, e.entityType, e.updatedAt
ORDER BY e.updatedAt DESC
LIMIT 20
```

---

**Setup complete!** You now have a fully functional Neo4j knowledge graph integrated with Claude.
