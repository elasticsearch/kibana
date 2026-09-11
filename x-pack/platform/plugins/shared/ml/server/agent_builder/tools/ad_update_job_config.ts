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
import { AD_UPDATE_JOB_CONFIG_TOOL_ID } from './tool_ids';

const calendarEventSchema = z.object({
  start_time: z.string().describe('ISO 8601 start time.'),
  end_time: z.string().describe('ISO 8601 end time.'),
  description: z.string().describe('Description of the scheduled event.'),
});

type CalendarEventInput = z.infer<typeof calendarEventSchema>;

const delayedDataCheckSchema = z.object({
  enabled: z.boolean(),
  check_window: z.string().optional().describe('Duration string, e.g. "2h".'),
});

const schema = z.object({
  operation: z.enum([
    'update_memory_limit',
    'update_query_delay',
    'update_delayed_data_check',
    'create_calendar_event',
  ]),
  job_id: z
    .string()
    .optional()
    .describe(
      'Required for update_* operations (or pass job_ids with exactly one entry). For create_calendar_event, prefer job_ids when attaching multiple jobs to one calendar. If omitted and job_ids has one entry, that entry is used as job_id.'
    ),
  job_ids: z
    .array(z.string())
    .optional()
    .describe(
      'For create_calendar_event: all job IDs that should share this calendar. Pass every job in one call so events are created once. A single-entry array is treated as job_id. Empty array with no job_id is an error.'
    ),
  memory_limit: z
    .string()
    .optional()
    .describe('Required for update_memory_limit. New model memory limit, e.g. "512mb".'),
  query_delay: z
    .string()
    .optional()
    .describe('Required for update_query_delay. New datafeed query delay, e.g. "120s".'),
  delayed_data_check: delayedDataCheckSchema
    .optional()
    .describe('Required for update_delayed_data_check.'),
  calendar_event: calendarEventSchema
    .optional()
    .describe(
      'Single event for create_calendar_event. Prefer calendar_events when adding multiple events.'
    ),
  calendar_events: z
    .array(calendarEventSchema)
    .optional()
    .describe(
      'Required for create_calendar_event (or provide calendar_event). One or more scheduled events to add.'
    ),
  calendar_id: z
    .string()
    .optional()
    .describe(
      'Optional for create_calendar_event. Calendar ID to create or update. Defaults to "calendar-{first_job_id}".'
    ),
});

const isAlreadyExistsError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const error = err as { statusCode?: number; meta?: { statusCode?: number }; message?: string };
  const statusCode = error.statusCode ?? error.meta?.statusCode;
  if (statusCode === 409) {
    return true;
  }
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return (
    message.includes('resource_already_exists_exception') || message.includes('already exists')
  );
};

const toEpochMs = (value: string | number | Date): number => {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'number') {
    return value;
  }
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  return Date.parse(trimmed);
};

interface CalendarEventTimeFields {
  description: string;
  start_time: string | number | Date;
  end_time: string | number | Date;
}

const isSameCalendarEvent = (
  left: CalendarEventTimeFields,
  right: CalendarEventTimeFields
): boolean =>
  left.description === right.description &&
  toEpochMs(left.start_time) === toEpochMs(right.start_time) &&
  toEpochMs(left.end_time) === toEpochMs(right.end_time);

/**
 * Resolves job identifiers from job_id and/or job_ids.
 * - If jobIds.length === 1 and jobId is missing, jobId is inferred as jobIds[0].
 * - If jobId is missing and jobIds is empty/missing, returns an error.
 */
const resolveJobIdentifiers = (
  jobId?: string,
  jobIds?: string[]
): { jobId: string; jobIds: string[] } | { error: string } => {
  const inputJobIds = jobIds ?? [];

  if (!jobId && inputJobIds.length === 0) {
    return { error: 'job_id or job_ids is required' };
  }

  const resolvedJobId = jobId ?? (inputJobIds.length === 1 ? inputJobIds[0] : undefined);
  const uniqueJobIds = [...new Set([...(resolvedJobId ? [resolvedJobId] : []), ...inputJobIds])];

  return {
    // Primary job for defaults / single-job ops: explicit jobId, else sole jobIds entry, else first.
    jobId: resolvedJobId ?? uniqueJobIds[0],
    jobIds: uniqueJobIds,
  };
};

const filterNewCalendarEvents = (
  requested: CalendarEventInput[],
  existing: Array<{
    description?: string;
    start_time?: string | number | Date;
    end_time?: string | number | Date;
  }>
): CalendarEventInput[] =>
  requested.filter(
    (event) =>
      !existing.some(
        (existingEvent) =>
          existingEvent.description !== undefined &&
          existingEvent.start_time !== undefined &&
          existingEvent.end_time !== undefined &&
          isSameCalendarEvent(event, {
            description: existingEvent.description,
            start_time: existingEvent.start_time,
            end_time: existingEvent.end_time,
          })
      )
  );

export const createAdUpdateJobConfigTool = (
  resolveMlCapabilities: ResolveMlCapabilities,
  authorization?: MlAuthorizationService,
  mlLicense?: MlLicense,
  enabledFeatures?: MlFeatures,
  buildMlClient?: BuildMlClientFn
): BuiltinSkillBoundedTool<typeof schema> => ({
  id: AD_UPDATE_JOB_CONFIG_TOOL_ID,
  type: ToolType.builtin,
  description:
    'Update ML job config: memory limit, datafeed query_delay, delayed data check config, or create a calendar event. For create_calendar_event: ensures the calendar exists (PUT), posts only missing events, then associates all job_ids with the calendar. Pass every job that should share the calendar in one call.',
  experimental: true,
  schema,
  handler: async (
    {
      operation,
      job_id: jobId,
      job_ids: jobIdsInput,
      memory_limit,
      query_delay,
      delayed_data_check,
      calendar_event,
      calendar_events,
      calendar_id,
    },
    { esClient, savedObjectsClient, request }
  ) => {
    const hasMlCapabilities = hasMlCapabilitiesProvider(
      resolveMlCapabilities,
      request,
      authorization,
      mlLicense,
      enabledFeatures
    );
    const ml = esClient.asCurrentUser.ml;
    const mlClient = buildMlClient?.(esClient, savedObjectsClient, request);

    try {
      switch (operation) {
        case 'update_memory_limit': {
          const resolved = resolveJobIdentifiers(jobId, jobIdsInput);
          if ('error' in resolved) {
            return {
              results: [createErrorResult('job_id is required for update_memory_limit')],
            };
          }
          if (resolved.jobIds.length > 1) {
            return {
              results: [
                createErrorResult(
                  'update_memory_limit accepts a single job_id (or job_ids with exactly one entry)'
                ),
              ],
            };
          }
          await hasMlCapabilities(['canUpdateJob']);
          if (mlClient) {
            const response = await mlClient.updateJob({
              job_id: resolved.jobId,
              body: { analysis_limits: { model_memory_limit: memory_limit } } as any,
            });
            return { results: [{ type: ToolResultType.other, data: response }] };
          }
          const response = await ml.updateJob({
            job_id: resolved.jobId,
            body: { analysis_limits: { model_memory_limit: memory_limit } } as any,
          });
          return { results: [{ type: ToolResultType.other, data: response }] };
        }

        case 'update_query_delay': {
          const resolved = resolveJobIdentifiers(jobId, jobIdsInput);
          if ('error' in resolved) {
            return {
              results: [createErrorResult('job_id is required for update_query_delay')],
            };
          }
          if (resolved.jobIds.length > 1) {
            return {
              results: [
                createErrorResult(
                  'update_query_delay accepts a single job_id (or job_ids with exactly one entry)'
                ),
              ],
            };
          }
          await hasMlCapabilities(['canUpdateDatafeed']);
          if (mlClient) {
            const response = await mlClient.updateDatafeed({
              datafeed_id: `datafeed-${resolved.jobId}`,
              body: { query_delay } as any,
            });
            return { results: [{ type: ToolResultType.other, data: response }] };
          }
          const response = await ml.updateDatafeed({
            datafeed_id: `datafeed-${resolved.jobId}`,
            body: { query_delay } as any,
          });
          return { results: [{ type: ToolResultType.other, data: response }] };
        }

        case 'update_delayed_data_check': {
          const resolved = resolveJobIdentifiers(jobId, jobIdsInput);
          if ('error' in resolved) {
            return {
              results: [createErrorResult('job_id is required for update_delayed_data_check')],
            };
          }
          if (resolved.jobIds.length > 1) {
            return {
              results: [
                createErrorResult(
                  'update_delayed_data_check accepts a single job_id (or job_ids with exactly one entry)'
                ),
              ],
            };
          }
          await hasMlCapabilities(['canUpdateDatafeed']);
          if (mlClient) {
            const response = await mlClient.updateDatafeed({
              datafeed_id: `datafeed-${resolved.jobId}`,
              body: { delayed_data_check_config: delayed_data_check } as any,
            });
            return { results: [{ type: ToolResultType.other, data: response }] };
          }
          const response = await ml.updateDatafeed({
            datafeed_id: `datafeed-${resolved.jobId}`,
            body: { delayed_data_check_config: delayed_data_check } as any,
          });
          return { results: [{ type: ToolResultType.other, data: response }] };
        }

        case 'create_calendar_event': {
          await hasMlCapabilities(['canCreateCalendar']);
          const resolved = resolveJobIdentifiers(jobId, jobIdsInput);
          if ('error' in resolved) {
            return {
              results: [
                createErrorResult('job_id or job_ids is required for create_calendar_event'),
              ],
            };
          }
          const { jobId: primaryJobId, jobIds } = resolved;
          const events = calendar_events ?? (calendar_event ? [calendar_event] : undefined);
          if (!events?.length) {
            return {
              results: [
                createErrorResult(
                  'calendar_events (or calendar_event) is required for create_calendar_event'
                ),
              ],
            };
          }
          const calendarId = calendar_id ?? `calendar-${primaryJobId}`;

          // 1. Ensure calendar exists with all jobs attached.
          let calendarCreated = true;
          try {
            await ml.putCalendar({
              calendar_id: calendarId,
              job_ids: jobIds,
            });
          } catch (err) {
            if (!isAlreadyExistsError(err)) {
              throw err;
            }
            calendarCreated = false;
            // Attach every job in one request (comma-separated).
            await ml.putCalendarJob({
              calendar_id: calendarId,
              job_id: jobIds.join(','),
            });
          }

          // 2. Post only events that are not already on the calendar (shared across jobs).
          const { events: existingEvents } = await ml.getCalendarEvents({
            calendar_id: calendarId,
          });
          const eventsToAdd = filterNewCalendarEvents(events, existingEvents ?? []);
          const response =
            eventsToAdd.length > 0
              ? await ml.postCalendarEvents({
                  calendar_id: calendarId,
                  events: eventsToAdd,
                })
              : { events: [] };

          return {
            results: [
              {
                type: ToolResultType.other,
                data: {
                  calendar_id: calendarId,
                  calendar_created: calendarCreated,
                  job_id: primaryJobId,
                  job_ids: jobIds,
                  events_requested: events.length,
                  events_added: eventsToAdd.length,
                  events_skipped_existing: events.length - eventsToAdd.length,
                  ...response,
                },
              },
            ],
          };
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
