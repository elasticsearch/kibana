/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { table } from 'table';
import { partition } from 'lodash';
import chalk from 'chalk';
import { getTableConfig } from '../get_table_config';
import { formatMetric } from '../format';
import { toBenchmarkSummary } from '../to_benchmark_summary';
import type { ConfigResult } from '../../runner/types';

const trimTableTrailingWhitespace = (output: string): string => output.replace(/[ \t]+$/gm, '');

export function reportSingleTerminal(results: ConfigResult[]): string {
  const header = ['', 'Avg', 'Min', 'Max', 'Std dev'];

  const lines: string[] = [];

  if (!results.length) {
    return 'No benchmark results to report';
  }

  for (const configResult of results) {
    lines.push('');
    lines.push(`${chalk.bold.cyan('Benchmark config:')} ${configResult.config.name}`);

    for (const benchResult of configResult.benchmarks) {
      const summary = toBenchmarkSummary(benchResult);

      const statusPart = summary.failed
        ? chalk.red(` (fail ${summary.failed}/${summary.completed + summary.failed})`)
        : chalk.dim(` (${summary.completed} run${summary.completed === 1 ? '' : 's'})`);
      const title = `${chalk.bold(summary.name)}${statusPart}`;
      lines.push(title);

      const [[duration], otherMetrics] = partition(
        summary.metrics,
        (metric) => metric.title === 'Duration'
      );

      if (!duration) {
        continue;
      }

      const rows = [duration, ...otherMetrics].map((metricResult) => {
        return [
          metricResult.title,
          formatMetric(metricResult.format ?? 'number', metricResult.summary.avg),
          formatMetric(metricResult.format ?? 'number', metricResult.summary.min),
          formatMetric(metricResult.format ?? 'number', metricResult.summary.max),
          formatMetric(
            'percentage',
            metricResult.summary.avg === 0
              ? 0
              : 100 * (metricResult.summary.stdDev / metricResult.summary.avg)
          ),
        ];
      });

      lines.push(
        trimTableTrailingWhitespace(table([header, ...rows], getTableConfig(header.length)))
      );
    }
  }

  return lines.join('\n');
}
