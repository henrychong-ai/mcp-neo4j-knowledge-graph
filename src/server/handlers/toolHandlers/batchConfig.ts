import { normaliseBooleanInput } from '../../../schemas/index.js';

/**
 * Normalise the boolean-meaning `enableParallel` of a batch tool's `config`.
 *
 * The same `config` object is returned unless `enableParallel` is the string
 * `"true"` / `"false"` (any letter case); then a copy carrying the boolean is
 * returned and every other key is kept. The caller's object is never mutated.
 *
 * @param config The `config` argument of a batch tool, as received
 * @returns The config to hand to the manager
 */
export function normaliseBatchConfig(config: unknown): unknown {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    return config;
  }
  const { enableParallel } = config as { enableParallel?: unknown };
  const normalised = normaliseBooleanInput(enableParallel);
  return normalised === enableParallel ? config : { ...config, enableParallel: normalised };
}
