/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';

import type { PackagePolicy } from '../../../common/types/models';
import type { AgentlessPolicyThroughput } from '../../../common/types/rest_spec/agentless_policy';
import { getAgentlessThroughputIndexPatterns } from '../../../common/services/agentless_throughput_helper';
import { retryTransientEsErrors } from '../epm/elasticsearch/retry';

const PEAK_WINDOW_SECONDS = 10;
const FULL_WINDOW_SECONDS = 24 * 3600;
// Matches the outer date_histogram `fixed_interval: '30m'`; used as the minimum
// averaging span so a policy whose only data lands in the current partial bucket
// is not divided by a near-zero span (which would wildly inflate the rate).
const BUCKET_INTERVAL_SECONDS = 30 * 60;

interface ThroughputBucket {
  key: number;
  doc_count: number;
  peak_per_window?: { value: number | null };
}

export const getPolicyThroughput = async (
  esClient: ElasticsearchClient,
  packagePolicy: PackagePolicy
): Promise<Omit<AgentlessPolicyThroughput, 'policyId'>> => {
  const emptyResult = { averagePerSecond: 0, series: [] };

  // Derive unique index patterns from the package policy's enabled data streams
  const indexPatterns = getAgentlessThroughputIndexPatterns(packagePolicy);

  if (indexPatterns.length === 0) {
    return emptyResult;
  }

  let searchResult;
  try {
    searchResult = await retryTransientEsErrors(() =>
      esClient.search({
        index: indexPatterns.join(','),
        size: 0,
        allow_no_indices: true,
        ignore_unavailable: true,
        query: {
          bool: {
            filter: [
              { range: { 'event.ingested': { gte: 'now-24h', lte: 'now' } } },
              { wildcard: { 'agent.name': { value: `*${packagePolicy.id}*` } } },
            ],
          },
        },
        aggs: {
          throughput: {
            date_histogram: {
              field: 'event.ingested',
              fixed_interval: '30m',
              min_doc_count: 0,
              extended_bounds: { min: 'now-24h', max: 'now' },
            },
            aggs: {
              per_window: {
                date_histogram: {
                  field: 'event.ingested',
                  fixed_interval: '10s',
                  min_doc_count: 1, // omit empty windows to keep inner bucket count low
                },
              },
              peak_per_window: {
                max_bucket: { buckets_path: 'per_window>_count' },
              },
            },
          },
        },
      })
    );
  } catch (err) {
    if (err?.statusCode === 404) {
      return emptyResult;
    }
    throw err;
  }

  const throughputAgg = searchResult.aggregations?.throughput as
    | { buckets: ThroughputBucket[] }
    | undefined;
  const buckets = throughputAgg?.buckets ?? [];

  let totalDocs = 0;
  let firstDataKey: number | undefined;
  const series = buckets.map(({ key, doc_count: docCount, peak_per_window: peak }) => {
    totalDocs += docCount;
    if (docCount > 0 && firstDataKey === undefined) {
      firstDataKey = key;
    }
    // peak docs in any 10s window within this bucket, normalised to events/s
    return { x: key, y: (peak?.value ?? 0) / PEAK_WINDOW_SECONDS };
  });

  // Normalise by the actual observed span (first bucket with data → now) rather
  // than a fixed 24h window — a newly enrolled policy would otherwise report a
  // rate far lower than its actual ingest rate.
  // Floor the span at one bucket interval to avoid inflated rates for a single
  // partial bucket.
  const nowSeconds = Date.now() / 1000;
  const spanSeconds =
    firstDataKey !== undefined
      ? Math.max(nowSeconds - firstDataKey / 1000, BUCKET_INTERVAL_SECONDS)
      : FULL_WINDOW_SECONDS;
  const averagePerSecond = totalDocs / spanSeconds;

  return { averagePerSecond, series };
};
