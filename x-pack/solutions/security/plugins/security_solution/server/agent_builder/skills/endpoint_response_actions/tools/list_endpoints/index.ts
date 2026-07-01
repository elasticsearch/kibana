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
import { LIST_ENDPOINTS_TOOL_ID } from '../..';

const listEndpointsSchema = z.object({
  hostNameFilter: z
    .string()
    .optional()
    .describe(
      'Optional hostname substring to filter results. Only endpoints whose hostname contains this value will be returned.'
    ),
});

const DEFAULT_PAGE_SIZE = 20;

export const listEndpointsTool = (
  endpointAppContextService: EndpointAppContextService
): BuiltinSkillBoundedTool => {
  return {
    id: LIST_ENDPOINTS_TOOL_ID,
    type: ToolType.builtin,
    description:
      'Lists endpoints enrolled with Elastic Defend that response actions can be executed on. Returns hostname, status, isolation state, OS, and last seen time for each endpoint.',
    schema: listEndpointsSchema,
    handler: async (params, { logger }) => {
      try {
        const spaceId = DEFAULT_SPACE_ID;
        const metadataService = endpointAppContextService.getEndpointMetadataService(spaceId);

        const kuery = params.hostNameFilter
          ? `united.endpoint.host.hostname: *${params.hostNameFilter}*`
          : undefined;

        const hostInfo = await metadataService.getHostMetadataList({
          page: 0,
          pageSize: DEFAULT_PAGE_SIZE,
          ...(kuery ? { kuery } : {}),
        });

        const endpoints = (hostInfo.data ?? []).map((entry: Record<string, unknown>) => {
          const metadata = entry.metadata as Record<string, unknown> | undefined;
          const host = (metadata?.host ?? {}) as Record<string, unknown>;
          const os = (host?.os ?? {}) as { name?: string; version?: string };
          const agent = (metadata?.agent ?? {}) as { id?: string };
          const endpointState = (metadata?.Endpoint as Record<string, unknown> | undefined)
            ?.state as Record<string, unknown> | undefined;

          const osLabel = os.name && os.version ? `${os.name} ${os.version}` : os.name || 'Unknown';

          return {
            hostName: (host.hostname as string) || 'unknown',
            agentId: agent.id || 'unknown',
            status: (entry.host_status as string) || 'offline',
            isolated: Boolean(endpointState?.isolation),
            os: osLabel,
            lastSeen: (entry.last_checkin as string) || null,
          };
        });

        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.other,
              data: {
                endpoints,
                total: hostInfo.total ?? 0,
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
                message: `Error listing endpoints: ${error.message}`,
              },
            },
          ],
        };
      }
    },
  };
};
