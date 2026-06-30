/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IKibanaSearchResponse } from '@kbn/search-types';
import type { estypes } from '@elastic/elasticsearch';
import type { LogsEndpointActionResponse } from '../../../endpoint/types';
import type { SortOrder, Inspect, Maybe, RequestBasicOptions } from './types';

export type ResultEdges<T = unknown> = estypes.SearchResponse<T>['hits']['hits'];

export interface ActionResponsesRequestOptions extends RequestBasicOptions {
  expiration: string;
  actionId: string;
  sort: {
    order: SortOrder;
    field: string;
  };
  agents: number;
  ccsEnabled?: boolean;
}

export interface ActionResponsesRequestStrategyResponse
  extends ActionResponsesRequestStrategyParseResponse {
  isCompleted: boolean;
  wasSuccessful: boolean;
  isExpired: boolean;
  status: 'successful' | 'failed' | 'pending';
  edges: ResultEdges<LogsEndpointActionResponse>;
}

export interface ActionResponsesRequestStrategyParseResponse
  extends IKibanaSearchResponse<
    estypes.SearchResponse<
      LogsEndpointActionResponse,
      {
        aggs: {
          responses_by_action_id: estypes.AggregationsSingleBucketAggregateBase & {
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
  inspect?: Maybe<Inspect>;
}
