# Changelog

All notable changes to Memento MCP will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.8] - 2025-04-01

### Added

- Initial public release
- Knowledge graph memory system with entities and relations
- Neo4j storage backend with unified graph and vector storage
- Semantic search using OpenAI embeddings
- Temporal awareness with version history for all graph elements
- Time-based confidence decay for relations
- Rich metadata support for entities and relations
- MCP tools for entity and relation management
- Support for Claude Desktop, Cursor, and other MCP-compatible clients
- Docker support for Neo4j setup
- CLI utilities for database management
- Comprehensive documentation and examples

### Changed

- Migrated storage from SQLite + Chroma to unified Neo4j backend
- Enhanced vector search capabilities with Neo4j's native vector indexing
- Improved performance for large knowledge graphs

## [0.3.0] - [Unreleased]

### Added

- Initial beta version with Neo4j support
- Vector search integration
- Basic MCP server functionality

## [0.2.0] - [Unreleased]

### Added

- SQLite and Chroma storage backends
- Core knowledge graph data structures
- Basic entity and relation management

## [0.1.0] - [Unreleased]

### Added

- Project initialization
- Basic MCP server framework
- Core interfaces and types
