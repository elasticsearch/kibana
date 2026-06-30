/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SignificantEvent } from '@kbn/significant-events-schema';
import type { JudgeEvaluator } from '../../types';

const VALID_STATUSES = new Set<SignificantEvent['status']>([
  'promoted',
  'acknowledged',
  'demoted',
  'resolved',
]);
const REQUIRED_FIELDS: Array<keyof SignificantEvent> = [
  'discovery_id',
  'discovery_slug',
  'status',
  'criticality',
  'confidence',
  'assessment_note',
  'evidences',
];

function isCriticalityValid(value: unknown): boolean {
  return value == null || (typeof value === 'number' && value >= 0 && value <= 100);
}

/**
 * CODE evaluator: validates required `SigEvent` fields, that `status` is in the allowed set, and
 * that `criticality` (when present) is a number in 0–100. Score = valid_docs / total_docs.
 */
export const schemaValidityJudgeEvaluator: JudgeEvaluator = {
  name: 'schema_validity',
  kind: 'CODE',
  evaluate: ({ output }) => {
    const events = output.significantEvents ?? [];

    if (events.length === 0) {
      return Promise.resolve({ score: 0, explanation: 'No significant events returned' });
    }

    let validCount = 0;
    const issues: string[] = [];

    for (const [i, event] of events.entries()) {
      const missing = REQUIRED_FIELDS.filter((f) => event[f] == null);
      if (missing.length > 0) {
        issues.push(`[${i}] missing fields: ${missing.join(', ')}`);
        continue;
      }
      if (!VALID_STATUSES.has(event.status)) {
        issues.push(`[${i}] invalid status: ${event.status}`);
        continue;
      }
      if (!isCriticalityValid(event.criticality)) {
        issues.push(`[${i}] invalid criticality: ${event.criticality}`);
        continue;
      }
      validCount++;
    }

    const score = validCount / events.length;
    return Promise.resolve({
      score,
      explanation:
        issues.length > 0
          ? `${issues.join('; ')} (score=${score.toFixed(2)})`
          : `All ${events.length} significant events have valid schema`,
    });
  },
};
