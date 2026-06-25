/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import path from 'path';
import { schema } from '@kbn/config-schema';
import type { RouteDependencies } from '../types';
import { API_VERSION, AVAILABILITY, MAX_PAGE_SIZE, OAS_TAG } from '../utils/route_constants';
import { handleRouteError } from '../utils/route_error_handlers';
import {
  assertCanReadManagedWorkflowExecution,
  hasWorkflowExecutionReadPrivilege,
  WORKFLOW_EXECUTION_READ_WITH_MANAGED_SECURITY,
} from '../utils/route_security';
import { executionIdParamSchema } from '../utils/schemas';
import { withAvailabilityCheck } from '../utils/with_availability_check';

export function registerGetExecutionLogsRoute({ router, api, spaces }: RouteDependencies) {
  router.versioned
    .get({
      path: '/api/workflows/executions/{executionId}/logs',
      access: 'public',
      security: WORKFLOW_EXECUTION_READ_WITH_MANAGED_SECURITY,
      summary: 'Get execution logs',
      description:
        'Retrieve paginated logs for a workflow execution. Optionally filter by a specific step execution.',
      options: {
        tags: [OAS_TAG],
        availability: AVAILABILITY,
      },
    })
    .addVersion(
      {
        version: API_VERSION,
        options: {
          oasOperationObject: () => path.join(__dirname, '../examples/get_execution_logs.yaml'),
        },
        validate: {
          request: {
            params: executionIdParamSchema,
            query: schema.object({
              stepExecutionId: schema.maybe(
                schema.string({
                  meta: { description: 'Filter logs by a specific step execution ID.' },
                })
              ),
              size: schema.number({
                min: 1,
                max: MAX_PAGE_SIZE,
                defaultValue: 100,
                meta: { description: 'Number of log entries per page.' },
              }),
              page: schema.number({
                min: 1,
                defaultValue: 1,
                meta: { description: 'Page number.' },
              }),
              sortField: schema.maybe(
                schema.string({ meta: { description: 'Field to sort by.' } })
              ),
              sortOrder: schema.maybe(
                schema.oneOf([schema.literal('asc'), schema.literal('desc')], {
                  meta: { description: 'Sort order.' },
                })
              ),
            }),
          },
        },
      },
      withAvailabilityCheck(async (context, request, response) => {
        try {
          if (!hasWorkflowExecutionReadPrivilege(request)) {
            return response.forbidden();
          }
          const { executionId } = request.params;
          const { size, page, sortField, sortOrder, stepExecutionId } = request.query;
          const spaceId = spaces.getSpaceId(request);
          const workflowExecution = await api.getWorkflowExecution(executionId, spaceId);
          if (!workflowExecution) {
            return response.notFound();
          }
          assertCanReadManagedWorkflowExecution(request, workflowExecution);

          const logs = await api.getWorkflowExecutionLogs({
            executionId,
            spaceId,
            size,
            page,
            sortField,
            sortOrder,
            stepExecutionId,
          });

          return response.ok({ body: logs });
        } catch (error) {
          return handleRouteError(response, error);
        }
      })
    );
}
