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
import type { ServiceNodeMetadataMap } from '../../data_registry/data_registry_types';
import { timeRangeSchemaOptional } from '../../utils/tool_schemas';
import { MAX_KQL_FILTER_LENGTH, MAX_SHORT_STRING_LENGTH } from '../../utils/schema_limits';
import { getAgentBuilderResourceAvailability } from '../../utils/get_agent_builder_resource_availability';
import { getToolHandler } from './handler';
import type { ServiceTopologyNode } from './types';

export const OBSERVABILITY_GET_SERVICE_TOPOLOGY_TOOL_ID = 'observability.get_service_topology';

const DEFAULT_TIME_RANGE = { start: 'now-1h', end: 'now' };

const getServiceTopologyToolSchema = z.object({
  ...timeRangeSchemaOptional(DEFAULT_TIME_RANGE),
  serviceName: z
    .string()
    .min(1)
    .max(MAX_SHORT_STRING_LENGTH)
    .describe('The name of the service to get the topology for'),
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
  environment: z
    .string()
    .max(MAX_SHORT_STRING_LENGTH)
    .optional()
    .describe(
      'Service environment (e.g. "production") used to scope the returned `nodeMetadata` badges. ' +
        'Pass it whenever the user is looking at a single environment — otherwise alert, SLO and ' +
        'anomaly counts are aggregated across every environment. Omit for all environments.'
    ),
  kuery: z
    .string()
    .max(MAX_KQL_FILTER_LENGTH)
    .optional()
    .describe(
      'KQL filter applied when computing the `nodeMetadata` alert and SLO badges, ' +
        'e.g. \'service.name: "frontend"\'. Omit when no filter applies.'
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
    annotations: {
      title: 'Get Service Topology',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    description: `Retrieves the service topology (dependency graph) for a service, with RED metrics (latency, throughput, error rate) per connection.

Returns:
- \`connections\`: source/target nodes with RED metrics. Each service node has a \`service.name\` field; external dependency nodes have a \`span.destination.service.resource\` field.
- \`nodeMetadata\` (best-effort, may be absent): per-service badge data keyed by service name. Each entry may contain \`alertsCount\`, \`sloStatus\`, \`sloCount\`, \`anomalySeverity\`, \`anomalyScore\`. Pass this field through verbatim when building an \`observability.service-map\` attachment.

Supports downstream, upstream, or both directions.

Scoping: \`environment\` and \`kuery\` scope the \`nodeMetadata\` badges only. The \`connections\` graph is always built from all environments, so do not claim a topology is environment-specific.

When to use:
- Checking which direct dependencies are failing or slow (depth: 1)
- Tracing cascading failures through multi-hop dependency chains
- Understanding blast radius of a failing service (direction: "upstream")
- Visualizing the full architecture around a service (direction: "both")

When NOT to use:
- For service-level metrics without topology, use \`observability.get_trace_metrics\`

After reviewing topology results, consider:
- Use \`observability.get_trace_metrics\` with timeseries to check latency/error trends over time
- Use \`observability.get_traces\` to find error patterns in failing dependencies`,
    schema: getServiceTopologyToolSchema,
    tags: ['observability', 'apm', 'service-map', 'topology'],
    availability: {
      cacheMode: 'space',
      handler: async ({ request }) => {
        return getAgentBuilderResourceAvailability({ core, request, logger });
      },
    },
    handler: async (toolParams, context) => {
      const { serviceName, direction, depth, start, end, environment, kuery } = toolParams;
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

        // Collect all service names from the topology connections (best-effort)
        const serviceNamesInTopology = new Set<string>();
        for (const conn of topology.connections) {
          for (const node of [conn.source, conn.target]) {
            if ('service.name' in node) {
              serviceNamesInTopology.add((node as ServiceTopologyNode)['service.name']);
            }
          }
        }

        // Enrich with per-service badge metadata (alerts, SLOs, ML anomalies),
        // scoped to the same environment/kuery the caller is looking at so the
        // counts match the user's view instead of aggregating every environment.
        // Best-effort: failures are logged and do not prevent topology from being returned.
        let nodeMetadata: ServiceNodeMetadataMap | undefined;
        if (serviceNamesInTopology.size > 0) {
          try {
            nodeMetadata = await dataRegistry.getData('servicesAlertsAndSlo', {
              request,
              serviceNames: [...serviceNamesInTopology],
              environment,
              kuery,
              start,
              end,
            });
          } catch (enrichError) {
            logger.debug(`Failed to enrich topology with badge metadata: ${enrichError.message}`);
          }
        }

        return {
          results: [
            {
              type: ToolResultType.other,
              data: {
                connections: topology.connections,
                ...(nodeMetadata !== undefined && { nodeMetadata }),
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
