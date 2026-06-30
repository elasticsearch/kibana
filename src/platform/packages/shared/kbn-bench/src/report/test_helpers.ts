/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Benchmark } from '../config/types';
import type { ProcStatSample, ProcStats } from '../runner/monitor/types';
import type { BenchmarkResult, BenchmarkRunResultCompleted, ConfigResult } from '../runner/types';

export function makeCompletedRun(
  time: number,
  metrics: Record<string, number> = {},
  stats: ProcStats[]
): BenchmarkRunResultCompleted {
  return { status: 'completed', time, metrics, stats };
}

export function makeBenchmark(
  name: string,
  times: number[],
  metricsPerRun: Array<Record<string, number>> = [],
  statsPerRun: ProcStats[][] = []
): BenchmarkResult {
  return {
    benchmark: { name } as Benchmark,
    runs: times.map((t, i) => makeCompletedRun(t, metricsPerRun[i] || {}, statsPerRun[i])),
  };
}

// Create a synthetic sequence of ProcStatSample objects simulating a single process's samples
export function makeStats(
  pid: number,
  samples: Array<{
    time: number;
    cpuUs: number;
    rss?: number;
    rssMax: number;
    tailRss?: number;
    heapUsed: number;
    heapTotal?: number;
    external?: number;
    arrayBuffers?: number;
    gcTotal: number;
    gcMajor?: number;
    gcMinor?: number;
    gcIncremental?: number;
    gcWeakCb?: number;
  }>
): ProcStats[] {
  return samples.map((s): ProcStatSample => {
    const heapTotal = s.heapTotal ?? s.heapUsed * 2;
    const external = s.external ?? 0;
    const arrayBuffers = s.arrayBuffers ?? 0;

    return {
      pid,
      argv: ['node', 'bench.js'],
      time: s.time,
      cpuUsage: s.cpuUs, // cumulative microseconds
      rss: s.rss ?? s.rssMax, // bytes
      rssMax: s.rssMax, // bytes
      tailRss: s.tailRss ?? s.rss ?? s.rssMax, // bytes
      heapUsed: s.heapUsed,
      heapTotal,
      external,
      arrayBuffers,
      tailHeapUsed: s.heapUsed,
      tailHeapTotal: heapTotal,
      tailExternal: external,
      tailArrayBuffers: arrayBuffers,
      heapUsage: s.heapUsed / heapTotal,
      gcTotal: s.gcTotal,
      gcMajor: s.gcMajor ?? 0,
      gcMinor: s.gcMinor ?? 0,
      gcIncremental: s.gcIncremental ?? 0,
      gcWeakCb: s.gcWeakCb ?? 0,
    } as ProcStatSample;
  });
}

// Convenience to build a benchmark with synthetic system stats per run.
// Each run can contain multiple processes (array of arrays of samples).
export function makeBenchmarkWithSystemStats(
  name: string,
  times: number[],
  perRunStats: ProcStats[][][] = []
): BenchmarkResult {
  const runsStats: ProcStats[][] = times.map((_, i) => {
    return (perRunStats[i] || []).flat();
  });
  return makeBenchmark(name, times, [], runsStats);
}

export function makeConfigResult(name: string, benches: BenchmarkResult[]): ConfigResult {
  const cfg: Partial<ConfigResult['config']> = {
    name,
    benchmarks: benches.map((bench) => bench.benchmark),
  };

  return {
    config: cfg as ConfigResult['config'],
    benchmarks: benches,
  };
}
