/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { InitialBenchConfig } from '@kbn/bench';
import { compareWarmStartMemory } from './ci_warm_start_memory/compare_warm_start_memory';

const config: InitialBenchConfig = {
  name: 'kibana_ci_warm_start_memory',
  runs: 3,
  monitorInterval: 250,
  profile: false,
  timeout: 10 * 60_000,
  onCompare: compareWarmStartMemory,
  benchmarks: [
    {
      kind: 'module',
      name: 'warm_start',
      module: require.resolve('./benchmarks/warm_start.bench.ts'),
      compare: {
        missing: 'lhs',
      },
    },
  ],
};

// eslint-disable-next-line import/no-default-export
export default config;
