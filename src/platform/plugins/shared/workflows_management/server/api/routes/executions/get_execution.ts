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
import { executionIdParamSchema } from '../utils/schemas';
import { withAvailabilityCheck } from '../utils/with_availability_check';

export function registerGetExecutionRoute({ router, api, spaces }: RouteDependencies) {
  router.versioned
    .get({
      path: '/api/workflows/executions/{executionId}',
      access: 'public',
      security: WORKFLOW_EXECUTION_READ_WITH_MANAGED_SECURITY,
      summary: 'Get a workflow execution',
      description: 'Retrieve details of a single workflow execution by its ID.',
      options: {
        tags: [OAS_TAG],
        availability: AVAILABILITY,
      },
    })
    .addVersion(
      {
        version: API_VERSION,
        options: {
          oasOperationObject: () => path.join(__dirname, '../examples/get_execution.yaml'),
        },
        validate: {
          request: {
            params: executionIdParamSchema,
            query: schema.object({
              includeInput: schema.boolean({
                defaultValue: false,
                meta: { description: 'Include execution input data.' },
              }),
              includeOutput: schema.boolean({
                defaultValue: false,
                meta: { description: 'Include execution output data.' },
              }),
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
          const { includeInput, includeOutput } = request.query;
          const spaceId = spaces.getSpaceId(request);
          const workflowExecution = await api.getWorkflowExecution(executionId, spaceId, {
            includeInput,
            includeOutput,
          });
          if (!workflowExecution) {
            return response.notFound();
          }
          assertCanReadManagedWorkflowExecution(request, workflowExecution);
          return response.ok({ body: workflowExecution });
        } catch (error) {
          return handleRouteError(response, error);
        }
      })
    );
}
