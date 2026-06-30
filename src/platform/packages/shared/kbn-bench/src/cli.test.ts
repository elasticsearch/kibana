/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

jest.mock('@kbn/dev-cli-runner', () => ({
  run: jest.fn(),
}));

jest.mock('./bench', () => ({
  bench: jest.fn(),
}));

import { run } from '@kbn/dev-cli-runner';
import { ToolingLog } from '@kbn/tooling-log';
import { bench } from './bench';
import { cli } from './cli';

interface TestCliRunContext {
  flags: {
    config: string;
    left?: string;
    right?: string;
    'left-build-dir'?: string;
    'right-build-dir'?: string;
    profile: boolean;
    'open-profile': boolean;
    grep?: string;
    runs: string;
    'monitor-interval'?: string;
    'config-from-cwd': boolean;
    verbose: boolean;
    quiet: boolean;
    silent: boolean;
    debug: boolean;
    help: boolean;
    _: string[];
    unexpected: string[];
  };
  log: ToolingLog;
}

describe('cli', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(bench).mockResolvedValue(undefined);
  });

  it('passes build directory comparison flags to bench without refs', async () => {
    const log = new ToolingLog({
      level: 'error',
      writeTo: {
        write: () => {},
      },
    });
    const withContextSpy = jest.spyOn(log, 'withContext');

    cli();

    const callback: (context: TestCliRunContext) => Promise<void> = jest.mocked(
      jest.requireMock('@kbn/dev-cli-runner').run
    ).mock.calls[0][0];
    await callback({
      flags: {
        config: 'benchmark.config.ts',
        'left-build-dir': '/tmp/base-build',
        'right-build-dir': '/tmp/target-build',
        profile: false,
        'open-profile': false,
        grep: undefined,
        runs: '3',
        'monitor-interval': '250',
        'config-from-cwd': false,
        verbose: false,
        quiet: false,
        silent: false,
        debug: false,
        help: false,
        _: [],
        unexpected: [],
      },
      log,
    });

    expect(withContextSpy).toHaveBeenCalledWith('@kbn/bench');
    expect(bench).toHaveBeenCalledWith({
      log: expect.any(ToolingLog),
      left: undefined,
      right: undefined,
      leftBuildDir: '/tmp/base-build',
      rightBuildDir: '/tmp/target-build',
      config: 'benchmark.config.ts',
      profile: false,
      openProfile: false,
      grep: undefined,
      runs: 3,
      monitorInterval: 250,
      configFromCwd: false,
    });
  });

  it('registers build directory override flags as string options', () => {
    cli();

    const options = jest.mocked(run).mock.calls[0][1];

    expect(options?.flags?.string).toContain('left-build-dir');
    expect(options?.flags?.string).toContain('right-build-dir');
    expect(options?.flags?.string).toContain('monitor-interval');
  });
});
