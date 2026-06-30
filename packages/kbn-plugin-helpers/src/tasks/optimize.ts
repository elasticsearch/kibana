/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';
import Fs from 'fs';
import { fork } from 'child_process';

import * as Rx from 'rxjs';
import { REPO_ROOT } from '@kbn/repo-info';
import { OptimizerConfig } from '@kbn/optimizer';
import { Bundle, BundleRemotes } from '@kbn/optimizer/src/common';
import { observeLines } from '@kbn/stdio-dev-helpers';

import type { TaskContext } from '../task_context';

type WorkerMsg = { success: true; warnings: string } | { success: false; error: string };

export async function optimize({
  log,
  dev,
  dist,
  watch,
  plugin,
  sourceDir,
  buildDir,
}: TaskContext) {
  if (!plugin.manifest.ui) {
    return;
  }

  log.info(`running @kbn/optimizer${!!watch ? ' in watch mode (use CTRL+C to quit)' : ''}`);
  await log.indent(2, async () => {
    const optimizerConfig = OptimizerConfig.create({
      repoRoot: REPO_ROOT,
      examples: false,
      testPlugins: false,
      includeCoreBundle: true,
      dist: !!dist,
      watch: !!watch,
    });

    const bundle = new Bundle({
      id: plugin.manifest.id,
      contextDir: sourceDir,
      ignoreMetrics: true,
      outputDir: Path.resolve(dev ? sourceDir : buildDir, 'target/public'),
      sourceRoot: sourceDir,
      type: 'plugin',
      manifestPath: Path.resolve(sourceDir, 'kibana.json'),
      remoteInfo: {
        pkgId: 'not-importable',
        targets: ['public', 'common'],
      },
    });

    const remotes = BundleRemotes.fromBundles([...optimizerConfig.bundles, bundle]);
    const worker = optimizerConfig.getWorkerConfig('cache disabled');

    const proc = fork(require.resolve('./optimize_worker'), {
      cwd: REPO_ROOT,
      execArgv: ['--require=@kbn/babel-register/install'],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    const rel = Path.relative(REPO_ROOT, bundle.outputDir);

    // Observe all events from child process
    const eventObservable = Rx.merge(
      observeLines(proc.stdout!).pipe(Rx.map((line) => ({ type: 'stdout', data: line }))),
      observeLines(proc.stderr!).pipe(Rx.map((line) => ({ type: 'stderr', data: line }))),
      Rx.fromEvent<[WorkerMsg]>(proc, 'message').pipe(
        Rx.map((msg) => ({ type: 'message', data: msg[0] }))
      ),
      Rx.fromEvent<Error>(proc, 'error').pipe(Rx.map((error) => ({ type: 'error', data: error })))
    );

    if (!watch) {
      Rx.fromEvent<[WorkerMsg]>(proc, 'message')
        .pipe(Rx.take(1))
        .subscribe(() => proc.kill('SIGKILL'));
    }

    // Subscribe to eventObservable to log events
    const eventSubscription = eventObservable.subscribe((event) => {
      if (event.type === 'stdout') {
        log.debug(event.data as string);
      } else if (event.type === 'stderr') {
        log.error(event.data as Error);
      } else if (event.type === 'message') {
        const result = event.data as WorkerMsg;
        // Handle message event
        if (!result.success) {
          log.error(`Optimizer failure: ${result.error}`);
        } else if (result.warnings) {
          log.warning(`browser bundle created at ${rel}, but with warnings:\n${result.warnings}`);
        } else {
          log.success(`browser bundle created at ${rel}`);
        }
      } else if (event.type === 'error') {
        log.error(event.data as Error);
      }
    });

    // Send message to child process
    proc.send({
      workerConfig: worker,
      bundles: JSON.stringify([bundle.toSpec()]),
      bundleRemotes: remotes.toSpecJson(),
    });

    // Cleanup fn definition
    const cleanup = () => {
      // Cleanup unnecessary files
      try {
        Fs.unlinkSync(Path.resolve(bundle.outputDir, '.kbn-optimizer-cache'));
      } catch {
        // no-op
      }

      // Unsubscribe from eventObservable
      eventSubscription.unsubscribe();

      log.info('stopping @kbn/optimizer');
    };

    // if watch mode just wait for the first event then cleanup and exit
    if (!watch) {
      // Wait for parent process to exit if not in watch mode
      await new Promise<void>((resolve) => {
        proc.once('exit', () => {
          cleanup();
          resolve();
        });
      });

      return;
    }

    // Wait for parent process to exit if not in watch mode
    await new Promise<void>((resolve) => {
      process.once('exit', () => {
        cleanup();
        resolve();
      });
    });
  });
}
