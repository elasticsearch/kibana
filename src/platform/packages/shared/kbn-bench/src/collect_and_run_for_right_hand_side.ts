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
import type { Benchmark, Script } from './config/types';
import { runConfig } from './run_config';
import type { ConfigResult } from './runner/types';
import type { GlobalRunContext } from './types';

export async function collectAndRunForRightHandSide({
  context,
  configGlob,
  leftResults,
  configFromCwd,
}: {
  context: GlobalRunContext;
  configGlob?: string | string[];
  leftResults: ConfigResult[];
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

  const compareBenchmarksByName = new Map<string, Benchmark>();

  loadedConfigs.forEach((config) => {
    config.benchmarks.forEach((benchmark) => {
      const benchmarkName = `${config.name} ${benchmark.name}`;
      compareBenchmarksByName.set(benchmarkName, benchmark);
    });
  });

  const results: ConfigResult[] = [];
  const errors: Error[] = [];

  for (const { config, benchmarks: benchmarkResults } of leftResults) {
    const startConfig = performance.now();

    const runnableBenchmarks = benchmarkResults.flatMap((benchmarkResult) => {
      const { benchmark } = benchmarkResult;

      const { missing = 'skip', exists = 'rhs' } = benchmark.compare || {
        missing: undefined,
        exists: undefined,
      };

      const name = `${config.name} ${benchmark.name}`;

      const compareBenchmark = compareBenchmarksByName.get(name);

      if (!compareBenchmark && missing === 'skip') {
        log.debug(`Could not find benchmark "${name}" in compare, skipping...`);
        return [];
      }

      const mode = !!compareBenchmark ? exists : 'lhs';

      switch (mode) {
        case 'lhs':
          return benchmark;

        case 'virtual':
          return toVirtual(
            { benchmark, workspaceDir: context.workspace.getDir() },
            { benchmark: compareBenchmark!, workspaceDir: context.workspace.getDir() }
          );

        case 'rhs':
          return compareBenchmark!;
      }
    });

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
      log.error(error);
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

function toVirtual<T extends Benchmark>(
  left: { benchmark: T; workspaceDir: string },
  right: { benchmark: T; workspaceDir: string }
): T {
  if (left.benchmark.kind !== right.benchmark.kind) {
    throw new Error(
      `Cannot virtualize benchmark, kind "${left.benchmark.kind}" in base does not match kind "${right.benchmark.kind}" in compare`
    );
  }

  function replaceWorkspaceDir<S extends Script | undefined>(script?: S): S;
  function replaceWorkspaceDir(script?: Script) {
    if (script === undefined) {
      return script;
    }

    if (typeof script === 'string') {
      return script.replace(left.workspaceDir, right.workspaceDir);
    }

    return {
      ...script,
      cmd: script.cmd.replace(left.workspaceDir, right.workspaceDir),
      cwd: script.cwd?.replace(left.workspaceDir, right.workspaceDir),
    };
  }

  if (left.benchmark.kind === 'module') {
    return {
      ...left.benchmark,
      module: replaceWorkspaceDir(left.benchmark.module),
    };
  }

  return {
    ...left.benchmark,
    before: replaceWorkspaceDir(left.benchmark.before),
    after: replaceWorkspaceDir(left.benchmark.after),
    afterAll: replaceWorkspaceDir(left.benchmark.afterAll),
    beforeAll: replaceWorkspaceDir(left.benchmark.afterAll),
    run: replaceWorkspaceDir(left.benchmark.run),
  };
}
