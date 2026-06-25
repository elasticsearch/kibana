/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import path from 'path';
import { WorkflowsManagementApiActions } from '@kbn/workflows';
import type { RouteDependencies } from '../types';
import { API_VERSION, AVAILABILITY, OAS_TAG } from '../utils/route_constants';
import { handleRouteError } from '../utils/route_error_handlers';
import {
  canReadManagedWorkflowExecutions,
  hasWorkflowReadPrivilege,
  WORKFLOW_READ_OR_READ_EXECUTIONS_SECURITY,
} from '../utils/route_security';
import { withAvailabilityCheck } from '../utils/with_availability_check';

export function registerGetStatsRoute({ router, api, spaces }: RouteDependencies) {
  router.versioned
    .get({
      path: '/api/workflows/stats',
      access: 'public',
      security: WORKFLOW_READ_OR_READ_EXECUTIONS_SECURITY,
      summary: 'Get workflow statistics',
      description:
        'Retrieve summary statistics about workflows, including total, enabled, and disabled counts; execution history metrics for the last 30 days are included only when the caller has execution read privilege.',
      options: {
        tags: [OAS_TAG],
        availability: AVAILABILITY,
      },
    })
    .addVersion(
      {
        version: API_VERSION,
        options: {
          oasOperationObject: () => path.join(__dirname, '../examples/get_stats.yaml'),
        },
        validate: false,
      },
      withAvailabilityCheck(async (context, request, response) => {
        try {
          if (!hasWorkflowReadPrivilege(request)) {
            return response.forbidden();
          }
          const spaceId = spaces.getSpaceId(request);
          const includeExecutionStats =
            request.authzResult?.[WorkflowsManagementApiActions.readExecution] === true;
          const stats = await api.getWorkflowStats(spaceId, {
            includeExecutionStats,
            includeManagedExecutionStats: canReadManagedWorkflowExecutions(request),
          });
          return response.ok({ body: stats || {} });
        } catch (error) {
          return handleRouteError(response, error);
        }
      })
    );
}
