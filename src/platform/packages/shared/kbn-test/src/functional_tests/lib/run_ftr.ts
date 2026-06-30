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
    throw createFailError(
      `${failureCount} functional test ${failureCount === 1 ? 'failure' : 'failures'}`
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
