/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { castArray } from 'lodash';
import { collectConfigPaths } from './config/collect_config_paths';
import { loadConfigs } from './config/load_configs';
import { parseConfigs } from './config/parse_configs';
import { runConfig } from './run_config';
import type { ConfigResult } from './runner/types';
import type { GlobalRunContext } from './types';

export async function collectAndRun({
  context,
  configGlob,
  configFromCwd,
}: {
  context: GlobalRunContext;
  configGlob?: string | string[];
  configFromCwd?: boolean;
}): Promise<ConfigResult[]> {
  const { log, globalConfig, runtimeOverrides, workspace } = context;

  const startAll = performance.now();

  log.debug('Collecting benchmark configs');

  const patterns = castArray(configGlob ?? []);

  const configPaths = await collectConfigPaths({
    patterns,
    cwd: configFromCwd ? process.cwd() : workspace.getDir(),
  });

  log.debug(`Discovered ${configPaths.length} config path(s)`);

  const parsedConfigs = await parseConfigs(configPaths);

  const loadedConfigs = loadConfigs(parsedConfigs, globalConfig, runtimeOverrides);

  // Summarize skips from grep filtering (benchmarks marked skip=true)
  let totalSkipped = 0;
  for (const cfg of loadedConfigs) {
    const skippedInConfig = cfg.benchmarks.filter((b) => b.skip).length;
    if (skippedInConfig) {
      totalSkipped += skippedInConfig;
    }
  }

  if (totalSkipped) {
    log.debug(`Total skipped benchmarks due to grep: ${totalSkipped}`);
  }

  log.info(`Loaded ${loadedConfigs.length} config(s)`);

  const results: ConfigResult[] = [];
  const errors: Error[] = [];

  const configsWithBenchmarks = loadedConfigs.filter((config) =>
    config.benchmarks.some((benchmark) => !benchmark.skip)
  );

  for (const config of configsWithBenchmarks) {
    const startConfig = performance.now();

    const runnableBenchmarks = config.benchmarks.filter((benchmark) => !benchmark.skip);

    log.info(
      `Running config ${config.name} with ${runnableBenchmarks.length}/${config.benchmarks.length} benchmark(s)`
    );

    try {
      results.push(
        await runConfig({
          config: {
            ...config,
            benchmarks: runnableBenchmarks,
          },
          context,
        })
      );
      log.info(
        `Finished config ${config.name} in ${Math.round((performance.now() - startConfig) / 1000)}s`
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      log.error(`Config ${config.name} failed: ${error.message}`);
      log.error(error.stack ?? error.message);
      errors.push(error);
    }
  }

  log.info(
    `All configs completed in ${Math.round(
      (performance.now() - startAll) / 1000
    )}s (total configs=${loadedConfigs.length})`
  );

  if (errors.length === 1) {
    throw errors[0];
  }

  if (errors.length > 1) {
    throw new Error(
      `${errors.length} benchmark configs failed: ${errors
        .map((error) => error.message)
        .join('; ')}`
    );
  }

  return results;
}
