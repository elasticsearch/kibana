/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { chunk } from 'lodash';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { Logger } from '@kbn/core/server';
import {
  AGENT_NAME,
  AT_TIMESTAMP,
  CLOUD_ACCOUNT_ID,
  CLOUD_AVAILABILITY_ZONE,
  CLOUD_PROVIDER,
  CLOUD_REGION,
  CONTAINER_ID,
  EVENT_OUTCOME,
  HOST_NAME,
  KUBERNETES_DEPLOYMENT_NAME,
  KUBERNETES_NAMESPACE,
  KUBERNETES_NODE_NAME,
  KUBERNETES_POD_NAME,
  PROCESSOR_EVENT,
  SERVICE_ENVIRONMENT,
  SERVICE_NAME,
  TRANSACTION_DURATION,
  USER_AGENT_NAME,
  THROUGHPUT_BUCKET_COUNT,
  THROUGHPUT_CORRELATION_THRESHOLD,
  THROUGHPUT_TOP_VALUES_PER_FIELD,
} from '@kbn/apm-types';
import type {
  ObservabilityAgentBuilderCoreSetup,
  ObservabilityAgentBuilderPluginSetupDependencies,
} from '../../types';
import { getObservabilityDataSources } from '../../utils/get_observability_data_sources';
import { kqlFilter, timeRangeFilter } from '../../utils/dsl_filters';
import { parseDatemath } from '../../utils/time';

type CorrelationsMetric = 'latency' | 'failure_rate' | 'throughput' | 'infra_metrics';

const DEFAULT_FIELD_CANDIDATES = [
  SERVICE_NAME,
  SERVICE_ENVIRONMENT,
  HOST_NAME,
  CLOUD_REGION,
  KUBERNETES_NAMESPACE,
  KUBERNETES_POD_NAME,
  CONTAINER_ID,
  AGENT_NAME,
  USER_AGENT_NAME,
] as const;

const INFRA_DEFAULT_FIELD_CANDIDATES = [
  HOST_NAME,
  CONTAINER_ID,
  KUBERNETES_POD_NAME,
  KUBERNETES_NAMESPACE,
  KUBERNETES_DEPLOYMENT_NAME,
  KUBERNETES_NODE_NAME,
  CLOUD_AVAILABILITY_ZONE,
  CLOUD_REGION,
  CLOUD_PROVIDER,
  CLOUD_ACCOUNT_ID,
] as const;

// Matches CHUNK_SIZE in apm/server/routes/correlations/queries/fetch_throughput_correlations.ts
const THROUGHPUT_CHUNK_SIZE = 10;

function computeIntervalMs(start: number, end: number): number {
  const rangeMs = end - start;
  return Math.max(60_000, Math.ceil(rangeMs / THROUGHPUT_BUCKET_COUNT / 60_000) * 60_000);
}

function computePearsonCorrelation(x: number[], y: number[]): number {
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

const APM_TIME_FIELD = AT_TIMESTAMP;
const PROCESSOR_EVENT_TRANSACTION = 'transaction';

function getOverallFilters({
  start,
  end,
  kqlFilter: kqlFilterValue,
}: {
  start: number;
  end: number;
  kqlFilter?: string;
}): QueryDslQueryContainer[] {
  return [
    ...timeRangeFilter(APM_TIME_FIELD, { start, end }),
    ...kqlFilter(kqlFilterValue),
    { term: { [PROCESSOR_EVENT]: PROCESSOR_EVENT_TRANSACTION } },
  ];
}

function toBoolFilter(filters: QueryDslQueryContainer[]) {
  return { bool: { filter: filters } };
}

function roundTo(value: number, digits: number) {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

async function getCorrelations({
  esClient,
  indices,
  candidates,
  subsetFilters,
  overallFilters,
  limit,
  subsetTotalHits,
  overallTotalHits,
}: {
  esClient: IScopedClusterClient;
  indices: string[];
  candidates: readonly string[];
  subsetFilters: QueryDslQueryContainer[];
  overallFilters: QueryDslQueryContainer[];
  limit: number;
  subsetTotalHits: number;
  overallTotalHits: number;
}) {
  return candidates.reduce<Promise<Array<{ field: string; values: unknown[] }>>>(
    async (accPromise, field) => {
      const acc = await accPromise;
      const resp = await esClient.asCurrentUser.search({
        index: indices,
        size: 0,
        query: toBoolFilter(subsetFilters),
        aggs: {
          correlated_values: {
            significant_terms: {
              field,
              size: limit,
              background_filter: toBoolFilter(overallFilters),
            },
          },
        },
      });

      const buckets = (resp.aggregations?.correlated_values as any)?.buckets as
        | Array<{ key: string; doc_count: number; bg_count: number; score: number }>
        | undefined;

      if (!buckets || buckets.length === 0) {
        return acc;
      }

      const values = buckets.map((b) => {
        const subsetPct = subsetTotalHits ? b.doc_count / subsetTotalHits : 0;
        const overallPct = overallTotalHits ? b.bg_count / overallTotalHits : 0;

        return {
          value: b.key,
          score: roundTo(b.score, 3),
          subsetDocCount: b.doc_count,
          overallDocCount: b.bg_count,
          subsetPct: roundTo(subsetPct, 4),
          overallPct: roundTo(overallPct, 4),
          upliftPctPoints: roundTo((subsetPct - overallPct) * 100, 2),
        };
      });

      return [...acc, { field, values }];
    },
    Promise.resolve([])
  );
}

export async function getToolHandler({
  core,
  plugins,
  logger,
  esClient,
  start,
  end,
  kqlFilter: kqlFilterValue,
  metric,
  percentileThreshold,
  fieldCandidates,
  limit,
}: {
  core: ObservabilityAgentBuilderCoreSetup;
  plugins: ObservabilityAgentBuilderPluginSetupDependencies;
  logger: Logger;
  esClient: IScopedClusterClient;
  start: string;
  end: string;
  kqlFilter?: string;
  metric: CorrelationsMetric;
  percentileThreshold: number;
  fieldCandidates?: string[];
  limit: number;
}) {
  const dataSources = await getObservabilityDataSources({ core, plugins, logger });
  const indices = dataSources.apmIndexPatterns.transaction.split(',');

  const startTime = parseDatemath(start);
  const endTime = parseDatemath(end, { roundUp: true });

  const overallFilters = getOverallFilters({
    start: startTime,
    end: endTime,
    kqlFilter: kqlFilterValue,
  });

  const overallCountResp = await esClient.asCurrentUser.search({
    index: indices,
    size: 0,
    track_total_hits: true,
    query: toBoolFilter(overallFilters),
  });

  const overallTotalHits =
    typeof overallCountResp.hits.total === 'number'
      ? overallCountResp.hits.total
      : overallCountResp.hits.total?.value ?? 0;

  if (overallTotalHits === 0) {
    const emptyBase = {
      metric,
      timeRange: { start, end },
      kqlFilter: kqlFilterValue,
      totalTransactions: 0,
      correlations: [],
    };
    if (metric === 'throughput') {
      return emptyBase;
    }
    return {
      ...emptyBase,
      subset: {
        totalTransactions: 0,
        definition:
          metric === 'failure_rate'
            ? { metric: 'failure_rate' as const }
            : { metric, percentileThreshold, durationThresholdUs: undefined },
      },
    };
  }

  // --- Throughput: Pearson correlation on RPM timeseries ---
  if (metric === 'throughput') {
    const intervalMs = computeIntervalMs(startTime, endTime);
    const intervalString = `${intervalMs / 1000}s`;

    const overallRpmResp = await esClient.asCurrentUser.search({
      index: indices,
      size: 0,
      query: toBoolFilter(overallFilters),
      aggs: {
        timeseries: {
          date_histogram: {
            field: APM_TIME_FIELD,
            fixed_interval: intervalString,
            min_doc_count: 0,
            extended_bounds: { min: startTime, max: endTime },
          },
          aggs: { rpm: { rate: { unit: 'minute' as const } } },
        },
      },
    });

    const overallBuckets = (overallRpmResp.aggregations?.timeseries as any)?.buckets ?? [];
    const overallBucketKeys: number[] = overallBuckets.map((b: any) => b.key as number);
    const overallRpm: number[] = overallBuckets.map(
      (b: any) => (b.rpm as { value: number }).value ?? 0
    );
    const overallMeanRpm = overallRpm.reduce((a, b) => a + b, 0) / (overallRpm.length || 1);

    if (overallBuckets.length < 3) {
      return {
        metric,
        timeRange: { start, end },
        kqlFilter: kqlFilterValue,
        totalTransactions: overallTotalHits,
        correlations: [],
        warning:
          'Time range too short for throughput correlation — at least 3 time buckets (~3 minutes) are required.',
      };
    }

    const throughputCandidates = (
      fieldCandidates?.length ? fieldCandidates : [...DEFAULT_FIELD_CANDIDATES]
    ).slice(0, 25);

    const correlations: Array<{ field: string; values: unknown[] }> = [];

    for (const field of throughputCandidates) {
      const termsResp = await esClient.asCurrentUser.search({
        index: indices,
        size: 0,
        query: toBoolFilter(overallFilters),
        aggs: { field_values: { terms: { field, size: THROUGHPUT_TOP_VALUES_PER_FIELD } } },
      });

      const termBuckets = ((termsResp.aggregations?.field_values as any)?.buckets ?? []) as Array<{
        key: string | number;
      }>;

      if (termBuckets.length === 0) continue;

      const fieldValues: unknown[] = [];

      for (const bucketChunk of chunk(termBuckets, THROUGHPUT_CHUNK_SIZE)) {
        const settled = await Promise.allSettled(
          bucketChunk.map(async (bucket) => {
            const fieldValue = bucket.key;
            const filteredFilters = [...overallFilters, { term: { [field]: fieldValue } }];

            const filteredResp = await esClient.asCurrentUser.search({
              index: indices,
              size: 0,
              query: toBoolFilter(filteredFilters),
              aggs: {
                timeseries: {
                  date_histogram: {
                    field: APM_TIME_FIELD,
                    fixed_interval: intervalString,
                    min_doc_count: 0,
                    extended_bounds: { min: startTime, max: endTime },
                  },
                  aggs: { rpm: { rate: { unit: 'minute' as const } } },
                },
              },
            });

            const filteredByKey = new Map<number, number>(
              ((filteredResp.aggregations?.timeseries as any)?.buckets ?? []).map((b: any) => [
                b.key as number,
                (b.rpm as { value: number }).value ?? 0,
              ])
            );
            const filteredRpm = overallBucketKeys.map((k) => filteredByKey.get(k) ?? 0);

            if (filteredRpm.every((v) => v === 0)) return;

            // Correlate filtered against the residual (overall minus filtered) to avoid the
            // inclusion bias that results from correlating a subset against its own superset.
            const residualRpm = overallRpm.map((v, i) => Math.max(0, v - filteredRpm[i]));
            const correlation = computePearsonCorrelation(filteredRpm, residualRpm);
            if (Math.abs(correlation) < THROUGHPUT_CORRELATION_THRESHOLD) return;

            const filteredMeanRpm =
              filteredRpm.reduce((a, b) => a + b, 0) / (filteredRpm.length || 1);

            fieldValues.push({
              value: fieldValue,
              correlation: roundTo(correlation, 3),
              rpmDelta: roundTo(filteredMeanRpm - overallMeanRpm, 3),
              rpmBaseline: roundTo(overallMeanRpm, 3),
            });
          })
        );
        const failedCount = settled.filter((r) => r.status === 'rejected').length;
        if (failedCount > 0) {
          logger.warn(
            `[throughput correlations] ${failedCount} timeseries queries failed for field "${field}"`
          );
        }
      }

      if (fieldValues.length > 0) {
        (fieldValues as Array<{ correlation: number }>).sort(
          (a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)
        );
        fieldValues.splice(limit);
        correlations.push({ field, values: fieldValues });
      }
    }

    return {
      metric,
      timeRange: { start, end },
      kqlFilter: kqlFilterValue,
      totalTransactions: overallTotalHits,
      correlations,
    };
  }

  // --- Latency, failure_rate, infra_metrics: significant_terms approach ---
  // Note: infra_metrics here uses significant_terms (KL-divergence scoring), whereas
  // fetchCorrelations in the APM plugin uses a K-S test via fetchSignificantCorrelations.
  // The two produce different scores for the same data; this is intentional — this handler
  // cannot import from the APM plugin (no plugin dependency). Document divergence in tool desc.
  let subsetFilters: QueryDslQueryContainer[] = [];
  let subsetDefinition:
    | {
        metric: 'latency' | 'infra_metrics';
        percentileThreshold: number;
        durationThresholdUs: number;
      }
    | { metric: 'failure_rate' };

  if (metric === 'latency' || metric === 'infra_metrics') {
    const percentileKey = `${percentileThreshold}`;
    const percentileResp = await esClient.asCurrentUser.search({
      index: indices,
      size: 0,
      query: toBoolFilter(overallFilters),
      aggs: {
        duration_percentile: {
          percentiles: {
            field: TRANSACTION_DURATION,
            percents: [percentileThreshold],
            keyed: true,
          },
        },
      },
    });

    const durationPercentiles = (
      percentileResp.aggregations?.duration_percentile as
        | { values?: Record<string, number | null> }
        | undefined
    )?.values;
    const durationThresholdUs = durationPercentiles?.[percentileKey];

    if (durationThresholdUs == null || !Number.isFinite(durationThresholdUs)) {
      throw new Error(
        `Could not compute duration percentile (p${percentileThreshold}) for field "${TRANSACTION_DURATION}".`
      );
    }

    subsetFilters = [
      ...overallFilters,
      { range: { [TRANSACTION_DURATION]: { gte: durationThresholdUs } } },
    ];
    subsetDefinition = { metric, percentileThreshold, durationThresholdUs };
  } else {
    subsetFilters = [...overallFilters, { term: { [EVENT_OUTCOME]: 'failure' } }];
    subsetDefinition = { metric: 'failure_rate' };
  }

  const subsetCountResp = await esClient.asCurrentUser.search({
    index: indices,
    size: 0,
    track_total_hits: true,
    query: toBoolFilter(subsetFilters),
  });

  const subsetTotalHits =
    typeof subsetCountResp.hits.total === 'number'
      ? subsetCountResp.hits.total
      : subsetCountResp.hits.total?.value ?? 0;

  const defaultCandidates =
    metric === 'infra_metrics'
      ? [...INFRA_DEFAULT_FIELD_CANDIDATES]
      : [...DEFAULT_FIELD_CANDIDATES];

  const candidates = (fieldCandidates?.length ? fieldCandidates : defaultCandidates).slice(0, 25);

  const correlations = await getCorrelations({
    esClient,
    indices,
    candidates,
    subsetFilters,
    overallFilters,
    limit,
    subsetTotalHits,
    overallTotalHits,
  });

  return {
    metric,
    timeRange: { start, end },
    kqlFilter: kqlFilterValue,
    totalTransactions: overallTotalHits,
    subset: {
      totalTransactions: subsetTotalHits,
      definition: subsetDefinition,
    },
    correlations,
  };
}
