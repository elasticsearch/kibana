/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TasksTaskInfo } from '@elastic/elasticsearch/lib/api/types';
import {
  API_BASE_PATH,
  QUERY_ACTIVITY_READ_PRIVILEGE,
  QUERY_ACTIVITY_MIN_RUNNING_TIME_SETTING,
} from '../../common/constants';
import type { RouteOptions } from '.';
import { QUERY_TASK_ACTIONS, transformTaskSummaries } from '../lib/transform_tasks';
import { getErrorStatusCode, hasQueryActivityMonitorPrivilege } from '../lib/route_helpers';

// Elasticsearch includes task headers independently of `detailed`; that flag only gates the
// description and status fields.
const LIST_FILTER_PATH = [
  'tasks.node',
  'tasks.id',
  'tasks.action',
  'tasks.parent_task_id',
  'tasks.start_time_in_millis',
  'tasks.running_time_in_nanos',
  'tasks.cancellable',
  'tasks.cancelled',
  'tasks.headers',
];

export const registerSearchRoute = ({ router, logger }: RouteOptions) => {
  router.get(
    {
      path: `${API_BASE_PATH}/search`,
      security: {
        authz: {
          requiredPrivileges: [QUERY_ACTIVITY_READ_PRIVILEGE],
        },
      },
      validate: false,
      options: {
        access: 'internal',
      },
    },
    async (context, _request, response) => {
      try {
        const coreContext = await context.core;

        // In ESS, verify the user has the ES monitor cluster privilege before proceeding.
        // In Serverless, security?.hasPrivileges is absent so the check is silently skipped —
        // GET /_tasks is an internal-only API that requires operator-level access there,
        // and Kibana RBAC (requiredPrivileges above) is the authorization gate.
        const hasMonitorPrivilege = await hasQueryActivityMonitorPrivilege(
          coreContext.elasticsearch.client.asCurrentUser
        );
        if (!hasMonitorPrivilege) {
          return response.forbidden({
            body: { message: 'Insufficient privileges to view queries' },
          });
        }

        // asInternalUser is intentional: in Serverless, GET /_tasks is an internal-only API
        // that requires operator-level access. Kibana RBAC (requiredPrivileges above) is the
        // authorization gate; the pre-flight hasPrivileges check above enforces ES privileges in ESS.
        const esClient = coreContext.elasticsearch.client.asInternalUser;
        const minRunningTimeMs = await coreContext.uiSettings.client.get<number>(
          QUERY_ACTIVITY_MIN_RUNNING_TIME_SETTING
        );
        const thresholdNanos = minRunningTimeMs * 1_000_000;

        const result = await esClient.tasks.list({
          detailed: false,
          group_by: 'none',
          actions: [...QUERY_TASK_ACTIONS],
          filter_path: LIST_FILTER_PATH,
        });

        const queries = transformTaskSummaries(
          (result.tasks ?? []) as TasksTaskInfo[],
          thresholdNanos
        );

        return response.ok({ body: { queries } });
      } catch (error) {
        logger.error(`Failed to fetch query activity: ${error}`);
        return response.customError({
          statusCode: getErrorStatusCode(error) ?? 500,
          body: { message: 'Failed to fetch query activity' },
        });
      }
    }
  );
};
