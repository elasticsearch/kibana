/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Discovery } from '@kbn/significant-events-schema';
import type { InvestigatorEvaluator } from '../../types';

const VALID_KINDS = new Set<Discovery['kind']>(['discovery', 'clearance', 'handled']);

const REQUIRED_FIELDS: Array<keyof Discovery> = [
  'kind',
  'title',
  'summary',
  'criticality',
  'confidence',
  'detections',
  'cause_kis',
  'discovery_slug',
  'dependency_edges',
  'infra_components',
  'evidences',
];

function isCriticalityValid(value: unknown): boolean {
  return value == null || (typeof value === 'number' && value >= 0 && value <= 100);
}

/**
 * CODE evaluator: validates that each discovery has all required fields, a valid `kind`, and a
 * `criticality` (when present) that is a number in 0–100. Score = valid_docs / total_docs.
 */
export const schemaValidityInvestigatorEvaluator: InvestigatorEvaluator = {
  name: 'schema_validity',
  kind: 'CODE',
  evaluate: ({ output }) => {
    const discoveries = output.discoveries ?? [];

    if (discoveries.length === 0) {
      return Promise.resolve({ score: 0, explanation: 'No discoveries returned' });
    }

    let validCount = 0;
    const issues: string[] = [];

    for (const [i, discovery] of discoveries.entries()) {
      const missing = REQUIRED_FIELDS.filter((f) => discovery[f] == null);
      if (missing.length > 0) {
        issues.push(`[${i}] missing fields: ${missing.join(', ')}`);
        continue;
      }
      if (!VALID_KINDS.has(discovery.kind)) {
        issues.push(`[${i}] invalid kind: ${discovery.kind}`);
        continue;
      }
      if (!isCriticalityValid(discovery.criticality)) {
        issues.push(`[${i}] invalid criticality: ${discovery.criticality}`);
        continue;
      }
      validCount++;
    }

    const score = validCount / discoveries.length;
    return Promise.resolve({
      score,
      explanation:
        issues.length > 0
          ? `${issues.join('; ')} (score=${score.toFixed(2)})`
          : `All ${discoveries.length} discoveries have valid schema`,
    });
  },
};
