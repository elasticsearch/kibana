/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { createErrorResult } from '@kbn/agent-builder-server';
import type { ResolveMlCapabilities } from '@kbn/ml-common-types/capabilities';
import type { MlLicense } from '../../../common/license';
import type { MlAuthorizationService } from '../../lib/capabilities/check_capabilities';
import { hasMlCapabilitiesProvider } from '../../lib/capabilities/check_capabilities';
import { AD_CREATE_JOB_TOOL_ID } from './tool_ids';

const schema = z.object({
  operation: z.enum(['validate_spec', 'estimate_memory', 'create_job', 'create_datafeed']),
  job_id: z.string().optional().describe('Job ID. Required for create_job and create_datafeed.'),
  job_config: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Full job configuration body for create_job or validate_spec.'),
  datafeed_config: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Full datafeed configuration body for create_datafeed.'),
});

export const createAdCreateJobTool = (
  resolveMlCapabilities: ResolveMlCapabilities,
  authorization?: MlAuthorizationService,
  mlLicense?: MlLicense
): BuiltinToolDefinition<typeof schema> => ({
  id: AD_CREATE_JOB_TOOL_ID,
  type: ToolType.builtin,
  tags: ['ml', 'anomaly-detection'],
  description:
    'Create an ML anomaly detection job and its datafeed. Also validates a job spec or estimates memory requirement before creation.',
  schema,
  handler: async (
    { operation, job_id: jobId, job_config: jobConfig, datafeed_config: datafeedConfig },
    { esClient, request }
  ) => {
    const hasMlCapabilities = hasMlCapabilitiesProvider(
      resolveMlCapabilities,
      request,
      authorization,
      mlLicense
    );
    const ml = esClient.asCurrentUser.ml;

    try {
      switch (operation) {
        case 'validate_spec': {
          await hasMlCapabilities(['canGetJobs']);
          if (!jobConfig) {
            return {
              results: [createErrorResult('job_config is required for validate_spec')],
            };
          }
          const response = await ml.validate({ body: jobConfig as any });
          return { results: [{ type: ToolResultType.other, data: response }] };
        }

        case 'estimate_memory': {
          await hasMlCapabilities(['canGetJobs']);
          if (!jobConfig) {
            return {
              results: [createErrorResult('job_config is required for estimate_memory')],
            };
          }
          const response = await ml.estimateModelMemory({ body: jobConfig as any });
          return { results: [{ type: ToolResultType.other, data: response }] };
        }

        case 'create_job': {
          await hasMlCapabilities(['canCreateJob']);
          if (!jobId || !jobConfig) {
            return {
              results: [createErrorResult('job_id and job_config are required for create_job')],
            };
          }
          // @ts-expect-error job config is passed as body at runtime
          const response = await ml.putJob({
            job_id: jobId,
            body: jobConfig,
          });
          return { results: [{ type: ToolResultType.other, data: response }] };
        }

        case 'create_datafeed': {
          await hasMlCapabilities(['canCreateDatafeed']);
          const datafeedId = jobId ? `datafeed-${jobId}` : undefined;
          if (!datafeedId || !datafeedConfig) {
            return {
              results: [
                createErrorResult('job_id and datafeed_config are required for create_datafeed'),
              ],
            };
          }
          const response = await ml.putDatafeed({
            datafeed_id: datafeedId,
            body: datafeedConfig as any,
          });
          return { results: [{ type: ToolResultType.other, data: response }] };
        }

        default:
          return {
            results: [createErrorResult(`Unknown operation: ${operation}`)],
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        results: [createErrorResult(`Error executing ${operation}: ${message}`)],
      };
    }
  },
});
