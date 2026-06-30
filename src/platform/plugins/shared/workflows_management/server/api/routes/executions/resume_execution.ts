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
import { WORKFLOW_EXECUTION_RESUME_SECURITY } from '../utils/route_security';
import { executionIdParamSchema } from '../utils/schemas';
import { withAvailabilityCheck } from '../utils/with_availability_check';

export function registerResumeExecutionRoute(deps: RouteDependencies) {
  const { router, api, spaces, audit } = deps;
  router.versioned
    .post({
      path: '/api/workflows/executions/{executionId}/resume',
      access: 'public',
      security: WORKFLOW_EXECUTION_RESUME_SECURITY,
      summary: 'Resume a workflow execution',
      description: 'Resume a paused workflow execution with the provided input.',
      options: {
        tags: [OAS_TAG],
        availability: AVAILABILITY,
      },
    })
    .addVersion(
      {
        version: API_VERSION,
        options: {
          oasOperationObject: () => path.join(__dirname, '../examples/resume_execution.yaml'),
        },
        validate: {
          request: {
            params: executionIdParamSchema,
            body: schema.object({
              input: schema.recordOf(schema.string(), schema.any(), {
                meta: { description: 'Input data to resume the execution with.' },
              }),
            }),
          },
        },
      },
      withAvailabilityCheck(async (context, request, response) => {
        try {
          const { executionId } = request.params;
          const { input } = request.body;
          const spaceId = spaces.getSpaceId(request);

          const { resumedBy } = await api.resumeWorkflowExecution(
            executionId,
            spaceId,
            input,
            request,
            { channel: 'kibana_execution_view' }
          );

          audit.logExecutionResumed(request, {
            executionId,
            resumedBy,
          });

          return response.ok({
            body: {
              success: true,
              executionId,
              message: 'Workflow resume scheduled',
            },
          });
        } catch (error) {
          audit.logExecutionResumed(request, {
            executionId: request.params.executionId,
            error,
          });
          return handleRouteError(response, error, { checkNotFound: true });
        }
      })
    );
}
