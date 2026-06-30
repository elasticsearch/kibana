/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { pickBy } from 'lodash';
import type {
  GlobalBenchConfig,
  InitialBenchConfigWithPath,
  LoadedBenchConfig,
  Benchmark,
} from './types';

function loadConfig(
  globalConfig: GlobalBenchConfig,
  config: InitialBenchConfigWithPath,
  runtimeOverrides: Partial<GlobalBenchConfig>
): LoadedBenchConfig {
  const mergedConfig = {
    runs: 5,
    timeout: 30_000,
    monitorInterval: 250,
    profile: false,
    openProfile: false,
    tracing: false,
    grep: undefined,
    tags: [],
    ...globalConfig,
    ...config,
    ...pickBy(runtimeOverrides, (value) => value !== undefined),
  };
  let grepTerms: string[] | undefined;
  if (mergedConfig.grep && mergedConfig.grep.length) {
    grepTerms = mergedConfig.grep.map((g: string) => g.toLowerCase());
  }
  const benchmarks: Benchmark[] = mergedConfig.benchmarks.map((benchmark) => {
    if (!grepTerms || benchmark.skip === true) return benchmark;
    const haystack = benchmark.name.toLowerCase();
    const match = grepTerms.some((term) => haystack.includes(term));
    return match ? benchmark : { ...benchmark, skip: true };
  });
  return { ...mergedConfig, benchmarks };
}

export function loadConfigs(
  configs: InitialBenchConfigWithPath[],
  globalConfig: GlobalBenchConfig,
  runtimeOverrides: Partial<GlobalBenchConfig>
): LoadedBenchConfig[] {
  return configs.map((config) => {
    return loadConfig(globalConfig, config, runtimeOverrides);
  });
}
