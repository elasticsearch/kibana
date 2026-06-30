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
import { timeRangeSchemaRequired } from '../../utils/tool_schemas';
import { getAgentBuilderResourceAvailability } from '../../utils/get_agent_builder_resource_availability';

export const OBSERVABILITY_GET_APM_TIMESERIES_TOOL_ID = 'observability.get_apm_timeseries';

// Upper bounds on string inputs to avoid unbounded-string DoS (CodeQL).
const MAX_NAME_LENGTH = 1024;
const MAX_KQL_LENGTH = 4096;

const getApmTimeseriesSchema = z.object({
  ...timeRangeSchemaRequired,
  serviceName: z
    .string()
    .max(MAX_NAME_LENGTH)
    .describe('The APM service name to plot the metric for.'),
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
  metric: z
    .enum(['latency', 'failedTransactionRate', 'throughput'])
    .describe(
      'Which metric to plot over time. Use "latency" for transaction_duration alerts, "failedTransactionRate" for error_rate / transaction_error_rate alerts, "throughput" for traffic volume.'
    ),
  latencyType: z
    .enum(['avg', 'p95', 'p99'])
    .default('avg')
    .describe('Aggregation type for latency. Ignored for non-latency metrics.'),
});

export function createGetApmTimeseriesTool({
  core,
  plugins,
  dataRegistry,
  logger,
}: {
  core: ObservabilityAgentBuilderCoreSetup;
  plugins: ObservabilityAgentBuilderPluginSetupDependencies;
  dataRegistry: ObservabilityAgentBuilderDataRegistry;
  logger: Logger;
}): StaticToolRegistration<typeof getApmTimeseriesSchema> {
  const toolDefinition: BuiltinToolDefinition<typeof getApmTimeseriesSchema> = {
    id: OBSERVABILITY_GET_APM_TIMESERIES_TOOL_ID,
    type: ToolType.builtin,
    description: `Returns time-bucketed APM metrics (latency, failed transaction rate, or throughput) for a single service over a time range, shaped for the "observability.apm-timeseries" attachment. Use it to visualise how a metric changed over time — e.g. the onset of a latency spike or the duration of an error-rate increase.

Returns an object ready to drop into an apm-timeseries attachment:
- serviceName
- metric: the requested metric name
- unit: 'ms' (latency) | '%' (failedTransactionRate, 0–100) | 'rpm' (throughput)
- dataPoints: array of { timestamp (epoch ms), value (number | null) } — null marks a gap

The alert threshold and alert-start time are NOT returned here; the caller adds them to the attachment from the alert context.`,
    schema: getApmTimeseriesSchema,
    tags: ['observability', 'apm', 'timeseries', 'latency', 'metrics'],
    availability: {
      cacheMode: 'space',
      handler: async ({ request }) => {
        return getAgentBuilderResourceAvailability({ core, request, logger });
      },
    },
    handler: async (toolParams, context) => {
      const { start, end, serviceName, environment, kqlFilter, metric, latencyType } = toolParams;
      const { request } = context;

      try {
        const result = await dataRegistry.getData('apmTimeseries', {
          request,
          serviceName,
          environment,
          kqlFilter,
          metric,
          latencyType,
          start,
          end,
        });

        if (!result) {
          throw new Error('APM timeseries data provider is not registered.');
        }

        return { results: [{ type: ToolResultType.other, data: result }] };
      } catch (error) {
        logger.error(`get_apm_timeseries error: ${error.message}`);
        logger.debug(error);
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to fetch APM timeseries: ${error.message}`,
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
