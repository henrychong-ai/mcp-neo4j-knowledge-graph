# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.4.3] - 2026-05-14

### Changed

- **Dependency bumps (minor/patch only):**
  - `axios` 1.16.0 → 1.16.1 (patch)
  - `@biomejs/biome` 2.4.14 → 2.4.15 (patch, dev)
  - `@types/node` 25.6.1 → 25.8.0 (minor, dev)
  - `@vitest/coverage-v8` 4.1.5 → 4.1.6 (patch, dev)
  - `oxlint` 1.63.0 → 1.64.0 (minor, dev)
  - `tsx` 4.21.0 → 4.22.0 (minor, dev)
  - `vitest` 4.1.5 → 4.1.6 (patch, dev)
  - `fast-uri` 3.1.0 → 3.1.2 (transitive, patch — supersedes Dependabot PR #47)

Major-version Dependabot PRs (`typescript` 5→6 #31, `lint-staged` 16→17 #46) deliberately skipped; they require manual audit. Dependabot PRs #45 (`@types/node` patch), #47 (`fast-uri` patch) are superseded by this bump and can be closed once this PR merges.

### Validated

- `pnpm run check` (oxlint + biome format:check + tsc --noEmit) — clean
- `pnpm run build` — clean
- `pnpm test` not run locally (requires Neo4j service); CI runs it against the workflow's Neo4j container.

