/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InvestigatorEvaluator } from '../../types';

/** CODE evaluator: every detection rule must carry ≥1 attributed evidence. Score = covered / total rules. */
export const evidenceCollectionEvaluator: InvestigatorEvaluator = {
  name: 'evidence_collection',
  kind: 'CODE',
  evaluate: ({ output }) => {
    const discoveries = output?.discoveries ?? [];

    let totalRules = 0;
    let covered = 0;
    const issues: string[] = [];

    for (const [i, discovery] of discoveries.entries()) {
      const detections = discovery.detections ?? [];
      const evidences = discovery.evidences ?? [];
      const evidenceRuleUuids = new Set(
        evidences.map((e) => e.rule_uuid).filter((id): id is string => Boolean(id))
      );

      for (const det of detections) {
        const ruleUuid = det.rule_uuid;
        if (!ruleUuid) {
          continue;
        }
        totalRules++;
        if (evidenceRuleUuids.has(ruleUuid)) {
          covered++;
        } else {
          issues.push(`[${i}] no evidence collected for rule "${det.rule_name ?? ruleUuid}"`);
        }
      }
    }

    if (totalRules === 0) {
      return Promise.resolve({
        score: null,
        label: 'unavailable',
        explanation: 'No detections present — nothing to collect evidence for',
      });
    }

    const score = covered / totalRules;
    return Promise.resolve({
      score,
      explanation:
        issues.length > 0
          ? `${issues.join('; ')} (score=${score.toFixed(2)})`
          : `All ${totalRules} rule(s) have collected evidence`,
    });
  },
};
