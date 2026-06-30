/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';

/**
 * Domain capability module for the `analyse_environment` action.
 *
 * Returns a coarse-grained customer profile (active integration data
 * streams + OS family mix + cloud provider mix) so feed recommendations
 * can be tailored. Same logic is invoked by the internal HTTP route and
 * the Agent Builder tool wrapper.
 */

export interface AnalyseEnvironmentParams {
  lookback_days?: number;
  index_patterns?: string[];
}

export interface BucketCount {
  key: string;
  doc_count: number;
}

export interface AnalyseEnvironmentResult {
  status: 'environment_profile_computed' | 'no_environment_activity';
  lookback_days: number;
  counts: {
    total_docs: number;
    active_data_streams: number;
    os_families: number;
    cloud_providers: number;
  };
  active_data_streams: Array<{ dataset: string; doc_count: number }>;
  os_mix: Array<{ family: string; doc_count: number }>;
  cloud_mix: Array<{ provider: string; doc_count: number }>;
  next_step: string;
}

const DEFAULT_INDEX_PATTERNS = [
  'logs-*',
  'metrics-endpoint.*',
  'logs-aws.*',
  'logs-azure.*',
  'logs-gcp.*',
  'logs-network_traffic.*',
  'logs-vulnerability.*',
];

interface EnvAggregations {
  per_data_stream?: { buckets: BucketCount[] };
  per_os_family?: { buckets: BucketCount[] };
  per_cloud_provider?: { buckets: BucketCount[] };
}

export const analyseEnvironment = async (
  esClient: ElasticsearchClient,
  logger: Logger,
  params: AnalyseEnvironmentParams
): Promise<AnalyseEnvironmentResult> => {
  const { lookback_days: lookbackDays = 7, index_patterns: indexPatterns } = params;

  const from = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const indices = indexPatterns?.length ? indexPatterns : DEFAULT_INDEX_PATTERNS;

  const response = await esClient.search({
    index: indices,
    ignore_unavailable: true,
    allow_no_indices: true,
    size: 0,
    track_total_hits: true,
    query: { range: { '@timestamp': { gte: from } } },
    aggs: {
      per_data_stream: {
        terms: { field: 'data_stream.dataset', size: 50, missing: '<unknown>' },
      },
      per_os_family: {
        terms: { field: 'host.os.family', size: 10, missing: '<unknown>' },
      },
      per_cloud_provider: {
        terms: { field: 'cloud.provider', size: 10, missing: '<unknown>' },
      },
    },
  });

  const total =
    typeof response.hits.total === 'number' ? response.hits.total : response.hits.total?.value ?? 0;
  const aggs = response.aggregations as EnvAggregations | undefined;
  const activeDataStreams = (aggs?.per_data_stream?.buckets ?? []).map((b) => ({
    dataset: b.key,
    doc_count: b.doc_count,
  }));
  const osMix = (aggs?.per_os_family?.buckets ?? []).map((b) => ({
    family: b.key,
    doc_count: b.doc_count,
  }));
  const cloudMix = (aggs?.per_cloud_provider?.buckets ?? []).map((b) => ({
    provider: b.key,
    doc_count: b.doc_count,
  }));

  logger.debug(
    `analyse_environment summary: total=${total} dataStreams=${activeDataStreams.length}`
  );

  return {
    status: total === 0 ? 'no_environment_activity' : 'environment_profile_computed',
    lookback_days: lookbackDays,
    counts: {
      total_docs: total,
      active_data_streams: activeDataStreams.length,
      os_families: osMix.length,
      cloud_providers: cloudMix.length,
    },
    active_data_streams: activeDataStreams,
    os_mix: osMix,
    cloud_mix: cloudMix,
    next_step:
      total === 0
        ? 'No matching data in the lookback window. The user may not have any ' +
          'integrations enabled yet — recommend onboarding before suggesting feeds.'
        : 'Cross-reference the active data streams + cloud mix with the ' +
          'threat-intel sources catalog (via `threat_intel.search_reports` tags ' +
          'and the manage-sources flow) to recommend feeds aligned with what the ' +
          'environment actually runs.',
  };
};
