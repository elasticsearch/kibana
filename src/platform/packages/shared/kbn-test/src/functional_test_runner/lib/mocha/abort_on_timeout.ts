/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import { isMochaTimeoutError } from '../../../mocha';
import type { Lifecycle } from '../lifecycle';
import type { Runner } from '../../fake_mocha_types';

/**
 * On the first Mocha timeout (test or hook), abort the whole config run via
 * `lifecycle.abort()` instead of letting the run limp through remaining tests and the
 * full `afterTestSuite`/after-all teardown cascade (see `wrapRunnableArgs`).
 *
 * Listens on the Mocha `Runner`'s `fail` event rather than the FTR `testFailure` /
 * `testHookFailure` lifecycle events: a Mocha timeout completes the runnable directly
 * via its own timer (`Runnable#resetTimeout`) without ever rejecting the runnable's
 * promise, so those lifecycle events never fire for timeouts.
 *
 * Detection relies on `isMochaTimeoutError` (the error's `code`) rather than its message:
 * ordinary request libraries (e.g. superagent, which underlies supertest) build their own
 * timeout errors with a message like "Timeout of 5000ms exceeded", which would be
 * indistinguishable from a real Mocha timeout if we matched on message text alone.
 *
 * Ordinary (non-timeout) failures are left alone so Smart Retry's failing-test set
 * stays meaningful.
 */
export function registerAbortOnTimeout(runner: Runner, lifecycle: Lifecycle, log: ToolingLog) {
  runner.on('fail', (_runnable: unknown, err: Error & { code?: string }) => {
    if (lifecycle.isAborting || !isMochaTimeoutError(err)) {
      return;
    }

    log.error(`FTR aborting config: Mocha timeout detected -> ${err.message}`);
    lifecycle.abort('mocha-timeout');
  });
}
