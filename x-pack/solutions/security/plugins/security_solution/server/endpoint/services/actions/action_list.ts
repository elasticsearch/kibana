/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EndpointAppContextService } from '../../endpoint_app_context_services';
import { fetchActionRequests } from './utils/fetch_action_requests';
import type { FetchActionResponsesResult } from './utils/fetch_action_responses';
import { fetchActionResponses } from './utils/fetch_action_responses';
import { ENDPOINT_DEFAULT_PAGE_SIZE } from '../../../../common/endpoint/constants';
import { CustomHttpRequestError } from '../../../utils/custom_http_request_error';
import type { ActionListApiResponse, LogsEndpointAction } from '../../../../common/endpoint/types';
import type {
  ResponseActionAgentType,
  ResponseActionStatus,
  ResponseActionsApiCommandNames,
  ResponseActionType,
} from '../../../../common/endpoint/service/response_actions/constants';

import {
  createActionDetailsRecord,
  getAgentHostNamesWithIds,
  mapResponsesByActionId,
  mapToNormalizedActionRequest,
} from './utils';
import { ACTIONS_SEARCH_PAGE_SIZE } from './constants';

interface OptionalFilterParams {
  agentTypes?: ResponseActionAgentType[];
  commands?: string[];
  elasticAgentIds?: string[];
  endDate?: string;
  page?: number;
  pageSize?: number;
  startDate?: string;
  userIds?: string[];
  /** Will filter out the action requests so that only those show `expiration` date is greater than now */
  unExpiredOnly?: boolean;
  /** list of action Ids that should have outputs */
  withOutputs?: string[];
  /** Include automated response actions */
  types?: string[];
}

/**
 * Similar to #getActionList but takes statuses filter options
 * Retrieve a list of all (at most 10k) Actions from index (`ActionDetails`)
 * filter out action details based on statuses filter options
 */
export const getActionListByStatus = async ({
  endpointService,
  spaceId,
  agentTypes,
  commands,
  elasticAgentIds,
  endDate,
  page: _page,
  pageSize,
  startDate,
  statuses,
  userIds,
  unExpiredOnly = false,
  types,
  withOutputs,
  ccsEnabled = false,
}: OptionalFilterParams & {
  statuses: ResponseActionStatus[];
  spaceId: string;
  endpointService: EndpointAppContextService;
  ccsEnabled?: boolean;
}): Promise<ActionListApiResponse> => {
  const size = pageSize ?? ENDPOINT_DEFAULT_PAGE_SIZE;
  const page = _page ?? 1;

  const { actionDetails: allActionDetails } = await getActionDetailsList({
    endpointService,
    spaceId,
    agentTypes,
    commands,
    elasticAgentIds,
    endDate,
    from: 0,
    size: ACTIONS_SEARCH_PAGE_SIZE,
    startDate,
    userIds,
    unExpiredOnly,
    types,
    withOutputs,
    ccsEnabled,
  });

  // filter out search results based on status filter options
  const actionDetailsByStatus = allActionDetails.filter((detail) =>
    statuses.includes(detail.status)
  );

  return {
    page,
    pageSize: size,
    startDate,
    endDate,
    agentTypes,
    elasticAgentIds,
    userIds,
    commands,
    statuses,
    // for size 20 -> page 1: (0, 20), page 2: (20, 40) ...etc
    data: actionDetailsByStatus.slice((page - 1) * size, size * page),
    total: actionDetailsByStatus.length,
  };
};

/**
 * Retrieve a list of Actions (`ActionDetails`)
 */
export const getActionList = async ({
  endpointService,
  spaceId,
  agentTypes,
  commands,
  elasticAgentIds,
  endDate,
  page: _page,
  pageSize,
  startDate,
  userIds,
  unExpiredOnly = false,
  withOutputs,
  types,
  ccsEnabled = false,
}: OptionalFilterParams & {
  spaceId: string;
  endpointService: EndpointAppContextService;
  ccsEnabled?: boolean;
}): Promise<ActionListApiResponse> => {
  const size = pageSize ?? ENDPOINT_DEFAULT_PAGE_SIZE;
  const page = _page ?? 1;
  // # of hits to skip
  const from = (page - 1) * size;

  const { actionDetails, totalRecords } = await getActionDetailsList({
    spaceId,
    endpointService,
    agentTypes,
    commands,
    elasticAgentIds,
    endDate,
    from,
    size,
    startDate,
    userIds,
    unExpiredOnly,
    withOutputs,
    types,
    ccsEnabled,
  });

  return {
    page,
    pageSize: size,
    startDate,
    endDate,
    agentTypes,
    elasticAgentIds,
    userIds,
    commands,
    statuses: undefined,
    data: actionDetails,
    total: totalRecords,
  };
};

export type GetActionDetailsListParam = OptionalFilterParams & {
  from: number;
  size: number;
};
const getActionDetailsList = async ({
  endpointService,
  spaceId,
  agentTypes,
  commands,
  elasticAgentIds,
  endDate,
  from,
  size,
  startDate,
  userIds,
  unExpiredOnly,
  withOutputs,
  types,
  ccsEnabled = false,
}: GetActionDetailsListParam & {
  spaceId: string;
  endpointService: EndpointAppContextService;
  ccsEnabled?: boolean;
}): Promise<{
  actionDetails: ActionListApiResponse['data'];
  totalRecords: number;
}> => {
  const logger = endpointService.createLogger('GetActionDetailsList');
  let actionRequests: LogsEndpointAction[] = [];
  let totalRecords: number = 0;

  try {
    const { data, total } = await fetchActionRequests({
      spaceId,
      endpointService,
      agentTypes,
      commands: commands as ResponseActionsApiCommandNames[],
      elasticAgentIds,
      startDate,
      endDate,
      from,
      size,
      userIds,
      unExpiredOnly,
      types: types as ResponseActionType[],
    });

    actionRequests = data;
    totalRecords = total;
  } catch (error) {
    // all other errors
    const err = new CustomHttpRequestError(
      error.meta?.meta?.body?.error?.reason ??
        `Unknown error while fetching action requests (${error.message})`,
      error.meta?.meta?.statusCode ?? 500,
      error
    );
    logger.error(err);
    throw err;
  }

  if (!totalRecords) {
    return { actionDetails: [], totalRecords: 0 };
  }

  const normalizedActionRequests = actionRequests.map(mapToNormalizedActionRequest);
  const agentIds: string[] = []; // Endpoint agent IDs only
  const actionReqIds = normalizedActionRequests.map((actionReq) => {
    if (actionReq.agentType === 'endpoint') {
      agentIds.push(...actionReq.agents);
    }

    return actionReq.id;
  });
  let actionResponses: FetchActionResponsesResult;
  let agentsHostInfo: { [id: string]: string };

  try {
    // get all responses for the action IDs retrieved
    [actionResponses, agentsHostInfo] = await Promise.all([
      fetchActionResponses({
        esClient: endpointService.getInternalEsClient(),
        actionIds: actionReqIds,
        ccsEnabled,
      }),

      // Get the host names for Elastic Endpoint agents
      getAgentHostNamesWithIds({
        endpointService,
        spaceId,
        agentIds,
      }),
    ]);
  } catch (error) {
    // all other errors
    const err = new CustomHttpRequestError(
      error.meta?.meta?.body?.error?.reason ??
        `Unknown error while fetching action responses (${error.message})`,
      error.meta?.meta?.statusCode ?? 500,
      error
    );
    logger.error(err);
    throw err;
  }

  const responsesByActionId = mapResponsesByActionId(actionResponses);
  const actionDetails: ActionListApiResponse['data'] = normalizedActionRequests.map((action) => {
    const actionRecord = createActionDetailsRecord(
      action,
      responsesByActionId[action.id] ?? { fleetResponses: [], endpointResponses: [] },
      agentsHostInfo
    );

    if (withOutputs && !withOutputs.includes(action.id)) {
      delete actionRecord.outputs;
    }

    return actionRecord;
  });

  return { actionDetails, totalRecords };
};
