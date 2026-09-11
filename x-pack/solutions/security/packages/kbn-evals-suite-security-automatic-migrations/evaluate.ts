/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReportDisplayOptions, EvaluationDataset } from '@kbn/evals';
import { evaluate as base, createDefaultTerminalReporter } from '@kbn/evals';
import { DashboardMigrationClient } from './src/dashboards/migration_client';
import {
  createEvaluateDataset,
  getDatasetSkipSummaries,
  clearDatasetSkipSummaries,
  formatEvalSummary,
} from './src/dashboards/evaluate_dataset';
import type { DashboardExample } from './datasets/dashboards/types';
import { RuleMigrationClient } from './src/rules/migration_client';
import {
  createRuleEvaluateDataset,
  getRuleDatasetSummaries,
  clearRuleDatasetSummaries,
  formatRuleEvalSummary,
} from './src/rules/evaluate_dataset';
import type { RuleExample } from './datasets/rules/types';
import { loadPrebuiltRules } from './src/rules/load_prebuilt_rules';

type EvaluateDatasetFn = (args: { dataset: EvaluationDataset<DashboardExample> }) => Promise<void>;

type EvaluateRuleDatasetFn = (args: {
  dataset: EvaluationDataset<RuleExample>;
  vendor: 'splunk' | 'qradar';
}) => Promise<void>;

interface WorkerFixtures {
  migrationClient: DashboardMigrationClient;
  evaluateDataset: EvaluateDatasetFn;
  ruleMigrationClient: RuleMigrationClient;
  evaluateRuleDataset: EvaluateRuleDatasetFn;
  reportDisplayOptions: ReportDisplayOptions;
  reportModelScore: ReturnType<typeof createDefaultTerminalReporter>;
  /** Not consumed directly — depend on this fixture to ensure the prebuilt rules are loaded once per worker. */
  prebuiltRulesLoaded: void;
}

export const evaluate = base.extend<{}, WorkerFixtures>({
  migrationClient: [
    async ({ fetch, log }, use) => {
      await use(new DashboardMigrationClient(fetch, log));
    },
    { scope: 'worker' },
  ],
  evaluateDataset: [
    async ({ evaluators, executorClient, migrationClient, log, connector }, use) => {
      await use(
        createEvaluateDataset({
          evaluators,
          executorClient,
          migrationClient,
          log,
          connectorId: connector.id,
        })
      );
    },
    { scope: 'worker' },
  ],
  prebuiltRulesLoaded: [
    async ({ esClient, log }, use) => {
      await loadPrebuiltRules(esClient, log);
      await use();
    },
    { scope: 'worker' },
  ],
  ruleMigrationClient: [
    async ({ fetch, log, prebuiltRulesLoaded }, use) => {
      await use(new RuleMigrationClient(fetch, log));
    },
    { scope: 'worker' },
  ],
  evaluateRuleDataset: [
    async ({ evaluators, executorClient, ruleMigrationClient, log, connector }, use) => {
      await use(
        createRuleEvaluateDataset({
          evaluators,
          executorClient,
          ruleMigrationClient,
          log,
          connectorId: connector.id,
        })
      );
    },
    { scope: 'worker' },
  ],
  reportDisplayOptions: [
    async ({ evaluators }, use) => {
      const { inputTokens, outputTokens, cachedTokens, toolCalls, latency } =
        evaluators.traceBasedEvaluators;

      const evaluatorDisplayOptions: ReportDisplayOptions['evaluatorDisplayOptions'] = new Map([
        [inputTokens.name, { decimalPlaces: 1, statsToInclude: ['mean', 'median'] }],
        [outputTokens.name, { decimalPlaces: 1, statsToInclude: ['mean', 'median'] }],
        [cachedTokens.name, { decimalPlaces: 1, statsToInclude: ['mean', 'median'] }],
        [toolCalls.name, { decimalPlaces: 1, statsToInclude: ['mean', 'median'] }],
        [latency.name, { unitSuffix: 's', statsToInclude: ['mean', 'median'] }],
        ['Lookup Join Presence', { statsToInclude: ['mean'] }],
        ['ES|QL Completeness', { statsToInclude: ['mean'] }],
        ['Markdown Error Detection', { statsToInclude: ['mean'] }],
        ['Panel Count Preservation', { statsToInclude: ['mean'] }],
        ['Translation Completeness', { statsToInclude: ['mean'] }],
        ['Index Pattern Validity', { statsToInclude: ['mean'] }],
        ['translation_fidelity', { statsToInclude: ['mean'] }],
        ['Custom Query Accuracy', { statsToInclude: ['mean', 'median'] }],
        ['LOOKUP JOIN Preservation', { statsToInclude: ['mean'] }],
        ['Translated ESQL Validity', { statsToInclude: ['mean'] }],
        ['Integration Match', { statsToInclude: ['mean'] }],
        ['Prebuilt Rule Match', { statsToInclude: ['mean'] }],
        ['Unsupported Pattern Detection', { statsToInclude: ['mean'] }],
        ['Hallucination Detection', { statsToInclude: ['mean'] }],
        ['Translation Result', { statsToInclude: ['mean'] }],
        ['NL Description Faithfulness', { statsToInclude: ['mean'] }],
      ]);

      await use({
        evaluatorDisplayOptions,
        evaluatorDisplayGroups: [
          {
            evaluatorNames: [inputTokens.name, outputTokens.name, cachedTokens.name],
            combinedColumnName: 'Tokens',
          },
          {
            evaluatorNames: [
              'ES|QL Completeness',
              'Markdown Error Detection',
              'Panel Count Preservation',
              'Translation Completeness',
              'Index Pattern Validity',
            ],
            combinedColumnName: 'Structural Validity',
          },
          {
            evaluatorNames: ['Lookup Join Presence', 'translation_fidelity'],
            combinedColumnName: 'Translation Quality',
          },
          {
            evaluatorNames: [
              'Translated ESQL Validity',
              'LOOKUP JOIN Preservation',
              'Unsupported Pattern Detection',
              'Translation Result',
            ],
            combinedColumnName: 'Rule Structural Checks',
          },
          {
            evaluatorNames: ['Custom Query Accuracy', 'Integration Match', 'Prebuilt Rule Match'],
            combinedColumnName: 'Rule Matching',
          },
          {
            evaluatorNames: ['Hallucination Detection', 'NL Description Faithfulness'],
            combinedColumnName: 'Rule Faithfulness',
          },
        ],
      });
    },
    { scope: 'worker' },
  ],
  reportModelScore: [
    async ({ reportDisplayOptions }, use) => {
      const defaultReporter = createDefaultTerminalReporter({ reportDisplayOptions });
      await use(async (scoreRepository, runId, log, filter) => {
        await defaultReporter(scoreRepository, runId, log, filter);

        const evalSummary = formatEvalSummary(getDatasetSkipSummaries());
        if (evalSummary) {
          log.info(`\n${evalSummary}`);
        }
        clearDatasetSkipSummaries();

        const ruleSummary = formatRuleEvalSummary(getRuleDatasetSummaries());
        if (ruleSummary) {
          log.info(`\n${ruleSummary}`);
        }
        clearRuleDatasetSummaries();
      });
    },
    { scope: 'worker' },
  ],
});
