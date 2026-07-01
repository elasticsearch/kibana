/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';
import { z } from '@kbn/zod/v4';
import { ToolResultType, ToolType } from '@kbn/agent-builder-common';
import { getToolResultId } from '@kbn/agent-builder-server/tools';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';

import type { EndpointAppContextService } from '../../../../../endpoint/endpoint_app_context_services';
import { UNISOLATE_TOOL_ID } from '../..';

const unisolateHostSchema = z.object({
  hostName: z.string().min(1).describe('The hostname of the endpoint to un-isolate.'),
  comment: z
    .string()
    .min(1)
    .optional()
    .describe('An optional comment explaining why the host is being un-isolated.'),
});

export const unisolateHostTool = (
  endpointAppContextService: EndpointAppContextService
): BuiltinSkillBoundedTool => {
  return {
    id: UNISOLATE_TOOL_ID,
    type: ToolType.builtin,
    description: `Un-isolates a host by its hostname. Re-establishes network connectivity on an endpoint that was previously isolated. The action is dispatched through the Elastic Defend Response Actions service.`,
    schema: unisolateHostSchema,
    handler: async (params, { logger }) => {
      try {
        const hostName = params.hostName as string;
        const comment = params.comment as string | undefined;
        const spaceId = DEFAULT_SPACE_ID;
        const responseActionsClient = endpointAppContextService.getInternalResponseActionsClient({
          spaceId,
          agentType: 'endpoint',
        });

        // The response actions API needs endpoint_ids, not host names.
        // We resolve hostName -> endpoint_ids via the fleet agent service.
        const fleetServices = endpointAppContextService.getInternalFleetServices(spaceId);
        const agent = fleetServices.agent;
        const agents = await agent.listAgents({
          showInactive: true,
          kuery: `local_metadata.host.name: ${hostName}`,
          page: 1,
          perPage: 1,
        });

        if (!agents?.agents?.length) {
          return {
            results: [
              {
                tool_result_id: getToolResultId(),
                type: ToolResultType.other,
                data: {
                  hostName,
                  found: false,
                  reason: 'endpoint_not_found' as const,
                  message: `No endpoint found with hostname '${hostName}'.`,
                },
              },
            ],
          };
        }

        const endpointIds = agents.agents.map((a) => a.id);

        // Note: the ResponseActionsClient method is called `release`, not `unisolate`
        const actionDetails = await responseActionsClient.release(
          {
            endpoint_ids: endpointIds,
            comment: comment ?? `Un-isolated via AI agent: ${hostName}`,
          },
          { hosts: { [endpointIds[0]]: { name: hostName } } }
        );

        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.other,
              data: {
                actionId: actionDetails.id,
                status: actionDetails.status,
                wasSuccessful: actionDetails.wasSuccessful,
                hosts: actionDetails.hosts,
                comment,
              },
            },
          ],
        };
      } catch (error) {
        logger.error(error);
        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.error,
              data: {
                message: `Error un-isolating host: ${error.message}`,
              },
            },
          ],
        };
      }
    },
  };
};
