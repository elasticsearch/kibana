/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Converts flat synthtrace ApmFields[] into the GET .../transactions/charts/latency response shape. */

import type { ApmFields } from '@kbn/synthtrace-client';
import type { APIReturnType } from '../../../services/rest/create_call_apm_api';

type LatencyChartResponse =
  APIReturnType<'GET /internal/apm/services/{serviceName}/transactions/charts/latency'>;

export function toLatencyChartResponse(
  docs: ApmFields[],
  serviceName: string,
  bucketMs = 60_000
): LatencyChartResponse {
  // Filter to transactions for this service
  const txns = docs.filter(
    (d) => d['processor.event'] === 'transaction' && d['service.name'] === serviceName
  );

  if (txns.length === 0) {
    return {
      currentPeriod: { latencyTimeseries: [], overallAvgDuration: null },
      previousPeriod: { latencyTimeseries: [], overallAvgDuration: null },
    };
  }

  // Group by bucket
  const buckets = new Map<number, number[]>();
  for (const t of txns) {
    const ts = t['@timestamp'] as number;
    const bucket = Math.floor(ts / bucketMs) * bucketMs;
    const durationUs = t['transaction.duration.us'] as number;
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket)!.push(durationUs);
  }

  const sortedKeys = [...buckets.keys()].sort((a, b) => a - b);
  const latencyTimeseries = sortedKeys.map((bucket) => {
    const durations = buckets.get(bucket)!;
    const avgUs = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    return { x: bucket, y: avgUs };
  });

  const allDurations = txns.map((t) => t['transaction.duration.us'] as number);
  const overallAvgDuration = allDurations.reduce((sum, d) => sum + d, 0) / allDurations.length;

  return {
    currentPeriod: {
      latencyTimeseries,
      overallAvgDuration,
    },
    previousPeriod: { latencyTimeseries: [], overallAvgDuration: null },
  };
}
