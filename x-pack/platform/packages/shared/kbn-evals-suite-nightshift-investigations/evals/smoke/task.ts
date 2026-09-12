/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { AggregationsMaxAggregate } from '@elastic/elasticsearch/lib/api/types';

/** What this eval observes about an eval dataset's seed data once it has been seeded. */
export interface SeedDataSummary {
  indices: readonly string[];
  documentCount: number;
  latestTimestamp: string | null;
}

/**
 * Reports what seeding actually put in the eval cluster.
 *
 * This is the task under test. It exercises nothing but the seeding path on purpose, so a low
 * score points at snapshot loading rather than at a model.
 */
export const summarizeSeedData = async ({
  esClient,
  indices,
}: {
  esClient: Client;
  indices: readonly string[];
}): Promise<SeedDataSummary> => {
  if (indices.length === 0) {
    return { indices, documentCount: 0, latestTimestamp: null };
  }

  const response = await esClient.search<
    { '@timestamp': string },
    { latest_timestamp: AggregationsMaxAggregate }
  >({
    index: indices.join(','),
    size: 0,
    track_total_hits: true,
    query: { match_all: {} },
    aggs: { latest_timestamp: { max: { field: '@timestamp' } } },
  });

  const { total } = response.hits;

  return {
    indices,
    documentCount: typeof total === 'number' ? total : total?.value ?? 0,
    latestTimestamp: response.aggregations?.latest_timestamp.value_as_string ?? null,
  };
};
