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
import { getAgentBuilderResourceAvailability } from '../../utils/get_agent_builder_resource_availability';

export const OBSERVABILITY_GET_APM_METRICS_TOOL_ID = 'observability.get_apm_metrics';

// Upper bounds on string inputs to avoid unbounded-string DoS (CodeQL).
const MAX_NAME_LENGTH = 1024;
const MAX_KQL_LENGTH = 4096;
const MAX_DATEMATH_LENGTH = 64;

const getApmMetricsSchema = z.object({
  serviceName: z
    .string()
    .max(MAX_NAME_LENGTH)
    .describe('The APM service name to fetch metrics for.'),
  environment: z
    .string()
    .max(MAX_NAME_LENGTH)
    .optional()
    .describe(
      'Optional service environment (e.g. "production"). Omit to include all environments.'
    ),
  kqlFilter: z
    .string()
    .max(MAX_KQL_LENGTH)
    .optional()
    .describe('Optional additional KQL filter, e.g. \'transaction.type: "request"\'.'),
  latencyType: z
    .enum(['avg', 'p95', 'p99'])
    .default('avg')
    .describe('Aggregation type for latency.'),
  start: z
    .string()
    .max(MAX_DATEMATH_LENGTH)
    .describe('Start of the current/focused window (datemath, e.g. "now-15m").'),
  end: z
    .string()
    .max(MAX_DATEMATH_LENGTH)
    .describe('End of the current/focused window (datemath, e.g. "now").'),
  baselineStart: z
    .string()
    .max(MAX_DATEMATH_LENGTH)
    .optional()
    .describe(
      'Start of the baseline window for comparison (datemath, e.g. "now-1h"). Provide together with baselineEnd to get delta badges.'
    ),
  baselineEnd: z
    .string()
    .max(MAX_DATEMATH_LENGTH)
    .optional()
    .describe('End of the baseline window (datemath, e.g. "now-15m").'),
});

export function createGetApmMetricsTool({
  core,
  plugins,
  dataRegistry,
  logger,
}: {
  core: ObservabilityAgentBuilderCoreSetup;
  plugins: ObservabilityAgentBuilderPluginSetupDependencies;
  dataRegistry: ObservabilityAgentBuilderDataRegistry;
  logger: Logger;
}): StaticToolRegistration<typeof getApmMetricsSchema> {
  const toolDefinition: BuiltinToolDefinition<typeof getApmMetricsSchema> = {
    id: OBSERVABILITY_GET_APM_METRICS_TOOL_ID,
    type: ToolType.builtin,
    description: `Returns current (and optionally baseline) APM metric snapshots for a single service, shaped for the "observability.apm-metrics" comparison card. Use it to show an at-a-glance before/after of latency, error rate, and throughput — for example comparing an alert window against the hour before.

Returns an object ready to drop into an apm-metrics attachment:
- serviceName, environment
- current: { latencyMs, errorRate (percentage 0–100), throughputRpm }
- baseline: same shape (present only when baselineStart/baselineEnd are provided)

Provide baselineStart/baselineEnd to get the comparison; omit them for current-only.`,
    schema: getApmMetricsSchema,
    tags: ['observability', 'apm', 'metrics', 'latency'],
    availability: {
      cacheMode: 'space',
      handler: async ({ request }) => {
        return getAgentBuilderResourceAvailability({ core, request, logger });
      },
    },
    handler: async (toolParams, context) => {
      const {
        serviceName,
        environment,
        kqlFilter,
        latencyType,
        start,
        end,
        baselineStart,
        baselineEnd,
      } = toolParams;
      const { request } = context;

      try {
        const result = await dataRegistry.getData('apmMetrics', {
          request,
          serviceName,
          environment,
          kqlFilter,
          latencyType,
          currentStart: start,
          currentEnd: end,
          baselineStart,
          baselineEnd,
        });

        if (!result) {
          throw new Error('APM metrics data provider is not registered.');
        }

        return { results: [{ type: ToolResultType.other, data: result }] };
      } catch (error) {
        logger.error(`get_apm_metrics error: ${error.message}`);
        logger.debug(error);
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to fetch APM metrics: ${error.message}`,
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
