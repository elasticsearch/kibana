/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { API_BASE_PATH, QUERY_ACTIVITY_READ_PRIVILEGE } from '../../common/constants';
import { getErrorStatusCode, hasQueryActivityMonitorPrivilege } from '../lib/route_helpers';
import { transformTasks } from '../lib/transform_tasks';
import type { RouteOptions } from '.';

const TASK_GET_FIELD_PROJECTION = [
  'completed',
  'task.node',
  'task.id',
  'task.action',
  'task.description',
  'task.start_time_in_millis',
  'task.running_time_in_nanos',
  'task.cancellable',
  'task.cancelled',
  'task.headers',
  'task.parent_task_id',
];

export const registerDetailsRoute = ({ router, logger }: RouteOptions) => {
  router.get(
    {
      path: `${API_BASE_PATH}/queries/{taskId}`,
      security: {
        authz: {
          requiredPrivileges: [QUERY_ACTIVITY_READ_PRIVILEGE],
        },
      },
      validate: {
        params: schema.object({
          taskId: schema.string({ minLength: 1, maxLength: 1000 }),
        }),
      },
      options: {
        access: 'internal',
      },
    },
    async (context, request, response) => {
      const notFound = () =>
        response.notFound({
          body: {
            message: 'Query not found or already completed',
            attributes: {
              code: 'QUERY_NOT_FOUND',
            },
          },
        });

      try {
        const coreContext = await context.core;
        const hasMonitorPrivilege = await hasQueryActivityMonitorPrivilege(
          coreContext.elasticsearch.client.asCurrentUser
        );
        if (!hasMonitorPrivilege) {
          return response.forbidden({
            body: { message: 'Insufficient privileges to view queries' },
          });
        }

        const esClient = coreContext.elasticsearch.client.asInternalUser;
        const result = await esClient.tasks.get({
          task_id: request.params.taskId,
          wait_for_completion: false,
          filter_path: TASK_GET_FIELD_PROJECTION,
        });

        if (result.completed) {
          return notFound();
        }

        // The task was selected from the threshold-filtered list, so do not reapply a potentially
        // changed minimum runtime while loading its details.
        const [query] = transformTasks(result.task ? [result.task] : [], 0);
        if (!query) {
          return notFound();
        }

        return response.ok({ body: { query } });
      } catch (error) {
        if (getErrorStatusCode(error) === 404) {
          return notFound();
        }

        logger.error(`Failed to fetch query activity task "${request.params.taskId}": ${error}`);
        return response.customError({
          statusCode: getErrorStatusCode(error) ?? 500,
          body: { message: 'Failed to fetch query details' },
        });
      }
    }
  );
};
