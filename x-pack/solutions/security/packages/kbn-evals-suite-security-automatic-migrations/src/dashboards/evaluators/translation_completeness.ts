/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator, EvaluationResult } from '@kbn/evals';
import type { DashboardExample } from '../../../datasets/dashboards/types';
import type { MigrationResult } from '../migration_client';
import { parsePanels } from '../helpers';

export const createTranslationCompletenessEvaluator = (): Evaluator<
  DashboardExample,
  MigrationResult
> => ({
  name: 'Translation Completeness',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({
    output,
  }: {
    input: unknown;
    output: MigrationResult;
    expected: unknown;
    metadata: unknown;
  }): Promise<EvaluationResult> => {
    // translation_result is at the dashboard level in the new API response
    const results = output.dashboards.map((dashboard) => ({
      dashboardId: dashboard.id,
      translationResult: dashboard.translation_result,
      panelCount: parsePanels(dashboard).length,
    }));

    const totalPanels = results.reduce((sum, r) => sum + r.panelCount, 0);

    if (totalPanels === 0) {
      // Check if we have any fully/partially translated dashboards at least
      const anyTranslated = output.dashboards.some(
        (d) => d.translation_result === 'full' || d.translation_result === 'partial'
      );
      if (!anyTranslated) {
        return { score: null, explanation: 'No panels found in output' };
      }
    }

    const fullyTranslated = output.dashboards.filter((d) => d.translation_result === 'full').length;
    const partiallyTranslated = output.dashboards.filter(
      (d) => d.translation_result === 'partial'
    ).length;
    const untranslatable = output.dashboards.filter(
      (d) => d.translation_result === 'untranslatable'
    ).length;
    const total = output.dashboards.length;

    if (total === 0) {
      return { score: null, explanation: 'No dashboards found in output' };
    }

    // Score: full=1.0 per dashboard, partial=0.5, untranslatable=0.0
    const score = (fullyTranslated + partiallyTranslated * 0.5) / total;

    const explanation =
      untranslatable > 0 || partiallyTranslated > 0
        ? `${fullyTranslated} fully translated, ${partiallyTranslated} partial, ${untranslatable} untranslatable out of ${total} dashboard(s)`
        : `All ${total} dashboard(s) fully translated`;

    return {
      score,
      explanation,
      metadata: {
        total,
        fullyTranslated,
        partiallyTranslated,
        untranslatable,
        totalPanels,
        dashboardStatuses: results,
      },
    };
  },
});
