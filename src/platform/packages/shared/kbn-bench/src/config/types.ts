/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { ConfigComparison } from '../report/to_config_comparison';
import type { ConfigSummary } from '../report/to_config_summary';
import type { ConfigResult } from '../runner/types';

export type CompareExists = 'lhs' | 'virtual' | 'rhs';
export type CompareMissing = 'skip' | 'lhs' | 'virtual';

export interface BenchmarkBase {
  kind: string;
  name: string;
  tags?: string[];
  description?: string;
  runs?: number;
  timeout?: number;
  skip?: boolean;
  compare?: {
    exists?: CompareExists;
    missing?: CompareMissing;
  };
}

export interface ModuleBenchmark extends BenchmarkBase {
  kind: 'module';
  module: string;
}

export type Script = string | { cwd?: string; cmd: string; args?: string[] };

export interface ScriptBenchmark extends BenchmarkBase {
  kind: 'script';
  ensure?: {
    bootstrap?: boolean;
    build?: boolean;
  };
  beforeAll?: Script;
  afterAll?: Script;
  before?: Script;
  after?: Script;
  run: Script;
}

export type Benchmark = ModuleBenchmark | ScriptBenchmark;

export interface OnCompareContext {
  log: ToolingLog;
  left: ConfigResult;
  right: ConfigResult;
  leftSummary: ConfigSummary;
  rightSummary: ConfigSummary;
  comparison: ConfigComparison;
}

export type OnCompareCallback = (context: OnCompareContext) => void | Promise<void>;

export interface InitialBenchConfig {
  name: string;
  benchmarks: Benchmark[];
  runs?: number;
  tags?: string[];
  timeout?: number;
  monitorInterval?: number;
  profile?: boolean;
  openProfile?: boolean;
  onCompare?: OnCompareCallback;
}

export interface InitialBenchConfigWithPath extends InitialBenchConfig {
  path: string;
}

export interface LoadedBenchConfig extends InitialBenchConfigWithPath {
  runs: number;
  tags: string[];
  timeout: number;
  monitorInterval: number;
  profile: boolean;
  openProfile: boolean;
  tracing: boolean;
  grep: string[] | undefined;
  benchmarks: Benchmark[];
}

export interface GlobalBenchConfig {
  runs?: number;
  profile?: boolean;
  openProfile?: boolean;
  tracing?: boolean;
  grep?: string[];
  monitorInterval?: number;
}
