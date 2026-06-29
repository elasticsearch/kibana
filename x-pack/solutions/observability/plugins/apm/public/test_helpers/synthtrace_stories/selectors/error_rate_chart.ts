/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Converts flat synthtrace ApmFields[] into the GET .../transactions/charts/error_rate response shape. */

import type { ApmFields } from '@kbn/synthtrace-client';
import type { APIReturnType } from '../../../services/rest/create_call_apm_api';

type ErrorRateResponse =
  APIReturnType<'GET /internal/apm/services/{serviceName}/transactions/charts/error_rate'>;

export function toErrorRateChartResponse(
  docs: ApmFields[],
  serviceName: string,
  bucketMs = 60_000
): ErrorRateResponse {
  const txns = docs.filter(
    (d) => d['processor.event'] === 'transaction' && d['service.name'] === serviceName
  );

  if (txns.length === 0) {
    return {
      currentPeriod: { timeseries: [], average: null },
      previousPeriod: { timeseries: [], average: null },
    };
  }

  const buckets = new Map<number, { total: number; failed: number }>();
  for (const t of txns) {
    const ts = t['@timestamp'] as number;
    const bucket = Math.floor(ts / bucketMs) * bucketMs;
    const current = buckets.get(bucket) ?? { total: 0, failed: 0 };
    current.total++;
    if (t['event.outcome'] === 'failure') {
      current.failed++;
    }
    buckets.set(bucket, current);
  }

  const sortedKeys = [...buckets.keys()].sort((a, b) => a - b);
  const timeseries = sortedKeys.map((bucket) => {
    const { total, failed } = buckets.get(bucket)!;
    return { x: bucket, y: total > 0 ? failed / total : null };
  });

  const totals = [...buckets.values()];
  const totalTxns = totals.reduce((sum, b) => sum + b.total, 0);
  const totalFailed = totals.reduce((sum, b) => sum + b.failed, 0);
  const average = totalTxns > 0 ? totalFailed / totalTxns : null;

  return {
    currentPeriod: { timeseries, average },
    previousPeriod: { timeseries: [], average: null },
  };
}
