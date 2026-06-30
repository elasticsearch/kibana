/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { last, mean, sumBy } from 'lodash';
import type { ProcStats, ProcStatSample, RunProcStats } from '../runner/monitor/types';

const TAIL_RSS_SAMPLE_COUNT = 8;

export const median = (values: readonly number[]): number => {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
};

/**
 * Aggregate samples for single process
 */
export function aggregateProcStatSamples(samples: ProcStatSample[]): ProcStats {
  // all metrics are cumulative, except for heap usage
  const aggregated = last(samples)!;
  const tailSamples = samples.slice(-TAIL_RSS_SAMPLE_COUNT);
  const getTailMedian = (metricName: keyof ProcStatSample): number => {
    return median(
      tailSamples
        .map((sample) => sample[metricName])
        .filter((value): value is number => value !== undefined)
    );
  };

  aggregated.heapUsage = mean(samples.map((sample) => sample.heapUsage));
  aggregated.tailRss = getTailMedian('rss');
  aggregated.tailHeapUsed = getTailMedian('heapUsed');
  aggregated.tailHeapTotal = getTailMedian('heapTotal');
  aggregated.tailExternal = getTailMedian('external');
  aggregated.tailArrayBuffers = getTailMedian('arrayBuffers');
  return aggregated;
}

/**
 * Aggregate proc stats for run, by summing the stats per process
 */
export function aggregateProcStats(stats: ProcStats[]): RunProcStats {
  return {
    gcIncremental: sumBy(stats, (stat) => stat.gcIncremental),
    gcWeakCb: sumBy(stats, (stat) => stat.gcWeakCb),
    gcMinor: sumBy(stats, (stat) => stat.gcMinor),
    gcMajor: sumBy(stats, (stat) => stat.gcMajor),
    gcTotal: sumBy(stats, (stat) => stat.gcTotal),
    cpuUsage: sumBy(stats, (stat) => stat.cpuUsage),
    rss: sumBy(stats, (stat) => stat.rss),
    rssMax: sumBy(stats, (stat) => stat.rssMax),
    tailRss: sumBy(stats, (stat) => stat.tailRss),
    heapUsed: sumBy(stats, (stat) => stat.heapUsed),
    heapTotal: sumBy(stats, (stat) => stat.heapTotal),
    external: sumBy(stats, (stat) => stat.external),
    arrayBuffers: sumBy(stats, (stat) => stat.arrayBuffers),
    tailHeapUsed: sumBy(stats, (stat) => stat.tailHeapUsed),
    tailHeapTotal: sumBy(stats, (stat) => stat.tailHeapTotal),
    tailExternal: sumBy(stats, (stat) => stat.tailExternal),
    tailArrayBuffers: sumBy(stats, (stat) => stat.tailArrayBuffers),
  };
}
