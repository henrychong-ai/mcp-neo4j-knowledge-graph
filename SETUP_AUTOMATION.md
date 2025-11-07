# MCP Neo4j Knowledge Graph - Automated Setup Guide

> **FOR CLAUDE CODE**: This is an interactive automation script. You are guiding a user through complete setup of the mcp-neo4j-knowledge-graph MCP server. Follow each section sequentially, prompting the user for input as needed. Be encouraging and clear in your communication.

---

## Your Role as Setup Assistant

You are helping a user set up the Neo4j Knowledge Graph MCP server from scratch. This automation assumes **NO prior setup** - not even Node.js or Docker.

**Your Tasks:**
1. Check prerequisites and guide installation if needed
2. Set up Neo4j database (Docker or local)
3. Generate configuration files
4. Integrate with Claude Code and/or Claude Desktop
5. Test the setup
6. Celebrate success! 🎉

**Be patient, encouraging, and clear.** Many users are new to this.

---

## Section 1: Welcome & Prerequisites Check

### 1.1 Welcome Message

Say something like:

```
Welcome! I'll guide you through setting up the Neo4j Knowledge Graph MCP server.
This will take about 10-15 minutes and give you persistent memory capabilities.

Let's start by checking your system prerequisites.
```

### 1.2 Check Node.js

**RUN:**
```bash
node --version
```

**EVALUATE:**
- **If version >= 20.0.0**: ✅ "Great! You have Node.js v[X.X.X] installed."
- **If version < 20.0.0**: ⚠️ "You have Node.js v[X.X.X], but we need v20.0.0 or higher."
  - **ACTION**: Provide upgrade instructions for their OS
- **If not found**: ❌ "Node.js is not installed."
  - **ACTION**: Provide installation instructions:
    - **macOS**: `brew install node`
    - **Linux**: Recommend nvm: `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash && nvm install 20`
    - **Windows**: Download from https://nodejs.org/

**STOP HERE** if Node.js installation is needed. Ask user to install and run this automation again.

### 1.3 Check Docker (for Neo4j)

**ASK USER:**
```
For Neo4j database, do you want to use:
1. Docker (Recommended - easiest setup, works everywhere)
2. Local installation (More control, requires manual setup)

Which do you prefer? (1 or 2)
```

**IF ANSWER = 1 (Docker):**

**RUN:**
```bash
docker --version && docker compose version
```

**EVALUATE:**
- **If both found**: ✅ "Docker and Docker Compose are installed."
- **If not found**: ❌ "Docker is not installed."
  - **ACTION**: Provide installation instructions:
    - **macOS**: Download Docker Desktop from https://www.docker.com/products/docker-desktop
    - **Linux**: Follow https://docs.docker.com/engine/install/
    - **Windows**: Download Docker Desktop for Windows

**STOP HERE** if Docker installation is needed. Ask user to install and run this automation again.

**IF ANSWER = 2 (Local installation):**
- Proceed to Section 2B (Local Neo4j)

---

## Section 2A: Neo4j Setup - Docker Path

### 2.1 Detect Operating System

**RUN:**
```bash
uname -s
```

This tells you the OS: `Darwin` (macOS), `Linux`, or check for Windows.

### 2.2 Ask for Neo4j Password

**ASK USER:**
```
Choose a password for your Neo4j database.
(Or press Enter to use the default: 'your_secure_password_here')

Password:
```

**STORE** the password as `NEO4J_PASSWORD` variable for later use.

### 2.3 Create docker-compose.yml

**TELL USER:**
```
I'm creating a docker-compose.yml file to run Neo4j...
```

**CREATE FILE** `docker-compose.yml` in current directory:

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
      - NEO4J_AUTH=neo4j/[NEO4J_PASSWORD]
      - NEO4J_PLUGINS=["apoc"]
      - NEO4J_server_memory_heap_initial__size=512M
      - NEO4J_server_memory_heap_max__size=512M
      - NEO4J_server_memory_pagecache_size=256M

volumes:
  neo4j_data:
  neo4j_logs:
```

**REPLACE** `[NEO4J_PASSWORD]` with the user's chosen password.

### 2.4 Start Neo4j

**RUN:**
```bash
docker compose up -d
```

**WAIT** 10 seconds, then **CHECK:**
```bash
docker compose ps
```

**EVALUATE:**
- **If shows "running"**: ✅ "Neo4j is running!"
- **If not running**: ❌ Show logs: `docker compose logs neo4j`

### 2.5 Verify Neo4j Access

**TELL USER:**
```
Neo4j is starting up... Let me check if it's accessible.
```

**RUN:**
```bash
curl -s http://localhost:7474 > /dev/null && echo "Neo4j Browser accessible" || echo "Not yet accessible"
```

**IF NOT ACCESSIBLE:**
- Wait 10 more seconds and try again
- After 3 attempts, show troubleshooting: `docker compose logs neo4j`

**WHEN ACCESSIBLE:**
```
✅ Neo4j is running! You can access the browser at: http://localhost:7474
   Username: neo4j
   Password: [their chosen password]
```

**GO TO:** Section 3 (Environment Configuration)

---

## Section 2B: Neo4j Setup - Local Installation Path

### 2.1 Provide OS-Specific Instructions

**FOR macOS:**
```bash
brew install neo4j
neo4j start
neo4j-admin set-initial-password [PASSWORD]
```

**FOR Linux:**
```
Follow the official guide at:
https://neo4j.com/docs/operations-manual/current/installation/linux/
```

**FOR Windows:**
```
Download Neo4j Desktop from:
https://neo4j.com/download/
```

**ASK USER:** "Have you completed the Neo4j installation? (yes/no)"

**IF NO:** Provide help and wait.
**IF YES:** Continue to verification.

### 2.2 Verify Local Neo4j

**RUN:**
```bash
neo4j status
```

**OR TRY:**
```bash
curl -s http://localhost:7474
```

**IF ACCESSIBLE:** ✅ Proceed to Section 3

---

## Section 3: Environment Configuration

### 3.1 Ask for OpenAI API Key (Optional)

**ASK USER:**
```
Do you have an OpenAI API key for semantic search?
This enables vector embeddings and semantic similarity.

(Optional - you can skip this and add it later)

Enter your OpenAI API key (or press Enter to skip):
```

**STORE** as `OPENAI_API_KEY` variable (or empty if skipped).

### 3.2 Create .env File (Optional)

**TELL USER:**
```
I'm creating a .env file for your configuration...
```

**CREATE FILE** `.env` in current directory:

```bash
# Neo4j Connection
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=[NEO4J_PASSWORD]
NEO4J_DATABASE=neo4j

# OpenAI API (Optional)
OPENAI_API_KEY=[OPENAI_API_KEY]
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

**NOTE:** This .env file is optional - configuration will be done in MCP client configs instead.

---

## Section 4: Claude Code Configuration

### 4.1 Explain What's Happening

**TELL USER:**
```
Now I'm going to configure Claude Code to use this MCP server.
I'll modify your ~/.claude.json file to add the Neo4j Knowledge Graph server.
```

### 4.2 Check if ~/.claude.json Exists

**RUN:**
```bash
[ -f ~/.claude.json ] && echo "exists" || echo "not found"
```

**IF NOT FOUND:**
**CREATE FILE** `~/.claude.json`:
```json
{
  "mcpServers": {}
}
```

### 4.3 Backup Existing Config

**IF FILE EXISTS:**
```bash
cp ~/.claude.json ~/.claude.json.backup-$(date +%Y%m%d-%H%M%S)
```

**TELL USER:** "I've created a backup of your existing config at ~/.claude.json.backup-[timestamp]"

### 4.4 Add MCP Server Configuration

**READ** current `~/.claude.json` content.

**ADD** this configuration to the `mcpServers` object:

```json
"neo4j-knowledge-graph": {
  "command": "npx",
  "args": ["-y", "@henrychong-ai/mcp-neo4j-knowledge-graph"],
  "env": {
    "MEMORY_STORAGE_TYPE": "neo4j",
    "NEO4J_URI": "bolt://localhost:7687",
    "NEO4J_USERNAME": "neo4j",
    "NEO4J_PASSWORD": "[NEO4J_PASSWORD]",
    "NEO4J_DATABASE": "neo4j",
    "NEO4J_VECTOR_INDEX": "entity_embeddings",
    "NEO4J_VECTOR_DIMENSIONS": "1536",
    "NEO4J_SIMILARITY_FUNCTION": "cosine",
    "OPENAI_API_KEY": "[OPENAI_API_KEY]",
    "OPENAI_EMBEDDING_MODEL": "text-embedding-3-small"
  }
}
```

**REPLACE:**
- `[NEO4J_PASSWORD]` with user's password
- `[OPENAI_API_KEY]` with user's API key (or remove line if not provided)

**WRITE** updated config back to `~/.claude.json`

**TELL USER:**
```
✅ Claude Code is now configured to use the Neo4j Knowledge Graph!
```

---

## Section 5: Claude Desktop Configuration (Optional)

### 5.1 Ask User

**ASK:**
```
Would you also like to configure Claude Desktop to use this MCP server?
(yes/no)
```

**IF NO:** Skip to Section 6

**IF YES:** Continue

### 5.2 Locate Claude Desktop Config

**FOR macOS:**
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**FOR Linux:**
```
~/.config/Claude/claude_desktop_config.json
```

**FOR Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

### 5.3 Backup and Update Config

**SAME PROCESS** as Section 4.3-4.4, but for Claude Desktop config file.

**TELL USER:**
```
✅ Claude Desktop is now configured!
You'll need to restart Claude Desktop for changes to take effect.
```

---

## Section 6: Verification & Testing

### 6.1 Test Neo4j Connection

**TELL USER:**
```
Let's verify the setup by testing the Neo4j connection...
```

**RUN:**
```bash
npx -y @henrychong-ai/mcp-neo4j-knowledge-graph --version
```

**IF SUCCESSFUL:** ✅ "MCP server package is accessible via npx!"

### 6.2 Explain Next Steps

**TELL USER:**
```
Great! Your setup is complete. Here's how to test it:

1. In THIS Claude Code session (or a new one), try:
   "Show me the available MCP tools for the knowledge graph"

2. Create your first entity:
   "Create an entity named 'Test' of type 'Example' with observation 'Setup test'"

3. Verify in Neo4j Browser:
   - Open http://localhost:7474
   - Login with: neo4j / [their password]
   - Run: MATCH (e:Entity) WHERE e.validTo IS NULL RETURN e

Would you like me to test it now by creating a sample entity?
```

### 6.3 Create Test Entity (If User Says Yes)

**USE MCP TOOL:** `mcp__kg__create_entities`

**CREATE:**
```json
{
  "entities": [
    {
      "name": "Setup_Test",
      "entityType": "Test",
      "observations": ["Successfully created during automated setup on [DATE]"]
    }
  ]
}
```

**IF SUCCESSFUL:**
```
🎉 Success! I just created a test entity in your knowledge graph!

Try searching for it: "Search the knowledge graph for 'Setup_Test'"
```

**IF FAILS:**
Show error and provide troubleshooting steps.

---

## Section 7: Troubleshooting

### Common Issues

**Issue: "Cannot connect to Neo4j"**
- Check Neo4j is running: `docker compose ps` or `neo4j status`
- Check port 7687 is accessible: `telnet localhost 7687`
- View Neo4j logs: `docker compose logs neo4j`

**Issue: "MCP tools not available in Claude Code"**
- Restart Claude Code session
- Check ~/.claude.json syntax is valid JSON
- Verify npx can run the package: `npx -y @henrychong-ai/mcp-neo4j-knowledge-graph --version`

**Issue: "Node already exists" error**
- This is a Neo4j schema constraint issue
- See: https://github.com/henrychong-ai/mcp-neo4j-knowledge-graph#troubleshooting

---

## Section 8: Success & Next Steps

### 8.1 Important: Restart Claude Code

**TELL USER:**
```
🎉 Setup is complete! However, there's one critical step:

⚠️  IMPORTANT: Claude Code needs to restart to load the new MCP server configuration.

Here's what to do:
1. Type "/exit" to exit this session
2. Type "claude --continue" to resume the session with MCP tools loaded
3. Once you're back, say "I'm back" or "ready" so I can help you test the MCP tools!

Don't worry - I'll be right here when you return. See you in a moment! 👋
```

**WAIT FOR USER TO RESTART AND RETURN**

When user returns and says they're back, proceed to Section 8.2

### 8.2 Test MCP Tools (After Restart)

**TELL USER:**
```
Welcome back! Now let's verify the MCP tools are working.

Let me check what tools are available...
```

**TRY TO USE MCP TOOL:** Check if MCP tools are available by attempting to list them or use one.

**IF MCP TOOLS ARE AVAILABLE:**
```
✅ Perfect! The MCP tools are loaded. Let's test them:
```

**SUGGEST TESTS:**
1. List available tools: "I can see [X] tools available including create_entities, search_nodes, semantic_search..."
2. Create a test entity if not already done
3. Search for the entity
4. View it in Neo4j Browser

**IF MCP TOOLS NOT AVAILABLE:**
```
Hmm, the tools aren't showing up yet. Let's troubleshoot:

1. Check your ~/.claude.json file has the correct configuration
2. Try restarting Claude Code one more time
3. Check for any error messages in the terminal

Would you like me to verify your configuration?
```

### 8.3 Optional: Add KG Usage Instructions to Claude User Preferences

**AFTER SUCCESSFUL MCP TOOL TEST:**

Now that your MCP server is working, you can optionally add Knowledge Graph usage instructions to your Claude user preferences file (~/.claude/CLAUDE.md). This helps Claude Code understand how to best use your knowledge graph.

**ASK USER:**
```
Would you like to add Knowledge Graph (KG) usage instructions to your Claude user preferences?

This will add helpful guidelines for:
- When to use semantic_search vs search_nodes
- Best practices for querying your knowledge graph
- Token limit warnings and optimization tips

Add instructions? (yes/no)
```

**IF NO:**
```
No problem! You can always add these instructions later by asking a future Claude Code session to:

"Read and execute the setup guide at henrychong.com/mcp-neo4j-kg/setup and add KG usage instructions to my CLAUDE.md file"

The setup guide contains the full instructions ready to add whenever you need them.
```

**CONTINUE TO SECTION 8.4**

**IF YES:**

#### Check if CLAUDE.md Exists

**RUN:**
```bash
[ -f ~/.claude/CLAUDE.md ] && echo "exists" || echo "not found"
```

**IF NOT FOUND:**
```
I'll create a new ~/.claude/CLAUDE.md file with the KG instructions.
```

**IF EXISTS:**
```
I'll add the KG instructions to your existing ~/.claude/CLAUDE.md file.
First, let me create a backup...
```

**RUN:**
```bash
cp ~/.claude/CLAUDE.md ~/.claude/CLAUDE.md.backup-$(date +%Y%m%d-%H%M%S)
```

#### Prepare KG Instructions Content

**DETERMINE OPENAI KEY STATUS:**
Check if user provided OpenAI API key during Section 3 setup.

**IF OPENAI KEY PROVIDED (Semantic search enabled):**

Create full instructions including semantic_search:

**RUN:**
```bash
cat >> ~/.claude/CLAUDE.md << 'EOF'

---

# Knowledge Graph (KG) Usage Instructions

*Added by mcp-neo4j-knowledge-graph setup on $(date +%Y-%m-%d)*

## Abbreviation
- **kg**: References the Neo4j knowledge graph and MCP tools (mcp__kg__search_nodes, mcp__kg__semantic_search, etc.)

## Search Methods

### semantic_search (Recommended for Exploration)

Use `semantic_search` for concept exploration, discovery, and natural language queries:

**When to use:**
- Exploring topics without knowing exact terminology
- Finding related concepts across different domains
- Natural language queries about abstract ideas

**Parameters:**
- `limit`: Maximum results (default: 10)
- `min_similarity`: Similarity threshold 0.0-1.0 (default: 0.6)
- `entity_types`: Optional filter by type
- `hybrid_search`: Combine with keyword search (default: true)

**Example queries:**
```
semantic_search("software architecture patterns")     → Finds design patterns, architectural concepts
semantic_search("database optimization techniques")   → Finds performance tuning, indexing strategies
semantic_search("project management methodologies")   → Finds Agile, Scrum, workflow approaches
```

**Benefits:**
- Finds conceptually related entities even with different terminology
- Discovers unexpected connections
- Works well with natural language queries

### search_nodes (Precision Method)

Use `search_nodes` for exact term matching:

**When to use:**
- Known exact terms or technical names
- Quick existence checks
- Technical lookups with specific terminology

**Benefits:**
- Fast and free (no API calls)
- Predictable exact matches
- Efficient for known terms

**Example queries:**
```
search_nodes("Docker")          → Finds entities mentioning Docker
search_nodes("React")           → Finds React-related entities
search_nodes("PostgreSQL")      → Finds PostgreSQL entities
```

**Limitations:**
- Literal matching only
- Won't find synonyms or related concepts
- Requires knowing exact terminology

## Best Practices

### Hybrid Approach (Recommended):
1. Start with `semantic_search` for discovery
2. Review results and identify exact terms used
3. Use `search_nodes` for precision refinement

### Query Optimization:
- **Semantic search**: Natural language - "web development frontend frameworks modern"
- **Keyword search**: Specific terms - "React", "Vue", "Angular"
- **Escalation**: semantic_search → search_nodes → file search → web search

## Critical Constraints

### NEVER use read_graph()
- ⚠️ The `read_graph()` tool always exceeds the 25,000 token response limit
- Response size: ~173,000 tokens (confirmed)
- **Always use `search_nodes()` or `semantic_search()` instead**

### Token Limit Awareness
- All MCP tool responses capped at 25,000 tokens maximum
- Use targeted searches rather than broad retrieval
- Apply filters early to reduce response size

---

EOF
```

**IF OPENAI KEY NOT PROVIDED (Semantic search disabled):**

**ASK USER:**
```
You didn't set up an OpenAI API key, so semantic search isn't currently enabled.

Would you like to include the semantic_search instructions anyway (as commented examples for future reference)?

This way, if you add an OpenAI key later, you'll have the instructions ready.

Include semantic_search instructions as comments? (yes/no)
```

**IF YES (include commented):**

**RUN:**
```bash
cat >> ~/.claude/CLAUDE.md << 'EOF'

---

# Knowledge Graph (KG) Usage Instructions

*Added by mcp-neo4j-knowledge-graph setup on $(date +%Y-%m-%d)*

## Abbreviation
- **kg**: References the Neo4j knowledge graph and MCP tools

## Search Methods

### search_nodes (Currently Available)

Use `search_nodes` for exact term matching:

**When to use:**
- Known exact terms or technical names
- Quick existence checks
- Technical lookups with specific terminology

**Example queries:**
```
search_nodes("Docker")          → Finds entities mentioning Docker
search_nodes("React")           → Finds React-related entities
search_nodes("PostgreSQL")      → Finds PostgreSQL entities
```

<!--
### semantic_search (Requires OpenAI API Key)

COMMENTED OUT - Add OpenAI API key to enable semantic search:

Use `semantic_search` for concept exploration and natural language queries:

**When to use:**
- Exploring topics without knowing exact terminology
- Finding related concepts across different domains
- Natural language queries about abstract ideas

**Parameters:**
- `limit`: Maximum results (default: 10)
- `min_similarity`: Similarity threshold 0.0-1.0 (default: 0.6)

**Example queries:**
```
semantic_search("software architecture patterns")     → Finds design patterns, architectural concepts
semantic_search("database optimization techniques")   → Finds performance tuning, indexing strategies
```

To enable: Add OPENAI_API_KEY to your ~/.claude.json MCP server config, then uncomment this section.
-->

## Critical Constraints

### NEVER use read_graph()
- ⚠️ The `read_graph()` tool always exceeds the 25,000 token response limit
- **Always use `search_nodes()` or `semantic_search()` instead**

---

EOF
```

**IF NO (omit semantic search):**

**RUN:**
```bash
cat >> ~/.claude/CLAUDE.md << 'EOF'

---

# Knowledge Graph (KG) Usage Instructions

*Added by mcp-neo4j-knowledge-graph setup on $(date +%Y-%m-%d)*

## Abbreviation
- **kg**: References the Neo4j knowledge graph and MCP tools

## Search Method

### search_nodes

Use `search_nodes` for exact term matching:

**When to use:**
- Known exact terms or technical names
- Quick existence checks
- Technical lookups with specific terminology

**Example queries:**
```
search_nodes("Docker")          → Finds entities mentioning Docker
search_nodes("React")           → Finds React-related entities
search_nodes("PostgreSQL")      → Finds PostgreSQL entities
```

## Critical Constraints

### NEVER use read_graph()
- ⚠️ The `read_graph()` tool always exceeds the 25,000 token response limit
- **Always use `search_nodes()` instead**

---

EOF
```

#### Verify Addition

**RUN:**
```bash
tail -20 ~/.claude/CLAUDE.md
```

**TELL USER:**
```
✅ Knowledge Graph usage instructions added to ~/.claude/CLAUDE.md!

A backup of your previous file was saved to:
~/.claude/CLAUDE.md.backup-[timestamp]

These instructions will help Claude Code use your knowledge graph more effectively in future sessions.
```

### 8.4 Final Success Celebration

**AFTER SUCCESSFUL MCP TOOL TEST:**

**TELL USER:**
```
🎉 Congratulations! Your Neo4j Knowledge Graph MCP server is fully working!

You now have:
✅ Neo4j database running
✅ MCP server configured in Claude Code
✅ MCP tools loaded and tested
[✅ Claude Desktop configured (if they chose this)]
✅ Test entity created and verified

Next steps:
1. Start building your knowledge graph by creating entities and relations
2. Use semantic search to find information: "Search for X"
3. Explore the documentation: https://www.npmjs.com/package/@henrychong-ai/mcp-neo4j-knowledge-graph

Happy graphing! 🚀
```

### 8.5 Save Setup Summary

**CREATE FILE** `mcp-neo4j-setup-summary.txt`:

```
MCP Neo4j Knowledge Graph - Setup Summary
==========================================
Date: [CURRENT DATE/TIME]

Neo4j:
- URI: bolt://localhost:7687
- Username: neo4j
- Password: [NEO4J_PASSWORD]
- Browser: http://localhost:7474

Configuration:
- Claude Code: ~/.claude.json ✅
- Claude Desktop: [YES/NO]

OpenAI Semantic Search: [ENABLED/SKIPPED]

Backups:
- ~/.claude.json.backup-[timestamp]

To restart Neo4j (Docker):
  docker compose restart neo4j

To stop Neo4j (Docker):
  docker compose stop neo4j

To view logs:
  docker compose logs -f neo4j

Documentation:
  https://www.npmjs.com/package/@henrychong-ai/mcp-neo4j-knowledge-graph
```

**TELL USER:** "I've saved a setup summary to mcp-neo4j-setup-summary.txt"

---

## End of Automation Script

**YOU'RE DONE!** The user now has a fully functional MCP Neo4j Knowledge Graph server.
