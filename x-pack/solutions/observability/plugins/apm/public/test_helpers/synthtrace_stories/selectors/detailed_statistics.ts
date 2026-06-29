/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Converts flat synthtrace ApmFields[] into the POST .../services/detailed_statistics response shape. */

import type { ApmFields } from '@kbn/synthtrace-client';
import type { APIReturnType } from '../../../services/rest/create_call_apm_api';

type DetailedStatisticsResponse = APIReturnType<'POST /internal/apm/services/detailed_statistics'>;

export function toDetailedStatisticsResponse(
  docs: ApmFields[],
  bucketMs = 60_000
): DetailedStatisticsResponse {
  const txns = docs.filter((d) => d['processor.event'] === 'transaction');
  const serviceNames = [...new Set(txns.map((t) => t['service.name'] as string))];

  const currentPeriod: DetailedStatisticsResponse['currentPeriod'] = {};

  for (const serviceName of serviceNames) {
    const serviceTxns = txns.filter((t) => t['service.name'] === serviceName);

    const buckets = new Map<number, { durations: number[]; failed: number; total: number }>();
    for (const t of serviceTxns) {
      const ts = t['@timestamp'] as number;
      const bucket = Math.floor(ts / bucketMs) * bucketMs;
      if (!buckets.has(bucket)) buckets.set(bucket, { durations: [], failed: 0, total: 0 });
      const b = buckets.get(bucket)!;
      b.durations.push((t['transaction.duration.us'] as number) ?? 0);
      b.total++;
      if (t['event.outcome'] === 'failure') b.failed++;
    }

    const sortedKeys = [...buckets.keys()].sort((a, b) => a - b);

    currentPeriod[serviceName] = {
      serviceName,
      latency: sortedKeys.map((bucket) => {
        const b = buckets.get(bucket)!;
        return { x: bucket, y: b.durations.reduce((s, d) => s + d, 0) / b.durations.length };
      }),
      throughput: sortedKeys.map((bucket) => ({
        x: bucket,
        y: buckets.get(bucket)!.total,
      })),
      transactionErrorRate: sortedKeys.map((bucket) => {
        const b = buckets.get(bucket)!;
        return { x: bucket, y: b.total > 0 ? b.failed / b.total : null };
      }),
    };
  }

  return { currentPeriod, previousPeriod: {} };
}
