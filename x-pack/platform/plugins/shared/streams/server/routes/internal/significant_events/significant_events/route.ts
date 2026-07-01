/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type {
  SignificantEventsGetResponse,
  SignificantEventsWorkflowStatusResult,
  SignificantEventsQueriesGenerationResult,
  SignificantEventsQueriesGenerationTaskResult,
} from '@kbn/significant-events-schema';
import { TaskStatus, deriveQueryType } from '@kbn/streams-schema';
import { z } from '@kbn/zod/v4';
import { FeatureNotEnabledError } from '../../../../lib/streams/errors/feature_not_enabled_error';
import { BUCKET_SIZE_PATTERN } from '../../../../lib/significant_events/helpers/fill_bucket_gaps';
import { fetchQueryOccurrencesFromAlerts } from '../../../../lib/significant_events/fetch_query_occurrences_from_alerts';
import { STREAMS_API_PRIVILEGES } from '../../../../../common/constants';
import { searchModeSchema } from '../../../utils/search_mode';
import {
  getSignificantEventsQueriesGenerationTaskId,
  SIGNIFICANT_EVENTS_QUERIES_GENERATION_TASK_TYPE,
  type SignificantEventsQueriesGenerationTaskParams,
} from '../../../../lib/significant_events/tasks/significant_events_queries_generation';
import { taskActionSchema } from '../../../../lib/tasks/task_action_schema';
import { createServerRoute } from '../../../create_server_route';
import { assertSignificantEventsAccess } from '../../../utils/assert_significant_events_access';
import { handleTaskAction } from '../../../utils/task_helpers';

// Make sure strings are expected for input, but still converted to a
// Date, without breaking the OpenAPI generator
const dateFromString = z.string().transform((input) => new Date(input));

/**
 * Guards against stale task results from a previous Kibana version that stored
 * queries with `kql`/`feature` but without the now-required `esql.query` field.
 * Returns a failed status instead of letting the malformed payload reach the client.
 */
const sanitizeTaskResult = (
  result: SignificantEventsQueriesGenerationTaskResult
): SignificantEventsQueriesGenerationTaskResult => {
  if ('queries' in result && result.queries.some((q) => q.esql?.query === undefined)) {
    return { status: TaskStatus.Failed, error: 'Stale task result from a previous version.' };
  }
  if ('queries' in result) {
    return {
      ...result,
      queries: result.queries.map((q) => ({
        ...q,
        type: deriveQueryType(q.esql.query),
      })),
    };
  }
  return result;
};

/** @deprecated Use GET /internal/streams/{name}/onboarding/_status instead. Will be removed in a follow-up. */
const significantEventsQueriesGenerationStatusRoute = createServerRoute({
  endpoint: 'GET /internal/streams/{name}/significant_events/_status',
  params: z.object({
    path: z.object({ name: z.string().describe('The name of the stream') }),
  }),
  options: {
    access: 'internal',
    summary: 'Check the status of significant events query generation',
    description:
      'Significant events query generation happens as a background task, this endpoint allows the user to check the status of this task.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  handler: async ({
    params,
    request,
    getScopedClients,
    server,
  }): Promise<SignificantEventsQueriesGenerationTaskResult> => {
    const { licensing, uiSettingsClient, taskClient } = await getScopedClients({
      request,
    });

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const { name } = params.path;

    const result = await taskClient.getStatus<
      SignificantEventsQueriesGenerationTaskParams,
      SignificantEventsQueriesGenerationResult
    >(getSignificantEventsQueriesGenerationTaskId(name));

    return sanitizeTaskResult(result);
  },
});

/** @deprecated Use POST /internal/streams/{name}/onboarding/_execute instead. Will be removed in a follow-up. */
const significantEventsQueriesGenerationTaskRoute = createServerRoute({
  endpoint: 'POST /internal/streams/{name}/significant_events/_task',
  params: z.object({
    path: z.object({ name: z.string().describe('The name of the stream') }),
    body: taskActionSchema({
      from: dateFromString.describe('Start of the time range'),
      to: dateFromString.describe('End of the time range'),
    }),
  }),
  options: {
    access: 'internal',
    summary: 'Manage significant events query generation task',
    description:
      'Manage the lifecycle of the background task that generates significant events queries based on the stream data.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  handler: async ({
    params,
    request,
    getScopedClients,
    server,
  }): Promise<SignificantEventsQueriesGenerationTaskResult> => {
    const { streamsClient, licensing, uiSettingsClient, taskClient } = await getScopedClients({
      request,
    });

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const { name } = params.path;
    await streamsClient.getStream(name);
    const { body } = params;
    const taskId = getSignificantEventsQueriesGenerationTaskId(name);

    const actionParams =
      body.action === 'schedule'
        ? ({
            action: body.action,
            scheduleConfig: {
              taskType: SIGNIFICANT_EVENTS_QUERIES_GENERATION_TASK_TYPE,
              taskId,
              params: {
                start: body.from.getTime(),
                end: body.to.getTime(),
                streamName: name,
              },
              request,
            },
          } as const)
        : ({ action: body.action } as const);

    const result = await handleTaskAction<
      SignificantEventsQueriesGenerationTaskParams,
      SignificantEventsQueriesGenerationResult
    >({
      taskClient,
      taskId,
      ...actionParams,
    });

    return sanitizeTaskResult(result);
  },
});

const readAllSignificantEventsRoute = createServerRoute({
  endpoint: 'GET /internal/streams/_significant_events',
  params: z.object({
    query: z.object({
      from: dateFromString.describe('Start of the time range'),
      to: dateFromString.describe('End of the time range'),
      bucketSize: z
        .string()
        .regex(BUCKET_SIZE_PATTERN)
        .describe('Size of time buckets for aggregation'),
      query: z.string().optional().describe('Query string to filter significant events queries'),
      streamNames: z
        .union([z.string().transform((val) => [val]), z.array(z.string())])
        .optional()
        .describe('Stream names to filter significant events'),
      searchMode: searchModeSchema,
    }),
  }),
  options: {
    access: 'internal',
    summary: 'Read all significant events',
    description: 'Read all significant events',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  handler: async ({
    params,
    request,
    getScopedClients,
    server,
  }): Promise<SignificantEventsGetResponse> => {
    const scopedClients = await getScopedClients({ request });
    const { scopedClusterClient, licensing, uiSettingsClient } = scopedClients;
    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const { from, to, bucketSize, query, streamNames, searchMode } = params.query;

    const [kiClient, { alertsReader }] = await Promise.all([
      scopedClients.getKnowledgeIndicatorClient(),
      scopedClients.getSignificantEventsAlertingContext(),
    ]);
    return fetchQueryOccurrencesFromAlerts(
      {
        from,
        to,
        bucketSize,
        query,
        streamNames,
        searchMode,
        alertsReader,
      },
      { kiClient, scopedClusterClient }
    );
  },
});

const significantEventsDiscoveryExecuteRoute = createServerRoute({
  endpoint: 'POST /internal/streams/significant_events/discovery/_execute',
  params: z.object({
    body: z.discriminatedUnion('action', [
      z.object({ action: z.literal('trigger') }),
      z.object({ action: z.literal('cancel') }),
    ]),
  }),
  options: {
    access: 'internal',
    summary: 'Manually trigger the Significant Events pipeline',
    description:
      'Executes the Significant Events orchestrator workflow for the current space. Runs detection, discovery, and triage in sequence.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  handler: async ({
    params,
    request,
    getScopedClients,
    workflowClients,
    getSpaceId,
    server,
    telemetry,
  }): Promise<{ executionId: string | null }> => {
    const { significantEventsDiscoveryClient } = workflowClients;
    if (!significantEventsDiscoveryClient) {
      throw new FeatureNotEnabledError(
        'Significant events discovery requires the workflows feature to be enabled'
      );
    }

    const { licensing, uiSettingsClient } = await getScopedClients({ request });

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const spaceId = await getSpaceId(request);
    const { body } = params;

    if (body.action === 'trigger') {
      const { executionId, isNew } = await significantEventsDiscoveryClient.run({
        request,
        spaceId,
      });
      if (isNew) {
        telemetry.trackSignificantEventsDiscoveryTriggered({
          execution_id: executionId,
          space_id: spaceId,
        });
      }
      return { executionId };
    }

    const executionId = await significantEventsDiscoveryClient.cancel({ request, spaceId });
    return { executionId };
  },
});

const significantEventsDiscoveryStatusRoute = createServerRoute({
  endpoint: 'GET /internal/streams/significant_events/discovery/_status',
  params: z.object({}),
  options: {
    access: 'internal',
    summary: 'Get the status of the Significant Events discovery pipeline',
    description:
      'Returns the status of the most recent Significant Events orchestrator workflow execution for the current space.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  handler: async ({
    request,
    getScopedClients,
    workflowClients,
    getSpaceId,
    server,
  }): Promise<SignificantEventsWorkflowStatusResult> => {
    const { significantEventsDiscoveryClient } = workflowClients;
    if (!significantEventsDiscoveryClient) {
      throw new FeatureNotEnabledError('Significant events discovery is not available');
    }
    const { licensing, uiSettingsClient } = await getScopedClients({ request });

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const spaceId = await getSpaceId(request);
    return significantEventsDiscoveryClient.getStatus({ spaceId });
  },
});

export const internalSignificantEventsRoutes = {
  ...significantEventsQueriesGenerationStatusRoute,
  ...significantEventsQueriesGenerationTaskRoute,
  ...readAllSignificantEventsRoute,
  ...significantEventsDiscoveryExecuteRoute,
  ...significantEventsDiscoveryStatusRoute,
};
