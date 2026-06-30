/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import * as Rx from 'rxjs';
import type { Lifecycle } from '../lifecycle';
import type { Mocha, Test } from '../../fake_mocha_types';

export interface RunTestsResult {
  failureCount: number;
  failedTestFiles: string[];
}

/**
 *  Run the tests that have already been loaded into
 *  mocha. aborts tests on 'cleanup' lifecycle runs
 *
 *  @param  {Lifecycle} lifecycle
 *  @param  {ToolingLog} log
 *  @param  {Mocha} mocha
 *  @return {Promise<RunTestsResult>} resolves to the number of test failures and failed test files
 */
export async function runTests(
  lifecycle: Lifecycle,
  mocha: Mocha,
  abortSignal?: AbortSignal
): Promise<RunTestsResult> {
  let runComplete = false;
  const failedTestFiles = new Set<string>();
  const runner = mocha.run(() => {
    runComplete = true;
  });

  runner.on('fail', (test: Test) => {
    if (test.file) {
      failedTestFiles.add(test.file);
    }
  });

  Rx.race(
    lifecycle.cleanup.before$,
    abortSignal ? Rx.fromEvent(abortSignal, 'abort').pipe(Rx.take(1)) : Rx.NEVER
  ).subscribe({
    next() {
      if (!runComplete) {
        runComplete = true;
        runner.uncaught(new Error('Forcing mocha to abort'));
        runner.abort();
      }
    },
  });

  return new Promise((resolve) => {
    const respond = () => {
      if (failedTestFiles.size) {
        // eslint-disable-next-line no-console
        console.log(
          '\nFailed test files:\n' + [...failedTestFiles].map((file) => `- ${file}`).join('\n')
        );
      }

      resolve({
        failureCount: runner.failures,
        failedTestFiles: [...failedTestFiles],
      });
    };

    // if there are no tests, mocha.run() is sync
    // and the 'end' event can't be listened to
    if (runComplete) {
      respond();
    } else {
      runner.on('end', respond);
    }
  });
}
