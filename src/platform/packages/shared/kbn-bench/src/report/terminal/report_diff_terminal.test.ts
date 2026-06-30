/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import chalk from 'chalk';
import { reportDiffTerminal } from './report_diff_terminal';
import {
  makeConfigResult,
  makeBenchmark,
  makeStats,
  makeBenchmarkWithSystemStats,
} from '../test_helpers';

describe('reportDiff', () => {
  const originalChalkLevel = chalk.level;

  beforeAll(() => {
    // disable chalk colors for snapshot stability
    chalk.level = 0;
  });

  afterAll(() => {
    chalk.level = originalChalkLevel;
  });

  test('handles added benchmark', () => {
    const right = [
      makeConfigResult('cfg', [makeBenchmark('benchA', [1000, 1100], [{ x: 10 }, { x: 12 }])]),
    ];

    const leftSet = { name: 'left', title: 'left', results: [] };
    const rightSet = { name: 'right', title: 'right', results: right };
    const out = reportDiffTerminal(leftSet, rightSet);

    expect(out).toContain('right');
    expect(out).toContain('benchA');
    expect(out).toContain('Duration');
    expect(out).toContain('x');

    expect(out).toMatchInlineSnapshot(`
      "Benchmark diff: left -> right
      left: left
      right: right
      benchA
      added
                  left        right   Δ   CI
       Duration      -   1.1s ±4.8%   -    —
       x             -     11 ±9.1%   -    —"
    `);
  });

  test('handles removed benchmark', () => {
    const left = [
      makeConfigResult('cfg', [makeBenchmark('benchA', [1000, 900], [{ x: 10 }, { x: 8 }])]),
    ];

    const leftSet = { name: 'left', title: 'left', results: left };
    const rightSet = { name: 'right', title: 'right', results: [] };
    const out = reportDiffTerminal(leftSet, rightSet);

    expect(out).toContain('left');
    expect(out).toContain('benchA');
    expect(out).toContain('Duration');
    expect(out).toContain('x');

    expect(out).toMatchInlineSnapshot(`
      "Benchmark diff: left -> right
      left: left
      right: right
      benchA
      removed
                         left   right   Δ   CI
       Duration   950ms ±5.3%       -   -    —
       x             9 ±11.1%       -   -    —"
    `);
  });

  test('handles changed metrics', () => {
    const left = [
      makeConfigResult('cfg', [
        makeBenchmark(
          'benchA',
          [1000, 900],
          [
            { x: 10, y: 5 },
            { x: 8, y: 6 },
          ]
        ),
        makeBenchmark('benchB', [500], [{ x: 3 }]),
      ]),
    ];
    const right = [
      makeConfigResult('cfg', [
        makeBenchmark(
          'benchA',
          [1200, 1000],
          [
            { x: 11, y: 7 },
            { x: 9, y: 5 },
          ]
        ),
        makeBenchmark('benchC', [700], [{ z: 4 }]),
      ]),
    ];

    // Compare only the primary benchmark (benchA) via the terminal renderer
    const leftSet = { name: 'left', title: 'left', results: left };
    const rightSet = { name: 'right', title: 'right', results: right };
    const out = reportDiffTerminal(leftSet, rightSet);

    expect(out).toContain('benchA');
    expect(out).toContain('Duration');
    expect(out).toContain('x');
    expect(out).toContain('y');

    expect(out).toMatchInlineSnapshot(`
      "Benchmark diff: left -> right
      left: left
      right: right
      benchA
      -
                         left        right                Δ                    CI
       Duration   950ms ±5.3%   1.1s ±9.1%   150ms (+15.8%)   Run 1086 more times
       x             9 ±11.1%    10 ±10.0%       1 (+11.1%)   Run 1937 more times
       y            5.5 ±9.1%     6 ±16.7%      0.5 (+9.1%)   Run 3243 more times


      benchB
      removed
                         left   right   Δ   CI
       Duration   500ms ±0.0%       -   -    —
       x              3 ±0.0%       -   -    —


      benchC
      added
                  left         right   Δ   CI
       Duration      -   700ms ±0.0%   -    —
       z             -       4 ±0.0%   -    —"
    `);
  });

  test('includes aggregated system metrics and shows deltas', () => {
    const leftProcRun1 = [
      makeStats(1, [
        { time: 1, cpuUs: 10_000, rss: 500, rssMax: 600, heapUsed: 100_000, gcTotal: 1 },
        { time: 2, cpuUs: 20_000, rss: 520, rssMax: 620, heapUsed: 110_000, gcTotal: 2 },
      ]),
    ];
    const leftProcRun2 = [
      makeStats(1, [
        { time: 1, cpuUs: 11_000, rss: 510, rssMax: 610, heapUsed: 100_000, gcTotal: 1 },
        { time: 2, cpuUs: 21_000, rss: 530, rssMax: 630, heapUsed: 115_000, gcTotal: 3 },
      ]),
    ];

    const rightProcRun1 = [
      makeStats(1, [
        { time: 1, cpuUs: 15_000, rss: 550, rssMax: 650, heapUsed: 120_000, gcTotal: 2 },
        { time: 2, cpuUs: 25_000, rss: 570, rssMax: 670, heapUsed: 130_000, gcTotal: 4 },
      ]),
    ];
    const rightProcRun2 = [
      makeStats(1, [
        { time: 1, cpuUs: 14_000, rss: 560, rssMax: 660, heapUsed: 125_000, gcTotal: 2 },
        { time: 2, cpuUs: 24_000, rss: 580, rssMax: 680, heapUsed: 135_000, gcTotal: 5 },
      ]),
    ];

    const left = [
      makeConfigResult('cfg', [
        makeBenchmarkWithSystemStats('benchA', [1000, 1000], [leftProcRun1, leftProcRun2]),
      ]),
    ];
    const right = [
      makeConfigResult('cfg', [
        makeBenchmarkWithSystemStats('benchA', [1200, 800], [rightProcRun1, rightProcRun2]),
      ]),
    ];

    const leftSet = { name: 'left', title: 'left', results: left };
    const rightSet = { name: 'right', title: 'right', results: right };
    const out = reportDiffTerminal(leftSet, rightSet);

    expect(out).toContain('benchA');
    expect(out).toContain('Duration');
    expect(out).toContain('CPU Usage');
    expect(out).toContain('Max RSS');
    expect(out).toContain('Tail RSS');
    expect(out).toContain('GC time');

    expect(out).toMatchInlineSnapshot(`
      "Benchmark diff: left -> right
      left: left
      right: right
      benchA
      -
                                         left             right                   Δ                    CI
       Duration                      1s ±0.0%         1s ±20.0%         0ms (+0.0%)   Run 3139 more times
       CPU Usage                    31s ±3.2%         39s ±2.6%         8s (+25.8%)    95%, +16.1%–+36.4%
       Max RSS                  1.20 KB ±0.8%     1.30 KB ±0.8%    100.00 B (+8.1%)     95%, +5.8%–+10.5%
       Tail RSS                 1.01 KB ±1.0%     1.10 KB ±0.9%    100.00 B (+9.7%)     95%, +6.9%–+12.6%
       Tail heap used         207.52 KB ±1.2%   249.02 KB ±2.0%   41.50 KB (+20.0%)    95%, +14.9%–+25.3%
       Tail heap total        415.04 KB ±1.2%   498.05 KB ±2.0%   83.01 KB (+20.0%)    95%, +14.9%–+25.3%
       Tail external memory         0 B ±0.0%         0 B ±0.0%           0 B (n/a)                     -
       Tail array buffers           0 B ±0.0%         0 B ±0.0%           0 B (n/a)                     -
       GC time                     4ms ±14.3%         7ms ±7.7%        3ms (+85.7%)   95%, +38.5%–+156.2%"
    `);
  });
});
