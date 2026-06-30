/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ToolingLog } from '@kbn/tooling-log';
import type { LoadedBenchConfig } from '../config/types';
import { makeBenchmark, makeConfigResult } from '../report/test_helpers';
import { runOnCompareCallbacks } from './run_on_compare_callbacks';

function makeLoadedConfig(
  name: string,
  options: { onCompare?: LoadedBenchConfig['onCompare'] } = {}
): LoadedBenchConfig {
  return {
    name,
    path: `/tmp/${name}.config.ts`,
    runs: 1,
    tags: [],
    timeout: 30_000,
    monitorInterval: 250,
    profile: false,
    openProfile: false,
    tracing: false,
    grep: undefined,
    benchmarks: [],
    onCompare: options.onCompare,
  };
}

describe('runOnCompareCallbacks', () => {
  const log = new ToolingLog({
    level: 'error',
    writeTo: {
      write: () => {},
    },
  });

  it('invokes onCompare only when both sides have results for a config', async () => {
    const onCompare = jest.fn();

    const leftResults = [
      {
        ...makeConfigResult('with-callback', [makeBenchmark('bench', [1000])]),
        config: makeLoadedConfig('with-callback', { onCompare }),
      },
      {
        ...makeConfigResult('left-only', [makeBenchmark('bench', [900])]),
        config: makeLoadedConfig('left-only', {
          onCompare: jest.fn(),
        }),
      },
    ];

    const rightResults = [
      {
        ...makeConfigResult('with-callback', [makeBenchmark('bench', [1100])]),
        config: makeLoadedConfig('with-callback'),
      },
    ];

    await runOnCompareCallbacks({
      log,
      leftResults,
      rightResults,
    });

    expect(onCompare).toHaveBeenCalledTimes(1);
  });

  it('passes left, right, summaries, comparison diff, and logger context', async () => {
    const onCompare = jest.fn();

    const left = {
      ...makeConfigResult('memory-check', [makeBenchmark('warm-start', [1000], [{ rss: 100 }])]),
      config: makeLoadedConfig('memory-check', { onCompare }),
    };
    const right = {
      ...makeConfigResult('memory-check', [makeBenchmark('warm-start', [1200], [{ rss: 200 }])]),
      config: makeLoadedConfig('memory-check'),
    };

    await runOnCompareCallbacks({
      log,
      leftResults: [left],
      rightResults: [right],
    });

    expect(onCompare).toHaveBeenCalledWith(
      expect.objectContaining({
        log: expect.any(ToolingLog),
        left,
        right,
        leftSummary: expect.objectContaining({
          name: 'memory-check',
          benchmarks: [expect.objectContaining({ name: 'warm-start' })],
        }),
        rightSummary: expect.objectContaining({
          name: 'memory-check',
          benchmarks: [expect.objectContaining({ name: 'warm-start' })],
        }),
        comparison: expect.objectContaining({
          benchmarks: [
            expect.objectContaining({
              name: 'warm-start',
              left: expect.objectContaining({ name: 'warm-start' }),
              right: expect.objectContaining({ name: 'warm-start' }),
              diff: expect.objectContaining({
                metrics: expect.arrayContaining([
                  expect.objectContaining({
                    title: 'Duration',
                    diff: expect.objectContaining({ absolute: 200 }),
                  }),
                ]),
              }),
            }),
          ],
        }),
      })
    );
  });

  it('propagates errors thrown from onCompare', async () => {
    const onCompare = jest.fn(() => {
      throw new Error('memory regression detected');
    });

    await expect(
      runOnCompareCallbacks({
        log,
        leftResults: [
          {
            ...makeConfigResult('memory-check', [makeBenchmark('warm-start', [1000])]),
            config: makeLoadedConfig('memory-check', { onCompare }),
          },
        ],
        rightResults: [
          {
            ...makeConfigResult('memory-check', [makeBenchmark('warm-start', [1200])]),
            config: makeLoadedConfig('memory-check'),
          },
        ],
      })
    ).rejects.toThrow('memory regression detected');
  });

  it('awaits async onCompare callbacks', async () => {
    const onCompare = jest.fn(async () => {
      await Promise.resolve();
      throw new Error('async policy failure');
    });

    await expect(
      runOnCompareCallbacks({
        log,
        leftResults: [
          {
            ...makeConfigResult('memory-check', [makeBenchmark('warm-start', [1000])]),
            config: makeLoadedConfig('memory-check', { onCompare }),
          },
        ],
        rightResults: [
          {
            ...makeConfigResult('memory-check', [makeBenchmark('warm-start', [1200])]),
            config: makeLoadedConfig('memory-check'),
          },
        ],
      })
    ).rejects.toThrow('async policy failure');
  });
});
