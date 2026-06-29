/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { GenerateDescriptionResult, TaskResult } from '@kbn/streams-schema';
import {
  DESCRIPTION_GENERATION_TASK_TYPE,
  getDescriptionGenerationTaskId,
  type DescriptionGenerationTaskParams,
} from '../../../../lib/tasks/task_definitions/description_generation';
import { taskActionSchema } from '../../../../lib/tasks/task_action_schema';
import { resolveConnectorId } from '../../../utils/resolve_connector_id';
import { STREAMS_API_PRIVILEGES } from '../../../../../common/constants';
import { assertSignificantEventsAccess } from '../../../utils/assert_significant_events_access';
import { createServerRoute } from '../../../create_server_route';
import { handleTaskAction } from '../../../utils/task_helpers';

const dateFromString = z.string().transform((input) => new Date(input));

export type DescriptionGenerationTaskResult = TaskResult<GenerateDescriptionResult>;

export const descriptionGenerationStatusRoute = createServerRoute({
  endpoint: 'GET /internal/streams/{name}/_description_generation/_status',
  options: {
    access: 'internal',
    summary: 'Check the status of a stream description generation task',
    description:
      'Description generation happens as a background task, this endpoint allows the user to check the status of this task. This endpoint combines with POST /internal/streams/{name}/_description_generation/_task which manages the task lifecycle.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    path: z.object({ name: z.string() }),
  }),
  handler: async ({
    params,
    request,
    getScopedClients,
    server,
  }): Promise<DescriptionGenerationTaskResult> => {
    const { streamsClient, licensing, uiSettingsClient, taskClient } = await getScopedClients({
      request,
    });

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const {
      path: { name },
    } = params;

    await streamsClient.ensureStream(name);

    return taskClient.getStatus<DescriptionGenerationTaskParams, GenerateDescriptionResult>(
      getDescriptionGenerationTaskId(name)
    );
  },
});

export const descriptionGenerationTaskRoute = createServerRoute({
  endpoint: 'POST /internal/streams/{name}/_description_generation/_task',
  options: {
    access: 'internal',
    summary: 'Generate a stream description',
    description:
      'Generate a stream description based on data in the stream using an LLM, this happens as a background task and this endpoint manages the task lifecycle.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  params: z.object({
    path: z.object({ name: z.string() }),
    body: taskActionSchema({
      from: dateFromString,
      to: dateFromString,
      connectorId: z
        .string()
        .optional()
        .describe(
          'Optional connector ID. If not provided, the default AI connector from settings will be used.'
        ),
    }),
  }),
  handler: async ({
    params,
    request,
    getScopedClients,
    server,
    logger,
  }): Promise<DescriptionGenerationTaskResult> => {
    const { streamsClient, licensing, uiSettingsClient, taskClient } = await getScopedClients({
      request,
    });

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const {
      path: { name },
      body,
    } = params;

    await streamsClient.ensureStream(name);

    const taskId = getDescriptionGenerationTaskId(name);
    const actionParams =
      body.action === 'schedule'
        ? ({
            action: body.action,
            scheduleConfig: {
              taskType: DESCRIPTION_GENERATION_TASK_TYPE,
              taskId,
              streamName: name,
              params: await (async (): Promise<DescriptionGenerationTaskParams> => {
                const connectorId = await resolveConnectorId({
                  connectorId: body.connectorId,
                  uiSettingsClient,
                  logger,
                });
                return {
                  connectorId,
                  start: body.from.getTime(),
                  end: body.to.getTime(),
                  streamName: name,
                };
              })(),
              request,
            },
          } as const)
        : ({ action: body.action } as const);

    return handleTaskAction<DescriptionGenerationTaskParams, GenerateDescriptionResult>({
      taskClient,
      taskId,
      ...actionParams,
    });
  },
});

export const internalDescriptionGenerationRoutes = {
  ...descriptionGenerationStatusRoute,
  ...descriptionGenerationTaskRoute,
};
