/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType } from '@kbn/agent-builder-common';
import type { ErrorResult, OtherResult } from '@kbn/agent-builder-common/tools/tool_result';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type {
  BuiltinToolDefinition,
  StaticToolRegistration,
  ToolHandlerReturn,
} from '@kbn/agent-builder-server';
import type { Logger } from '@kbn/core/server';
import { getAgentBuilderResourceAvailability } from '../../utils/get_agent_builder_resource_availability';
import { timeRangeSchemaOptional } from '../../utils/tool_schemas';
import { MAX_KQL_FILTER_LENGTH } from '../../utils/schema_limits';
import type { ObservabilityAgentBuilderCoreSetup } from '../../types';
import type { ObservabilityAgentBuilderDataRegistry } from '../../data_registry/data_registry';
import { getToolHandler } from './handler';

export const OBSERVABILITY_GET_HOSTS_TOOL_ID = 'observability.get_hosts';

const DEFAULT_TIME_RANGE = {
  start: 'now-1h',
  end: 'now',
};

export type GetHostsToolResult = OtherResult<{
  total: number;
  hosts: Array<{
    name: string;
    metrics: Array<{ name: string; value: number | null }>;
    metadata: Array<{ name: string; value: string | number | null }>;
  }>;
}>;

const getHostsSchema = z.object({
  ...timeRangeSchemaOptional(DEFAULT_TIME_RANGE),
  limit: z.number().int().min(1).max(100).default(20).describe(`Maximum number of hosts to return`),
  kqlFilter: z
    .string()
    .max(MAX_KQL_FILTER_LENGTH)
    .optional()
    .describe(
      'KQL filter to narrow down results. Examples: "service.name: frontend", "host.name: web-*", "cloud.provider: aws".'
    ),
});

export function createGetHostsTool({
  core,
  logger,
  dataRegistry,
}: {
  core: ObservabilityAgentBuilderCoreSetup;
  logger: Logger;
  dataRegistry: ObservabilityAgentBuilderDataRegistry;
}): StaticToolRegistration<typeof getHostsSchema> {
  const toolDefinition: BuiltinToolDefinition<typeof getHostsSchema> = {
    id: OBSERVABILITY_GET_HOSTS_TOOL_ID,
    type: ToolType.builtin,
    description: `Retrieves a list of hosts with their infrastructure metrics (CPU, memory, disk, network). Use this tool to get an overview of host health and resource utilization.

When to use:
- Getting a high-level view of infrastructure health
- Identifying hosts with high CPU/memory usage or disk space issues
- Checking network throughput across hosts
- Answering questions like "which hosts are under heavy load?" or "what's the memory usage of my servers?"

Returns host names, metrics (CPU percentage, memory usage, disk space, network rx/tx), and metadata (OS name, cloud provider, IP address).`,
    schema: getHostsSchema,
    tags: ['observability', 'infrastructure', 'hosts', 'metrics'],
    availability: {
      cacheMode: 'space',
      handler: async ({ request }) => {
        return getAgentBuilderResourceAvailability({ core, request, logger });
      },
    },
    handler: async (
      toolParams,
      { request }
    ): Promise<ToolHandlerReturn<GetHostsToolResult | ErrorResult>> => {
      const { start, end, limit, kqlFilter } = toolParams;

      try {
        const { hosts, total } = await getToolHandler({
          request,
          dataRegistry,
          start,
          end,
          limit,
          kqlFilter,
        });

        return {
          results: [
            {
              type: ToolResultType.other as const,
              data: {
                hosts,
                total,
              },
            },
          ],
        };
      } catch (error) {
        logger.error(`Error fetching hosts: ${error.message}`);
        logger.debug(error);

        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to fetch hosts: ${error.message}`,
                stack: error.stack,
              },
            },
          ],
        };
      }
    },
  };

  return toolDefinition;
}
