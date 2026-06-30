/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { aggregateProcStats, aggregateProcStatSamples } from './aggregate_proc_stats';
import type { ProcStatSample } from '../runner/monitor/types';

const makeSample = ({
  pid,
  time,
  rss,
}: {
  pid: number;
  time: number;
  rss: number;
}): ProcStatSample => {
  return {
    pid,
    argv: ['node', 'benchmark.js'],
    time,
    cpuUsage: time,
    rss,
    rssMax: rss + 100,
    tailRss: 0,
    heapUsed: rss + 200,
    heapTotal: rss + 300,
    external: rss + 400,
    arrayBuffers: rss + 500,
    tailHeapUsed: 0,
    tailHeapTotal: 0,
    tailExternal: 0,
    tailArrayBuffers: 0,
    heapUsage: 0.5,
    gcTotal: 0,
    gcMajor: 0,
    gcMinor: 0,
    gcIncremental: 0,
    gcWeakCb: 0,
  };
};

describe('aggregateProcStatSamples', () => {
  it('uses the median of the last 8 current RSS samples as tail RSS', () => {
    const samples = Array.from({ length: 10 }, (_, index) =>
      makeSample({
        pid: 100,
        time: index + 1,
        rss: (index + 1) * 100,
      })
    );

    expect(aggregateProcStatSamples(samples).tailRss).toBe(650);
  });

  it('uses the median of the last 8 heap and external samples as tail context', () => {
    const samples = Array.from({ length: 10 }, (_, index) =>
      makeSample({
        pid: 100,
        time: index + 1,
        rss: (index + 1) * 100,
      })
    );

    expect(aggregateProcStatSamples(samples)).toEqual(
      expect.objectContaining({
        tailHeapUsed: 850,
        tailHeapTotal: 950,
        tailExternal: 1050,
        tailArrayBuffers: 1150,
      })
    );
  });
});

describe('aggregateProcStats', () => {
  it('sums tail memory metrics across monitored processes', () => {
    const firstProcess = aggregateProcStatSamples([
      makeSample({ pid: 100, time: 1, rss: 100 }),
      makeSample({ pid: 100, time: 2, rss: 200 }),
    ]);
    const secondProcess = aggregateProcStatSamples([
      makeSample({ pid: 200, time: 1, rss: 300 }),
      makeSample({ pid: 200, time: 2, rss: 400 }),
    ]);

    expect(aggregateProcStats([firstProcess, secondProcess])).toEqual(
      expect.objectContaining({
        tailRss: 500,
        tailHeapUsed: 900,
        tailHeapTotal: 1100,
        tailExternal: 1300,
        tailArrayBuffers: 1500,
      })
    );
  });
});
