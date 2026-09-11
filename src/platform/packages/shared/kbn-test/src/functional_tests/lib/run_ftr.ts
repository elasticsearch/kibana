/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import { createFailError } from '@kbn/dev-cli-errors';

import type { EsVersion, Config } from '../../functional_test_runner';
import { FunctionalTestRunner } from '../../functional_test_runner';

/**
 * Exit code of `scripts/functional_tests` when every test ran and the only reason for the
 * nonzero exit is failing tests/hooks, all of which are in the JUnit report. Any other error
 * (config, server start/stop or crash mid-run, runner, reporter) exits with 1, as does a run cut
 * short by `--bail`/`mochaOpts.bail` or an abort, so CI can tell whether the JUnit failures
 * fully explain the exit. Server errors thrown while shutting down supersede this error because
 * they are raised from a `finally` block in `runTests`.
 * Referenced by `.buildkite/scripts/steps/test/ftr_configs.sh`.
 */
export const FTR_TEST_FAILURES_EXIT_CODE = 11;

export async function runFtr(options: {
  log: ToolingLog;
  config: Config;
  esVersion: EsVersion;
  signal?: AbortSignal;
  retry?: number;
}) {
  const ftr = new FunctionalTestRunner(options.log, options.config, options.esVersion);

  const failureCount = await ftr.run(options.signal, options.retry);
  if (failureCount > 0) {
    // Bail stops at the first failure and an abort (ES/Kibana exited early) stops wherever it
    // was, so in both cases the JUnit report is incomplete and does not explain the exit alone.
    // `mochaOpts.bail` is the effective value: the CLI flag is applied onto the config.
    const stoppedEarly = options.signal?.aborted || options.config.get('mochaOpts.bail') === true;
    throw createFailError(
      `${failureCount} functional test ${failureCount === 1 ? 'failure' : 'failures'}`,
      { exitCode: stoppedEarly ? 1 : FTR_TEST_FAILURES_EXIT_CODE }
    );
  }
}

export async function checkForEnabledTestsInFtrConfig(options: {
  log: ToolingLog;
  config: Config;
  esVersion: EsVersion;
}) {
  if (options.config.get('testRunner')) {
    // configs with custom test runners are assumed to always have tests
    return true;
  }

  if (options.config.module.type === 'journey') {
    return !options.config.module.journey.config.isSkipped();
  }

  const ftr = new FunctionalTestRunner(options.log, options.config, options.esVersion);
  const stats = await ftr.getTestStats();
  if (!stats) {
    throw createFailError('unable to get test stats');
  }

  return stats.nonSkippedTestCount > 0;
}
