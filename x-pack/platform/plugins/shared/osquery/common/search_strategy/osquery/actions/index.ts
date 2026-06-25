/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { IEsSearchResponse } from '@kbn/search-types';
import type { IKibanaSearchResponse } from '@kbn/search-types';
import type { Inspect, Maybe } from '../../common';
import type { RequestOptions, RequestOptionsPaginated } from '../..';

export type ActionEdges = estypes.SearchResponse<object>['hits']['hits'];

export type ActionResultEdges = estypes.SearchResponse<object>['hits']['hits'];

export interface ActionsStrategyResponse extends IEsSearchResponse {
  edges: ActionEdges;
  inspect?: Maybe<Inspect>;
}

export interface SingleQueryResultCounts {
  total_rows: number;
  responded_agents: number;
  successful_agents: number;
  error_agents: number;
}

export interface PackResultCounts {
  total_rows: number;
  queries_with_results: number;
  queries_total: number;
  successful_agents: number;
  error_agents: number;
}

export type ResultCounts = SingleQueryResultCounts | PackResultCounts;

export interface ActionDetails {
  action_id: string;
  expiration: string;
  '@timestamp': string;
  agent_all: boolean;
  agent_ids: string[];
  agent_platforoms: string[];
  agent_policy_ids: string[];
  agents: string[];
  user_id?: string;
  user_profile_uid?: string;
  pack_id?: string;
  pack_name?: string;
  space_id?: string;
  pack_prebuilt?: boolean;
  tags?: string[];
  status?: string;
  result_counts?: ResultCounts;
  queries?: Array<{
    action_id: string;
    id: string;
    query: string;
    agents: string[];
    ecs_mapping?: unknown;
    version?: string;
    platform?: string;
    saved_query_id?: string;
    expiration?: string;
  }>;
}

export interface ActionsRequestOptions extends RequestOptionsPaginated {
  spaceId: string;
}

export interface ActionDetailsStrategyResponse extends IEsSearchResponse {
  actionDetails: estypes.SearchHit<ActionDetails>;
  inspect?: Maybe<Inspect>;
}

export interface ActionDetailsRequestOptions extends RequestOptions {
  actionId: string;
  spaceId: string;
}

export interface ActionResultsStrategyResponse
  extends IKibanaSearchResponse<
    estypes.SearchResponse<
      object,
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
  edges: ActionResultEdges;
  inspect?: Maybe<Inspect>;
}

export interface ActionResultsRequestOptions extends RequestOptionsPaginated {
  actionId: string;
  agentIds?: string[];
  startDate?: string;
  useNewDataStream?: boolean;
  integrationNamespaces?: string[];
  spaceId: string;
}
