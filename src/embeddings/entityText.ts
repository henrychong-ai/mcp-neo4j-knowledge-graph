import type { Entity } from '../KnowledgeGraphManager.js';

/**
 * Build the canonical text representation of an entity.
 *
 * Used for BOTH embedding generation and reranking so the two never drift —
 * single source of truth for "what text represents this entity". Pure (no side
 * effects); callers add their own logging.
 *
 * @param entity - Entity to render
 * @returns Multi-line text: name, type, and observations
 */
export function prepareEntityText(entity: Entity): string {
  const lines = [`Name: ${entity.name}`, `Type: ${entity.entityType}`, 'Observations:'];

  if (entity.observations) {
    let observationsArray: unknown = entity.observations;
    if (typeof entity.observations === 'string') {
      try {
        observationsArray = JSON.parse(entity.observations);
      } catch {
        observationsArray = [entity.observations];
      }
    }
    if (!Array.isArray(observationsArray)) {
      observationsArray = [String(observationsArray)];
    }
    const arr = observationsArray as string[];
    if (arr.length > 0) {
      lines.push(...arr.map(obs => `- ${obs}`));
    } else {
      lines.push('  (No observations)');
    }
  } else {
    lines.push('  (No observations)');
  }

  return lines.join('\n');
}
