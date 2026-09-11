/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import ChildProcess, { type ForkOptions } from 'child_process';
import { Readable } from 'stream';
import * as Rx from 'rxjs';

import { REPO_ROOT } from '@kbn/repo-info';
import { SomeDevLog } from '@kbn/some-dev-log';
import { observeLines } from '@kbn/stdio-dev-helpers';

// import type { Result } from './kibana_worker';

interface StartTSWorkerArgs extends ForkOptions {
  log: SomeDevLog;
  /** Path to worker source. Best practice to `require.resolve('../relative/paths')` */
  src: string;
}

/**
 * Provide a TS file as the src of a NodeJS Worker with some built-in handling
 * of std streams and debugging.
 */
export function startTSWorker<Message>({
  log,
  src,
  cwd = REPO_ROOT,
  execArgv = [],
  stdio = ['ignore', 'pipe', 'pipe', 'ipc'],
  ...forkOptions
}: StartTSWorkerArgs) {
  const fork = ChildProcess.fork(src, {
    execArgv: ['--require=@kbn/swc-register/install', ...execArgv],
    cwd,
    stdio,
    ...forkOptions,
  });

  const msg$ = Rx.merge(
    // the actual value we are interested in
    Rx.fromEvent(fork, 'message'),

    // worker logs are written to the logger, but dropped from the stream
    routeToLog(fork.stdout!, log, 'debug'),
    routeToLog(fork.stderr!, log, 'error'),

    // if an error occurs running the worker throw it into the stream
    Rx.fromEvent(fork, 'error').pipe(
      Rx.map((err) => {
        throw err;
      })
    )
  ).pipe(
    Rx.takeUntil(Rx.fromEvent(fork, 'exit')),
    Rx.map((mergedResults) => {
      const [message] = mergedResults as [Message];
      log.debug('message received from worker', message);
      return message;
    })
  );

  return { msg$, proc: fork };
}

function routeToLog(readable: Readable, log: SomeDevLog, level: 'debug' | 'error') {
  return observeLines(readable).pipe(
    Rx.tap((line) => {
      log[level](line);
    }),
    Rx.ignoreElements()
  );
}
