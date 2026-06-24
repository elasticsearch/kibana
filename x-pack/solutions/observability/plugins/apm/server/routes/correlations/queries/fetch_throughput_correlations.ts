/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { chunk } from 'lodash';
import { isNonLocalIndexName } from '@kbn/es-query';
import { termQuery } from '@kbn/observability-plugin/server';
import type {
  CommonCorrelationsQueryParams,
  EntityType,
  FieldValuePair,
  UnifiedCorrelation,
} from '../../../../common/correlations/types';
import {
  THROUGHPUT_BUCKET_COUNT,
  THROUGHPUT_CORRELATION_THRESHOLD,
} from '../../../../common/correlations/constants';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';
import { getCommonCorrelationsQuery } from './get_common_correlations_query';
import { getEventTypeFromEntityType } from '../utils';

export interface ThroughputCorrelationsResponse {
  throughputCorrelations: UnifiedCorrelation[];
  ccsWarning: boolean;
  fallbackResult?: UnifiedCorrelation;
}

interface FilteredRpmEntry {
  fieldName: string;
  fieldValue: string | number;
  filteredRpm: number[];
}

export function computeIntervalString(start: number, end: number): string {
  const rangeMs = end - start;
  const bucketMs = Math.max(60_000, Math.ceil(rangeMs / THROUGHPUT_BUCKET_COUNT / 60_000) * 60_000);
  return `${bucketMs / 1000}s`;
}

export function computePearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
  const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  return denominator === 0 ? 0 : numerator / denominator;
}

async function fetchFilteredRpmTimeseries({
  apmEventClient,
  entityType,
  start,
  end,
  environment,
  kuery,
  query,
  intervalString,
  fieldValuePair,
  overallBucketKeys,
}: CommonCorrelationsQueryParams & {
  apmEventClient: APMEventClient;
  entityType: EntityType;
  intervalString: string;
  fieldValuePair: FieldValuePair;
  overallBucketKeys: number[];
}): Promise<FilteredRpmEntry | undefined> {
  const eventType = getEventTypeFromEntityType(entityType);
  const { fieldName, fieldValue } = fieldValuePair;

  const resp = await apmEventClient.search('get_filtered_throughput_timeseries', {
    apm: { events: [eventType] },
    track_total_hits: false,
    size: 0,
    query: {
      bool: {
        filter: [
          getCommonCorrelationsQuery({ start, end, environment, kuery, query }),
          ...termQuery(fieldName, fieldValue),
        ],
      },
    },
    aggs: {
      timeseries: {
        date_histogram: {
          field: '@timestamp',
          fixed_interval: intervalString,
          min_doc_count: 0,
          extended_bounds: { min: start, max: end },
        },
        aggs: {
          throughput: { rate: { unit: 'minute' as const } },
        },
      },
    },
  });

  const filteredByKey = new Map<number, number>(
    (resp.aggregations?.timeseries.buckets ?? []).map((b) => [
      b.key as number,
      (b.throughput as { value: number }).value ?? 0,
    ])
  );

  // Align to overall bucket keys; treat missing buckets as 0
  const filteredRpm = overallBucketKeys.map((k) => filteredByKey.get(k) ?? 0);

  // Skip pairs with no traffic at all
  if (filteredRpm.every((v) => v === 0)) return undefined;

  return { fieldName, fieldValue, filteredRpm };
}

export const fetchThroughputCorrelations = async ({
  apmEventClient,
  entityType,
  start,
  end,
  environment,
  kuery,
  query,
  fieldValuePairs,
}: CommonCorrelationsQueryParams & {
  apmEventClient: APMEventClient;
  entityType: EntityType;
  fieldValuePairs: FieldValuePair[];
}): Promise<ThroughputCorrelationsResponse> => {
  const intervalString = computeIntervalString(start, end);
  const eventType = getEventTypeFromEntityType(entityType);

  // Fetch overall RPM timeseries once; bail out gracefully if the query fails
  const overallResp = await apmEventClient
    .search('get_overall_throughput_timeseries', {
      apm: { events: [eventType] },
      track_total_hits: false,
      size: 0,
      query: getCommonCorrelationsQuery({ start, end, environment, kuery, query }),
      aggs: {
        timeseries: {
          date_histogram: {
            field: '@timestamp',
            fixed_interval: intervalString,
            min_doc_count: 0,
            extended_bounds: { min: start, max: end },
          },
          aggs: {
            throughput: { rate: { unit: 'minute' as const } },
          },
        },
      },
    })
    .catch(() => null);

  if (!overallResp) {
    return { throughputCorrelations: [], ccsWarning: false };
  }

  const overallBuckets = overallResp.aggregations?.timeseries.buckets ?? [];
  const overallBucketKeys = overallBuckets.map((b) => b.key as number);
  const overallRpm = overallBuckets.map((b) => (b.throughput as { value: number }).value ?? 0);
  const overallMeanRpm = overallRpm.reduce((a, b) => a + b, 0) / (overallRpm.length || 1);

  // Fetch filtered RPM timeseries in chunks to cap simultaneous ES requests
  const CHUNK_SIZE = 10;
  const fulfilled: Array<FilteredRpmEntry | undefined> = [];
  const rejected: unknown[] = [];

  for (const pairChunk of chunk(fieldValuePairs, CHUNK_SIZE)) {
    const settled = await Promise.allSettled(
      pairChunk.map((pair) =>
        fetchFilteredRpmTimeseries({
          apmEventClient,
          entityType,
          start,
          end,
          environment,
          kuery,
          query,
          intervalString,
          fieldValuePair: pair,
          overallBucketKeys,
        })
      )
    );
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        fulfilled.push(result.value);
      } else {
        rejected.push(result.reason);
      }
    }
  }

  const entries = fulfilled.filter((f): f is FilteredRpmEntry => f !== undefined);

  const correlations: UnifiedCorrelation[] = [];
  let fallbackResult: UnifiedCorrelation | undefined;
  let bestFallbackAbs = 0;

  for (const { fieldName, fieldValue, filteredRpm } of entries) {
    const correlation = computePearsonCorrelation(overallRpm, filteredRpm);
    const filteredMeanRpm = filteredRpm.reduce((a, b) => a + b, 0) / (filteredRpm.length || 1);

    const result: UnifiedCorrelation = {
      fieldName,
      fieldValue,
      correlation,
      rpmDelta: filteredMeanRpm - overallMeanRpm,
      rpmBaseline: overallMeanRpm,
    };

    if (Math.abs(correlation) >= THROUGHPUT_CORRELATION_THRESHOLD) {
      correlations.push(result);
    } else if (Math.abs(correlation) > bestFallbackAbs) {
      bestFallbackAbs = Math.abs(correlation);
      fallbackResult = { ...result, isFallbackResult: true };
    }
  }

  correlations.sort((a, b) => Math.abs(b.correlation ?? 0) - Math.abs(a.correlation ?? 0));

  const index = (apmEventClient.indices as Record<string, string | undefined>)[eventType];
  const ccsWarning = rejected.length > 0 && !!index && isNonLocalIndexName(index);

  return {
    throughputCorrelations: correlations,
    ccsWarning,
    ...(correlations.length === 0 && fallbackResult ? { fallbackResult } : {}),
  };
};
