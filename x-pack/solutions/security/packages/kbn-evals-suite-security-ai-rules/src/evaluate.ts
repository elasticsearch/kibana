/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Phoenix executor is omitted intentionally — this suite runs against a local
// Kibana instance, not an external Phoenix/Arize tracing endpoint.
import type { BoundInferenceClient } from '@kbn/inference-common';
import type { ReportDisplayOptions } from '@kbn/evals';
import { evaluate as base, createDefaultTerminalReporter } from '@kbn/evals';
import chalk from 'chalk';
import { SecurityRuleGenerationClient } from './chat_client';
import {
  getDatasetSkipSummaries,
  clearDatasetSkipSummaries,
  type DatasetSkipSummary,
} from './evaluate_dataset';

function formatEvalSummary(summaries: DatasetSkipSummary[]): string {
  if (summaries.length === 0) {
    return '';
  }

  const col = { name: 42, total: 7, ok: 11, missing: 18, errors: 14 };

  const pad = (str: string, width: number) => str.padStart(width);
  const header = [
    'Dataset'.padEnd(col.name),
    pad('Total', col.total),
    pad('Succeeded', col.ok),
    pad('Skipped (no index)', col.missing),
    pad('Agent errors', col.errors),
  ].join('  ');

  const divider = '─'.repeat(header.length);

  const rows = summaries.map((s) => {
    const namePart = s.datasetName.padEnd(col.name);
    const totalPart = pad(String(s.totalExamples), col.total);
    const okPart =
      s.succeeded > 0 ? chalk.green(pad(String(s.succeeded), col.ok)) : pad('0', col.ok);
    const missingPart =
      s.missingIndexSkips > 0
        ? chalk.yellow(pad(String(s.missingIndexSkips), col.missing))
        : pad('0', col.missing);
    const errorPart =
      s.otherFailures > 0
        ? chalk.red(pad(String(s.otherFailures), col.errors))
        : pad('0', col.errors);
    return `${namePart}  ${totalPart}  ${okPart}  ${missingPart}  ${errorPart}`;
  });

  const grandTotal = summaries.reduce((sum, s) => sum + s.totalExamples, 0);
  const grandSucceeded = summaries.reduce((sum, s) => sum + s.succeeded, 0);
  const totalMissing = summaries.reduce((sum, s) => sum + s.missingIndexSkips, 0);
  const totalErrors = summaries.reduce((sum, s) => sum + s.otherFailures, 0);

  const lines = [
    chalk.bold('═══ EVALUATION SUMMARY ═══'),
    '',
    chalk.gray(header),
    chalk.gray(divider),
    ...rows,
  ];

  const pct = grandTotal > 0 ? Math.round((grandSucceeded / grandTotal) * 100) : 0;
  lines.push('', `Rule generation success rate: ${grandSucceeded}/${grandTotal} (${pct}%)`);

  if (totalMissing > 0) {
    lines.push(
      chalk.yellow(
        `⚠ ${totalMissing} example(s) skipped — required index patterns not found in Elasticsearch.`
      )
    );
  }
  if (totalErrors > 0) {
    const allReasons = summaries.flatMap((s) => s.otherFailureReasons);
    const counts = new Map<string, number>();
    for (const reason of allReasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort(([, a], [, b]) => b - a);

    lines.push('', chalk.red(`Agent errors (${totalErrors}):`));
    for (const [reason, count] of sorted) {
      lines.push(chalk.red(`  ${String(count).padStart(2)}x  ${reason}`));
    }
  }

  return lines.join('\n');
}

export const evaluate = base.extend<
  {},
  {
    chatClient: SecurityRuleGenerationClient;
    evaluationInferenceClient: BoundInferenceClient;
  }
>({
  chatClient: [
    async ({ fetch, log, connector }, use) => {
      await use(new SecurityRuleGenerationClient(fetch, log, connector.id));
    },
    {
      scope: 'worker',
    },
  ],
  evaluationInferenceClient: [
    async ({ inferenceClient, evaluationConnector }, use) => {
      await use(inferenceClient.bindTo({ connectorId: evaluationConnector.id }));
    },
    {
      scope: 'worker',
    },
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
        ['Query Syntax Validity', { statsToInclude: ['mean'] }],
        ['Field Coverage', { statsToInclude: ['mean'] }],
        ['Rule Type & Language', { statsToInclude: ['mean'] }],
        ['MITRE Accuracy', { statsToInclude: ['mean', 'median'] }],
        ['Severity Validity', { statsToInclude: ['mean'] }],
        ['Risk Score Validity', { statsToInclude: ['mean'] }],
        ['Interval Format', { statsToInclude: ['mean'] }],
        ['Lookback Gap', { statsToInclude: ['mean'] }],
        ['Severity Match', { statsToInclude: ['mean'] }],
        ['Risk Score Match', { statsToInclude: ['mean', 'median'] }],
        ['ES|QL Functional Equivalence', { statsToInclude: ['mean'] }],
        ['Rejection', { statsToInclude: ['mean'] }],
        ['Tool Trajectory', { statsToInclude: ['mean'] }],
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
              'Query Syntax Validity',
              'Rule Type & Language',
              'Severity Validity',
              'Risk Score Validity',
              'Interval Format',
              'Lookback Gap',
            ],
            combinedColumnName: 'Structural Validity',
          },
          {
            evaluatorNames: ['MITRE Accuracy', 'Severity Match', 'Risk Score Match'],
            combinedColumnName: 'Reference Match',
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
      });
    },
    { scope: 'worker' },
  ],
});
