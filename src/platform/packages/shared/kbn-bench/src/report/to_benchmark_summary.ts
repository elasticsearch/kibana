/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { compact, mapValues } from 'lodash';
import type { RunProcStats } from '../runner/monitor/types';
import type { BenchmarkResult, BenchmarkRunResultCompleted } from '../runner/types';
import { aggregateProcStats } from './aggregate_proc_stats';
import { toMetricSummary } from './to_metric_summary';
import type { MetricSummary } from './types';

const getNumberValues = (
  runProcStats: RunProcStats[],
  metricName: keyof RunProcStats
): number[] => {
  return runProcStats
    .map((stat) => stat[metricName])
    .filter((value): value is number => value !== undefined);
};

export interface BenchmarkSummary {
  name: string;
  completed: number;
  failed: number;
  metrics: Record<
    string,
    {
      title: string;
      summary: MetricSummary;
      format?: 'size' | 'duration' | 'percentage' | 'number';
    }
  >;
}

export function toBenchmarkSummary(result: BenchmarkResult): BenchmarkSummary {
  const completed = result.runs.filter(
    (r): r is BenchmarkRunResultCompleted => r.status === 'completed'
  );

  const numFailed = result.runs.length - completed.length;

  const times = completed.map((run) => run.time);

  if (!times.length) {
    return {
      completed: completed.length,
      failed: numFailed,
      metrics: {},
      name: result.benchmark.name,
    };
  }

  const time = toMetricSummary(times)!;

  const metrics = completed.reduce((prev, run) => {
    Object.entries(run.metrics).forEach(([name, metric]) => {
      const { value, title, format } =
        typeof metric === 'number'
          ? { title: name, value: metric, format: 'number' as const }
          : metric;

      if (!prev[name]) {
        prev[name] = { values: [value], title, format };
        return;
      }

      prev[name].values.push(value);
    });

    return prev;
  }, {} as Record<string, { values: number[]; title: string; format?: 'size' | 'duration' | 'percentage' | 'number' }>);

  const runProcStats: RunProcStats[] = [];

  for (const run of completed) {
    if (run.stats) {
      runProcStats.push(aggregateProcStats(run.stats));
    }
  }

  if (runProcStats.length) {
    const cpuValues = compact(runProcStats.map((stat) => stat.cpuUsage));

    if (cpuValues.length) {
      metrics.cpuUsage = {
        values: compact(runProcStats.map((stat) => stat.cpuUsage)),
        title: 'CPU Usage',
        format: 'duration',
      };
    }

    const rssValues = compact(runProcStats.map((stat) => stat.rssMax));

    if (rssValues.length) {
      metrics.maxRssSize = {
        values: compact(runProcStats.map((stat) => stat.rssMax)),
        title: 'Max RSS',
        format: 'size',
      };
    }

    const tailRssValues = compact(runProcStats.map((stat) => stat.tailRss));

    if (tailRssValues.length) {
      metrics.tailRssSize = {
        values: compact(runProcStats.map((stat) => stat.tailRss)),
        title: 'Tail RSS',
        format: 'size',
      };
    }

    const tailHeapUsedValues = getNumberValues(runProcStats, 'tailHeapUsed');

    if (tailHeapUsedValues.length) {
      metrics.tailHeapUsedSize = {
        values: tailHeapUsedValues,
        title: 'Tail heap used',
        format: 'size',
      };
    }

    const tailHeapTotalValues = getNumberValues(runProcStats, 'tailHeapTotal');

    if (tailHeapTotalValues.length) {
      metrics.tailHeapTotalSize = {
        values: tailHeapTotalValues,
        title: 'Tail heap total',
        format: 'size',
      };
    }

    const tailExternalValues = getNumberValues(runProcStats, 'tailExternal');

    if (tailExternalValues.length) {
      metrics.tailExternalMemorySize = {
        values: tailExternalValues,
        title: 'Tail external memory',
        format: 'size',
      };
    }

    const tailArrayBuffersValues = getNumberValues(runProcStats, 'tailArrayBuffers');

    if (tailArrayBuffersValues.length) {
      metrics.tailArrayBuffersSize = {
        values: tailArrayBuffersValues,
        title: 'Tail array buffers',
        format: 'size',
      };
    }

    const gcValues = compact(runProcStats.map((stat) => stat.gcTotal));

    if (gcValues.length) {
      metrics.totalGcTime = {
        values: compact(runProcStats.map((stat) => stat.gcTotal)),
        title: 'GC time',
        format: 'duration',
      };
    }
  }

  return {
    name: result.benchmark.name,
    completed: completed.length,
    failed: numFailed,
    metrics: {
      time: {
        title: 'Duration',
        format: 'duration',
        summary: time,
      },
      ...mapValues(metrics, (value) => {
        return {
          title: value.title,
          summary: toMetricSummary(value.values),
          format: value.format,
        };
      }),
    },
  };
}
