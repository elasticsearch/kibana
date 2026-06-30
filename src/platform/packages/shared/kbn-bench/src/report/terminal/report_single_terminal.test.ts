/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import chalk from 'chalk';
import { reportSingleTerminal } from './report_single_terminal';
import {
  makeConfigResult,
  makeBenchmark,
  makeBenchmarkWithSystemStats,
  makeStats,
} from '../test_helpers';

describe('reportResults', () => {
  const originalChalkLevel = chalk.level;

  beforeAll(() => {
    chalk.level = 0;
  });

  afterAll(() => {
    chalk.level = originalChalkLevel;
  });

  it('handles empty results', () => {
    const out = reportSingleTerminal([] as any);
    expect(out).toBe('No benchmark results to report');
  });

  it('renders a single run with system stats correctly', () => {
    const sysStatsRun1 = [
      makeStats(100, [
        { time: 1, cpuUs: 10_000, rss: 500, rssMax: 600, heapUsed: 100_000, gcTotal: 0 },
        { time: 2, cpuUs: 20_000, rss: 550, rssMax: 700, heapUsed: 110_000, gcTotal: 2 },
      ]),
    ];

    const results = [
      makeConfigResult('config1', [
        makeBenchmark('benchA', [1234], [{ x: 50, y: 100 }]),
        makeBenchmarkWithSystemStats('benchB', [2345], [sysStatsRun1]),
      ]),
    ];

    const out = reportSingleTerminal(results as any);
    expect(out).toMatchInlineSnapshot(`
      "
      Benchmark config: config1
      benchA (1 run)
                   Avg    Min    Max   Std dev
       Duration   1.2s   1.2s   1.2s      0.0%
       x            50     50     50      0.0%
       y           100    100    100      0.0%


      benchB (1 run)
                                    Avg         Min         Max   Std dev
       Duration                    2.3s        2.3s        2.3s      0.0%
       CPU Usage                    30s         30s         30s      0.0%
       Max RSS                  1.27 KB     1.27 KB     1.27 KB      0.0%
       Tail RSS                 1.03 KB     1.03 KB     1.03 KB      0.0%
       Tail heap used         205.08 KB   205.08 KB   205.08 KB      0.0%
       Tail heap total        410.16 KB   410.16 KB   410.16 KB      0.0%
       Tail external memory         0 B         0 B         0 B      0.0%
       Tail array buffers           0 B         0 B         0 B      0.0%
       GC time                      2ms         2ms         2ms      0.0%

      "
    `);
  });

  it('renders multiple runs with varying system stats correctly', () => {
    const sysRun1 = [
      makeStats(1, [
        { time: 1, cpuUs: 5_000, rss: 510, rssMax: 610, heapUsed: 100_000, gcTotal: 1 },
        { time: 2, cpuUs: 10_000, rss: 520, rssMax: 620, heapUsed: 105_000, gcTotal: 2 },
      ]),
    ];
    const sysRun2 = [
      makeStats(1, [
        { time: 1, cpuUs: 12_000, rss: 550, rssMax: 650, heapUsed: 120_000, gcTotal: 3 },
        { time: 2, cpuUs: 20_000, rss: 560, rssMax: 660, heapUsed: 130_000, gcTotal: 4 },
      ]),
    ];

    const results = [
      makeConfigResult('config1', [
        makeBenchmark('benchA', [1000, 1200, 1400], [{ x: 10 }, { x: 20 }, { x: 30 }]),
        makeBenchmarkWithSystemStats('benchB', [2000, 2200], [sysRun1, sysRun2]),
      ]),
    ];

    const out = reportSingleTerminal(results as any);
    expect(out).toMatchInlineSnapshot(`
      "
      Benchmark config: config1
      benchA (3 runs)
                   Avg   Min    Max   Std dev
       Duration   1.2s    1s   1.4s     13.6%
       x            20    10     30     40.8%


      benchB (2 runs)
                                    Avg         Min         Max   Std dev
       Duration                    2.1s          2s        2.2s      4.8%
       CPU Usage                  23.5s         15s         32s     36.2%
       Max RSS                  1.24 KB     1.20 KB     1.28 KB      3.1%
       Tail RSS                 1.04 KB     1.01 KB     1.08 KB      3.7%
       Tail heap used         222.17 KB   200.20 KB   244.14 KB      9.9%
       Tail heap total        444.34 KB   400.39 KB   488.28 KB      9.9%
       Tail external memory         0 B         0 B         0 B      0.0%
       Tail array buffers           0 B         0 B         0 B      0.0%
       GC time                      5ms         3ms         7ms     40.0%

      "
    `);
  });

  it('handles failed runs', () => {
    const results = [
      {
        ...makeConfigResult('config1', [makeBenchmark('benchA', [1000])]),
        benchmarks: [
          {
            ...makeBenchmark('benchA', [1000]),
            runs: [{ status: 'failed' as const, error: new Error('fail'), stats: [] }],
          },
        ],
      },
    ];

    const out = reportSingleTerminal(results);
    expect(out).toContain('benchA (fail 1/1)');
  });
});
