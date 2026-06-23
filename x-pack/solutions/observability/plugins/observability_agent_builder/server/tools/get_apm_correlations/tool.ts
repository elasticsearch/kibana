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
import { i18n } from '@kbn/i18n';
import type { ILicense } from '@kbn/licensing-types';
import { firstValueFrom } from 'rxjs';
import type {
  ObservabilityAgentBuilderCoreSetup,
  ObservabilityAgentBuilderPluginSetupDependencies,
} from '../../types';
import { timeRangeSchemaRequired } from '../../utils/tool_schemas';
import { getAgentBuilderResourceAvailability } from '../../utils/get_agent_builder_resource_availability';
import { getToolHandler } from './handler';
import { OBSERVABILITY_GET_INDEX_INFO_TOOL_ID, OBSERVABILITY_GET_TRACE_METRICS_TOOL_ID } from '..';

export const OBSERVABILITY_GET_APM_CORRELATIONS_TOOL_ID = 'observability.get_apm_correlations';

const MAX_FIELD_CANDIDATES = 25;
const MAX_RESULTS_PER_FIELD = 20;
const INVALID_LICENSE = i18n.translate(
  'xpack.observabilityAgentBuilder.tools.getApmCorrelations.invalidLicense',
  {
    defaultMessage:
      'To use the correlations API, you must be subscribed to an Elastic Platinum license.',
  }
);

const isActivePlatinumLicense = (license?: ILicense) =>
  Boolean(license && license.isActive && license.hasAtLeast('platinum'));

const getApmCorrelationsSchema = z.object({
  ...timeRangeSchemaRequired,
  kqlFilter: z
    .string()
    .optional()
    .describe(
      'KQL filter to scope transactions to a specific service, endpoint, environment, host, or trace. Examples: \'service.name: "frontend"\', \'service.name: "checkout" AND transaction.name: "POST /api/cart"\', \'trace.id: "abc123"\'.'
    ),
  metric: z
    .enum(['latency', 'failure_rate', 'throughput', 'infra_metrics'])
    .default('latency')
    .describe(
      'Metric to correlate on. "latency" finds dimensions over-represented among slow transactions. "failure_rate" finds dimensions over-represented among failed transactions. "throughput" finds dimensions whose presence correlates with changes in transaction rate (RPM) — useful for finding which attributes are associated with traffic spikes or drops. "infra_metrics" finds infrastructure entities (hosts, pods, containers, cloud regions) over-represented among slow transactions.'
    ),
  percentileThreshold: z
    .number()
    .min(50)
    .max(99.9)
    .optional()
    .default(95)
    .describe(
      'For metric="latency" and metric="infra_metrics": defines what "slow" means using a percentile of transaction duration. Example: 95 means "slow transactions are those at or above the p95 duration". Ignored for metric="failure_rate" and metric="throughput".'
    ),
  fieldCandidates: z
    .array(z.string())
    .min(1)
    .max(MAX_FIELD_CANDIDATES)
    .optional()
    .describe(
      `Fields to test for correlations (keyword fields recommended). If omitted, defaults to common APM dimensions for latency/failure_rate/throughput, or infrastructure fields (host.name, container.id, kubernetes.*, cloud.*) for infra_metrics. Hard limit: ${MAX_FIELD_CANDIDATES}. Use ${OBSERVABILITY_GET_INDEX_INFO_TOOL_ID} to discover valid fields and values before expanding this list.`
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_RESULTS_PER_FIELD)
    .optional()
    .default(10)
    .describe(
      `Maximum number of correlated values to return per field. Defaults to 10. Hard limit: ${MAX_RESULTS_PER_FIELD}.`
    ),
});

export function createGetApmCorrelationsTool({
  core,
  plugins,
  logger,
}: {
  core: ObservabilityAgentBuilderCoreSetup;
  plugins: ObservabilityAgentBuilderPluginSetupDependencies;
  logger: Logger;
}): StaticToolRegistration<typeof getApmCorrelationsSchema> {
  const toolDefinition: BuiltinToolDefinition<typeof getApmCorrelationsSchema> = {
    id: OBSERVABILITY_GET_APM_CORRELATIONS_TOOL_ID,
    type: ToolType.builtin,
    description: `Analyzes APM transaction correlations to identify which dimensions are most associated with slow, failed, or throughput-anomalous transactions, or which infrastructure entities host slow transactions.

This is a "unified correlations" style tool intended to support investigations where you already have a scoped set of transactions and want to find what stands out within them.

When to use this tool:
- After ${OBSERVABILITY_GET_TRACE_METRICS_TOOL_ID} identifies a high-latency or high-failure service/endpoint, to find *which attributes* (host, version, cloud region, etc.) are over-represented in slow/failed transactions (metric="latency" or metric="failure_rate").
- To investigate traffic spikes or drops and find which service attributes correlate with throughput changes (metric="throughput").
- To identify which specific infrastructure entities (hosts, pods, containers, cloud regions) are associated with slowness (metric="infra_metrics").
- To generate candidate hypotheses for root cause analysis (for example: "slow requests are concentrated on a single host.name" or "failures are correlated with a specific user_agent.name").

When NOT to use this tool:
- If you don't yet know which service/endpoint is unhealthy, start with ${OBSERVABILITY_GET_TRACE_METRICS_TOOL_ID}.
- If you need the raw trace details, use observability.get_traces.

Notes:
- "latency" and "infra_metrics" correlations use a percentileThreshold (default p95) to define the slow subset. Scoring uses significant_terms (KL-divergence); this differs from the Kibana UI which uses a K-S test — scores are not directly comparable.
- "throughput" computes Pearson correlation between overall RPM and per-field-value RPM timeseries; results with |correlation| < 0.3 are excluded. Requires at least a ~3-minute time range to produce meaningful results.
- "infra_metrics" automatically uses infrastructure field candidates (host.name, container.id, kubernetes.pod.name, etc.) unless fieldCandidates is specified.
- Results are best-effort and may be less useful when fieldCandidates include high-cardinality fields or fields without keyword mappings.`,
    schema: getApmCorrelationsSchema,
    tags: ['observability', 'apm', 'correlations', 'trace'],
    availability: {
      cacheMode: 'space',
      handler: async ({ request }) => {
        return getAgentBuilderResourceAvailability({ core, request, logger });
      },
    },
    handler: async (
      { start, end, kqlFilter, metric, percentileThreshold, fieldCandidates, limit },
      { esClient }
    ) => {
      try {
        const [, pluginStart] = await core.getStartServices();
        const license = await firstValueFrom(pluginStart.licensing.license$);
        if (!isActivePlatinumLicense(license)) {
          return {
            results: [
              {
                type: ToolResultType.error,
                data: {
                  message: INVALID_LICENSE,
                },
              },
            ],
          };
        }

        const result = await getToolHandler({
          core,
          plugins,
          logger,
          esClient,
          start,
          end,
          kqlFilter,
          metric,
          percentileThreshold,
          fieldCandidates,
          limit,
        });

        return {
          results: [{ type: ToolResultType.other, data: result }],
        };
      } catch (error) {
        logger.error(`Error getting APM correlations: ${error.message}`);
        logger.debug(error);

        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to get APM correlations: ${error.message}`,
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
