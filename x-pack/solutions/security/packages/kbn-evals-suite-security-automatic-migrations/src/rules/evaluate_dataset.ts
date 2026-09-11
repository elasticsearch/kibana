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
import type { RuleExample, RuleInput } from '../../datasets/rules/types';
import type { RuleMigrationClient, RuleMigrationResult } from './migration_client';
import {
  createCustomQueryAccuracyEvaluator,
  createLookupJoinPreservationEvaluator,
  createEsqlValidityEvaluator,
  createIntegrationMatchEvaluator,
  createPrebuiltRuleMatchEvaluator,
  createPrebuiltRuleMatchJustificationEvaluator,
  createUnsupportedPatternDetectionEvaluator,
  createHallucinationDetectionEvaluator,
  createTranslationResultEvaluator,
  createNlDescriptionFaithfulnessEvaluator,
} from './evaluators';

// ---------------------------------------------------------------------------
// Skip stats registry
// ---------------------------------------------------------------------------

export interface RuleDatasetSummary {
  datasetName: string;
  totalExamples: number;
  succeeded: number;
  failures: number;
  failureReasons: string[];
}

const ruleDatasetSummaries = new Map<string, RuleDatasetSummary>();

export function getRuleDatasetSummaries(): RuleDatasetSummary[] {
  return Array.from(ruleDatasetSummaries.values());
}

export function clearRuleDatasetSummaries(): void {
  ruleDatasetSummaries.clear();
}

export function formatRuleEvalSummary(summaries: RuleDatasetSummary[]): string {
  if (summaries.length === 0) return '';

  const lines: string[] = ['═══ RULE MIGRATION EVALUATION SUMMARY ═══', ''];
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
      lines.push('  Failures:');
      for (const [reason, count] of [...counts.entries()].sort(([, a], [, b]) => b - a)) {
        lines.push(`    ${String(count).padStart(2)}x  ${reason.slice(0, 120)}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createRuleEvaluateDataset({
  evaluators,
  executorClient,
  ruleMigrationClient,
  log,
  connectorId,
}: {
  evaluators: DefaultEvaluators;
  executorClient: EvalsExecutorClient;
  ruleMigrationClient: RuleMigrationClient;
  log: ToolingLog;
  connectorId: string;
}): ({
  dataset,
  vendor,
}: {
  dataset: EvaluationDataset<RuleExample>;
  vendor: 'splunk' | 'qradar';
}) => Promise<void> {
  const sharedEvaluators: Array<Evaluator<RuleExample, RuleMigrationResult>> = [
    createCustomQueryAccuracyEvaluator(),
    createLookupJoinPreservationEvaluator(),
    createEsqlValidityEvaluator(),
    createIntegrationMatchEvaluator(),
    createPrebuiltRuleMatchEvaluator(),
    createPrebuiltRuleMatchJustificationEvaluator(evaluators),
    createUnsupportedPatternDetectionEvaluator(),
    createTranslationResultEvaluator(),
    createHallucinationDetectionEvaluator(evaluators),
  ];

  const qradarEvaluators: Array<Evaluator<RuleExample, RuleMigrationResult>> = [
    createNlDescriptionFaithfulnessEvaluator(evaluators),
  ];

  return async function evaluateRuleDataset({
    dataset,
    vendor,
  }: {
    dataset: EvaluationDataset<RuleExample>;
    vendor: 'splunk' | 'qradar';
  }): Promise<void> {
    const allEvaluators =
      vendor === 'qradar' ? [...sharedEvaluators, ...qradarEvaluators] : sharedEvaluators;

    let totalExamples = 0;
    let succeeded = 0;
    let failures = 0;
    const failureReasons: string[] = [];

    await executorClient.runExperiment(
      {
        datasets: [dataset],
        concurrency: 3,
        task: async ({ input }) => {
          if (!input) throw new Error('Missing input for task');
          totalExamples++;
          const ruleInput = input as RuleInput;
          log.info(`[Task] Migrating rule: "${ruleInput.original_rule?.title ?? 'unknown'}"`);

          try {
            const result = await ruleMigrationClient.migrateRule(ruleInput, connectorId);
            succeeded++;
            log.info(
              `[Task] Rule migration complete: translation_result=${result.rule.translation_result}`
            );
            return result;
          } catch (error) {
            failures++;
            const msg = error instanceof Error ? error.message : String(error);
            failureReasons.push(msg.slice(0, 120));
            log.error(`[Task] Rule migration failed: ${msg}`);
            throw error;
          }
        },
      },
      allEvaluators
    );

    ruleDatasetSummaries.set(dataset.name, {
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
