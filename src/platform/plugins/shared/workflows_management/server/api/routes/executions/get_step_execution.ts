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
import { API_VERSION, AVAILABILITY, OAS_TAG } from '../utils/route_constants';
import { handleRouteError } from '../utils/route_error_handlers';
import {
  assertCanReadManagedWorkflowExecution,
  hasWorkflowExecutionReadPrivilege,
  WORKFLOW_EXECUTION_READ_WITH_MANAGED_SECURITY,
} from '../utils/route_security';
import { withAvailabilityCheck } from '../utils/with_availability_check';

export function registerGetStepExecutionRoute({ router, api, spaces }: RouteDependencies) {
  router.versioned
    .get({
      path: '/api/workflows/executions/{executionId}/step/{stepExecutionId}',
      access: 'public',
      security: WORKFLOW_EXECUTION_READ_WITH_MANAGED_SECURITY,
      summary: 'Get a step execution',
      description: 'Retrieve details of a single step execution within a workflow execution.',
      options: {
        tags: [OAS_TAG],
        availability: AVAILABILITY,
      },
    })
    .addVersion(
      {
        version: API_VERSION,
        options: {
          oasOperationObject: () => path.join(__dirname, '../examples/get_step_execution.yaml'),
        },
        validate: {
          request: {
            params: schema.object({
              executionId: schema.string({ meta: { description: 'Workflow execution ID.' } }),
              stepExecutionId: schema.string({ meta: { description: 'Step execution ID.' } }),
            }),
          },
        },
      },
      withAvailabilityCheck(async (context, request, response) => {
        try {
          if (!hasWorkflowExecutionReadPrivilege(request)) {
            return response.forbidden();
          }
          const { executionId, stepExecutionId } = request.params;
          const spaceId = spaces.getSpaceId(request);
          const workflowExecution = await api.getWorkflowExecution(executionId, spaceId);
          if (!workflowExecution) {
            return response.notFound();
          }
          assertCanReadManagedWorkflowExecution(request, workflowExecution);
          const stepExecution = await api.getStepExecution(
            { executionId, id: stepExecutionId },
            spaceId
          );
          if (!stepExecution) {
            return response.notFound();
          }
          return response.ok({ body: stepExecution });
        } catch (error) {
          return handleRouteError(response, error);
        }
      })
    );
}
