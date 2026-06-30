/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { IWorkspace } from '@kbn/workspaces';
import type { Benchmark, LoadedBenchConfig } from '../config/types';
import type { ProcStats } from './monitor/types';
import type { MetricFormat } from '../report/types';

export interface BenchmarkMetric {
  title: string;
  value: number;
  format?: 'size' | 'duration' | 'percentage' | 'number';
}

interface BenchmarkRunResultBase {
  status: string;
  stats: ProcStats[];
}

export interface BenchmarkRunReturn {
  metrics?: Record<string, number | BenchmarkMetric>;
}

export interface BenchmarkRunResultCompleted extends BenchmarkRunResultBase {
  status: 'completed';
  time: number;
  metrics: Record<string, number | { value: number; title: string; format?: MetricFormat }>;
}

export interface BenchmarkRunResultFailed extends BenchmarkRunResultBase {
  status: 'failed';
  error: Error;
}

export type BenchmarkRunResult = BenchmarkRunResultCompleted | BenchmarkRunResultFailed;

export interface BenchmarkResult {
  benchmark: Benchmark;
  runs: BenchmarkRunResult[];
  profile?: string;
}

export interface ConfigResult {
  config: LoadedBenchConfig;
  benchmarks: BenchmarkResult[];
}

export interface BenchmarkRunContext {
  log: ToolingLog;
  workspace: IWorkspace;
  buildDir?: string;
}

export interface BenchmarkRunnable {
  beforeAll?: (ctx: BenchmarkRunContext) => Promise<void>;
  afterAll?: (ctx: BenchmarkRunContext) => Promise<void>;
  before?: (ctx: BenchmarkRunContext) => Promise<void>;
  after?: (ctx: BenchmarkRunContext) => Promise<void>;
  run: (ctx: BenchmarkRunContext) => Promise<void | BenchmarkRunReturn>;
}

export interface BenchRunnableConfig {
  runs: number;
}
