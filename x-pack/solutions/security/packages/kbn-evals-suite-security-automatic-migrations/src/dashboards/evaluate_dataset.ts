/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  DefaultEvaluators,
  Evaluator,
  EvaluationDataset,
  EvalsExecutorClient,
} from '@kbn/evals';
import type { ToolingLog } from '@kbn/tooling-log';
import type { DashboardExample } from '../../datasets/dashboards/types';
import type { DashboardMigrationClient, MigrationResult } from './migration_client';
import { createLookupJoinPresenceEvaluator } from './evaluators/lookup_join_presence';
import { createEsqlCompletenessEvaluator } from './evaluators/esql_completeness';
import { createMarkdownErrorDetectionEvaluator } from './evaluators/markdown_error_detection';
import { createPanelCountPreservationEvaluator } from './evaluators/panel_count_preservation';
import { createTranslationCompletenessEvaluator } from './evaluators/translation_completeness';
import { createIndexPatternValidityEvaluator } from './evaluators/index_pattern_validity';
import { createTranslationFidelityEvaluator } from './evaluators/translation_fidelity';

// ---------------------------------------------------------------------------
// Skip stats registry — accumulated per dataset, consumed by the reporter
// ---------------------------------------------------------------------------

export interface DatasetSkipSummary {
  datasetName: string;
  totalExamples: number;
  succeeded: number;
  failures: number;
  failureReasons: string[];
}

const datasetSkipSummaries = new Map<string, DatasetSkipSummary>();

export function getDatasetSkipSummaries(): DatasetSkipSummary[] {
  return Array.from(datasetSkipSummaries.values());
}

export function clearDatasetSkipSummaries(): void {
  datasetSkipSummaries.clear();
}

export function formatEvalSummary(summaries: DatasetSkipSummary[]): string {
  if (summaries.length === 0) {
    return '';
  }

  const lines: string[] = ['═══ DASHBOARD MIGRATION EVALUATION SUMMARY ═══', ''];

  for (const s of summaries) {
    const pct = s.totalExamples > 0 ? Math.round((s.succeeded / s.totalExamples) * 100) : 0;
    lines.push(`Dataset: ${s.datasetName}`);
    lines.push(
      `  Total: ${s.totalExamples}  Succeeded: ${s.succeeded}  Failures: ${s.failures} (${pct}% success)`
    );

    if (s.failureReasons.length > 0) {
      const counts = new Map<string, number>();
      for (const reason of s.failureReasons) {
        counts.set(reason, (counts.get(reason) ?? 0) + 1);
      }
      const sorted = [...counts.entries()].sort(([, a], [, b]) => b - a);
      lines.push('  Failures:');
      for (const [reason, count] of sorted) {
        lines.push(`    ${String(count).padStart(2)}x  ${reason}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

const MAX_REASON_LENGTH = 120;
function truncate(s: string): string {
  return s.length > MAX_REASON_LENGTH ? `${s.slice(0, MAX_REASON_LENGTH)}...` : s;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createEvaluateDataset({
  evaluators,
  executorClient,
  migrationClient,
  log,
  connectorId,
}: {
  evaluators: DefaultEvaluators;
  executorClient: EvalsExecutorClient;
  migrationClient: DashboardMigrationClient;
  log: ToolingLog;
  connectorId: string;
}): ({ dataset }: { dataset: EvaluationDataset<DashboardExample> }) => Promise<void> {
  const allEvaluators: Array<Evaluator<DashboardExample, MigrationResult>> = [
    createLookupJoinPresenceEvaluator(),
    createEsqlCompletenessEvaluator(),
    createMarkdownErrorDetectionEvaluator(),
    createPanelCountPreservationEvaluator(),
    createTranslationCompletenessEvaluator(),
    createIndexPatternValidityEvaluator(),
    createTranslationFidelityEvaluator(evaluators),
  ];

  return async function evaluateDataset({
    dataset,
  }: {
    dataset: EvaluationDataset<DashboardExample>;
  }): Promise<void> {
    let totalExamples = 0;
    let succeeded = 0;
    let failures = 0;
    const failureReasons: string[] = [];

    await executorClient.runExperiment(
      {
        datasets: [dataset],
        concurrency: 1, // dashboard migrations are memory-heavy; suite runs after rules eval leaving Kibana close to OOM (SocketError: other side closed)
        task: async ({ input }) => {
          if (!input) throw new Error('Missing input for task');
          totalExamples++;
          log.info(
            `[Task] Migrating dashboard: "${
              input.original_dashboard_export?.result?.title ?? 'unknown'
            }"`
          );
          try {
            const result = await migrationClient.migrateDashboard(input, connectorId);
            succeeded++;
            log.info(
              `[Task] Migration complete: migrationId=${result.migrationId}, dashboards=${result.dashboards.length}`
            );
            return result;
          } catch (error) {
            failures++;
            const msg = error instanceof Error ? error.message : String(error);
            failureReasons.push(truncate(msg));
            log.error(`[Task] Migration failed: ${msg}`);
            throw error;
          }
        },
      },
      allEvaluators
    );

    datasetSkipSummaries.set(dataset.name, {
      datasetName: dataset.name,
      totalExamples,
      succeeded,
      failures,
      failureReasons,
    });

    if (failures > 0) {
      log.warning(
        `[Summary] ${dataset.name}: ${totalExamples} total — ${succeeded} succeeded, ${failures} failed`
      );
    } else {
      log.info(`[Summary] ${dataset.name}: ${totalExamples} total — ${succeeded} succeeded`);
    }
  };
}
