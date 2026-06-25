/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import path from 'path';
import type { RouteDependencies } from '../types';
import { API_VERSION, AVAILABILITY, OAS_TAG } from '../utils/route_constants';
import { handleRouteError } from '../utils/route_error_handlers';
import {
  assertCanReadManagedWorkflowExecution,
  hasWorkflowExecutionReadPrivilege,
  WORKFLOW_EXECUTION_READ_WITH_MANAGED_SECURITY,
} from '../utils/route_security';
import { executionIdParamSchema } from '../utils/schemas';
import { withAvailabilityCheck } from '../utils/with_availability_check';

export function registerGetChildrenExecutionsRoute({ router, api, spaces }: RouteDependencies) {
  router.versioned
    .get({
      path: '/api/workflows/executions/{executionId}/children',
      access: 'public',
      security: WORKFLOW_EXECUTION_READ_WITH_MANAGED_SECURITY,
      summary: 'Get child executions',
      description:
        'Retrieve child workflow executions spawned by sub-workflow steps within a parent execution.',
      options: {
        tags: [OAS_TAG],
        availability: AVAILABILITY,
      },
    })
    .addVersion(
      {
        version: API_VERSION,
        options: {
          oasOperationObject: () =>
            path.join(__dirname, '../examples/get_children_executions.yaml'),
        },
        validate: {
          request: {
            params: executionIdParamSchema,
          },
        },
      },
      withAvailabilityCheck(async (context, request, response) => {
        try {
          if (!hasWorkflowExecutionReadPrivilege(request)) {
            return response.forbidden();
          }
          const { executionId } = request.params;
          const spaceId = spaces.getSpaceId(request);
          const workflowExecution = await api.getWorkflowExecution(executionId, spaceId);
          if (!workflowExecution) {
            return response.notFound();
          }
          assertCanReadManagedWorkflowExecution(request, workflowExecution);
          const childExecutions = await api.getChildWorkflowExecutions(executionId, spaceId);
          return response.ok({ body: childExecutions });
        } catch (error) {
          const statusCode =
            error instanceof Error &&
            'meta' in error &&
            typeof (error as { meta?: { statusCode?: number } }).meta?.statusCode === 'number'
              ? (error as { meta: { statusCode: number } }).meta.statusCode
              : undefined;
          if (statusCode === 404) {
            return response.notFound();
          }
          return handleRouteError(response, error);
        }
      })
    );
}
