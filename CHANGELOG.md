# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.7] - 2026-04-23

### Changed

- **Dependency Updates** (minor/patch only, no major bumps):
  - `axios` ^1.15.0 → ^1.15.2
  - `@biomejs/biome` ^2.4.12 → ^2.4.13
  - `@vitest/coverage-v8` ^4.1.4 → ^4.1.5
  - `oxlint` ^1.60.0 → ^1.61.0
  - `vitest` ^4.1.4 → ^4.1.5
- **Security / Dependabot**:
  - `follow-redirects` 1.15.11 → 1.16.0 (transitive via `axios`; also pinned via `pnpm.overrides`). Addresses Dependabot PR #30.
- 828 tests passing; lint, format, typecheck, build all green.

### Deferred

- `typescript` 5.9.3 → 6.0.3 (major bump — deferred, Dependabot PR #31)
- `uuid` 13.0.0 → 14.0.0 (major bump — deferred)

## [2.2.6] - 2026-04-15

### Changed

- **Dependency Updates** (minor/patch only, no major bumps):
  - `@modelcontextprotocol/sdk` ^1.28.0 → ^1.29.0
  - `axios` ^1.14.0 → ^1.15.0
  - `dotenv` ^17.3.1 → ^17.4.2
  - `lru-cache` ^11.2.7 → ^11.3.5
  - `@biomejs/biome` ^2.4.9 → ^2.4.12
  - `@types/node` ^25.4.0 → ^25.6.0
  - `@vitest/coverage-v8` ^4.1.2 → ^4.1.4
  - `oxlint` ^1.57.0 → ^1.60.0
  - `vitest` ^4.1.2 → ^4.1.4
- 828 tests passing; lint, format, typecheck, build all green.

### Deferred

- `typescript` 5.9.3 → 6.0.2 (major bump — deferred for separate review)

## [2.2.5] - 2026-04-11

### Security

Security patches — dependabot advisories resolved. All 16 open alerts addressed via `pnpm.overrides` (vulnerable packages are transitive-only).

- **hono 4.12.7 → 4.12.12** — 5 advisories: cookie prefix bypass (GHSA-r5rp-j6wh-rvv4), cookie name validation in `setCookie()`, IPv4-mapped IPv6 `ipRestriction()` bypass, `serveStatic` repeated-slash middleware bypass, `toSSG()` path traversal
- **@hono/node-server 1.19.11 → 1.19.13** — `serveStatic` middleware bypass
- **vite 7.3.1 → 7.3.2** (via `vitest`) — WebSocket arbitrary file read, `server.fs.deny` query bypass, optimized deps `.map` path traversal
- **picomatch 2.3.1 → 2.3.2 and 4.0.3 → 4.0.4** — ReDoS via extglob quantifiers and method injection in POSIX character classes
- **path-to-regexp 8.3.0 → 8.4.2** (via `express` → `@modelcontextprotocol/sdk`) — DoS via sequential optional groups and multiple wildcards
- **yaml 2.8.2 → 2.8.3** — stack overflow via deeply nested YAML collections

### Changed

- `pnpm.overrides`: bump `hono` override ≥4.12.7 → ≥4.12.12, `@hono/node-server` ≥1.19.10 → ≥1.19.13; add `vite ^7.3.2`, `picomatch ≥4.0.4` (with nested `micromatch>picomatch ^2.3.2` for shelljs/fast-glob compat), `path-to-regexp@>=8.0.0 <8.4.0 ≥8.4.0`, `yaml@>=2.0.0 <2.8.3 ≥2.8.3`
- 834 tests passing

## [2.2.3] - 2026-03-11

### Security

- Fix 3 Dependabot security alerts via pnpm overrides:
  - **HIGH**: @hono/node-server authorization bypass via encoded slashes (GHSA-wc8c-qw6v-h7f6) — override to ≥1.19.10
  - **HIGH**: express-rate-limit IPv4-mapped IPv6 bypass (new override ≥8.2.2)
  - **MEDIUM**: hono prototype pollution via \_\_proto\_\_ in parseBody (override bumped to ≥4.12.7)

### Changed

- **Dependency Updates**:
  - @biomejs/biome 2.4.2→2.4.6, @types/node 24.10.9→25.4.0, oxlint 1.48.0→1.53.0
  - Transitive: hono→4.12.7, @hono/node-server→1.19.11, express-rate-limit→8.3.1
- Fix stale MCP server version in setup.ts (was hardcoded '1.0.0', now '2.2.3')
- Close 3 Dependabot PRs (#11–#13) superseded by direct updates
- 834 tests passing
