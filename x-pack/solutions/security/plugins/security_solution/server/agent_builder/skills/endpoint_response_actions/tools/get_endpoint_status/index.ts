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
import { HostStatus } from '../../../../../../common/endpoint/types';

import type { EndpointAppContextService } from '../../../../../endpoint/endpoint_app_context_services';
import { GET_ENDPOINT_STATUS_TOOL_ID } from '../..';
import type { EndpointNotFoundResult } from '../types';

const getEndpointStatusSchema = z.object({
  hostName: z.string().min(1).describe('The hostname of the endpoint to check status for.'),
});

/**
 * Builds a consistent "endpoint not found" result object. The consumer
 * (agent / caller) can distinguish the cause by inspecting `reason`.
 */
function notFoundResult(
  hostName: string,
  reason: 'endpoint_not_found' | 'index_not_found'
): EndpointNotFoundResult {
  const messages: Record<string, string> = {
    endpoint_not_found: `No endpoint found with hostname '${hostName}'.`,
    index_not_found: `The endpoint metadata index is not available. Cannot retrieve status for '${hostName}'.`,
  };
  return {
    hostName,
    found: false,
    reason,
    status: HostStatus.OFFLINE,
    isolated: false,
    lastSeen: null,
    message: messages[reason],
  };
}

export const getEndpointStatusTool = (
  endpointAppContextService: EndpointAppContextService
): BuiltinSkillBoundedTool => {
  return {
    id: GET_ENDPOINT_STATUS_TOOL_ID,
    type: ToolType.builtin,
    description: `Retrieves the current status of a host by its hostname, including whether it is isolated, its last seen time, and online/offline status.`,
    schema: getEndpointStatusSchema,
    handler: async (params, { logger }) => {
      try {
        const hostName = params.hostName as string;
        const spaceId = DEFAULT_SPACE_ID;

        // Resolve hostname to endpoint IDs via fleet agent service
        const fleetServices = endpointAppContextService.getInternalFleetServices(spaceId);
        const agentClient = fleetServices.agent;
        const agents = await agentClient.listAgents({
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
                data: notFoundResult(hostName, 'endpoint_not_found'),
              },
            ],
          };
        }

        const agent = agents.agents[0];
        const agentId = agent.id;

        // Get detailed status from endpoint metadata service
        const metadataService = endpointAppContextService.getEndpointMetadataService(spaceId);

        // Try to get metadata for this specific agent
        let isolated = false;
        let lastSeen: string | null = null;
        let status = HostStatus.OFFLINE;

        try {
          const hostInfo = await metadataService.getHostMetadataList({
            page: 0,
            pageSize: 1,
            kuery: `agent.id: ${agentId}`,
          });

          if (hostInfo.data?.length) {
            const hostMetadata = hostInfo.data[0];
            isolated = Boolean(hostMetadata.metadata.Endpoint?.state?.isolation);
            lastSeen = hostMetadata.last_checkin || null;
            status = hostMetadata.host_status || HostStatus.OFFLINE;
          } else {
            // Agent exists in fleet but metadata index returned zero hits.
            // The metadata service catches `index_not_found_exception` and
            // returns `{ data: [], total: 0 }`, so we infer index_not_found
            // when the total is zero.  If total > 0 but data is empty, the
            // agent was filtered out by policy/space — treat as endpoint not found.
            if (hostInfo.total === 0) {
              // The metadata service already handles index_not_found gracefully.
              // However, if the index does not exist the service returns empty
              // data without error. We use the ES client to check whether the
              // backing index actually exists.
              const esClient = endpointAppContextService.getInternalEsClient();
              try {
                const indicesExists = await esClient.indices.exists({
                  index: '.ds-metrics-endpoint.metadata-default',
                });
                if (!indicesExists) {
                  return {
                    results: [
                      {
                        tool_result_id: getToolResultId(),
                        type: ToolResultType.other,
                        data: notFoundResult(hostName, 'index_not_found'),
                      },
                    ],
                  };
                }
              } catch (esError) {
                logger.warn(
                  `Could not verify index existence for host ${hostName}: ${esError.message}`
                );
              }
            }
          }
        } catch (metadataError) {
          logger.warn(`Could not retrieve metadata for host ${hostName}: ${metadataError.message}`);
          // Fallback to agent-level info
          isolated = Boolean((agent as unknown as { isolation?: string }).isolation);
          lastSeen = agent.last_checkin ?? null;
          status =
            (agent as unknown as { host_status?: HostStatus }).host_status || HostStatus.OFFLINE;
        }

        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.other,
              data: {
                hostName,
                agentId,
                found: true,
                status,
                isolated,
                lastSeen,
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
                message: `Error retrieving endpoint status: ${error.message}`,
              },
            },
          ],
        };
      }
    },
  };
};
