/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { Logger } from '@kbn/core/server';
import type { BuiltinToolDefinition, StaticToolRegistration } from '@kbn/agent-builder-server';
import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type {
  ObservabilityAgentBuilderCoreSetup,
  ObservabilityAgentBuilderPluginSetupDependencies,
} from '../../types';
import type { ObservabilityAgentBuilderDataRegistry } from '../../data_registry/data_registry';
import { timeRangeSchemaOptional } from '../../utils/tool_schemas';
import { getAgentBuilderResourceAvailability } from '../../utils/get_agent_builder_resource_availability';
import { getToolHandler } from './handler';
import type { ServiceNodeMetadataMap } from '../../data_registry/data_registry_types';
import type { ServiceTopologyConnection } from './types';

export const OBSERVABILITY_GET_SERVICE_TOPOLOGY_TOOL_ID = 'observability.get_service_topology';

/** Collects unique service names from the source/target service nodes of a connection set. */
function collectServiceNames(connections: ServiceTopologyConnection[]): string[] {
  const names = new Set<string>();
  for (const connection of connections) {
    for (const node of [connection.source, connection.target]) {
      if ('service.name' in node) {
        names.add(node['service.name']);
      }
    }
  }
  return [...names];
}

const DEFAULT_TIME_RANGE = { start: 'now-1h', end: 'now' };

const getServiceTopologyToolSchema = z.object({
  ...timeRangeSchemaOptional(DEFAULT_TIME_RANGE),
  serviceName: z.string().min(1).describe('The name of the service to get the topology for'),
  direction: z
    .enum(['downstream', 'upstream', 'both'])
    .default('downstream')
    .describe(
      'Direction of dependencies to retrieve. ' +
        '"downstream" shows what this service calls (dependencies). ' +
        '"upstream" shows what calls this service (callers). ' +
        '"both" shows both directions. Defaults to "downstream".'
    ),
  depth: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Maximum number of hops to traverse. ' +
        'depth=1 returns only immediate (single-hop) dependencies. ' +
        'Omit for unlimited traversal (full multi-hop topology).'
    ),
});

export function createGetServiceTopologyTool({
  core,
  plugins,
  dataRegistry,
  logger,
}: {
  core: ObservabilityAgentBuilderCoreSetup;
  plugins: ObservabilityAgentBuilderPluginSetupDependencies;
  dataRegistry: ObservabilityAgentBuilderDataRegistry;
  logger: Logger;
}): StaticToolRegistration<typeof getServiceTopologyToolSchema> {
  const toolDefinition: BuiltinToolDefinition<typeof getServiceTopologyToolSchema> = {
    id: OBSERVABILITY_GET_SERVICE_TOPOLOGY_TOOL_ID,
    type: ToolType.builtin,
    description: `Retrieves the service topology (dependency graph) for a service, with RED metrics (latency, throughput, error rate) per connection.

Returns connections with source/target nodes and RED metrics. Supports downstream, upstream, or both directions.

When to use:
- Checking which direct dependencies are failing or slow (depth: 1)
- Tracing cascading failures through multi-hop dependency chains
- Understanding blast radius of a failing service (direction: "upstream")
- Visualizing the full architecture around a service (direction: "both")

When NOT to use:
- For service-level metrics without topology, use \`observability.get_trace_metrics\`

After reviewing topology results, consider:
- Use \`observability.get_trace_metrics\` with timeseries to check latency/error trends over time
- Use \`observability.get_traces\` to find error patterns in failing dependencies

Also returns \`nodeMetadata\`: a map keyed by service name with per-service \`alertsCount\`, \`sloStatus\`, and \`sloCount\`. Pass both \`connections\` and \`nodeMetadata\` verbatim into an "observability.service-map" attachment to render alert/SLO badges on the service nodes.`,
    schema: getServiceTopologyToolSchema,
    tags: ['observability', 'apm', 'service-map', 'topology'],
    availability: {
      cacheMode: 'space',
      handler: async ({ request }) => {
        return getAgentBuilderResourceAvailability({ core, request, logger });
      },
    },
    handler: async (toolParams, context) => {
      const { serviceName, direction, depth, start, end } = toolParams;
      const { request } = context;

      try {
        const topology = await getToolHandler({
          core,
          plugins,
          request,
          dataRegistry,
          logger,
          serviceName,
          direction,
          depth,
          start,
          end,
        });

        // Enrich with per-service alert/SLO badge metadata. This is best-effort:
        // if the lookup fails, still return the topology so the map can render.
        let nodeMetadata: ServiceNodeMetadataMap = {};
        const serviceNames = collectServiceNames(topology.connections);
        if (serviceNames.length > 0) {
          try {
            nodeMetadata =
              (await dataRegistry.getData('servicesAlertsAndSlo', {
                request,
                serviceNames,
                start,
                end,
              })) ?? {};
          } catch (badgeError) {
            logger.debug(`Failed to fetch alert/SLO badges for topology: ${badgeError.message}`);
          }
        }

        return {
          results: [
            {
              type: ToolResultType.other,
              data: {
                connections: topology.connections,
                nodeMetadata,
              },
            },
          ],
        };
      } catch (error) {
        logger.error(`Error getting service topology: ${error.message}`);
        logger.debug(error);

        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to fetch service topology: ${error.message}`,
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
