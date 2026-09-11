/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DefaultEvaluators, Evaluator, EvaluationResult } from '@kbn/evals';
import type { DashboardExample } from '../../../datasets/dashboards/types';
import type { MigrationResult } from '../migration_client';
import { extractEsqlQueries } from '../helpers';

export function createTranslationFidelityEvaluator(
  evaluators: DefaultEvaluators
): Evaluator<DashboardExample, MigrationResult> {
  return {
    name: 'translation_fidelity',
    kind: 'LLM',
    direction: 'maximize',
    evaluate: async ({ input, output, expected, metadata }): Promise<EvaluationResult> => {
      if (!output?.dashboards?.length) {
        return { score: null, label: 'N/A', explanation: 'No translated dashboards in output' };
      }

      const sourceSpl = input?.original_dashboard_export?.result?.['eai:data'];
      if (!sourceSpl) {
        return { score: null, label: 'N/A', explanation: 'No source dashboard in input' };
      }
      const translatedQueries = extractEsqlQueries(output);

      if (translatedQueries.length === 0) {
        return {
          score: null,
          label: 'N/A',
          explanation: 'No ES|QL queries to evaluate fidelity against',
        };
      }

      // Limit data sent to LLM judge to avoid token limits
      const maxPanels = 10;
      const limitedQueries = translatedQueries.slice(0, maxPanels);
      const panelPairsSummary = limitedQueries
        .map((q, i) => `Panel ${i + 1}: "${q.panelTitle}"\n  ES|QL: ${q.query.slice(0, 500)}`)
        .join('\n\n');

      const truncatedNote =
        translatedQueries.length > maxPanels
          ? `\n(Showing ${maxPanels} of ${translatedQueries.length} panels)\n`
          : '';

      const criteriaEval = evaluators.criteria([
        `You are evaluating a Splunk-to-Kibana dashboard translation. ` +
          `The source Splunk dashboard XML is provided, and the translated ES|QL queries are shown below.\n\n` +
          `SOURCE SPLUNK DASHBOARD (truncated):\n${sourceSpl.slice(0, 3000)}\n\n` +
          `TRANSLATED PANELS:${truncatedNote}\n${panelPairsSummary}\n\n` +
          `Evaluate the translation on TWO dimensions:\n` +
          `1. GROUNDING: Panel titles, field names, and data sources in the output must be traceable to the source. ` +
          `Flag any hallucinated content.\n` +
          `2. INTENT PRESERVATION: Each ES|QL query must answer the same analytical question as its source SPL.\n\n` +
          `Score YES if both grounding and intent are preserved. Score NO otherwise.`,
      ]);

      try {
        return await criteriaEval.evaluate({ input, output, expected, metadata });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          score: null,
          label: 'ERROR',
          explanation: `LLM judge failed: ${msg.slice(0, 200)}`,
        };
      }
    },
  };
}
