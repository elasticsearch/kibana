/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getActionList } from '..';
import type {
  ActionListApiResponse,
  EndpointPendingActions,
} from '../../../../common/endpoint/types';
import type { EndpointAppContextService } from '../../endpoint_app_context_services';
import { ACTIONS_SEARCH_PAGE_SIZE } from './constants';

const PENDING_ACTION_RESPONSE_MAX_LAPSED_TIME = 300000; // 300k ms === 5 minutes

/**
 * Returns an array containing the pending action summary for each of the Agent IDs provided on input
 */
export const getPendingActionsSummary = async (
  endpointService: EndpointAppContextService,
  spaceId: string,
  /** The Fleet Agent IDs to be checked */
  agentIDs: string[],
  ccsEnabled: boolean = false
): Promise<EndpointPendingActions[]> => {
  const { data: unExpiredActionList } = await getActionList({
    spaceId,
    endpointService,
    unExpiredOnly: true,
    elasticAgentIds: agentIDs,
    pageSize: ACTIONS_SEARCH_PAGE_SIZE,
    ccsEnabled,
  });

  // Store a map of `agent_id => array of actions`
  const unExpiredByAgentId: Record<string, ActionListApiResponse['data']> =
    unExpiredActionList.reduce<Record<string, ActionListApiResponse['data']>>(
      (byAgentMap, action) => {
        for (const agent of action.agents) {
          if (!byAgentMap[agent]) {
            byAgentMap[agent] = [];
          }

          byAgentMap[agent].push(action);
        }

        return byAgentMap;
      },
      {}
    );

  const pending: EndpointPendingActions[] = [];
  let endpointMetadataLastUpdated: Record<string, Date> | undefined;

  for (const agentID of agentIDs) {
    const agentPendingActions: EndpointPendingActions['pending_actions'] = {};
    const setActionAsPending = (commandName: string) => {
      // Add the command to the list of pending actions and increment the count for this command
      agentPendingActions[commandName] = (agentPendingActions[commandName] ?? 0) + 1;
    };

    pending.push({
      agent_id: agentID,
      pending_actions: agentPendingActions,
    });

    const metadataService = endpointService.getEndpointMetadataService(spaceId);
    const agentUnexpiredActions = unExpiredByAgentId[agentID] ?? [];

    for (const unExpiredAction of agentUnexpiredActions) {
      // If this agent's action state is not completed, then mark it as pending
      if (!unExpiredAction.agentState[agentID].isCompleted) {
        setActionAsPending(unExpiredAction.command);
      } else if (
        unExpiredAction.wasSuccessful &&
        (unExpiredAction.command === 'isolate' || unExpiredAction.command === 'unisolate') &&
        unExpiredAction.agentType === 'endpoint'
      ) {
        // For Elastic Defend (endpoint):
        // For Isolate and Un-Isolate, we want to ensure that the isolation status being reported in the
        // endpoint metadata was received after the action was completed. This is to ensure that the
        // isolation status being reported in the UI remains as accurate as possible.

        // If the metadata documents for all agents has not yet been retrieved, do it now
        if (!endpointMetadataLastUpdated) {
          endpointMetadataLastUpdated = (
            await metadataService.findHostMetadataForFleetAgents(agentIDs, ccsEnabled)
          ).reduce((acc, endpointMetadata) => {
            acc[endpointMetadata.elastic.agent.id] = new Date(endpointMetadata.event.created);
            return acc;
          }, {} as Record<string, Date>);
        }

        const lastEndpointMetadataEventTimestamp = endpointMetadataLastUpdated[agentID];
        const actionCompletedAtTimestamp = new Date(unExpiredAction.completedAt ?? Date.now());
        const enoughTimeHasLapsed =
          Date.now() - actionCompletedAtTimestamp.getTime() >
          PENDING_ACTION_RESPONSE_MAX_LAPSED_TIME;

        // If an endpoint metadata update was not received after the action completed,
        // and we are still within the lapse time of waiting for it, then show this action
        // as pending.
        if (
          !enoughTimeHasLapsed &&
          lastEndpointMetadataEventTimestamp &&
          lastEndpointMetadataEventTimestamp < actionCompletedAtTimestamp
        ) {
          setActionAsPending(unExpiredAction.command);
        }
      }
    }
  }

  return pending;
};
