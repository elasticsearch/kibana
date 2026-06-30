/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Script, ScriptBenchmark } from '../config/types';
import type { BenchmarkRunContext, BenchmarkRunnable } from './types';

function scriptToRunnableMethod<T extends Script | undefined>(
  script: T
): T extends Script ? (context: BenchmarkRunContext) => Promise<void> : undefined;

function scriptToRunnableMethod(script?: Script) {
  if (!script) {
    return script;
  }

  return async (context: BenchmarkRunContext) => {
    const cwd = context.workspace.getDir();
    if (typeof script === 'string') {
      await context.workspace.exec(script, { log: context.log });
      return;
    }

    await context.workspace.exec(script.cmd, script.args ?? [], {
      cwd: script.cwd ?? cwd,
      log: context.log,
    });
  };
}

export function fromScriptBenchmark(benchmark: ScriptBenchmark): BenchmarkRunnable {
  const beforeAll = scriptToRunnableMethod(benchmark.beforeAll);

  return {
    run: scriptToRunnableMethod(benchmark.run),
    beforeAll: async (context: BenchmarkRunContext) => {
      if (benchmark.ensure?.bootstrap) {
        await context.workspace.ensureBootstrap();
      }
      if (benchmark.ensure?.build && !context.buildDir) {
        await context.workspace.ensureBuild();
      }
      await beforeAll?.(context);
    },
    afterAll: scriptToRunnableMethod(benchmark.afterAll),
    before: scriptToRunnableMethod(benchmark.before),
    after: scriptToRunnableMethod(benchmark.after),
  };
}
