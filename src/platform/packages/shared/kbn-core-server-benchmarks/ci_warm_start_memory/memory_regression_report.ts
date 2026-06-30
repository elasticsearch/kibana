/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

export const WARM_START_MEMORY_REPORT_PATH_ENV = 'KIBANA_CI_WARM_START_MEMORY_REPORT_PATH';
export const DEFAULT_WARM_START_MEMORY_REPORT_PATH =
  'target/warm_start_memory_regression_report.json';

export interface WarmStartMemoryRegressionReportContext {
  readonly baselineCommit?: string;
  readonly targetCommit?: string;
  readonly baselineBuildId?: string;
  readonly targetBuildId?: string;
}

export type WarmStartMemoryRegressionMetricName = 'tailRss' | 'maxRss' | 'tailHeapUsed';
export type WarmStartMemoryDiagnosticMetricName =
  | 'tailHeapTotal'
  | 'tailExternal'
  | 'tailArrayBuffers';

export interface WarmStartMemoryRegressionMetricReport {
  readonly baselineBytes: number;
  readonly targetBytes: number;
  readonly baselineSampleBytes: readonly number[];
  readonly targetSampleBytes: readonly number[];
  readonly deltaBytes: number;
  readonly allowedDeltaBytes: number;
  readonly regressed: boolean;
}

export interface WarmStartMemoryDiagnosticMetricReport {
  readonly baselineBytes: number;
  readonly targetBytes: number;
  readonly deltaBytes: number;
}

export interface WarmStartMemoryRegressionReport {
  readonly metrics: {
    readonly tailRss: WarmStartMemoryRegressionMetricReport;
    readonly maxRss: WarmStartMemoryRegressionMetricReport;
    readonly tailHeapUsed?: WarmStartMemoryRegressionMetricReport;
  };
  readonly diagnosticMetrics?: Partial<
    Record<WarmStartMemoryDiagnosticMetricName, WarmStartMemoryDiagnosticMetricReport>
  >;
  readonly triggeredMetrics: WarmStartMemoryRegressionMetricName[];
  readonly context?: WarmStartMemoryRegressionReportContext;
}

export const buildWarmStartMemoryRegressionReport = ({
  metrics,
  triggeredMetrics,
  context,
  diagnosticMetrics,
}: {
  metrics: {
    readonly tailRss: Omit<WarmStartMemoryRegressionMetricReport, 'deltaBytes'>;
    readonly maxRss: Omit<WarmStartMemoryRegressionMetricReport, 'deltaBytes'>;
    readonly tailHeapUsed?: Omit<WarmStartMemoryRegressionMetricReport, 'deltaBytes'>;
  };
  triggeredMetrics: WarmStartMemoryRegressionMetricName[];
  context?: WarmStartMemoryRegressionReportContext;
  diagnosticMetrics?: Partial<
    Record<
      WarmStartMemoryDiagnosticMetricName,
      Omit<WarmStartMemoryDiagnosticMetricReport, 'deltaBytes'>
    >
  >;
}): WarmStartMemoryRegressionReport => {
  const report: WarmStartMemoryRegressionReport = {
    metrics: Object.fromEntries(
      Object.entries(metrics).map(([metricName, metric]) => [
        metricName,
        {
          ...metric,
          deltaBytes: metric.targetBytes - metric.baselineBytes,
        },
      ])
    ) as WarmStartMemoryRegressionReport['metrics'],
    triggeredMetrics,
  };
  const definedDiagnosticMetrics = diagnosticMetrics
    ? (Object.fromEntries(
        Object.entries(diagnosticMetrics)
          .filter(
            (
              entry
            ): entry is [
              WarmStartMemoryDiagnosticMetricName,
              Omit<WarmStartMemoryDiagnosticMetricReport, 'deltaBytes'>
            ] => entry[1] !== undefined
          )
          .map(([metricName, metric]) => [
            metricName,
            {
              ...metric,
              deltaBytes: metric.targetBytes - metric.baselineBytes,
            },
          ])
      ) as WarmStartMemoryRegressionReport['diagnosticMetrics'])
    : undefined;

  const reportWithDiagnosticMetrics =
    definedDiagnosticMetrics && Object.keys(definedDiagnosticMetrics).length > 0
      ? {
          ...report,
          diagnosticMetrics: definedDiagnosticMetrics,
        }
      : report;

  if (context && Object.keys(context).length > 0) {
    return {
      ...reportWithDiagnosticMetrics,
      context,
    };
  }

  return reportWithDiagnosticMetrics;
};

export const getWarmStartMemoryRegressionReportPath = (): string => {
  return process.env[WARM_START_MEMORY_REPORT_PATH_ENV] ?? DEFAULT_WARM_START_MEMORY_REPORT_PATH;
};

export const getWarmStartMemoryRegressionReportContextFromEnv = ():
  | WarmStartMemoryRegressionReportContext
  | undefined => {
  const context: WarmStartMemoryRegressionReportContext = {
    baselineCommit:
      process.env.KIBANA_CI_WARM_START_MEMORY_BASELINE_COMMIT ?? process.env.GITHUB_PR_MERGE_BASE,
    targetCommit:
      process.env.KIBANA_CI_WARM_START_MEMORY_TARGET_COMMIT ?? process.env.BUILDKITE_COMMIT,
    baselineBuildId: process.env.KIBANA_CI_WARM_START_MEMORY_BASELINE_BUILD_ID,
    targetBuildId:
      process.env.KIBANA_CI_WARM_START_MEMORY_TARGET_BUILD_ID ?? process.env.BUILDKITE_BUILD_ID,
  };

  const definedContext = Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined && value !== '')
  ) as WarmStartMemoryRegressionReportContext;

  return Object.keys(definedContext).length > 0 ? definedContext : undefined;
};

export const writeWarmStartMemoryRegressionReport = async (
  report: WarmStartMemoryRegressionReport,
  reportPath: string = getWarmStartMemoryRegressionReportPath()
): Promise<string> => {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return reportPath;
};
