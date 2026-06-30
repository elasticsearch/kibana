/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { Benchmark, LoadedBenchConfig } from '../config/types';
import { getFileBaseDir } from '../filesystem/get_file_base_dir';
import type { GlobalRunContext } from '../types';
import { clearExistingProfiles } from './profile/clear_existing_profiles';
import { collectAndMergeCpuProfiles } from './profile/collect_and_merge_profiles';
import type {
  BenchmarkResult,
  BenchmarkRunContext,
  BenchmarkRunResult,
  BenchmarkRunReturn,
  BenchmarkRunnable,
} from './types';
import { wrapInProfiler } from './profile/wrap_in_profiler';
import { startMonitoring } from './monitor/start_monitoring';

function createCallbackWrapper(
  context: BenchmarkRunContext,
  timeout: number
): <T extends ((ctx: BenchmarkRunContext) => Promise<any>) | undefined>(
  name: string,
  cb?: T
) => Promise<T extends Function ? Awaited<ReturnType<T>> : void> {
  return (name, cb) => {
    if (!cb) {
      return Promise.resolve();
    }

    context.log.debug(`Starting ${name}`);

    return Promise.race([
      Promise.resolve(cb(context))
        .then((val) => {
          context.log.debug(`Completed ${name}`);
          return val;
        })
        .catch((error) => {
          context.log.warning(`${name} failed with ${error}`);
          throw error;
        }),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(`Timeout ${name}: timeout of ${timeout}ms reached before promise resolved`)
          );
        }, timeout).unref();
      }),
    ]);
  };
}

async function runAll({
  config,
  benchmark,
  hooks,
  log,
  dir,
  monitorInterval,
}: {
  config: LoadedBenchConfig;
  benchmark: Benchmark;
  hooks: {
    before?: () => Promise<void>;
    run: () => Promise<BenchmarkRunReturn | void>;
    after?: () => Promise<void>;
  };
  log: ToolingLog;
  dir: string;
  monitorInterval: number;
}) {
  const results: BenchmarkRunResult[] = [];

  // don't collect system metrics for high volume of runs, too much overhead
  const shouldMonitor = benchmark.kind !== 'module' || config.runs <= 100;

  const run = async () => {
    const stopMonitoring = shouldMonitor
      ? await startMonitoring({ log, dir, procStatsRefreshInterval: monitorInterval })
      : async (...args: any[]) => [];

    await hooks.before?.();

    try {
      const start = performance.now();
      const result = await hooks?.run();

      const metrics = result && result.metrics ? result.metrics : {};

      results.push({
        metrics,
        status: 'completed',
        time: performance.now() - start,
        stats: await stopMonitoring(),
      });
    } catch (error: any) {
      results.push({
        error,
        status: 'failed',
        stats: await stopMonitoring(),
      });
    } finally {
      await hooks.after?.();
    }
  };

  for (let i = 0; i < config.runs; i++) {
    await run();
  }

  return results;
}

export async function runBenchmark({
  context,
  config,
  benchmark,
  runnable,
}: {
  context: GlobalRunContext;
  config: LoadedBenchConfig;
  benchmark: Benchmark;
  runnable: BenchmarkRunnable;
}): Promise<BenchmarkResult> {
  const { log: parentLog, workspace } = context;

  parentLog.info(
    `Start benchmark name=${benchmark.name} kind=${benchmark.kind} runs=${config.runs}`
  );

  const benchmarkContext: BenchmarkRunContext = {
    log: context.log,
    workspace,
    buildDir: context.buildDir,
  };

  const wrapInTimeout = createCallbackWrapper(benchmarkContext, config.timeout);

  const testResultsBaseDir = getFileBaseDir({
    dataDir: context.dataDir,
    configName: config.name,
    benchmarkName: benchmark.name,
    workspaceName: workspace.getDisplayName(),
  });

  const results: BenchmarkRunResult[] = [];

  const profilesDir = testResultsBaseDir;

  await clearExistingProfiles(context.log, profilesDir);

  try {
    await wrapInTimeout(`${benchmark.name}:beforeAll()`, runnable.beforeAll);

    const runCb = () =>
      runAll({
        config,
        benchmark,
        hooks: {
          before: () => wrapInTimeout(`${benchmark.name}:before()`, runnable.before),
          run: () => wrapInTimeout(`${benchmark.name}:run()`, runnable.run),
          after: () => wrapInTimeout(`${benchmark.name}:after()`, runnable.after),
        },
        log: context.log,
        dir: testResultsBaseDir,
        monitorInterval: config.monitorInterval,
      });

    const resultsFromRun = config.profile
      ? await wrapInProfiler(profilesDir, runCb)
      : await runCb();

    results.push(...resultsFromRun);
  } finally {
    await wrapInTimeout(`${benchmark.name}:afterAll()`, runnable.afterAll);
  }

  let profile;

  if (config.profile) {
    profile = await collectAndMergeCpuProfiles({
      profilesDir,
      name: benchmark.name,
      log: context.log,
    });
  }

  return {
    benchmark,
    runs: results,
    profile,
  };
}
