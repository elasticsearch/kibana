/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { run } from '@kbn/dev-cli-runner';

import { bench } from './bench';

export function cli() {
  return run(
    async ({ flags, log }) => {
      return await bench({
        log: log.withContext('@kbn/bench'),
        left: flags.left,
        right: flags.right,
        leftBuildDir: flags['left-build-dir'],
        rightBuildDir: flags['right-build-dir'],
        config: flags.config,
        profile: Boolean(flags.profile),
        openProfile: Boolean(flags['open-profile']),
        grep: flags.grep,
        runs: flags.runs ? Number(flags.runs) : undefined,
        monitorInterval: flags['monitor-interval'] ? Number(flags['monitor-interval']) : undefined,
        configFromCwd: Boolean(flags['config-from-cwd']),
      });
    },
    {
      flags: {
        string: [
          'config',
          'left',
          'right',
          'left-build-dir',
          'right-build-dir',
          'grep',
          'runs',
          'monitor-interval',
        ],
        boolean: ['profile', 'open-profile', 'config-from-cwd'],
        help: `--config           Location (glob) of benchmark config files
      --left            Git ref for baseline (exclusive with build directory comparison)
      --right           Git ref to compare against (exclusive with build directory comparison)
      --left-build-dir  Build directory for artifact comparison (exclusive with --left/--right)
      --right-build-dir Build directory for artifact comparison (exclusive with --left/--right)
      --profile         Collect a CPU profile for each benchmark suite
      --open-profile    After merging, open each merged profile in speedscope
      --grep            Filter benchmarks by (case-insensitive) substring(s); can repeat
      --runs            Number of runs, overrides # of runs in config
      --monitor-interval Process monitor sample interval in milliseconds
      --config-from-cwd Use process.cwd() for config file path instead of workspace root
      `,
      } as const,
    }
  );
}
