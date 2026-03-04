<p align="center">
  <img src="https://assets.henrychong.com/mcp-neo4j-knowledge-graph/logo-readme.png" alt="Neo4j Knowledge Graph MCP Server" width="800">
</p>

<h1 align="center">Neo4j Knowledge Graph MCP Server</h1>

<p align="center">
Scalable, high-performance knowledge graph memory system with semantic retrieval, contextual recall, and temporal awareness. Provides any LLM client supporting MCP (e.g., Claude Desktop, Cursor, GitHub Copilot) with resilient, adaptive, and persistent long-term ontological memory.
</p>

<p align="center">
<strong>Maintained by</strong> <a href="https://github.com/henrychong-ai">Henry Chong</a>
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@henrychong-ai/mcp-neo4j-knowledge-graph"><img src="https://img.shields.io/npm/v/@henrychong-ai/mcp-neo4j-knowledge-graph" alt="npm version"></a>
<a href="https://github.com/henrychong-ai/mcp-neo4j-knowledge-graph/actions/workflows/ci-cd.yml"><img src="https://github.com/henrychong-ai/mcp-neo4j-knowledge-graph/actions/workflows/ci-cd.yml/badge.svg" alt="CI"></a>
<a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
<a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-%3E%3D24-green" alt="Node.js"></a>
</p>

---

## Quick Start

Get up and running in ~10 minutes:

1. [Install Node.js](#installation) (v24+) and [start Neo4j](#storage-backend) (Docker or Desktop)
2. [Configure your MCP client](#configuration) (Claude Desktop, Claude Code, Cursor, etc.)
3. [Test the setup](#testing-your-setup) by creating your first entity

**Sections:**

- [Installation](#installation) - npm/npx setup
- [Neo4j Setup](#storage-backend) - Docker or local database
- [Configuration](#configuration) - Environment variables
- [Claude Desktop](#integration-with-claude-desktop) - MCP client setup
- [Claude Code](#integration-with-claude-code) - CLI client setup
- [Testing](#testing-your-setup) - Verification steps

---

## Installation

### Global Installation with npx (Recommended)

You can run this Neo4j Knowledge Graph MCP server directly using npx:

```bash
npx @henrychong-ai/mcp-neo4j-knowledge-graph
```

This method is recommended for use with Claude Desktop and other MCP-compatible clients.

### npm Installation

For local use or development:

```bash
# Install the package
pnpm install -g @henrychong-ai/mcp-neo4j-knowledge-graph

# Or use locally in your project
pnpm install @henrychong-ai/mcp-neo4j-knowledge-graph
```

> **Note**: This package is maintained in a private GitHub repository but published publicly to npm. The compiled code, documentation, and full functionality are available through npm installation.

---

## Core Concepts

### Entities

Entities are the primary nodes in the knowledge graph. Each entity has:

- A unique name (identifier)
- An entity type (e.g., "person", "organization", "event")
- A list of observations
- Vector embeddings (for semantic search)
- Complete version history

Example:

```json
{
  "name": "John_Smith",
  "entityType": "person",
  "observations": ["Speaks fluent Spanish"]
}
```

**EntityType Convention:** Use `lowercase-kebab-case` for entityType values (e.g., `person`, `medical-condition`, `claude-code-skill`). Avoid uppercase, spaces, or underscores.

### Relations

Relations define directed connections between entities with enhanced properties:

- Strength indicators (0.0-1.0)
- Confidence levels (0.0-1.0)
- Rich metadata (source, timestamps, tags)
- Temporal awareness with version history
- Time-based confidence decay

Example:

```json
{
  "from": "John_Smith",
  "to": "Anthropic",
  "relationType": "works_at",
  "strength": 0.9,
  "confidence": 0.95,
  "metadata": {
    "source": "linkedin_profile",
    "last_verified": "2025-03-21"
  }
}
```

## Storage Backend

This MCP server uses Neo4j as its storage backend, providing a unified solution for both graph storage and vector search capabilities.

### Why Neo4j?

- **Unified Storage**: Consolidates both graph and vector storage into a single database
- **Native Graph Operations**: Built specifically for graph traversal and queries
- **Integrated Vector Search**: Vector similarity search for embeddings built directly into Neo4j
- **Scalability**: Better performance with large knowledge graphs
- **Simplified Architecture**: Clean design with a single database for all operations

### Prerequisites

- Neo4j 5.13+ (required for vector search capabilities)

### Neo4j Desktop Setup (Recommended)

The easiest way to get started with Neo4j is to use [Neo4j Desktop](https://neo4j.com/download/):

1. Download and install Neo4j Desktop from <https://neo4j.com/download/>
2. Create a new project
3. Add a new database
4. Set password to `memento_password` (or your preferred password)
5. Start the database

The Neo4j database will be available at:

- **Bolt URI**: `bolt://127.0.0.1:7687` (for driver connections)
- **HTTP**: `http://127.0.0.1:7474` (for Neo4j Browser UI)
- **Default credentials**: username: `neo4j`, password: `your_password` (or whatever you configured)

### Neo4j Setup with Docker (Alternative)

Alternatively, you can use Docker to run Neo4j:

```bash
# Start Neo4j container
docker run -d \
  --name neo4j-kg \
  --restart unless-stopped \
  -p 7474:7474 \
  -p 7687:7687 \
  -v neo4j-kg_data:/data \
  -v neo4j-kg_logs:/logs \
  -e NEO4J_AUTH=neo4j/your_password \
  neo4j:5.26-community

# Stop Neo4j container
docker stop neo4j-kg

# Start existing container
docker start neo4j-kg

# Remove Neo4j container (preserves data in volumes)
docker rm neo4j-kg
```

When using Docker, the Neo4j database will be available at:

- **Bolt URI**: `bolt://127.0.0.1:7687` (for driver connections)
- **HTTP**: `http://127.0.0.1:7474` (for Neo4j Browser UI)
- **Default credentials**: username: `neo4j`, password: `your_password`

#### Data Persistence and Management

Neo4j data persists across container restarts and even version upgrades due to Docker named volumes:

- `neo4j-kg_data` - Database files
- `neo4j-kg_logs` - Log files

To backup your data:

```bash
# Create a backup of the data volume
docker run --rm -v neo4j-kg_data:/data -v $(pwd):/backup alpine tar czf /backup/neo4j-backup-$(date +%Y%m%d).tar.gz -C /data .
```

To restore from backup:

```bash
# Restore data from backup
docker run --rm -v neo4j-kg_data:/data -v $(pwd):/backup alpine tar xzf /backup/neo4j-backup-YYYYMMDD.tar.gz -C /data
```

##### Upgrading Neo4j Version

For comprehensive Neo4j upgrade procedures, see **[docs/UPGRADE.md](docs/UPGRADE.md)**.

This guide covers:

- When and why to upgrade (LTS vs Latest)
- Complete 5-phase upgrade procedure with go/no-go checkpoints
- Configuration management (deprecated settings)
- Troubleshooting and rollback procedures
- Real-world upgrade examples with verified commands
- 48-hour monitoring schedule

**Quick Reference for Docker:**

```bash
# Basic upgrade (for development/testing)
1. Stop current container: docker stop neo4j-kg
2. Remove container: docker rm neo4j-kg
3. Start new version: docker run -d --name neo4j-kg ... neo4j:5.XX-community
4. Reinitialize schema: pnpm run neo4j:init
```

> **Production Warning**: For production deployments with valuable data, always follow the complete procedure in docs/UPGRADE.md, which includes backup verification, data integrity checks, and rollback procedures.

##### Complete Database Reset

If you need to completely reset your Neo4j database:

```bash
# Stop and remove the container
docker stop neo4j-kg
docker rm neo4j-kg

# Remove the data volume
docker volume rm neo4j-kg_data

# Restart with fresh container
docker run -d \
  --name neo4j-kg \
  --restart unless-stopped \
  -p 7474:7474 \
  -p 7687:7687 \
  -v neo4j-kg_data:/data \
  -v neo4j-kg_logs:/logs \
  -e NEO4J_AUTH=neo4j/your_password \
  neo4j:5.26-community

# Reinitialize the schema
pnpm run neo4j:init
```

### Neo4j CLI Utilities

This MCP server includes command-line utilities for managing Neo4j operations:

#### Testing Connection

Test the connection to your Neo4j database:

```bash
# Test with default settings
pnpm run neo4j:test

# Test with custom settings
pnpm run neo4j:test -- --uri bolt://127.0.0.1:7687 --username myuser --password mypass --database neo4j
```

#### Initializing Schema

For normal operation, Neo4j schema initialization happens automatically when the MCP server connects to the database. You don't need to run any manual commands for regular usage.

The following commands are only necessary for development, testing, or advanced customization scenarios:

```bash
# Initialize with default settings (only needed for development or troubleshooting)
pnpm run neo4j:init

# Initialize with custom vector dimensions
pnpm run neo4j:init -- --dimensions 768 --similarity euclidean

# Force recreation of all constraints and indexes
pnpm run neo4j:init -- --recreate

# Combine multiple options
pnpm run neo4j:init -- --vector-index custom_index --dimensions 384 --recreate
```

## Advanced Features

### Semantic Search

Find semantically related entities based on meaning rather than just keywords:

- **Vector Embeddings**: Entities are automatically encoded into high-dimensional vector space using OpenAI's embedding models
- **Cosine Similarity**: Find related concepts even when they use different terminology
- **Configurable Thresholds**: Set minimum similarity scores to control result relevance
- **Cross-Modal Search**: Query with text to find relevant entities regardless of how they were described
- **Multi-Model Support**: Compatible with multiple embedding models (OpenAI text-embedding-3-small/large)
- **Contextual Retrieval**: Retrieve information based on semantic meaning rather than exact keyword matches
- **Optimized Defaults**: Tuned parameters for balance between precision and recall (0.6 similarity threshold, hybrid search enabled)
- **Hybrid Search**: Combines semantic and keyword search for more comprehensive results
- **Adaptive Search**: System intelligently chooses between vector-only, keyword-only, or hybrid search based on query characteristics and available data
- **Performance Optimization**: Prioritizes vector search for semantic understanding while maintaining fallback mechanisms for resilience
- **Query-Aware Processing**: Adjusts search strategy based on query complexity and available entity embeddings

### Temporal Awareness

Track complete history of entities and relations with point-in-time graph retrieval:

- **Full Version History**: Every change to an entity or relation is preserved with timestamps
- **Point-in-Time Queries**: Retrieve the exact state of the knowledge graph at any moment in the past
- **Change Tracking**: Automatically records createdAt, updatedAt, validFrom, and validTo timestamps
- **Temporal Consistency**: Maintain a historically accurate view of how knowledge evolved
- **Non-Destructive Updates**: Updates create new versions rather than overwriting existing data
- **Time-Based Filtering**: Filter graph elements based on temporal criteria
- **History Exploration**: Investigate how specific information changed over time

### Confidence Decay

Relations automatically decay in confidence over time based on configurable half-life:

- **Time-Based Decay**: Confidence in relations naturally decreases over time if not reinforced
- **Configurable Half-Life**: Define how quickly information becomes less certain (default: 30 days)
- **Minimum Confidence Floors**: Set thresholds to prevent over-decay of important information
- **Decay Metadata**: Each relation includes detailed decay calculation information
- **Non-Destructive**: Original confidence values are preserved alongside decayed values
- **Reinforcement Learning**: Relations regain confidence when reinforced by new observations
- **Reference Time Flexibility**: Calculate decay based on arbitrary reference times for historical analysis

### Advanced Metadata

Rich metadata support for both entities and relations with custom fields:

- **Source Tracking**: Record where information originated (user input, analysis, external sources)
- **Confidence Levels**: Assign confidence scores (0.0-1.0) to relations based on certainty
- **Relation Strength**: Indicate importance or strength of relationships (0.0-1.0)
- **Temporal Metadata**: Track when information was added, modified, or verified
- **Custom Tags**: Add arbitrary tags for classification and filtering
- **Structured Data**: Store complex structured data within metadata fields
- **Query Support**: Search and filter based on metadata properties
- **Extensible Schema**: Add custom fields as needed without modifying the core data model

### Batch Operations

Optimized bulk operations providing 10-50x performance improvement over individual operations:

- **High-Performance Bulk Processing**: Batch operations use Neo4j's UNWIND clause for dramatic performance gains
- **Automatic Chunking**: Large batches are automatically split into optimal chunk sizes (default: 100 items)
- **Parallel Processing**: Independent operations (like embedding generation) can run concurrently
- **Progress Tracking**: Optional callbacks provide real-time progress updates for long-running operations
- **Partial Failure Handling**: Continue processing on failures with detailed error reports per item
- **Performance Metrics**: Each batch operation returns total time and per-item average timing
- **Transaction Safety**: Automatic rollback on failures ensures data consistency

**Available Batch Tools**:

- `create_entities_batch`: Create multiple entities in single operation
- `create_relations_batch`: Create multiple relations in single operation
- `add_observations_batch`: Add observations to multiple entities in single operation
- `update_entities_batch`: Update multiple entities in single operation

**Performance Comparison**:

```typescript
// Individual operations: ~50 seconds for 100 entities
for (const entity of entities) {
  await createEntities([entity]);
}

// Batch operation: ~1.5 seconds for 100 entities (33x faster)
await createEntitiesBatch(entities, {
  maxBatchSize: 100,
  enableParallel: true,
});
```

**Configuration Options**:

- `maxBatchSize`: Control chunk size (default: 100)
- `enableParallel`: Reserved for future parallel chunk processing (embeddings always generated if service available)
- `onProgress`: Callback for progress tracking

**Cost Management:**

- Incremental approach minimizes API calls
- Only processes entities without embeddings
- Typical cost: ~$0.02 per 1M tokens
- Production cost: ~$0.0025 per daily run (for typical workloads)

This automation ensures semantic search remains highly effective as your knowledge graph grows, without requiring manual embedding regeneration.

### Query Result Caching (v1.5.0+)

Semantic search queries are automatically cached for improved performance:

**Cache Configuration:**

- **LRU (Least Recently Used) Strategy**: Automatically evicts oldest entries when full
- **Capacity**: 500 unique queries cached simultaneously
- **TTL (Time-To-Live)**: 5 minutes per cache entry
- **Size Limit**: 10,000 entities maximum across all cached results
- **Size Calculation**: Entity count + relation count

**Cache Behavior:**

- **Cache Hits**: Sub-millisecond response for repeated queries
- **Automatic Invalidation**: Cache cleared on mutations (create_entities, add_observations, delete_entities, etc.)
- **Intelligent Keying**: Considers query text, limit, similarity threshold, entity types, and hybrid config
- **Metrics Integration**: Cache hits/misses tracked via Prometheus (when enabled)

**Performance Impact:**

- **First Query**: Normal latency (~100-500ms depending on graph size)
- **Cached Query**: <1ms response time
- **Memory Usage**: Minimal - automatically bounded by size limits
- **Cache Miss Rate**: Typically <10% for conversational workloads

**Example Scenarios:**

- User asks "What programming languages do you know?" → Cache miss (~300ms)
- User asks "What programming languages do you know?" again → Cache hit (<1ms)
- User creates new entity → Cache cleared for consistency
- User asks "What programming languages do you know?" → Cache miss (~300ms, fresh results)

This caching layer provides significant performance improvements for repeated or similar queries without any configuration needed.

## MCP API Tools

The following tools are available to LLM client hosts through the Model Context Protocol:

### Entity Management

- **create_entities**
  - Create multiple new entities in the knowledge graph
  - Input: `entities` (array of objects)
    - Each object contains:
      - `name` (string): Entity identifier
      - `entityType` (string): Type classification
      - `domain` (string, optional): User-defined namespace for organization. Default: `null` (uncategorized)
      - `observations` (string[]): Associated observations

- **add_observations**
  - Add new observations to existing entities
  - Input: `observations` (array of objects)
    - Each object contains:
      - `entityName` (string): Target entity
      - `contents` (string[]): New observations to add

- **delete_entities**
  - Remove entities and their relations
  - Input: `entityNames` (string[])

- **delete_observations**
  - Remove specific observations from entities
  - Input: `deletions` (array of objects)
    - Each object contains:
      - `entityName` (string): Target entity
      - `observations` (string[]): Observations to remove

### Relation Management

- **create_relations**
  - Create multiple new relations between entities with enhanced properties
  - Input: `relations` (array of objects)
    - Each object contains:
      - `from` (string): Source entity name
      - `to` (string): Target entity name
      - `relationType` (string): Relationship type
      - `strength` (number, optional): Relation strength (0.0-1.0)
      - `confidence` (number, optional): Confidence level (0.0-1.0)
      - `metadata` (object, optional): Custom metadata fields

- **get_relation**
  - Get a specific relation with its enhanced properties
  - Input:
    - `from` (string): Source entity name
    - `to` (string): Target entity name
    - `relationType` (string): Relationship type

- **update_relation**
  - Update an existing relation with enhanced properties
  - Input: `relation` (object):
    - Contains:
      - `from` (string): Source entity name
      - `to` (string): Target entity name
      - `relationType` (string): Relationship type
      - `strength` (number, optional): Relation strength (0.0-1.0)
      - `confidence` (number, optional): Confidence level (0.0-1.0)
      - `metadata` (object, optional): Custom metadata fields

- **delete_relations**
  - Remove specific relations from the graph
  - Input: `relations` (array of objects)
    - Each object contains:
      - `from` (string): Source entity name
      - `to` (string): Target entity name
      - `relationType` (string): Relationship type

### Graph Operations

- **read_graph**
  - Read the entire knowledge graph
  - No input required

- **search_nodes**
  - Search for nodes based on query
  - Input:
    - `query` (string): Search query
    - `domain` (string, optional): Filter by user-defined domain. Omit to search all domains

- **open_nodes**
  - Retrieve specific nodes by name
  - Input: `names` (string[])

### Semantic Search

- **semantic_search**
  - Search for entities semantically using vector embeddings and similarity
  - Input:
    - `query` (string): The text query to search for semantically
    - `limit` (number, optional): Maximum results to return (default: 10)
    - `min_similarity` (number, optional): Minimum similarity threshold (0.0-1.0, default: 0.6)
    - `entity_types` (string[], optional): Filter results by entity types
    - `domain` (string, optional): Filter by user-defined domain. Omit to search all domains
    - `hybrid_search` (boolean, optional): Combine keyword and semantic search (default: true)
    - `semantic_weight` (number, optional): Weight of semantic results in hybrid search (0.0-1.0, default: 0.6)
  - Features:
    - Intelligently selects optimal search method (vector, keyword, or hybrid) based on query context
    - Gracefully handles queries with no semantic matches through fallback mechanisms
    - Maintains high performance with automatic optimization decisions

- **get_entity_embedding**
  - Get the vector embedding for a specific entity
  - Input:
    - `entity_name` (string): The name of the entity to get the embedding for

### Temporal Features

- **get_entity_history**
  - Get complete version history of an entity
  - Input: `entityName` (string)

- **get_relation_history**
  - Get complete version history of a relation
  - Input:
    - `from` (string): Source entity name
    - `to` (string): Target entity name
    - `relationType` (string): Relationship type

- **get_graph_at_time**
  - Get the state of the graph at a specific timestamp
  - Input: `timestamp` (number): Unix timestamp (milliseconds since epoch)

- **get_decayed_graph**
  - Get graph with time-decayed confidence values
  - Input: `options` (object, optional):
    - `reference_time` (number): Reference timestamp for decay calculation (milliseconds since epoch)
    - `decay_factor` (number): Optional decay factor override

## Configuration

### Environment Variables

Configure the MCP server with these environment variables:

```bash
# Neo4j Connection Settings
NEO4J_URI=bolt://127.0.0.1:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password
NEO4J_DATABASE=neo4j

# Vector Search Configuration
NEO4J_VECTOR_INDEX=entity_embeddings
NEO4J_VECTOR_DIMENSIONS=1536
NEO4J_SIMILARITY_FUNCTION=cosine

# Embedding Service Configuration
OPENAI_API_KEY=your-openai-api-key
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Logging Configuration
LOG_LEVEL=warn              # Log level: debug, info, warn, error, silent (default: warn)
DEBUG=true                  # Enable debug mode (enables additional diagnostic tools)

# Prometheus Metrics (Optional - Production Monitoring)
ENABLE_PROMETHEUS_METRICS=true  # Enable metrics collection and HTTP endpoint
```

### Prometheus Metrics

The MCP server includes built-in Prometheus metrics for production observability. Metrics are **disabled by default** to minimize local machine overhead and only enabled when explicitly configured.

#### Enabling Metrics

Set the environment variable to enable metrics collection:

```bash
export ENABLE_PROMETHEUS_METRICS=true
```

When enabled, the metrics server starts on **port 9091** and exposes a `/metrics` endpoint in Prometheus exposition format.

#### Available Metrics

**Query Performance:**

- `mcp_query_duration_seconds` - Histogram tracking query execution time
  - Labels: `operation` (loadGraph, searchNodes, openNodes, semanticSearch), `cache_status` (hit, miss, disabled)
  - Buckets: 1ms, 5ms, 10ms, 50ms, 100ms, 500ms, 1s, 5s

**Cache Performance (ready for future cache integration):**

- `mcp_cache_hits_total` - Counter for cache hits
- `mcp_cache_misses_total` - Counter for cache misses
- `mcp_cache_invalidations_total` - Counter for cache invalidations
- `mcp_cache_size_current` - Gauge for current cache size

**Process Metrics:**

- Default Node.js process metrics (CPU, memory, event loop, garbage collection)

#### Accessing Metrics

Once enabled, metrics are available at:

```bash
curl http://localhost:9091/metrics
```

#### Production Deployment

For production deployments, configure Prometheus to scrape the metrics endpoint:

```yaml
scrape_configs:
  - job_name: 'mcp-kg-server'
    scrape_interval: 30s
    static_configs:
      - targets: ['localhost:9091']
        labels:
          instance: 'mcp-neo4j-knowledge-graph'
          environment: 'production'
```

Metrics can then be visualized in Grafana with custom dashboards showing:

- Query performance trends
- Cache hit/miss ratios
- System resource utilization
- Operation latency distributions

#### Port Selection

Port 9091 is chosen to avoid conflicts with common Prometheus exporters:

- 9090: Prometheus server
- 9099: neo4j-exporter
- 9100: node-exporter

### Command Line Options

The Neo4j CLI tools support the following options:

```
--uri <uri>              Neo4j server URI (default: bolt://127.0.0.1:7687)
--username <username>    Neo4j username (default: neo4j)
--password <password>    Neo4j password (default: memento_password)
--database <n>           Neo4j database name (default: neo4j)
--vector-index <n>       Vector index name (default: entity_embeddings)
--dimensions <number>    Vector dimensions (default: 1536)
--similarity <function>  Similarity function (cosine|euclidean) (default: cosine)
--recreate               Force recreation of constraints and indexes
--no-debug               Disable detailed output (debug is ON by default)
```

### Embedding Models

Available OpenAI embedding models:

- `text-embedding-3-small`: Efficient, cost-effective (1536 dimensions)
- `text-embedding-3-large`: Higher accuracy, more expensive (3072 dimensions)
- `text-embedding-ada-002`: Legacy model (1536 dimensions)

#### OpenAI API Configuration

To use semantic search, you'll need to configure OpenAI API credentials:

1. Obtain an API key from [OpenAI](https://platform.openai.com/api-keys)
2. Configure your environment with:

```bash
# OpenAI API Key for embeddings
OPENAI_API_KEY=your-openai-api-key
# Default embedding model
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

> **Note**: For testing environments, the system will mock embedding generation if no API key is provided. However, using real embeddings is recommended for integration testing.

## Integration with Claude Desktop

### Configuration

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "neo4j-kg": {
      "command": "npx",
      "args": ["-y", "@henrychong-ai/mcp-neo4j-knowledge-graph"],
      "env": {
        "NEO4J_URI": "bolt://127.0.0.1:7687",
        "NEO4J_USERNAME": "neo4j",
        "NEO4J_PASSWORD": "your_password",
        "NEO4J_DATABASE": "neo4j",
        "NEO4J_VECTOR_INDEX": "entity_embeddings",
        "NEO4J_VECTOR_DIMENSIONS": "1536",
        "NEO4J_SIMILARITY_FUNCTION": "cosine",
        "OPENAI_API_KEY": "your-openai-api-key",
        "OPENAI_EMBEDDING_MODEL": "text-embedding-3-small",
        "DEBUG": "true"
      }
    }
  }
}
```

Alternatively, for local development, you can use:

```json
{
  "mcpServers": {
    "neo4j-kg": {
      "command": "/path/to/node",
      "args": ["/path/to/mcp-neo4j-knowledge-graph/dist/index.js"],
      "env": {
        "NEO4J_URI": "bolt://127.0.0.1:7687",
        "NEO4J_USERNAME": "neo4j",
        "NEO4J_PASSWORD": "your_password",
        "NEO4J_DATABASE": "neo4j",
        "NEO4J_VECTOR_INDEX": "entity_embeddings",
        "NEO4J_VECTOR_DIMENSIONS": "1536",
        "NEO4J_SIMILARITY_FUNCTION": "cosine",
        "OPENAI_API_KEY": "your-openai-api-key",
        "OPENAI_EMBEDDING_MODEL": "text-embedding-3-small",
        "DEBUG": "true"
      }
    }
  }
}
```

> **Important**: Always explicitly specify the embedding model in your Claude Desktop configuration to ensure consistent behavior.

### Recommended System Prompts

For optimal integration with Claude, add these statements to your system prompt:

```
You have access to a Neo4j knowledge graph memory system, which provides you with persistent memory capabilities.
Your memory tools are provided by a sophisticated knowledge graph implementation.
When asked about past conversations or user information, always check the knowledge graph first.
You should use semantic_search to find relevant information in your memory when answering questions.
```

### Testing Semantic Search

Once configured, Claude can access the semantic search capabilities through natural language:

1. To create entities with semantic embeddings:

   ```
   User: "Remember that Python is a high-level programming language known for its readability and JavaScript is primarily used for web development."
   ```

2. To search semantically:

   ```
   User: "What programming languages do you know about that are good for web development?"
   ```

3. To retrieve specific information:

   ```
   User: "Tell me everything you know about Python."
   ```

The power of this approach is that users can interact naturally, while the LLM handles the complexity of selecting and using the appropriate memory tools.

### Real-World Applications

The adaptive search capabilities provide practical benefits:

1. **Query Versatility**: Users don't need to worry about how to phrase questions - the system adapts to different query types automatically

2. **Failure Resilience**: Even when semantic matches aren't available, the system can fall back to alternative methods without user intervention

3. **Performance Efficiency**: By intelligently selecting the optimal search method, the system balances performance and relevance for each query

4. **Improved Context Retrieval**: LLM conversations benefit from better context retrieval as the system can find relevant information across complex knowledge graphs

For example, when a user asks "What do you know about machine learning?", the system can retrieve conceptually related entities even if they don't explicitly mention "machine learning" - perhaps entities about neural networks, data science, or specific algorithms. But if semantic search yields insufficient results, the system automatically adjusts its approach to ensure useful information is still returned.

## Integration with Claude Code

### Configuration

Add this to your `~/.claude.json`:

```json
{
  "mcpServers": {
    "neo4j-kg": {
      "command": "npx",
      "args": ["-y", "@henrychong-ai/mcp-neo4j-knowledge-graph"],
      "env": {
        "NEO4J_URI": "bolt://127.0.0.1:7687",
        "NEO4J_USERNAME": "neo4j",
        "NEO4J_PASSWORD": "your_password",
        "NEO4J_DATABASE": "neo4j",
        "NEO4J_VECTOR_INDEX": "entity_embeddings",
        "NEO4J_VECTOR_DIMENSIONS": "1536",
        "NEO4J_SIMILARITY_FUNCTION": "cosine",
        "OPENAI_API_KEY": "your-openai-api-key",
        "OPENAI_EMBEDDING_MODEL": "text-embedding-3-small"
      }
    }
  }
}
```

### Verify MCP Tools Available

In a Claude Code session, the MCP tools will be automatically available. You can verify by asking:

```
Show me the available MCP tools for the knowledge graph
```

You should see tools like:

- `mcp__kg__create_entities`
- `mcp__kg__create_relations`
- `mcp__kg__add_observations`
- `mcp__kg__search_nodes`
- `mcp__kg__semantic_search`
- And more...

## Testing Your Setup

### Step 1: Create Your First Entity

In Claude Desktop or Claude Code, say:

```
Use the knowledge graph to create an entity named "Python"
of type "Programming Language" with the observation
"General-purpose, high-level programming language known for readability"
```

### Step 2: Search for the Entity

```
Search the knowledge graph for "Python"
```

Claude should find your entity using the `mcp__kg__search_nodes` tool.

### Step 3: Add More Observations

```
Add these observations to the Python entity:
- Created by Guido van Rossum in 1991
- Popular for data science, web development, and automation
- Dynamic typing with interpreted execution
```

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
Perform a semantic search for "programming languages for beginners"
```

The Python entity should appear in results based on semantic similarity.

## Troubleshooting

### Schema Constraint Configuration

Temporal versioning requires a **composite uniqueness constraint** in your Neo4j database:

```cypher
CREATE CONSTRAINT entity_name
FOR (e:Entity)
REQUIRE (e.name, e.validTo) IS UNIQUE;
```

If you see `Node already exists` errors, your database has an old single-field constraint. See `docs/SCHEMA_CONSTRAINT_FIX.md` for diagnosis and fix instructions.

### Vector Search Diagnostics

The MCP server includes built-in diagnostic capabilities to help troubleshoot vector search issues:

- **Embedding Verification**: The system checks if entities have valid embeddings and automatically generates them if missing
- **Vector Index Status**: Verifies that the vector index exists and is in the ONLINE state
- **Fallback Search**: If vector search fails, the system falls back to text-based search
- **Detailed Logging**: Comprehensive logging of vector search operations for troubleshooting

### Debug Tools (when DEBUG=true)

Additional diagnostic tools become available when debug mode is enabled:

- **diagnose_vector_search**: Information about the Neo4j vector index, embedding counts, and search functionality
- **force_generate_embedding**: Forces the generation of an embedding for a specific entity
- **debug_embedding_config**: Information about the current embedding service configuration

### Developer Reset

To completely reset your Neo4j database during development:

```bash
# Stop the container (if using Docker)
docker stop neo4j-kg

# Remove the container (if using Docker)
docker rm neo4j-kg

# Delete the data volume (if using Docker)
docker volume rm neo4j-kg_data

# For Neo4j Desktop, right-click your database and select "Drop database"

# Restart the database
# For Docker:
docker run -d \
  --name neo4j-kg \
  --restart unless-stopped \
  -p 7474:7474 \
  -p 7687:7687 \
  -v neo4j-kg_data:/data \
  -v neo4j-kg_logs:/logs \
  -e NEO4J_AUTH=neo4j/your_password \
  neo4j:5.26-community

# For Neo4j Desktop:
# Click the "Start" button for your database

# Reinitialize the schema
pnpm run neo4j:init
```

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE) - See the LICENSE file for details.

## Acknowledgments

Built on foundational work by [Gannon Hall](https://github.com/gannonh). For the original implementation, see [@gannonh/memento-mcp](https://github.com/gannonh/memento-mcp).
