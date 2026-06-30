/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, KibanaRequest } from '@kbn/core/server';
import type { Agent } from '@kbn/fleet-plugin/common/types/models';
import type { ISearchRequestParams } from '@kbn/search-types';
import type { EndpointFleetServicesInterface } from '../../services/fleet';
import { policyIndexPattern } from '../../../../common/endpoint/constants';
import { catchAndWrapError } from '../../utils';
import type { EndpointAppContext } from '../../types';
import { INITIAL_POLICY_ID } from '.';
import type { GetHostPolicyResponse, HostPolicyResponse } from '../../../../common/endpoint/types';
import { prefixIndexPatternsWithCcs } from '../../utils/ccs_utils';

export const getESQueryPolicyResponseByAgentID = (
  agentID: string,
  index: string
): ISearchRequestParams => {
  return {
    query: {
      bool: {
        filter: {
          term: {
            'agent.id': agentID,
          },
        },
        must_not: {
          term: {
            'Endpoint.policy.applied.id': INITIAL_POLICY_ID,
          },
        },
      },
    },
    sort: [
      {
        'event.created': {
          order: 'desc',
        },
      },
    ],
    size: 1,
    index,
  };
};

export async function getPolicyResponseByAgentId(
  agentID: string,
  esClient: ElasticsearchClient,
  fleetServices: EndpointFleetServicesInterface,
  ccsEnabled: boolean
): Promise<GetHostPolicyResponse | undefined> {
  const query = getESQueryPolicyResponseByAgentID(
    agentID,
    prefixIndexPatternsWithCcs(policyIndexPattern, ccsEnabled)
  );
  const response = await esClient.search<HostPolicyResponse>(query).catch(catchAndWrapError);

  if (response.hits.hits.length > 0 && response.hits.hits[0]._source != null) {
    // Ensure agent is in the current space id. Call to fleet will Error if agent is not in current space
    await fleetServices.ensureInCurrentSpace({ agentIds: [agentID] });

    return {
      policy_response: response.hits.hits[0]._source,
    };
  }

  return undefined;
}

export async function agentVersionsMap(
  endpointAppContext: EndpointAppContext,
  request: KibanaRequest,
  kqlQuery: string,
  pageSize: number = 1000
): Promise<Map<string, number>> {
  const searchOptions = (pageNum: number) => {
    return {
      page: pageNum,
      perPage: pageSize,
      showInactive: false,
      kuery: kqlQuery,
    };
  };

  let page = 1;
  const result: Map<string, number> = new Map<string, number>();
  let hasMore = true;
  while (hasMore) {
    const queryResult = await endpointAppContext.service
      .getInternalFleetServices()
      .agent.listAgents(searchOptions(page++));
    queryResult.agents.forEach((agent: Agent) => {
      const agentVersion = agent.local_metadata?.elastic?.agent?.version;
      if (result.has(agentVersion)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        result.set(agentVersion, result.get(agentVersion)! + 1);
      } else {
        result.set(agentVersion, 1);
      }
    });
    hasMore = queryResult.agents.length > 0;
  }
  return result;
}
