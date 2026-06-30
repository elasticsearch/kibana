/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { keyBy, uniq } from 'lodash';
import { maybe } from '@kbn/utility-types';
import type { ConfigResult } from '../runner/types';
import type { BenchmarkDiff } from './diff/to_comparison';
import { toBenchmarkDiff } from './diff/to_comparison';
import type { BenchmarkSummary } from './to_benchmark_summary';
import { toBenchmarkSummary } from './to_benchmark_summary';

export interface BenchmarkComparison {
  name: string;
  left: BenchmarkSummary | undefined;
  right: BenchmarkSummary | undefined;
  diff: BenchmarkDiff;
}

export interface ConfigComparison {
  benchmarks: BenchmarkComparison[];
}

export function toConfigComparison(left: ConfigResult, right: ConfigResult): ConfigComparison {
  const leftBenchmarkResultsByName = keyBy(
    left.benchmarks,
    (benchmarkResult) => benchmarkResult.benchmark.name
  );

  const rightBenchmarkResultsByName = keyBy(
    right.benchmarks,
    (benchmarkResult) => benchmarkResult.benchmark.name
  );

  const allNames = uniq([
    ...Object.keys(leftBenchmarkResultsByName),
    ...Object.keys(rightBenchmarkResultsByName),
  ]);

  return {
    benchmarks: allNames.map((name) => {
      const leftBenchmarkResult = maybe(leftBenchmarkResultsByName[name]);
      const rightBenchmarkResult = maybe(rightBenchmarkResultsByName[name]);

      const leftSummary = leftBenchmarkResult ? toBenchmarkSummary(leftBenchmarkResult) : undefined;
      const rightSummary = rightBenchmarkResult
        ? toBenchmarkSummary(rightBenchmarkResult)
        : undefined;

      return {
        name,
        left: leftSummary,
        right: rightSummary,
        diff: toBenchmarkDiff({ left: leftSummary, right: rightSummary }),
      };
    }),
  };
}
