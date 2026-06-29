/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Converts flat synthtrace ApmFields[] into the GET .../throughput response shape. */

import type { ApmFields } from '@kbn/synthtrace-client';
import type { APIReturnType } from '../../../services/rest/create_call_apm_api';

type ThroughputResponse = APIReturnType<'GET /internal/apm/services/{serviceName}/throughput'>;

export function toThroughputChartResponse(
  docs: ApmFields[],
  serviceName: string,
  bucketMs = 60_000
): ThroughputResponse {
  const txns = docs.filter(
    (d) => d['processor.event'] === 'transaction' && d['service.name'] === serviceName
  );

  if (txns.length === 0) {
    return { currentPeriod: [], previousPeriod: [] };
  }

  const buckets = new Map<number, number>();
  for (const t of txns) {
    const ts = t['@timestamp'] as number;
    const bucket = Math.floor(ts / bucketMs) * bucketMs;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }

  const minutesPerBucket = bucketMs / 60_000;
  const sortedKeys = [...buckets.keys()].sort((a, b) => a - b);
  const currentPeriod = sortedKeys.map((bucket) => ({
    x: bucket,
    y: buckets.get(bucket)! / minutesPerBucket,
  }));

  return { currentPeriod, previousPeriod: [] };
}
