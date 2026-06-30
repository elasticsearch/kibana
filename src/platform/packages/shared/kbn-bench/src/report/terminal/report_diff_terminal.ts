/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { table } from 'table';
import { compact, keyBy, partition, uniq } from 'lodash';
import chalk from 'chalk';
import { maybe } from '@kbn/utility-types';
import { toBenchmarkDiff } from '../diff/to_comparison';
import { getTableConfig } from '../get_table_config';
import { formatConfidence, formatDelta, formatMetricSummary } from '../format';
import type { ConfigResult } from '../../runner/types';
import type { BenchmarkSummary } from '../to_benchmark_summary';
import { toBenchmarkSummary } from '../to_benchmark_summary';

interface ResultSet {
  name: string;
  title: string;
  results: ConfigResult[];
}

const trimTableTrailingWhitespace = (output: string): string => output.replace(/[ \t]+$/gm, '');

function getStatus(left?: BenchmarkSummary, right?: BenchmarkSummary) {
  if (!left) return chalk.green('added');
  if (!right) return chalk.red('removed');
  return '-';
}

function getConfigDiff({
  left,
  right,
}: {
  left: { name: string; result?: ConfigResult };
  right: { name: string; result?: ConfigResult };
}): string | null {
  if (!left.result && !right.result) {
    return null;
  }

  const leftBenchmarkResultsByName = keyBy(
    left?.result?.benchmarks,
    (benchmarkResult) => benchmarkResult.benchmark.name
  );

  const rightBenchmarkResultsByName = keyBy(
    right?.result?.benchmarks,
    (benchmarkResult) => benchmarkResult.benchmark.name
  );

  const allNames = uniq([
    ...Object.keys(leftBenchmarkResultsByName),
    ...Object.keys(rightBenchmarkResultsByName),
  ]);

  const allOutput = allNames.map((name) => {
    const innerLines: string[] = [name];

    const leftBenchmarkResult = maybe(leftBenchmarkResultsByName[name]);
    const rightBenchmarkResult = maybe(rightBenchmarkResultsByName[name]);

    const leftSummary = leftBenchmarkResult ? toBenchmarkSummary(leftBenchmarkResult) : undefined;
    const rightSummary = rightBenchmarkResult
      ? toBenchmarkSummary(rightBenchmarkResult)
      : undefined;

    const status = getStatus(leftSummary, rightSummary);

    innerLines.push(status);

    const diff = toBenchmarkDiff({ left: leftSummary, right: rightSummary });

    const [[duration], otherMetrics] = partition(
      diff.metrics,
      (metric) => metric.title === 'Duration'
    );
    const header = ['', left.name, right.name, 'Δ', 'CI'];

    const rows = compact([duration, ...otherMetrics]).map((metricDiff) => {
      return [
        metricDiff.title,
        formatMetricSummary(metricDiff.format, metricDiff.left),
        formatMetricSummary(metricDiff.format, metricDiff.right),
        formatDelta(metricDiff.format, metricDiff.diff),
        formatConfidence(metricDiff.ci),
      ];
    });

    innerLines.push(
      trimTableTrailingWhitespace(table([header, ...rows], getTableConfig(header.length)))
    );

    return innerLines.join('\n');
  });

  return allOutput.join('\n');
}

export function reportDiffTerminal(left: ResultSet, right: ResultSet): string {
  const lines: string[] = [];

  lines.push('');

  lines.push(chalk.bold.cyan(`Benchmark diff: ${left.name} -> ${right.name}`));
  lines.push(chalk.dim(`${left.name}: ${left.title}`));
  lines.push(chalk.dim(`${right.name}: ${right.title}`));

  const leftConfigs = keyBy(left.results, (res) => res.config.name);

  const rightConfigs = keyBy(right.results, (res) => res.config.name);

  const allNames = uniq(Object.keys(leftConfigs).concat(Object.keys(rightConfigs)));

  for (const configName of allNames) {
    const leftCfg = maybe(leftConfigs[configName]);
    const rightCfg = maybe(rightConfigs[configName]);

    const rendered = getConfigDiff({
      left: { result: leftCfg, name: left.name },
      right: { result: rightCfg, name: right.name },
    });

    if (rendered) {
      lines.push(rendered, '');
    }
  }

  return lines.join('\n').trim();
}
