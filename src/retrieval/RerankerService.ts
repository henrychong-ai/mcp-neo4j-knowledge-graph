import axios from 'axios';

import { logger } from '../utils/logger.js';

/**
 * Configuration for the neural reranker stage.
 *
 * Disabled by default — reranking is strictly additive. When `enabled` is false
 * (no config, or `RERANK_ENABLED` unset) the search pipeline returns its
 * vector/hybrid ordering unchanged.
 */
export interface RerankConfig {
  enabled: boolean;
  /** Full native run URL for the reranker model. */
  endpoint: string;
  model: string;
  apiKey: string;
  /** Candidates sent to the reranker (recall set). */
  topN: number;
  /** Results kept after rerank. */
  topK: number;
  /** Per-passage truncation for scoring only (reranker context limits). */
  maxPassageChars: number;
  timeoutMs: number;
}

/** Response shape of the Cloudflare native rerank endpoint (`.../ai/run/<model>`). */
interface RerankResponse {
  result?: { response?: { id: number; score: number }[] };
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Thin client for a cross-encoder reranker (default: Cloudflare Workers AI
 * `@cf/baai/bge-reranker-base`). OpenAI-style/native HTTP; reuses `axios`.
 *
 * The service itself MAY throw (transport/parse errors) — callers are expected
 * to fail open (return the pre-rerank order). It never enables itself without a
 * resolved endpoint + API key.
 */
export class RerankerService {
  private readonly cfg: RerankConfig;

  constructor(cfg: RerankConfig) {
    this.cfg = cfg;
  }

  get enabled(): boolean {
    return this.cfg.enabled;
  }

  get topN(): number {
    return this.cfg.topN;
  }

  get topK(): number {
    return this.cfg.topK;
  }

  get model(): string {
    return this.cfg.model;
  }

  /**
   * Build a reranker from environment variables. Returns a DISABLED instance
   * unless `RERANK_ENABLED=true` AND an endpoint + API key resolve.
   *
   * Env: RERANK_ENABLED, RERANK_MODEL (default @cf/baai/bge-reranker-base),
   * RERANK_ENDPOINT (or derived from RERANK_ACCOUNT_ID/CF_ACCOUNT_ID + model),
   * RERANK_API_KEY (falls back to EMBEDDING_API_KEY), RERANK_TOP_N (20),
   * RERANK_TOP_K (10), RERANK_MAX_PASSAGE_CHARS (2000), RERANK_TIMEOUT_MS (5000).
   */
  static fromEnv(): RerankerService {
    const requested = process.env.RERANK_ENABLED === 'true';
    const model = process.env.RERANK_MODEL || '@cf/baai/bge-reranker-base';
    const apiKey = process.env.RERANK_API_KEY || process.env.EMBEDDING_API_KEY || '';
    let endpoint = process.env.RERANK_ENDPOINT || '';
    const accountId = process.env.RERANK_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
    if (!endpoint && accountId) {
      endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
    }

    const enabled = requested && endpoint.length > 0 && apiKey.length > 0;
    if (requested && !enabled) {
      logger.warn(
        'RerankerService: RERANK_ENABLED=true but endpoint or API key could not be resolved — ' +
          'reranking DISABLED (fail-open). Set RERANK_ENDPOINT (or RERANK_ACCOUNT_ID) and RERANK_API_KEY.'
      );
    } else if (enabled) {
      logger.info(`RerankerService: enabled (model ${model})`);
    }

    return new RerankerService({
      enabled,
      endpoint,
      model,
      apiKey,
      topN: intEnv('RERANK_TOP_N', 20),
      topK: intEnv('RERANK_TOP_K', 10),
      maxPassageChars: intEnv('RERANK_MAX_PASSAGE_CHARS', 2000),
      timeoutMs: intEnv('RERANK_TIMEOUT_MS', 5000),
    });
  }

  /**
   * Rerank `passages` against `query`. Returns candidate indices reordered
   * descending by relevance, length <= topK. THROWS on transport/parse error —
   * the caller fail-opens.
   *
   * @param query - Search query
   * @param passages - Candidate passages (index-aligned with the caller's results)
   * @returns Indices into `passages`, best-first
   */
  async rerank(query: string, passages: string[]): Promise<number[]> {
    const contexts = passages
      .slice(0, this.cfg.topN)
      .map(text => ({ text: (text || '').slice(0, this.cfg.maxPassageChars) }));

    const response = await axios.post<RerankResponse>(
      this.cfg.endpoint,
      { query: query.slice(0, this.cfg.maxPassageChars), contexts },
      {
        headers: {
          Authorization: `Bearer ${this.cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: this.cfg.timeoutMs,
      }
    );

    const ranked = response.data?.result?.response;
    if (!Array.isArray(ranked)) {
      throw new Error('Reranker returned a malformed response (missing result.response array)');
    }

    // Defensive: keep only integer, in-range, UNIQUE ids (CF returns request-array indices).
    // Fractional / duplicate / out-of-range ids are dropped so a malformed-but-arrayed response
    // can't corrupt ordering or duplicate results — the caller still fully fail-opens on a throw.
    const seen = new Set<number>();
    const indices: number[] = [];
    for (const row of ranked) {
      const id = row?.id;
      if (
        typeof id === 'number' &&
        Number.isInteger(id) &&
        id >= 0 &&
        id < contexts.length &&
        !seen.has(id)
      ) {
        seen.add(id);
        indices.push(id);
        if (indices.length >= this.cfg.topK) break;
      }
    }
    return indices;
  }
}
