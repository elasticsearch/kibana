/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator } from '@kbn/evals';
import type {
  AnonymizedAlert,
  AttackDiscoveryDatasetExample,
  AttackDiscoveryTaskOutput,
} from '../types';

export const ALERT_ID_GROUNDING_EVALUATOR_NAME = 'Alert-ID Grounding';

const ID_LINE = /^_id,(.+)$/m;

/**
 * Extracts the set of valid alert IDs from the input alerts. The `pageContent`
 * `_id,<id>` line (see `formatAsPageContent` in
 * `src/clients/attack_discovery_client.ts`) is the sole source of truth, since
 * that is exactly what the model sees — the IDs it can legitimately cite.
 */
const extractInputAlertIds = (anonymizedAlerts: ReadonlyArray<AnonymizedAlert>): Set<string> => {
  const ids = new Set<string>();
  for (const alert of anonymizedAlerts) {
    const match = typeof alert.pageContent === 'string' ? alert.pageContent.match(ID_LINE) : null;
    if (match) {
      ids.add(match[1].trim());
    }
  }
  return ids;
};

/**
 * Deterministic evaluator (`kind: 'CODE'`, no LLM call) that checks every
 * `alertIds[]` referenced by the generated insights is grounded in the input
 * alert set. Hallucinated alert references — IDs the model invented or copied
 * from its own narrative rather than the provided alerts — score below 1.0.
 *
 * Score = `groundedCount / citedCount` (1.0 = every cited ID exists in the
 * input). When the output cites no alert IDs there is nothing to ground, so the
 * evaluator returns `scoreOnEmpty` (default `1`), mirroring the empty-output
 * convention of the ES|QL validity evaluator. A `null` insights array (task
 * failure) scores 0.
 *
 * @param config.scoreOnEmpty - Score returned when no alert IDs are cited.
 *   Defaults to `1`.
 * @param config.name - Override the evaluator name.
 */
export const createAlertIdGroundingEvaluator = (
  config: { scoreOnEmpty?: number; name?: string } = {}
): Evaluator<AttackDiscoveryDatasetExample, AttackDiscoveryTaskOutput> => {
  const { scoreOnEmpty = 1, name = ALERT_ID_GROUNDING_EVALUATOR_NAME } = config;

  return {
    name,
    kind: 'CODE',
    evaluate: async ({ input, output }) => {
      const insights = output?.insights;
      if (insights == null) {
        return { score: 0, label: 'missing_insights', explanation: 'No insights to ground.' };
      }

      const anonymizedAlerts = (input as { anonymizedAlerts?: ReadonlyArray<AnonymizedAlert> })
        ?.anonymizedAlerts;

      // When the example carries no inline alert set (e.g. searchAlerts mode, where
      // alerts are fetched at task time), the valid-ID set is unknowable here, so we
      // cannot distinguish a grounded reference from a hallucinated one. Return N/A
      // rather than scoring every cited ID as ungrounded.
      if (anonymizedAlerts == null) {
        return {
          score: null,
          label: 'N/A',
          explanation: 'No inline input alert set available to ground against.',
        };
      }

      const validIds = extractInputAlertIds(anonymizedAlerts);

      const citedIds = insights.flatMap((insight) =>
        Array.isArray(insight.alertIds) ? insight.alertIds : []
      );

      // No cited IDs means there is nothing to ground; an insight may legitimately
      // omit alertIds. Defaults to 1 ("nothing cited, nothing wrong"); override via
      // `scoreOnEmpty` if a suite wants to require citations.
      if (citedIds.length === 0) {
        return {
          score: scoreOnEmpty,
          label: 'no-alert-ids',
          explanation: 'Output cites no alert IDs — nothing to ground.',
          metadata: { citedCount: 0, validIdCount: validIds.size },
        };
      }

      const ungroundedIds = citedIds.filter((id) => !validIds.has(id));
      const groundedCount = citedIds.length - ungroundedIds.length;
      const score = groundedCount / citedIds.length;
      const fullyGrounded = ungroundedIds.length === 0;

      return {
        score,
        label: fullyGrounded ? 'grounded' : 'ungrounded',
        explanation: fullyGrounded
          ? `All ${citedIds.length} cited alert ID(s) exist in the input alert set.`
          : `${ungroundedIds.length} of ${citedIds.length} cited alert ID(s) are not in the input ` +
            `alert set (hallucinated): ${[...new Set(ungroundedIds)].join(', ')}`,
        metadata: {
          citedCount: citedIds.length,
          groundedCount,
          ungroundedIds: [...new Set(ungroundedIds)],
          validIdCount: validIds.size,
        },
      };
    },
  };
};
