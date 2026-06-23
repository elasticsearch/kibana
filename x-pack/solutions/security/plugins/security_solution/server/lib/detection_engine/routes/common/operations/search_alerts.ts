/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AggregationsAggregationContainer,
  Indices,
  MappingRuntimeFields,
  Sort,
} from '@elastic/elasticsearch/lib/api/types';

import type { SecuritySolutionRequestHandlerContext } from '../../../../../types';
import type { QueryAlertsBodyParams } from '../../../../../../common/api/detection_engine/signals';

interface SearchAlertsArgs {
  context: SecuritySolutionRequestHandlerContext;
  index: undefined | Indices;
  params: QueryAlertsBodyParams;
}

/**
 * Runs a search/aggregation against `index` using the provided `params`.
 * Returns the raw `search` response; throws on Elasticsearch errors.
 */
export const searchAlerts = async ({ context, index, params }: SearchAlertsArgs) => {
  const esClient = (await context.core).elasticsearch.client.asCurrentUser;

  const {
    query,
    aggs,
    _source,
    fields,
    track_total_hits: trackTotalHits,
    size,
    runtime_mappings: runtimeMappings,
    sort,
  } = params;

  return esClient.search({
    index,
    query,
    aggs: aggs as Record<string, AggregationsAggregationContainer>,
    _source,
    fields,
    track_total_hits: trackTotalHits,
    size,
    runtime_mappings: runtimeMappings as MappingRuntimeFields,
    sort: sort as Sort,
    ignore_unavailable: true,
  });
};
