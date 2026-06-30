/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType } from '@kbn/agent-builder-common';
import type { ErrorResult } from '@kbn/agent-builder-common/tools/tool_result';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { BuiltinToolDefinition, StaticToolRegistration } from '@kbn/agent-builder-server';
import type { Logger } from '@kbn/core/server';
import { getAgentBuilderResourceAvailability } from '../../utils/get_agent_builder_resource_availability';
import type {
  ObservabilityAgentBuilderCoreSetup,
  ObservabilityAgentBuilderPluginSetupDependencies,
} from '../../types';
import { timeRangeSchemaOptional } from '../../utils/tool_schemas';
import { MAX_KQL_FILTER_LENGTH, MAX_SHORT_STRING_LENGTH } from '../../utils/schema_limits';
import { getToolHandler } from './handler';

export const OBSERVABILITY_GET_ANOMALY_DETECTION_JOBS_TOOL_ID =
  'observability.get_anomaly_detection_jobs';

const DEFAULT_JOBS_LIMIT = 10;
const DEFAULT_ANOMALY_RECORDS_LIMIT = 10;
const DEFAULT_MIN_ANOMALY_SCORE = 50;
const DEFAULT_TIME_RANGE = {
  start: 'now-24h',
  end: 'now',
};

export interface GetAnomalyDetectionJobsToolResult {
  type: ToolResultType.other;
  data: {
    jobs: Awaited<ReturnType<typeof getToolHandler>>;
    total: number;
    message?: string;
  };
}

const getAnomalyDetectionJobsSchema = z.object({
  group: z
    .string()
    .max(MAX_SHORT_STRING_LENGTH)
    .optional()
    .describe('Filter jobs by ML job group name (e.g., "apm", "network").'),
  jobIds: z
    .array(z.string().min(1).max(MAX_SHORT_STRING_LENGTH))
    .min(1)
    .max(20)
    .optional()
    .describe('Specific ML job IDs to query. Omit to include all jobs in this space.'),
  jobsLimit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .default(DEFAULT_JOBS_LIMIT)
    .describe('Maximum number of jobs to return.'),
  anomalyRecordsLimit: z
    .number()
    .int()
    .min(0)
    .max(100)
    .default(DEFAULT_ANOMALY_RECORDS_LIMIT)
    .describe(
      'Maximum anomaly records to return per job. Set to 0 to skip anomaly records entirely.'
    ),
  minAnomalyScore: z
    .number()
    .min(0)
    .max(100)
    .default(DEFAULT_MIN_ANOMALY_SCORE)
    .describe(
      'Minimum anomaly score threshold (0-100). Higher scores indicate more severe anomalies. Default is 50 to filter noise.'
    ),
  includeExplanation: z
    .boolean()
    .default(false)
    .describe(
      'Include detailed anomaly score explanations. Disabled by default to reduce response size.'
    ),
  influencerFilter: z
    .string()
    .max(MAX_KQL_FILTER_LENGTH)
    .optional()
    .describe(
      'Filter anomalies by influencer fields using KQL syntax. Influencer fields are entity fields like service.name, host.name, kubernetes.pod.name, etc. Examples: \'service.name: "frontend"\', \'service.name: "frontend" AND host.name: "server-1"\', \'NOT host.name: "server-3"\'.'
    ),
  ...timeRangeSchemaOptional(DEFAULT_TIME_RANGE),
});

export function createGetAnomalyDetectionJobsTool({
  core,
  plugins,
  logger,
}: {
  core: ObservabilityAgentBuilderCoreSetup;
  plugins: ObservabilityAgentBuilderPluginSetupDependencies;
  logger: Logger;
}): StaticToolRegistration<typeof getAnomalyDetectionJobsSchema> {
  const toolDefinition: BuiltinToolDefinition<typeof getAnomalyDetectionJobsSchema> = {
    id: OBSERVABILITY_GET_ANOMALY_DETECTION_JOBS_TOOL_ID,
    type: ToolType.builtin,
    description: `Retrieves Machine Learning anomaly detection jobs and their top anomaly records.

When to use:
- Investigating anomalies in logs, metrics, or traces
- Finding outliers that might indicate problems
- Answering "is anything behaving abnormally?"`,
    schema: getAnomalyDetectionJobsSchema,
    tags: ['observability', 'machine_learning', 'anomaly_detection'],
    availability: {
      cacheMode: 'space',
      handler: async ({ request }) => {
        return getAgentBuilderResourceAvailability({ core, request, logger });
      },
    },
    handler: async (
      toolParams,
      { esClient, request }
    ): Promise<{
      results: (GetAnomalyDetectionJobsToolResult | Omit<ErrorResult, 'tool_result_id'>)[];
    }> => {
      const {
        group,
        jobIds,
        jobsLimit,
        anomalyRecordsLimit,
        minAnomalyScore,
        includeExplanation,
        influencerFilter,
        start: rangeStart,
        end: rangeEnd,
      } = toolParams;
      const scopedEsClient = esClient.asCurrentUser;
      const mlClient = scopedEsClient.ml;

      try {
        const mlJobs = await getToolHandler({
          core,
          plugins,
          mlClient,
          request,
          logger,
          group,
          jobIds,
          jobsLimit,
          anomalyRecordsLimit,
          minAnomalyScore,
          includeExplanation,
          influencerFilter,
          rangeStart,
          rangeEnd,
        });

        return {
          results: [
            {
              type: ToolResultType.other,
              data: {
                jobs: mlJobs,
                total: mlJobs.length,
              },
            },
          ],
        };
      } catch (error) {
        logger.error(`Error retrieving anomaly detection jobs: ${error.message}`);
        logger.debug(error);
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to retrieve anomaly detection jobs: ${error.message}`,
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
