/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import { AGENT_ACTIONS_RESULTS_INDEX } from '@kbn/fleet-plugin/common';
import type { estypes } from '@elastic/elasticsearch';
import type {
  EndpointActionResponse,
  LogsEndpointActionResponse,
  EndpointActionResponseDataOutput,
} from '../../../../../common/endpoint/types';
import { ACTIONS_SEARCH_PAGE_SIZE } from '../constants';
import { catchAndWrapError } from '../../../utils';
import { ENDPOINT_ACTION_RESPONSES_INDEX_PATTERN } from '../../../../../common/endpoint/constants';
import { prefixIndexPatternsWithCcs } from '../../../utils/ccs_utils';

/** @internal */
const buildSearchQuery = (
  actionIds: string[] = [],
  agentIds: string[] = []
): estypes.QueryDslQueryContainer => {
  const filter: estypes.QueryDslQueryContainer[] = [];
  const query: estypes.QueryDslQueryContainer = { bool: { filter } };

  if (agentIds?.length) {
    filter.push({ terms: { agent_id: agentIds } });
  }
  if (actionIds?.length) {
    filter.push({ terms: { action_id: actionIds } });
  }

  return query;
};

interface FetchActionResponsesOptions {
  esClient: ElasticsearchClient;
  /** List of specific action ids to filter for */
  actionIds?: string[];
  /** List of specific agent ids to filter for */
  agentIds?: string[];
  ccsEnabled?: boolean;
}

export interface FetchActionResponsesResult<
  TOutputContent extends EndpointActionResponseDataOutput = EndpointActionResponseDataOutput,
  TResponseMeta extends {} = {}
> {
  /** Response (aka: the `ack`) sent to the fleet index */
  fleetResponses: EndpointActionResponse[];
  /** Responses sent by Endpoint directly to the endpoint index */
  endpointResponses: Array<LogsEndpointActionResponse<TOutputContent, TResponseMeta>>;
}

/**
 * Fetch Response Action responses from both the Endpoint and the Fleet indexes
 */
export const fetchActionResponses = async <
  TOutputContent extends EndpointActionResponseDataOutput = EndpointActionResponseDataOutput,
  TResponseMeta extends {} = {}
>(
  options: FetchActionResponsesOptions
): Promise<FetchActionResponsesResult<TOutputContent, TResponseMeta>> => {
  const [fleetResponses, endpointResponses] = await Promise.all([
    fetchFleetActionResponses(options),
    fetchEndpointActionResponses<TOutputContent, TResponseMeta>(options),
  ]);

  return { fleetResponses, endpointResponses };
};

/**
 * Fetch Response Action response documents from the Endpoint index
 * @param esClient
 * @param actionIds
 * @param agentIds
 */
export const fetchEndpointActionResponses = async <
  TOutputContent extends EndpointActionResponseDataOutput = EndpointActionResponseDataOutput,
  TResponseMeta extends {} = {}
>({
  esClient,
  actionIds,
  agentIds,
  ccsEnabled,
}: FetchActionResponsesOptions): Promise<
  Array<LogsEndpointActionResponse<TOutputContent, TResponseMeta>>
> => {
  const searchResponse = await esClient
    .search<LogsEndpointActionResponse<TOutputContent, TResponseMeta>>(
      {
        index: prefixIndexPatternsWithCcs(
          ENDPOINT_ACTION_RESPONSES_INDEX_PATTERN,
          ccsEnabled ?? false
        ),
        size: ACTIONS_SEARCH_PAGE_SIZE,
        query: buildSearchQuery(actionIds, agentIds),
      },
      { ignore: [404] }
    )
    .catch(catchAndWrapError);

  return (searchResponse?.hits?.hits ?? []).map((esHit) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return esHit._source!;
  });
};

/**
 * Fetch Response Action response documents from the Fleet index
 * @param esClient
 * @param actionIds
 * @param agentIds
 */
export const fetchFleetActionResponses = async ({
  esClient,
  actionIds,
  agentIds,
  ccsEnabled,
}: FetchActionResponsesOptions): Promise<EndpointActionResponse[]> => {
  const searchResponse = await esClient
    .search<EndpointActionResponse>(
      {
        index: prefixIndexPatternsWithCcs(AGENT_ACTIONS_RESULTS_INDEX, ccsEnabled ?? false),
        size: ACTIONS_SEARCH_PAGE_SIZE,
        query: buildSearchQuery(actionIds, agentIds),
      },
      { ignore: [404] }
    )
    .catch(catchAndWrapError);

  return (searchResponse?.hits?.hits ?? []).map((esHit) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return esHit._source!;
  });
};
