/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { IKibanaSearchResponse } from '@kbn/search-types';
import type { Inspect, Maybe } from '../../common';
import type { RequestOptionsPaginated } from '../..';

export type ScheduledActionResultEdges = estypes.SearchResponse<object>['hits']['hits'];

export interface ScheduledActionResultsStrategyResponse
  extends IKibanaSearchResponse<
    estypes.SearchResponse<
      object,
      {
        aggs: {
          responses_by_schedule: estypes.AggregationsSingleBucketAggregateBase & {
            rows_count: estypes.AggregationsSumAggregate;
            responses: {
              buckets: Array<{
                key: string;
                doc_count: number;
              }>;
            };
          };
        };
      }
    >
  > {
  edges: ScheduledActionResultEdges;
  inspect?: Maybe<Inspect>;
}

export interface ScheduledActionResultsRequestOptions extends RequestOptionsPaginated {
  scheduleId: string;
  executionCount: number;
  spaceId: string;
  startDate?: string;
  integrationNamespaces?: string[];
}
