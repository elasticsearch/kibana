/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';
import { createErrorResult } from '@kbn/agent-builder-server';
import type { ResolveMlCapabilities } from '@kbn/ml-common-types/capabilities';
import type { MlLicense } from '../../../common/license';
import type { MlFeatures } from '../../../common/constants/app';
import type { MlAuthorizationService } from '../../lib/capabilities/check_capabilities';
import { hasMlCapabilitiesProvider } from '../../lib/capabilities/check_capabilities';
import type { BuildMlClientFn } from '../ml_client_factory';
import { AD_MANAGE_JOB_STATE_TOOL_ID } from './tool_ids';

/** Groups that mark a scratch job created by the agent builder. */
const SCRATCH_GROUP = 'ml-agent-scratch';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Terminal datafeed states: the lookback run has finished (or failed). */
const TERMINAL_DATAFEED_STATES = new Set(['stopped', 'failed']);
const FAILED_JOB_STATE = 'failed';
const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_SECONDS_CAP = 600;

const clampWaitSeconds = (maxWaitSeconds: number): number => {
  if (!Number.isFinite(maxWaitSeconds)) {
    return 120;
  }
  return Math.min(Math.max(maxWaitSeconds, 0), MAX_WAIT_SECONDS_CAP);
};

const computeProgressPct = (
  latestRecordTimestamp: number | undefined,
  startMs: number | undefined,
  endMs: number | undefined
): number | undefined => {
  if (startMs === undefined || endMs === undefined || endMs <= startMs) {
    return undefined;
  }
  if (typeof latestRecordTimestamp !== 'number') {
    return 0;
  }
  const raw = (latestRecordTimestamp - startMs) / (endMs - startMs);
  return Math.max(0, Math.min(100, Math.round(raw * 100)));
};

const schema = z.object({
  operation: z.enum([
    'open_job',
    'close_job',
    'start_datafeed',
    'stop_datafeed',
    'revert_model_snapshot',
    'preview_datafeed',
    'delete_job',
    'await_batch_completion',
  ]),
  job_id: z.string().describe('The anomaly detection job ID.'),
  snapshot_id: z
    .string()
    .optional()
    .describe('Model snapshot ID. Required for revert_model_snapshot.'),
  start: z
    .string()
    .optional()
    .describe('Start time for start_datafeed (ISO 8601). Omit for real-time datafeed.'),
  end: z
    .string()
    .optional()
    .describe('End time for start_datafeed (ISO 8601). Omit for open-ended.'),
  allow_non_scratch: z
    .boolean()
    .optional()
    .describe(
      'For delete_job: allow deleting a job not in the ml-agent-scratch group. Default false.'
    ),
  delete_user_annotations: z
    .boolean()
    .optional()
    .describe('For delete_job: also delete user annotations. Default true.'),
  max_wait_seconds: z
    .number()
    .optional()
    .describe(
      'For await_batch_completion: maximum seconds to block. Default 120, hard cap 600. Returns timed_out if the datafeed has not stopped by then. Call again to extend the wait.'
    ),
  datafeed_start_ms: z
    .number()
    .optional()
    .describe(
      'For await_batch_completion: epoch ms the datafeed was started from — used to compute progress_pct.'
    ),
  datafeed_end_ms: z
    .number()
    .optional()
    .describe(
      'For await_batch_completion: epoch ms the datafeed was started to — used to compute progress_pct.'
    ),
});

export const createAdManageJobStateTool = (
  resolveMlCapabilities: ResolveMlCapabilities,
  authorization?: MlAuthorizationService,
  mlLicense?: MlLicense,
  enabledFeatures?: MlFeatures,
  buildMlClient?: BuildMlClientFn
): BuiltinSkillBoundedTool<typeof schema> => ({
  id: AD_MANAGE_JOB_STATE_TOOL_ID,
  type: ToolType.builtin,
  description:
    'Change ML job and datafeed state: open/close job, start/stop datafeed, revert to a model snapshot, preview a datafeed, delete a scratch job, or block until a batch datafeed run completes.',
  experimental: true,
  schema,
  handler: async (
    {
      operation,
      job_id: jobId,
      snapshot_id: snapshotId,
      start,
      end,
      allow_non_scratch: allowNonScratch,
      delete_user_annotations: deleteUserAnnotations = true,
      max_wait_seconds: maxWaitSeconds = 120,
      datafeed_start_ms: datafeedStartMs,
      datafeed_end_ms: datafeedEndMs,
    },
    { esClient, savedObjectsClient, request, events }
  ) => {
    const hasMlCapabilities = hasMlCapabilitiesProvider(
      resolveMlCapabilities,
      request,
      authorization,
      mlLicense,
      enabledFeatures
    );
    const ml = esClient.asCurrentUser.ml;
    const datafeedId = `datafeed-${jobId}`;
    const mlClient = buildMlClient?.(esClient, savedObjectsClient, request);

    try {
      switch (operation) {
        case 'open_job': {
          await hasMlCapabilities(['canOpenJob']);
          if (mlClient) {
            const response = await mlClient.openJob({ job_id: jobId });
            return { results: [{ type: ToolResultType.other, data: response }] };
          }
          const response = await ml.openJob({ job_id: jobId });
          return { results: [{ type: ToolResultType.other, data: response }] };
        }

        case 'close_job': {
          await hasMlCapabilities(['canCloseJob']);
          if (mlClient) {
            const response = await mlClient.closeJob({ job_id: jobId });
            return { results: [{ type: ToolResultType.other, data: response }] };
          }
          const response = await ml.closeJob({ job_id: jobId });
          return { results: [{ type: ToolResultType.other, data: response }] };
        }

        case 'start_datafeed': {
          await hasMlCapabilities(['canStartStopDatafeed']);
          const body: Record<string, unknown> = {};
          if (start) body.start = start;
          if (end) body.end = end;
          if (mlClient) {
            const response = await mlClient.startDatafeed({
              datafeed_id: datafeedId,
              body: body as any,
            });
            return { results: [{ type: ToolResultType.other, data: response }] };
          }
          const response = await ml.startDatafeed({ datafeed_id: datafeedId, body: body as any });
          return { results: [{ type: ToolResultType.other, data: response }] };
        }

        case 'stop_datafeed': {
          await hasMlCapabilities(['canStartStopDatafeed']);
          if (mlClient) {
            const response = await mlClient.stopDatafeed({ datafeed_id: datafeedId });
            return { results: [{ type: ToolResultType.other, data: response }] };
          }
          const response = await ml.stopDatafeed({ datafeed_id: datafeedId });
          return { results: [{ type: ToolResultType.other, data: response }] };
        }

        case 'revert_model_snapshot': {
          await hasMlCapabilities(['canUpdateJob']);
          if (!snapshotId) {
            return {
              results: [createErrorResult('snapshot_id is required for revert_model_snapshot')],
            };
          }
          if (mlClient) {
            const response = await mlClient.revertModelSnapshot({
              job_id: jobId,
              snapshot_id: snapshotId,
            });
            return { results: [{ type: ToolResultType.other, data: response }] };
          }
          const response = await ml.revertModelSnapshot({
            job_id: jobId,
            snapshot_id: snapshotId,
          });
          return { results: [{ type: ToolResultType.other, data: response }] };
        }

        case 'preview_datafeed': {
          await hasMlCapabilities(['canPreviewDatafeed']);
          const response = await ml.previewDatafeed({ datafeed_id: datafeedId });
          return { results: [{ type: ToolResultType.other, data: response }] };
        }

        case 'delete_job': {
          await hasMlCapabilities(['canDeleteJob']);

          // Use mlClient when available so that saved-object lifecycle hooks run,
          // keeping the ML UI in sync after deletion.
          // "Scratch" jobs are temporary batch jobs created for the user to initially preview/confirm configurations with historical data
          // before creating a permanent job, real time job
          // So in specific operations, we only want agent to only be able to delete these temporary "scratch" jobs
          const jobApi = mlClient ?? ml;
          if (!allowNonScratch) {
            const jobInfo = await jobApi.getJobs({ job_id: jobId });
            const job = jobInfo.jobs?.[0];
            const groups: string[] = Array.isArray(job?.groups) ? job.groups : [];
            if (!groups.includes(SCRATCH_GROUP)) {
              return {
                results: [
                  createErrorResult(
                    `Job "${jobId}" is not in the "${SCRATCH_GROUP}" group. Only scratch jobs may be deleted. Pass allow_non_scratch: true to override.`
                  ),
                ],
              };
            }
          }

          // Stop datafeed (ignore 404 — may already be stopped or never created)
          try {
            await jobApi.stopDatafeed({ datafeed_id: datafeedId, body: { force: true } as any });
          } catch {
            // datafeed not running or does not exist — proceed
          }

          // Delete datafeed (ignore 404)
          try {
            await jobApi.deleteDatafeed({ datafeed_id: datafeedId });
          } catch {
            // datafeed does not exist — proceed
          }

          // Delete the job; mlClient enforces space-scoping and audit logging
          const response = await jobApi.deleteJob({
            job_id: jobId,
            delete_user_annotations: deleteUserAnnotations,
          });
          return { results: [{ type: ToolResultType.other, data: response }] };
        }

        case 'await_batch_completion': {
          await hasMlCapabilities(['canGetJobs']);
          const waitSeconds = clampWaitSeconds(maxWaitSeconds);
          const deadlineMs = Date.now() + waitSeconds * 1000;
          const statsApi = mlClient ?? ml;

          while (true) {
            const [datafeedStats, jobStats] = await Promise.all([
              statsApi.getDatafeedStats({ datafeed_id: datafeedId }),
              statsApi.getJobStats({ job_id: jobId }),
            ]);

            const datafeedState: string | undefined = datafeedStats.datafeeds?.[0]?.state;
            const job = jobStats.jobs?.[0];
            const jobState: string | undefined = job?.state;
            const latestRecordTimestamp: number | undefined =
              job?.data_counts?.latest_record_timestamp;

            let progressPct = computeProgressPct(
              latestRecordTimestamp,
              datafeedStartMs,
              datafeedEndMs
            );
            const datafeedDone =
              datafeedState !== undefined && TERMINAL_DATAFEED_STATES.has(datafeedState);
            const jobFailed = jobState === FAILED_JOB_STATE;

            if (datafeedDone && progressPct !== undefined) {
              progressPct = 100;
            } else if (progressPct === 100 && !datafeedDone) {
              progressPct = 99;
            }

            const progressLabel =
              progressPct !== undefined ? `${progressPct}%` : datafeedState ?? 'unknown';
            events?.reportProgress(`Waiting for batch datafeed to complete (${progressLabel})`, {
              metadata: {
                datafeed_state: datafeedState ?? 'unknown',
                ...(progressPct !== undefined ? { progress_pct: String(progressPct) } : {}),
              },
            });

            if (jobFailed) {
              return {
                results: [
                  {
                    type: ToolResultType.other,
                    data: {
                      status: 'failed',
                      job_id: jobId,
                      datafeed_id: datafeedId,
                      datafeed_state: datafeedState,
                      job_state: jobState,
                      progress_pct: progressPct,
                    },
                  },
                ],
              };
            }

            if (datafeedDone) {
              return {
                results: [
                  {
                    type: ToolResultType.other,
                    data: {
                      status: 'completed',
                      job_id: jobId,
                      datafeed_id: datafeedId,
                      datafeed_state: datafeedState,
                      job_state: jobState,
                      progress_pct: progressPct ?? 100,
                    },
                  },
                ],
              };
            }

            if (Date.now() >= deadlineMs) {
              return {
                results: [
                  {
                    type: ToolResultType.other,
                    data: {
                      status: 'timed_out',
                      job_id: jobId,
                      datafeed_id: datafeedId,
                      datafeed_state: datafeedState,
                      job_state: jobState,
                      progress_pct: progressPct,
                      message:
                        'Batch datafeed has not completed yet. Call await_batch_completion again to extend the wait.',
                    },
                  },
                ],
              };
            }

            await sleep(POLL_INTERVAL_MS);
          }
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
