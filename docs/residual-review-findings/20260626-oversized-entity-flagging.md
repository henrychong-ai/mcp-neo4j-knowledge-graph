# Residual review findings — oversized-entity flagging (v2.8.0, Phase 1)

Autosequence run, branch `develop`, 2026-06-26. The HIGH/concurring findings were applied in-loop; the items below were deliberately deferred (optimizations, judgement-calls, lone-reviewer, or verified-unreachable). Tracked here so they are durable, not chat-only.

## Deferred (not applied this run)

1. **[MEDIUM] `create_entities_batch` write-warning does an avoidable `openNodes` round-trip.** (code-review)
   With `ENTITY_SIZE_WARN_ON_WRITE=true` (default), every batch write re-hydrates the touched entities via `openNodes` purely to size them — added latency on the write hot path. For `create_entities_batch` the observation content is already in `args.entities[].observations`, so it could be sized in-process via `estimateEntitySize` with no DB call; only `add`/`update` genuinely need the post-write re-read. Deferred: it's an optimization that adds a divergent code path (and `args` may differ from stored after transforms), not a correctness defect. Bounded to touched entities and fully fail-open today.

2. **[LOW] No per-caller domain/tenant scoping on `flag_oversized_entities` / write hooks.** (security + code-review)
   These size-only paths don't apply any per-caller domain scoping that other read tools may enforce. Out of scope for the Phase-1 security pass; track as a separate business-logic/authz audit (the data exposed is size metrics only, never entity bodies, so exposure is low).

3. **[LOW] `flagOversizedEntities` in-memory `loadGraph()` fallback is not cap-immune.** (codex)
   Reached only when a provider lacks `scanEntitySizes` — verified unreachable in stock production (`Neo4jStorageProvider` always implements it). Could fire for a custom/injected provider. Optional hardening: return a degraded `note`/`error` instead of a full `loadGraph()`, or gate behind a dev flag. Left as-is (the `note` field already flags the degraded path).

## Verification caveats (deploy-time)

4. **`scanEntitySizes` Cypher verified by inspection only.** The new Cypher (`valueType()`, `split`, `coalesce`, `reduce`, `LIMIT toInteger($limit)`) is unit-tested against a mocked provider, not executed against a live Neo4j in this run (integration tests not run). Validate against vps-2 (Neo4j 5.26) at deploy time — part of the deferred Step 10 deploy/verify, which is out of scope for this branch.

## Phase-2 extension points (design-only, intentionally not built)

Prometheus gauges (`kg_entity_estimated_tokens` / `kg_oversized_entities_total`), `open_nodes` graceful-degrade for already-CRITICAL entities, and a `suggest_entity_split` helper — see the plan at `~/.claude/plans/20260626-kg-oversized-entity-flagging.md`.
