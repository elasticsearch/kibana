/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ToolingLog } from '@kbn/tooling-log';
import type { IWorkspace } from '@kbn/workspaces';
import type { ScriptBenchmark } from '../config/types';
import { fromScriptBenchmark } from './from_script_benchmark';
import type { BenchmarkRunContext } from './types';

describe('fromScriptBenchmark', () => {
  const benchmark: ScriptBenchmark = {
    kind: 'script',
    name: 'build-aware-script',
    ensure: {
      build: true,
    },
    run: {
      cmd: 'node',
      args: ['script.js'],
    },
  };

  const createContext = (buildDir?: string) => {
    const workspace: IWorkspace = {
      ensureCheckout: jest.fn(async () => {}),
      ensureBootstrap: jest.fn(async () => {}),
      ensureBuild: jest.fn(async () => {}),
      getDisplayName: () => 'test-workspace',
      getCommitLine: async () => 'test-commit',
      getDir: () => '/repo',
      exec: jest.fn() as IWorkspace['exec'],
    };

    const context: BenchmarkRunContext = {
      log: new ToolingLog({
        level: 'error',
        writeTo: {
          write: () => {},
        },
      }),
      workspace,
      buildDir,
    };

    return { context, workspace };
  };

  it('ensures a build when no build directory override is present', async () => {
    const runnable = fromScriptBenchmark(benchmark);
    const { context, workspace } = createContext();

    await runnable.beforeAll?.(context);

    expect(workspace.ensureBuild).toHaveBeenCalledTimes(1);
  });

  it('skips build preparation when a build directory override is present', async () => {
    const runnable = fromScriptBenchmark(benchmark);
    const { context, workspace } = createContext('/tmp/kibana-build');

    await runnable.beforeAll?.(context);

    expect(workspace.ensureBuild).not.toHaveBeenCalled();
  });
});
