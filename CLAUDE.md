# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**@henrychong-ai/mcp-neo4j-knowledge-graph** is a Model Context Protocol (MCP) server implementing a Neo4j-based knowledge graph with temporal versioning and semantic search capabilities. Maintained by Henry Chong, built on foundational work by Gannon Hall.

**Key Features:**

- Temporal versioning for entities and relations (track historical changes)
- Neo4j graph database as primary storage backend
- Vector embeddings and semantic search via OpenAI
- MCP server for Claude Desktop and Claude Code integration
- Full test coverage with Vitest

## Public Repository

This repository is public. Maintainer-only operational notes, when present, are in the untracked `CLAUDE.local.md`.

**Public-content gate:** `pnpm run public:check` (`scripts/check-public-sanitization.mjs`) reads every git-tracked file, and every tracked file name, and fails on:

| Rule | Fails on | Passes |
| ---- | -------- | ------ |
| Personal home path | a home directory under `/Users` with a real name | a placeholder name (`you`, `username`, `<name>`) |
| Secret reference | an `op://` reference that names a real vault | the bare scheme in prose; a placeholder vault (`your-…`, `example…`, `vault`) |
| Account host | a named 1Password account host | the shared sign-in hosts; `your-…` and `example…` names |
| Tailnet host | any `*.ts.net` name | a `your-…`, `example…` or `tailnet…` label |
| Private server name | the `vps-<n>` form | nothing |
| Server deployment path | the two server directories under `/opt` that hold deployment backups and scripts | any other `/opt` path |
| Email address | any address | reserved example domains, GitHub no-reply addresses, the contact published in `package.json` |
| Known private identifier | a 32-character hexadecimal token whose SHA-256 is on the list in the script | every other token |

- **Where it runs:** `pnpm run check`; the last step of `.husky/pre-commit` (with `--staged`, which reads the staged content the commit will contain rather than the files on disk); its own CI step. On a public repository CI reports a leak only after the push, so the pre-commit step is the one that prevents it. Never commit with `--no-verify`.
- **Never write a private value into the script, its tests or any doc.** An exact identifier goes in as its SHA-256 only (hash the lowercase value with no trailing newline). Everything else is matched by shape.
- **The script and its tests are scanned too.** Describe a forbidden shape in words; in tests, build it from fragments at runtime.
- **A finding is fixed, not allow-listed.** Replace the value with a placeholder, or move the note to `CLAUDE.local.md`. Widening an allow list is the owner's decision.
- **A finding names the file, line and rule, never the matched text.** CI logs of a public repository are public.
- **Out of reach:** untracked and git-ignored files, commit messages, git history, and text that is not UTF-8.

## Tech Stack

| Layer           | Technology                         |
| --------------- | ---------------------------------- |
| Runtime         | Node.js >=24 LTS                   |
| Language        | TypeScript 6.0 (`typescript@~6.0`), ES2024 target |
| Package Manager | pnpm                               |
| Database        | Neo4j 5.13+ (Community/Enterprise) |
| Protocol        | MCP SDK                            |
| Validation      | Zod                                |
| Embeddings      | OpenAI-compatible (OpenAI / Cloudflare Workers AI / any); default text-embedding-3-small; optional bge reranker (v2.5.0+) |
| Testing         | Vitest + @vitest/coverage-v8       |
| Linting         | Oxlint (typescript, unicorn, oxc, import, promise, node, vitest plugins) |
| Formatting      | Biome (formatter-only, linter disabled)         |
| Git Hooks       | Husky: gitleaks, lint-staged, public-content gate |

**Lint exception:** `.oxlintrc.json` turns `preserve-caught-error` off for `src/embeddings/OpenAIEmbeddingService.ts`. The caught value there can be an AxiosError whose request config holds the `Authorization: Bearer` header, so it must never be attached as `cause` to a rethrown error.

**Tests are linted.** There is no `.eslintignore` (Oxlint honours that file, and it used to exclude every test). Build and coverage ignores live in `.oxlintrc.json` `ignorePatterns`. An `overrides` entry for test files (`**/__vitest__/**`, `**/__test-utils__/**`, `*.test.ts`, `*.spec.ts`, `vitest.setup.ts`) relaxes four rules; counts are from the first run with tests included (1166 diagnostics):

| Rule | Hits | Setting for tests | Reason |
| ---- | ---- | ----------------- | ------ |
| `vitest/require-mock-type-parameters` | 869 | off | Opinionated. Tests are excluded from `tsc` (`tsconfig.json`), so a type parameter on each `vi.fn()` would never be checked. |
| `typescript/no-explicit-any` | 172 | off | Same reason. `any` is how tests build partial mocks and reach private members. |
| `no-new` | 7 | off | A constructor run for its effect (it warns, throws, or calls `ensureSchema`) is the thing under test. |
| `vitest/no-standalone-expect` | 18 | on, with `additionalTestBlockFunctions` | Two OpenAI test files alias `it` / `it.skip` as `conditionalTest` and `skipIfNoKeyOrMockEnabled`; the rule has to be told those are test blocks. |

Inline disables, each with its reason: `vitest/no-disabled-tests` on five placeholder `it.skip` tests in the two `Neo4jEntityHistory*` files, and `vitest/require-to-throw-message` on one refused-connection assertion in `PrometheusMetrics.comprehensive.test.ts`. Everything else the first run reported (100 diagnostics) was fixed in the tests. Do not weaken an assertion to satisfy a lint rule.

### TypeScript and tsconfig

**The compiler is pinned to the 6.0 line: `typescript@~6.0`.** npm's `latest` tag is TypeScript 7, so never add `typescript` without the range. `pnpm add -D typescript@~6.0` writes a caret (`^6.0.x`) into `package.json`; put the tilde back by hand and run `pnpm install`. TypeScript 7 passes as a type-check-only lane (`pnpm dlx --package=typescript@^7.0 tsc --noEmit -p tsconfig.json`) but is not the project compiler.

**`tsconfig.json` follows the team standard for a Node package emitted with `tsc`.** `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noImplicitOverride`, `noFallthroughCasesInSwitch` and `useUnknownInCatchVariables`; `verbatimModuleSyntax` with `isolatedModules`; `module` and `moduleResolution` `NodeNext`; `target` and `lib` `ES2024` (no DOM types); `types: ["node"]` (TypeScript 6 loads no `@types` package by default); `rootDir` `src`, `outDir` `dist`; `declaration` and `sourceMap`. There is no `paths` alias, because `tsc` does not rewrite an alias in the emitted imports. Tests stay excluded from `tsc`.

**`declarationMap` stays off, against the template.** A `.d.ts.map` points at the `.ts` file under `src/`, and the package publishes only `dist/` (`files` in `package.json`), so the maps would resolve to nothing for a consumer. Turning the flag on adds one map per source file to the package (66 files at v2.10.0: 268 packed files against 202). Check `npm pack --dry-run` after any change to the emit options.

Three flags were turned on with the TypeScript 6 move. What each asks of new code:

| Flag | Rule |
| ---- | ---- |
| `verbatimModuleSyntax` | A name used only as a type is imported with `import type` (or an inline `type`). A plain import is kept in the emitted JavaScript and loads that module at runtime. |
| `noPropertyAccessFromIndexSignature` | Keys that come from an index signature are read with brackets: `process.env['NEO4J_URI']`, `args['query']`, `node['observations']`. Same property read as the dot form. |
| `exactOptionalPropertyTypes` | `x?: T` no longer accepts an explicit `undefined`. Where the code passes one, declare the property `x?: T \| undefined`. |

- **Do not satisfy `exactOptionalPropertyTypes` by leaving a key out in storage or versioning code.** A key that is present with the value `undefined` and a key that is absent are different inputs to Neo4j query parameters and to `versionEntities`, which inherits a field only when its key is absent. Widen the type instead; changing what is passed is a behaviour change and needs its own tests.
- **One assertion stands in for a widening.** `StorageProviderFactory.createProvider` builds its Neo4j config `as Partial<Neo4jConfig>`. It copies every option as given, so an option the caller left out arrives as an explicit `undefined` and overwrites the default in `Neo4jStorageProvider`'s `{ ...DEFAULT_NEO4J_CONFIG, ...options.config }`. The server's own start-up path (`createStorageConfig`) always supplies all seven options and is unaffected; only a direct caller of the factory with partial options can hit it. Known and not changed: fixing it changes what the provider receives.

## Getting Started

See **[README.md](README.md)** for complete setup instructions covering installation, Neo4j setup, MCP client configuration, and testing.

## Development Commands

### Build & Development

```bash
pnpm run build              # TypeScript compilation + executable permissions
pnpm run dev               # Watch mode for development
pnpm run prepare           # Pre-publish build (runs automatically)
```

### Testing

```bash
pnpm test                  # Run all tests
pnpm run test:watch        # Watch mode
pnpm run test:verbose      # Detailed output
pnpm run test:coverage     # Coverage report
pnpm run test:integration  # Integration tests (requires Neo4j)
```

### Code Quality

```bash
pnpm run lint              # Oxlint check
pnpm run lint:fix          # Oxlint auto-fix
pnpm run format            # Biome formatting
pnpm run format:check      # Biome format check (CI)
pnpm run public:check      # Public-content gate (see "Public Repository")
pnpm run check             # lint + format:check + typecheck + public:check
pnpm run fix               # lint:fix + format
```

### Neo4j Setup & Maintenance

```bash
pnpm run neo4j:init        # Initialize Neo4j schema
pnpm run neo4j:test        # Test Neo4j connection
pnpm run kg:oversized      # Report entities near the open_nodes cap
pnpm run kg:repair         # Repair duplicated relations / duplicate live versions (DRY RUN)
pnpm run kg:repair -- --apply   # ...and execute it
```

### Running Single Tests

```bash
# Run specific test file
npx vitest run src/storage/__vitest__/Neo4jStorageProvider.test.ts

# Run tests matching pattern
npx vitest run --grep "temporal versioning"
```

## Architecture

### Core Components

**KnowledgeGraphManager** (`src/KnowledgeGraphManager.ts`)

- Central orchestrator for all graph operations
- Manages entities, relations, and observations via Neo4j storage provider
- Coordinates between storage provider, vector store, and embedding service

**Neo4j Storage Layer** (`src/storage/neo4j/`)

- **Neo4jStorageProvider**: Main storage implementation with temporal versioning
- **Neo4jConnectionManager**: Connection pooling and session management
- **Neo4jSchemaManager**: Constraint and index management
- **Neo4jVectorStore**: Vector similarity search with Neo4j vector indexes
- **Neo4jConfig**: Configuration defaults and types

**MCP Server** (`src/server/`)

- **setup.ts**: Server initialization and tool registration
- **handlers/**: Tool handlers for MCP protocol (create_entities, add_observations, etc.)
- Standard input/output transport for Claude integration

**Embedding System** (`src/embeddings/`)

- **EmbeddingServiceFactory**: Creates OpenAI or mock embedding services
- **EmbeddingJobManager**: Async job queue for entity embedding generation. Backed by `Neo4jJobStore` (v2.4.0+) — jobs are stored as `:EmbeddingJob` nodes with atomic claim semantics suitable for multi-worker deployments. The previous SQLite-backed queue (v2.x) was a silent no-op against Neo4j storage and has been removed.
- **EmbeddingRateLimiter**: Token bucket rate limiting for OpenAI API

### Data Model

**Entities**: Nodes with name, type, domain, observations, and optional embeddings

```typescript
{
  name: string;           // Unique identifier
  entityType: string;     // Category/classification (lowercase-kebab-case)
  domain?: string | null; // Optional user-defined namespace for organization
  observations: string[]; // Knowledge fragments
  embedding?: EntityEmbedding;
}
```

**EntityType Convention**: Use `lowercase-kebab-case` format (e.g., `person`, `medical-condition`, `claude-code-skill`). No uppercase, spaces, or underscores.

**Domain Property**: Optional user-defined string for logical organization of entities:

- **Type**: Any string value (user-defined, e.g., `medical`, `work`, `personal`)
- **Default**: `null` (uncategorized)
- **Query behavior**: Omit domain parameter to query across all domains; specify domain to filter
- **Migration**: Existing entities without domain continue to work unchanged

**Relations**: Directed edges between entities with temporal metadata

```typescript
{
  from: string;
  to: string;
  relationType: string;
  strength?: number;      // 0.0-1.0
  confidence?: number;    // 0.0-1.0
  metadata?: Record<string, unknown>;
}
```

**Temporal Versioning**: All entities and relations have temporal fields

```typescript
{
  id: string; // UUID for version
  version: number; // Incrementing version number
  validFrom: number; // Timestamp when version became active
  validTo: number | null; // Timestamp when version was superseded (NULL = current)
  createdAt: number; // Original creation timestamp
  updatedAt: number; // Last modification timestamp
  changedBy: string | null;
}
```

### Critical Implementation Details

**BigInt Conversion (v1.0.5 Fix)**
Neo4j driver returns integers as BigInt. Always convert before arithmetic:

```typescript
// CORRECT
const newVersion = (currentNode.version ? Number(currentNode.version) : 0) + 1;

// WRONG - throws "Cannot mix BigInt and other types"
const newVersion = (currentNode.version || 0) + 1;
```

**Affected locations:**

- `Neo4jStorageProvider.ts:902` - addObservations entity versioning
- `Neo4jStorageProvider.ts:1211` - deleteObservations entity versioning
- `Neo4jStorageProvider.ts:1432` - updateRelation relation versioning

**Temporal Versioning Workflow**
When updating an entity/relation:

1. Query current version (WHERE validTo IS NULL)
2. Calculate newVersion with BigInt conversion
3. Mark old version as invalid (SET validTo = now)
4. Create new version with incremented version number
5. Recreate all relationships for new entity version

**Schema Constraint Requirement**
Neo4j database MUST have composite constraint for temporal versioning:

```cypher
CREATE CONSTRAINT entity_name
FOR (e:Entity)
REQUIRE (e.name, e.validTo) IS UNIQUE;
```

If database has old single-field constraint on `name` only, temporal versioning will fail with "Node already exists" error. See `docs/SCHEMA_CONSTRAINT_FIX.md` for diagnosis and fix instructions.

## Known Issues & Solutions

### Schema Constraint Issue

**Symptom**: `Node(X) already exists with label 'Entity' and property 'name' = '...'`
**Cause**: Database has single-field `Entity.name` constraint instead of composite `(name, validTo)`
**Fix**: See `docs/SCHEMA_CONSTRAINT_FIX.md` for complete instructions

### Integration Tests Require Neo4j

Tests in `src/storage/__vitest__/Neo4jIntegration.test.ts` require running Neo4j instance. These are skipped by default unless `TEST_INTEGRATION=true`.

### Environment Variables

Required for full functionality:

```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password
OPENAI_API_KEY=sk-...              # Optional: for real embeddings
OPENAI_EMBEDDING_MODEL=text-embedding-3-small  # Optional

# v2.3.0+ — Server/client topology for fleet deployments
WRITE_EMBEDDINGS_LOCALLY=true      # Default true. Set to "false" on thin-client hosts to skip
                                    # queueing embedding jobs on entity writes; entities persisted
                                    # with NULL embedding for a server-side backfiller to handle.
EMBEDDING_BACKFILL_CRON='0 19 * * *' # Cron for scheduleIncrementalRegeneration. Tighten to
                                    # '*/1 * * * *' on the server-side instance for ~1-min latency.
EMBEDDING_STALE_CLAIM_MS=300000      # v2.4.0+. Claimed jobs older than this auto-release back
                                    # to 'pending' on the next processJobs tick. Default 5 min.

# v2.9.0+ — temporal-versioning safety
NEO4J_TX_TIMEOUT_MS=60000            # Transaction timeout on EVERY transaction + auto-commit query.
NEO4J_MAX_LIVE_RELATIONSHIPS=5000    # Pre-flight ceiling; over it, versioning is refused with the
                                    # entity name + `pnpm kg:repair`, instead of OOMing the database.
```

## Testing Strategy

**Unit Tests**: Mock storage providers and services
**Integration Tests**: Require live Neo4j instance
**Test Location**: `src/**/__vitest__/*.test.ts`

Test files use Vitest with comprehensive mocking:

- Storage providers can be mocked or use real Neo4j
- Embedding service has mock implementation for testing

## CI/CD Pipeline

### GitHub Actions (`ci-cd.yml`)

| Job                                  | Trigger           | Node |
| ------------------------------------ | ----------------- | ---- |
| **Lint-Format-Typecheck-Test-Build** | All pushes, PRs   | 24.x |
| **Publish to npm**                   | Tags matching v\* | 24.x |

**Build Job Steps:**

1. Checkout code
2. Install pnpm (from packageManager field)
3. Setup Node.js 24.x with pnpm cache
4. Install dependencies (`--frozen-lockfile`)
5. Public-content gate (`pnpm public:check`)
6. Lint (`pnpm lint`)
7. Format check (`pnpm format:check`)
8. Type check (`pnpm typecheck`)
9. Build project
10. Initialize Neo4j schema (service container)
11. Run tests

**Publish Job:**

- **Trigger**: Only on version tags (e.g., `v2.2.0`)
- **Authentication**: OIDC Trusted Publishing + `--provenance` (no token secret; trusted publisher configured on npmjs.org for this repo + ci-cd.yml)
- **Version Check**: Tag must match `package.json` version

## Version History & Recent Bugfixes

### v2.10.0 (2026-10-02) - Tool Input Validation Gate

Every tool call is validated against a per-tool Zod schema before dispatch (see "Tool Input Validation Gate" below). Handlers still receive the original arguments. Calls that were silent no-ops (a missing top-level required key), a missing `query`/`entity_name`, and a negative `config.maxBatchSize` (previously an infinite loop) are now rejected with a clear error. Also: `noUncheckedIndexedAccess` on, Oxlint config actually loaded (`.oxlintrc.json`), `@types/node` on 24, gitleaks pre-commit. Full detail in CHANGELOG.md.

### v2.9.2 (2026-09-11) - Dependency Security Sweep

Cleared 12 advisories (5 high, 7 moderate) — `fast-uri` 3.1.7 (runtime-reachable via `ajv`), `nanoid` 3.3.19, `qs` 6.16.0, `hono` 4.13.7, `vitest`/`@vitest/mocker` 4.1.11. Raised the `hono`, `qs`, and `fast-uri` override floors, added a `nanoid` floor, removed the dead `@isaacs/brace-expansion` override, and ran the in-range sweep (oxlint 1.82.0, biome 2.5.13, tsx 4.23.13, axios 1.20.0, zod 4.6.2, uuid 14.0.2). No source changes. Full detail in CHANGELOG.md.

### v2.9.1 (2026-09-02) - `kg:repair` Step 4 Constraint Abort

`kg:repair` step 4 stamped every duplicate live version of a name with the same `validTo`, violating the `(name, validTo)` uniqueness constraint whenever a name had three or more live versions and rolling the step back. Losers now close at `$now - i` (newest first). Apply mode now re-counts after every pass and repeats while work remains (`--passes`, default 3), because step 5's re-pointing can leave step-1 duplicates behind.

### v2.9.0 (2026-09-02) - Versioning Relationship Duplication & Duplicate Live Versions

Two production data-corruption defects fixed by consolidating every entity-versioning path into one `versionEntities` helper (see "Entity Temporal Versioning" above). Adds `NEO4J_TX_TIMEOUT_MS`, `NEO4J_MAX_LIVE_RELATIONSHIPS`, and the `kg:repair` CLI (dry run by default, `--apply` to execute). Full detail in CHANGELOG.md.

---

### v2.2.0 (2026-03-04) - Public Release Preparation

**Public Release:**

- Git history sanitised (author emails normalised)
- Infrastructure references generalised (no private IPs/hostnames)
- Private deployment config moved to `CLAUDE.local.md` (gitignored)

**CI/CD Alignment:**

- Updated actions/checkout and actions/setup-node to v6
- Added concurrency group, timeout, workflow_dispatch, top-level permissions
- Added format:check step, removed duplicate test:coverage step
- Frozen lockfile for CI installs

**Dependency Updates:**

- uuid 11→13 (built-in TypeScript types, removed @types/uuid)
- node-cron 3→4 (ESM-only, zero code changes needed)
- dotenv 16→17, lru-cache 11.2.6, MCP SDK 1.27.1, axios 1.13.6
- biome 2.4.2, oxlint 1.48.0, lint-staged 16.3.2
- pnpm 10.28.2→10.30.0

**Community Files:**

- Added LICENSE (MIT dual copyright), SECURITY.md, CODE_OF_CONDUCT.md
- Updated CONTRIBUTING.md with current lint stack
- Added GitHub issue/PR templates, dependabot.yml

**Fixes:**

- lint-staged: Removed unsupported yml/yaml/md globs from biome format

---

### v2.1.1 (2026-02-13) - Lint Stack Migration: ESLint/Prettier to Oxlint/Biome

**Lint Stack Replacement:**

- Replaced ESLint 9 (strictTypeChecked) with Oxlint for linting (native Rust, ~100x faster)
- Replaced Prettier with Biome formatter (linter disabled, formatter-only mode)
- Oxlint plugins: import, promise, node, vitest
- Biome config matches previous Prettier settings (single quotes, trailing commas, 100 line width)
- `.eslintignore` for test file exclusions (oxlint reads this by default)

**Dependency Reduction:**

- Removed 14 ESLint/Prettier packages (eslint, prettier, @typescript-eslint/*, @stylistic/*, eslint-plugin-sonarjs, etc.)
- Added 2 packages: oxlint, @biomejs/biome
- Net reduction: 12 dev dependencies

**Code Quality Fixes:**

- Removed useless try/catch wrappers in `setup.ts` and `callToolHandler.ts`
- Replaced `new Array(n)` with `Array.from({ length: n })` in `DefaultEmbeddingService.ts`

---

### v1.13.0 (2026-02-02) - Tech Stack Modernization

**Major Tech Stack Updates:**

- Zod 4.x for runtime validation with comprehensive schemas (`src/schemas/index.ts`)
- ESLint 9 with strictTypeChecked configuration
- Vitest 4.x testing framework
- pnpm 10.28.2 package manager
- TypeScript ES2022 target with isolatedModules

**Dependency Updates:**

- @modelcontextprotocol/sdk 1.25.3
- @typescript-eslint/\* 8.54.0
- prettier 3.8.1
- All packages updated to latest minor/patch versions

**CI/CD Improvements:**

- Fixed flaky rate limiter timing test
- Adjusted coverage thresholds for CI environment variance

---

### v1.12.5 (2026-02-02) - Dependency Updates

**Updated to Latest Minor/Patch Versions:**

- @modelcontextprotocol/sdk: 1.25.2 → 1.25.3
- @stylistic/eslint-plugin: 5.7.0 → 5.7.1
- @typescript-eslint/\*: 8.53.0 → 8.54.0
- @vitest/coverage-v8: 4.0.17 → 4.0.18
- axios: 1.13.2 → 1.13.4
- eslint-plugin-sonarjs: 3.0.5 → 3.0.6
- lru-cache: 11.2.4 → 11.2.5
- prettier: 3.7.4 → 3.8.1
- typescript-eslint: 8.53.0 → 8.54.0
- vitest: 4.0.17 → 4.0.18

---

### v1.12.4 (2026-02-02) - Zod 4, ESLint strictTypeChecked, Dependency Updates

**Validation & Type Safety:**

- Added Zod 4.x for runtime input validation (`src/schemas/index.ts`)
- Comprehensive schemas for all MCP tool inputs (entities, relations, observations, search)
- Type-safe validation helpers with error handling

**ESLint strictTypeChecked Compliance:**

- Upgraded from `recommendedTypeChecked` to `strictTypeChecked`
- 13 rules set to 'warn' for gradual adoption (no-unsafe-\*, restrict-template-expressions, etc.)
- 6 rules disabled with documented justifications (no-unnecessary-condition, no-extraneous-class, etc.)
- Build passes with 0 errors, 1068 warnings for incremental improvement

**Dependency Updates:**

- Updated pnpm from 10.0.0 to 10.28.2 (latest stable)
- Updated TypeScript target from ES2020 to ES2022
- Updated Node.js engines from >=24 to >=18 (broader compatibility)
- Removed dead dependencies: hono, openai, ts-node, glob, rimraf, semver

**Security:**

- Resolved 5 Dependabot alerts by removing unused dependencies with vulnerabilities

---

### v1.12.3 (2026-01-31) - Lint Stack & Ironclad Stack Alignment

**Lint Stack Alignment:**

- Added `format:check` script for CI format validation
- Added `check` script combining lint + format:check + typecheck
- Created `.prettierignore` with comprehensive exclusion patterns
- Created `.vscode/settings.json` for format-on-save integration
- Added format:check step to CI/CD workflow
- Fixed pre-commit hook executable permissions
- Fixed Prettier formatting in 4 config files

**Ironclad Stack Compliance:**

- Updated `.nvmrc` to explicit version `24.13.0`
- Added `engine-strict=true` to `.npmrc`
- Added `packageManager` field to package.json (now pnpm@10.28.2)
- Added `isolatedModules: true` to tsconfig.json (ESM compatibility)
- Added `useUnknownInCatchVariables: true` to tsconfig.json (type safety)

**Coverage Thresholds:** Current thresholds (40-45%) are intentionally lower than ironclad standard (80%) as this is an existing codebase with incremental improvement planned. See vitest.config.ts for details.

---

### v1.12.2 (2026-01-31) - CI/CD Improvements

**Changes:**

- Expanded test matrix to Node 20.x, 22.x, 24.x
- Added lint and typecheck steps before build
- Publish uses Node 24.x (current LTS)
- Renamed workflow from `mcp-neo4j-knowledge-graph.yml` to `ci-cd.yml`

---

### v1.0.5 (2025-10-17) - BigInt Version Arithmetic Fix

**Problem**: `Cannot mix BigInt and other types, use explicit conversions` error when using `add_observations`, `delete_observations`, or `update_relation` with migrated entities.

**Root Cause**: Neo4j driver returns integer fields (`version`, `createdAt`, `updatedAt`, `validFrom`, `validTo`) as JavaScript BigInt, not Number. Arithmetic operations like `(version || 0) + 1` fail because `||` doesn't convert BigInt to Number.

**Solution**: Applied explicit `Number()` conversion before arithmetic in 3 locations:

1. `Neo4jStorageProvider.ts:902` - `addObservations` entity version increment
2. `Neo4jStorageProvider.ts:1211` - `deleteObservations` entity version increment
3. `Neo4jStorageProvider.ts:1432` - `updateRelation` relation version increment

**Pattern Used**:

```typescript
// CORRECT - converts BigInt before arithmetic
const newVersion = (currentNode.version ? Number(currentNode.version) : 0) + 1;

// WRONG - throws error with BigInt values
const newVersion = (currentNode.version || 0) + 1;
```

**Testing**: 287 unit tests passing, BigInt arithmetic errors resolved.

**Status**: ✅ Published to npm, fully functional with temporal versioning

### v1.0.4 (2025-10-17) - BigInt CreatedAt Field Fix

**Problem**: Same BigInt conversion error, but only affecting `createdAt` field assignments.

**Solution**: Applied `Number()` conversion to 3 `createdAt` assignments:

1. Line 985: Entity creation with existing createdAt
2. Line 1026: Outgoing relation recreation during entity update
3. Line 1065: Incoming relation recreation during entity update

**Status**: ✅ Published to npm, but incomplete (missed version field arithmetic)

### Known Issue: Neo4j Schema Constraint

**Problem**: After fixing v1.0.5 BigInt issues, discovered separate schema constraint problem:

```
Neo4jError: Node(636) already exists with label 'Entity' and property 'name' = '...'
```

**Root Cause**: Database has old **single-field UNIQUE constraint** on `Entity.name` instead of required **composite constraint** on `(name, validTo)`.

**Why This Matters**:

- Temporal versioning creates multiple entity nodes with same name but different validTo timestamps
- Single-field constraint: Blocks all duplicate names (prevents temporal versioning)
- Composite constraint: Allows same name with different validTo values (enables temporal versioning)

**Example Valid State with Composite Constraint**:

```
Entity 1: name="Framework", validTo=NULL,        version=2  ← Current
Entity 2: name="Framework", validTo=1760713600,  version=1  ← Historical
```

**Solution**: Database-level constraint fix (NOT a code issue):

```cypher
DROP CONSTRAINT entity_name IF EXISTS;
CREATE CONSTRAINT entity_name
FOR (e:Entity)
REQUIRE (e.name, e.validTo) IS UNIQUE;
```

**Documentation**: Complete diagnosis and fix guide in `docs/SCHEMA_CONSTRAINT_FIX.md`

**Status**: ⚠️ Requires manual database update per installation

### Historical Context

**Original Implementation Issues**: Earlier versions of the codebase had JSON parsing errors and subprocess-based Neo4j operations causing failures.

**Key Improvements Made**:

- ✅ Direct `neo4j-driver` usage (no subprocess)
- ✅ Proper transaction management
- ✅ Parameterized queries
- ✅ Professional error handling
- ✅ Connection pooling

See `INVESTIGATION.md` for detailed technical analysis.

## Deployment

### Docker Compose Example

```yaml
services:
  neo4j:
    image: neo4j:5.26-community
    container_name: neo4j-kg
    environment:
      NEO4J_AUTH: neo4j/${NEO4J_PASSWORD}
      NEO4J_PLUGINS: '["apoc"]'
      NEO4J_server_memory_heap_initial__size: 2G
      NEO4J_server_memory_heap_max__size: 2G
      NEO4J_server_memory_pagecache_size: 1G
      NEO4J_db_memory_transaction_max: 512M
    ports:
      - '7474:7474' # HTTP
      - '7687:7687' # Bolt
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
    restart: unless-stopped
```

**For upgrade procedures**, see [docs/UPGRADE.md](docs/UPGRADE.md).

### Vector Embeddings

- Provider-agnostic (OpenAI-compatible). Defaults: OpenAI text-embedding-3-small (1536d). Cloudflare Workers AI example: @cf/qwen/qwen3-embedding-0.6b (1024d) + @cf/baai/bge-reranker-base reranker
- INVARIANT: `EMBEDDING_DIMENSIONS` == `NEO4J_VECTOR_DIMENSIONS` == model native output dim. Model switch with a different dim = index rebuild + full re-embed (runbook: README "Switching models")
- Setup walkthroughs (OpenAI / Cloudflare free plan / self-hosted) + multi-surface MCP client topology: README "Embeddings & Reranking Setup" + "Multi-Surface MCP Client Setup"
- Semantic search defaults (v2.7.0, reranker-aware): vector recall is always `limit ?? 10`; default return is 10 (no reranker) or the top 5 reranked (`RERANK_TOP_K`, default 5) when a reranker is configured; explicit `limit` always honoured exactly. `min_similarity` default 0 (disabled — Neo4j `(cos+1)/2` normalised scale; see README)

**Automated Maintenance (v1.3.0+):**

- **Daily Cron**: Automatic incremental embedding generation at configurable schedule
- **Method**: `EmbeddingJobManager.scheduleIncrementalRegeneration()`
- **Behavior**: Checks all entities, schedules jobs only for those missing embeddings

**Manual Maintenance:**

- On-demand generation: `pnpm run embeddings:generate`
- Test subset: `pnpm run embeddings:test` (processes 5 entities)
- Regenerate all: `pnpm run embeddings:generate -- --force`
- Cost per run: ~$0.02 per 1M tokens

## Critical Implementation Patterns

### Tool Input Validation Gate

- **Every tool call is checked before dispatch.** `handleCallToolRequest` calls `assertValidToolInput` (`src/server/handlers/validateToolInput.ts`), which looks the tool up in the `toolInputSchemas` table in `src/schemas/index.ts`. A tool with no entry is rejected as `Unknown tool`.
- **Gate, not transform.** Handlers receive the original arguments object: no defaults, no coercion, no stripped keys. Schemas use `z.looseObject` at every level.
- **Boolean inputs are the one normalised type.** A key that means a boolean (`include_null_domain`, `hybrid_search`, `enable_hybrid_retrieval`, `hybrid_config.enable_score_debug`, `include_ok`, `config.enableParallel`) accepts `true`/`false` and the strings `"true"`/`"false"` in any letter case; the gate rejects anything else. The handler, not the gate, converts the string with `normaliseBooleanInput` (`src/schemas/index.ts`; batch `config` via `toolHandlers/batchConfig.ts`) before reading it — read raw, `"false"` is truthy and `"true" === true` is false. A new boolean input needs `booleanLike` in its schema AND the `normaliseBooleanInput` call in its handler.
- **Rule: never turn a call that succeeds and does something meaningful today into a failure.** A schema is as lenient as the code that reads the value (`whenTruthy`, `anyValue`, `unless` in `src/schemas/index.ts`). Reject only what already throws deeper in the stack, silently does nothing, or stores a wrong-typed value.
- **Change a tool = change both.** Adding a tool, or changing its arguments, means updating the advertised `inputSchema` in `listToolsHandler.ts` AND its schema in `src/schemas/index.ts` together.
- **Parity tests enforce it.** `src/server/handlers/__vitest__/toolInputValidation.test.ts` is generated from the advertised tool list: one schema per tool, advertised required keys rejected when missing or wrong-typed, advertised optional keys never required. A required key the code tolerates when absent needs an entry, with the reason, in that file's `TOLERATED_WHEN_ABSENT` list.
- **Failure shape.** A plain `Error` (JSON-RPC `-32603`): `Invalid arguments for tool <name>: <path>: <problem>`. Never put argument values in the message.

### Embedding Write Guards (v2.6.0)

- **Dimension guard**: `Neo4jStorageProvider.assertEmbeddingDimension` rejects any vector whose length != `config.vectorDimensions` — on `updateEntityEmbedding` (throws, job fails loudly) and `createEntities` (entity persists with NULL embedding). Wrong-dimension vectors are NEVER written.
- **Production mock-guard**: `EmbeddingServiceFactory.hasEmbeddingProvider(env)` rejects `MOCK_EMBEDDINGS` under `NODE_ENV=production`; `shouldWriteEmbeddings(service, env)` refuses a `DefaultEmbeddingService` (mock OR silent fallback) in production — index.ts then runs keyword-only. Random vectors never drive a production store.
- **Startup consistency check**: `checkDimensionConsistency(env)` warns at boot when `EMBEDDING_DIMENSIONS` != `NEO4J_VECTOR_DIMENSIONS`.
- **Version source of truth**: `setup.ts getPackageVersion()` reads package.json via `createRequire` — never hardcode the MCP serverInfo version.

### Entity Temporal Versioning (v2.9.0) — LANDMINE

**One helper owns versioning: `Neo4jStorageProvider.versionEntities(txc, inputs)`.** Every path that supersedes an existing entity version routes through it — `addObservations`, `addObservationsBatch`, `deleteObservations`, `updateEntitiesBatch`, and the upsert case of `createEntities`/`createEntitiesBatch`. Never hand-roll the close-old / create-new / recreate-relationships sequence again; four divergent copies of it caused two production data-corruption incidents.

- **Copy relationships with `MERGE (newE)-[r:RELATES_TO {id: rel.id}]->(to) ON CREATE SET r += $props`, never `CREATE`.** A batch holding BOTH ends of a relationship copies it twice (outgoing for one entity, incoming for the other); `CREATE` doubled the count on every joint batch, reaching 39,382 physical edges for 15 logical ones and exhausting `db.memory.transaction.max` (512 MiB).
- **Close EVERY live version of the name, not just the id you read.** The composite `(name, validTo)` UNIQUE constraint does **not** prevent multiple live versions — Neo4j exempts rows with a NULL in the constrained property set. This is why 48 names ended up multi-live.
- **Resolve counterparts to their newest live version AFTER creating the new versions,** so a counterpart versioned in the same call resolves to its new version and a dead counterpart is dropped rather than re-attached to a stale one.
- **Never `collect()` a relationship group.** Both the helper and `kg:repair` carry `min(elementId(r))` + `count(r)` and re-match; a `collect()` over a 39k-edge group blows the 512 MiB cap on its own.
- **Re-creating an existing entity changes only what the call supplies.** The upsert case of `createEntities`/`createEntitiesBatch` leaves a field out of the new version's fields, so the new version inherits it from the live one, when the caller did not supply it:
  - **Observations:** omitted or `[]` keeps the stored observations and leaves the embedding NULL for the backfill. A non-empty list replaces them (it does not merge) — use `add_observations` to append.
  - **Domain:** omitted (or `undefined`) keeps the stored domain. An explicit `null` or `''` clears it; a non-empty string sets it. The batch path normalises `domain` to null on its rows for the fresh `CREATE`, so "was it supplied" is recorded from the raw input (`domainSuppliedRows`) — never infer it from the normalised row.
  - **entityType** is a required input and is always written.
  - Through v2.10.0 such a call wrote `[]` over the stored observations and reset the domain to null. A NEW name is unaffected: no observations is stored as `[]`, no domain as null.
- **Observations are stored as a JSON string, never a Neo4j list.** `searchNodes` uses `e.observations =~ $query`, which silently matches nothing against a list.
- **Every `beginTransaction()` takes `this.txConfig`** (`NEO4J_TX_TIMEOUT_MS`, default 60 s). An untimed transaction holds write locks until the server kills it, and the production server had no `db.transaction.timeout`.

### Reranker & Ordering (v2.7.0)

- **keepAlive:false transport agents**: `RerankerService` and `OpenAIEmbeddingService` each create their own axios instance with `keepAlive: false` `node:http`/`node:https` agents (inline per file, deliberately no shared util) — the shared default keep-alive agent's half-open socket made every rerank call after a multi-second recall gap time out and silently fail open.
- **Full-ordering rerank + caller-side trim**: `RerankerService.rerank()` returns the complete defensively score-sorted ordering (no topK early-break); `KnowledgeGraphManager.maybeRerank` owns the trim to the return count and appends any unscored tail (candidates beyond `RERANK_TOP_N`) in recall order.
- **Provider preserves rank order through hydration**: `Neo4jStorageProvider.semanticSearch` reorders `openNodes()` results to match the ranked name list (hybrid and non-hybrid paths) — recall order is meaningful, and fail-open returns hybrid-ordered results sliced to the return count.
- **`min_similarity` default 0** (disabled): threshold applies to Neo4j's `(cos+1)/2` normalised score; defaults resolve with `??` so an explicit `0` works.

### BigInt Handling in Neo4j Operations

**All temporal fields from Neo4j are BigInt and require conversion**:

```typescript
// Temporal fields that are BigInt from Neo4j:
// - version, createdAt, updatedAt, validFrom, validTo

// ALWAYS convert before arithmetic or assignment
const version = currentNode.version ? Number(currentNode.version) : 0;
const createdAt = Number(currentNode.createdAt);
const validFrom = props.validFrom ? Number(props.validFrom) : null;
```

**Where to Apply Conversions**:

- Before arithmetic: `(value ? Number(value) : default) + 1`
- In assignments: `createdAt: Number(node.createdAt)`
- In comparisons: `timestamp > Number(node.validFrom)`

### Temporal Versioning Update Workflow

When any entity/relation changes (via `addObservations`, `deleteObservations`, `updateRelation`):

1. **Query current version** (WHERE validTo IS NULL)
2. **Calculate new version** with BigInt conversion
3. **Mark old version invalid** (SET validTo = now)
4. **Create new version** with incremented version
5. **Recreate relationships** pointing to new entity version

**Transaction boundaries are critical** - all 5 steps must succeed or rollback together.

See `CHANGELOG.md` for complete history.

## Dependency Maintenance

**pnpm overrides do NOT apply to auto-installed peers (v2.8.1 landmine).** `vite` arrives only as an auto-installed peer of `vitest` (`autoInstallPeers: true`), so a `pnpm.overrides.vite` entry is silently ignored — resolution stays put even after deleting `pnpm-lock.yaml` and purging the pnpm metadata cache. Any transitive that reaches the tree only as an auto-installed peer must be declared as a **direct devDependency** for its override to bind. Symptom: an override that "does nothing" while every other override in the same block applies correctly.

**Transitive advisories are mostly unreachable here.** `hono`, `@hono/node-server`, `express`, and `body-parser` come via the MCP SDK's HTTP stack; `src/index.ts` uses `StdioServerTransport` only and never loads them. Patch them to keep the Dependabot list actionable, but they are not runtime exposure. `axios` (embeddings + reranker) and `fast-uri` (via `ajv`, schema validation) **are** runtime-reachable — treat those advisories as material.

**Overrides pinning a transitive major need the parent's range checked first.** `@hono/node-server >=2.0.5` is only legitimate from MCP SDK 1.30.0, which widened its declared range to `^1.19.9 || ^2.0.5`; on 1.29.0 the same override violates the SDK's constraint.

**An override FLOOR goes stale and then actively holds a package back.** `postcss: ">=8.5.10"` (written for an earlier advisory) left resolution pinned at 8.5.15 while sibling repos with no override floated freely to 8.5.23 — so when a new postcss advisory landed (`<= 8.5.17`, patched 8.5.18) this repo was the only one exposed. An override is a *pin*, not a *minimum guarantee*: pnpm will not float past whatever the lockfile already holds. When a new advisory names a package you already override, raise the floor — don't assume the existing override covers it. Corollary to the upper-bound rule above: bound the top, but keep the bottom current.

**Bound the top of EVERY override, not just the ones that bit you.** As of v2.8.2 every entry in the block carries a `<MAJOR+1` ceiling. An unbounded `>=X` floor is a standing invitation for `pnpm update` to float a transitive across a major boundary with no error (the sibling-repo `undici` 7→8 incident). Floor for the advisory, ceiling for the blast radius.

**An override that rewrites a DIRECT dependency's specifier desyncs the lockfile importer under `pnpm update` (v2.8.2 landmine).** `vite` is both a direct devDependency (`^7.3.6`, declared so its override binds) and an override target (`>=7.3.6 <8`). `pnpm update` refreshed the resolved versions but left the importer specifier recorded as `^7.3.6`, so the very next `pnpm install --frozen-lockfile` failed with `specifiers in the lockfile don't match specifiers in package.json: vite (lockfile: ^7.3.6, manifest: >=7.3.6 <8)` — i.e. green locally, red in CI. A plain `pnpm install` reconciles it. This is the concrete mechanism behind the rule below; it only shows up when a package is simultaneously a direct dep and an override target.

After any override change, regenerate the lockfile and confirm with `pnpm install --frozen-lockfile` — `pnpm update` alone leaves drift that `pnpm run check` does not catch.

## Publishing

Package is published to npm as `@henrychong-ai/mcp-neo4j-knowledge-graph`:

```bash
pnpm run build              # Build first
pnpm version patch          # Bump version
pnpm publish --access public
git push && git push --tags
```

**Pre-publish checklist:**

1. All tests passing
2. BigInt conversions verified
3. Schema constraints documented
4. CHANGELOG.md updated
5. Clear npx cache after publishing: `rm -rf ~/.npm/_npx/*/node_modules/@henrychong-ai`
