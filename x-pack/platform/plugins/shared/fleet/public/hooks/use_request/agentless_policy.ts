/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@kbn/react-query';

import { API_VERSIONS } from '../../../common';

import { agentlessPolicyRouteService } from '../../../common/services';
import type {
  CreateAgentlessPolicyRequest,
  CreateAgentlessPolicyResponse,
  DeleteAgentlessPolicyRequest,
  DeleteAgentlessPolicyResponse,
  GetBulkAgentlessPolicyThroughputResponse,
  GetAgentlessPolicyResponse,
  ListAgentlessPoliciesRequest,
  ListAgentlessPoliciesResponse,
  UpdateAgentlessPolicyRequest,
  UpdateAgentlessPolicyResponse,
} from '../../../common/types/rest_spec/agentless_policy';

import { sendRequestForRq } from './use_request';
import type { RequestError } from './use_request';

export const sendCreateAgentlessPolicy = (body: CreateAgentlessPolicyRequest['body']) => {
  return sendRequestForRq<CreateAgentlessPolicyResponse>({
    path: agentlessPolicyRouteService.getCreatePath(),
    method: 'post',
    version: API_VERSIONS.public.v1,
    body: JSON.stringify(body),
  });
};

export const sendUpdateAgentlessPolicy = (
  policyId: string,
  body: UpdateAgentlessPolicyRequest['body']
) => {
  return sendRequestForRq<UpdateAgentlessPolicyResponse>({
    path: agentlessPolicyRouteService.getUpdatePath(policyId),
    method: 'put',
    version: API_VERSIONS.public.v1,
    body: JSON.stringify(body),
  });
};

export const sendDeleteAgentlessPolicy = (
  policyId: string,
  query?: DeleteAgentlessPolicyRequest['query']
) => {
  return sendRequestForRq<DeleteAgentlessPolicyResponse>({
    path: agentlessPolicyRouteService.getDeletePath(policyId),
    method: 'delete',
    version: API_VERSIONS.public.v1,
    query,
  });
};

export const useBulkGetAgentlessPolicyThroughput = (policyIds: string[]) => {
  return useQuery<GetBulkAgentlessPolicyThroughputResponse, RequestError>(
    ['agentlessPolicyThroughput', policyIds],
    () =>
      sendRequestForRq<GetBulkAgentlessPolicyThroughputResponse>({
        path: agentlessPolicyRouteService.getBulkThroughputPath(),
        method: 'post',
        version: API_VERSIONS.internal.v1,
        body: JSON.stringify({ policyIds }),
      }),
    {
      enabled: policyIds.length > 0,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  );
};

export const sendGetAgentlessPolicy = (policyId: string) => {
  return sendRequestForRq<GetAgentlessPolicyResponse>({
    path: agentlessPolicyRouteService.getInfoPath(policyId),
    method: 'get',
    version: API_VERSIONS.public.v1,
  });
};

export const sendListAgentlessPolicies = (query?: ListAgentlessPoliciesRequest['query']) => {
  return sendRequestForRq<ListAgentlessPoliciesResponse>({
    path: agentlessPolicyRouteService.getListPath(),
    method: 'get',
    version: API_VERSIONS.public.v1,
    query,
  });
};
