/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ANNOTATION_CONTEXT } from './constants';
import { formatBytes } from './format_bytes';
import type { WarmStartMemoryRegressionReport } from './regression_report';
import type { UnavailableBaselineBuild } from './resolve_baseline_build';

export type AnnotateFn = (
  context: string,
  style: 'info' | 'success' | 'warning' | 'error',
  body: string
) => void;

export const buildBaselineUnavailableAnnotation = (
  unavailable: UnavailableBaselineBuild
): string => {
  const attemptSummary = unavailable.attempts
    .map(
      (attempt) =>
        `- attempt ${attempt.attempt} @ \`${attempt.commitSha.slice(0, 12)}\`: ${attempt.outcome}${
          attempt.buildUrl ? ` ([build](${attempt.buildUrl}))` : ''
        }`
    )
    .join('\n');

  return [
    '### Warm-start memory bench skipped',
    '',
    'No reusable baseline `kibana-on-merge` build with `kibana-default.tar.zst` was found within the merge-base ancestor window.',
    '',
    `Merge base: \`${unavailable.mergeBaseCommitSha}\``,
    `Attempts: ${unavailable.attemptCount}/${unavailable.maxAttempts}`,
    '',
    attemptSummary,
  ].join('\n');
};

export const buildExecutionFailureAnnotation = (message: string): string => {
  return ['### Warm-start memory bench failed', '', message].join('\n');
};

const formatMetricSection = (
  metricLabel: string,
  metric: WarmStartMemoryRegressionReport['metrics']['tailRss']
): string => {
  return [
    `**${metricLabel}**`,
    `- baseline: ${formatBytes(metric.baselineBytes)}`,
    `- target: ${formatBytes(metric.targetBytes)}`,
    `- delta: ${formatBytes(metric.deltaBytes)} (allowed: ${formatBytes(
      metric.allowedDeltaBytes
    )})`,
    `- regressed: ${metric.regressed ? 'yes' : 'no'}`,
  ].join('\n');
};

const DIAGNOSTIC_METRIC_LABELS = {
  tailHeapTotal: 'Tail heap total',
  tailExternal: 'Tail external memory',
  tailArrayBuffers: 'Tail array buffers',
} as const;

type DiagnosticMetricName = keyof typeof DIAGNOSTIC_METRIC_LABELS;
type DiagnosticMetricReport = NonNullable<
  NonNullable<WarmStartMemoryRegressionReport['diagnosticMetrics']>[DiagnosticMetricName]
>;

const formatDiagnosticMetricSection = (
  metricName: DiagnosticMetricName,
  metric: DiagnosticMetricReport
): string => {
  return [
    `**${DIAGNOSTIC_METRIC_LABELS[metricName]}**`,
    `- baseline: ${formatBytes(metric.baselineBytes)}`,
    `- target: ${formatBytes(metric.targetBytes)}`,
    `- delta: ${formatBytes(metric.deltaBytes)}`,
  ].join('\n');
};

export const buildRegressionAnnotation = (report: WarmStartMemoryRegressionReport): string => {
  const contextLines = report.context
    ? [
        '',
        '**Context**',
        ...(report.context.baselineCommit
          ? [`- baseline commit: \`${report.context.baselineCommit}\``]
          : []),
        ...(report.context.targetCommit
          ? [`- target commit: \`${report.context.targetCommit}\``]
          : []),
        ...(report.context.baselineBuildId
          ? [`- baseline build: \`${report.context.baselineBuildId}\``]
          : []),
        ...(report.context.targetBuildId
          ? [`- target build: \`${report.context.targetBuildId}\``]
          : []),
      ]
    : [];

  const diagnosticMetricLines = report.diagnosticMetrics
    ? (
        Object.entries(report.diagnosticMetrics) as Array<
          [DiagnosticMetricName, DiagnosticMetricReport | undefined]
        >
      )
        .filter((entry): entry is [DiagnosticMetricName, DiagnosticMetricReport] => {
          return entry[1] !== undefined;
        })
        .flatMap(([metricName, metric]) => ['', formatDiagnosticMetricSection(metricName, metric)])
    : [];
  const tailHeapUsedMetricLines = report.metrics.tailHeapUsed
    ? ['', formatMetricSection('Tail heap used', report.metrics.tailHeapUsed)]
    : [];

  return [
    '### Warm-start memory regression detected',
    '',
    `Triggered metrics: ${report.triggeredMetrics.join(', ')}`,
    '',
    formatMetricSection('Tail RSS', report.metrics.tailRss),
    '',
    formatMetricSection('Max RSS', report.metrics.maxRss),
    ...tailHeapUsedMetricLines,
    ...(diagnosticMetricLines.length
      ? ['', '**Diagnostic memory context**', ...diagnosticMetricLines]
      : []),
    ...contextLines,
  ].join('\n');
};

export const annotateBaselineUnavailable = (
  unavailable: UnavailableBaselineBuild,
  annotate: AnnotateFn
): void => {
  annotate(ANNOTATION_CONTEXT, 'warning', buildBaselineUnavailableAnnotation(unavailable));
};

export const annotateExecutionFailure = (message: string, annotate: AnnotateFn): void => {
  annotate(ANNOTATION_CONTEXT, 'error', buildExecutionFailureAnnotation(message));
};

export const annotateRegression = (
  report: WarmStartMemoryRegressionReport,
  annotate: AnnotateFn
): void => {
  annotate(ANNOTATION_CONTEXT, 'error', buildRegressionAnnotation(report));
};
