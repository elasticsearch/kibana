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
import { WORKFLOW_EXECUTION_CANCEL_SECURITY } from '../utils/route_security';
import { workflowIdParamSchema } from '../utils/schemas';
import { withAvailabilityCheck } from '../utils/with_availability_check';

export function registerCancelWorkflowExecutionsRoute({ router, api, spaces }: RouteDependencies) {
  router.versioned
    .post({
      path: '/api/workflows/workflow/{workflowId}/executions/cancel',
      access: 'public',
      security: WORKFLOW_EXECUTION_CANCEL_SECURITY,
      summary: 'Cancel all active workflow executions',
      description:
        'Request cancellation for all non-terminal executions of the given workflow in the current space.',
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
            path.join(__dirname, '../examples/cancel_workflow_executions.yaml'),
        },
        validate: {
          request: {
            params: workflowIdParamSchema,
          },
        },
      },
      withAvailabilityCheck(async (context, request, response) => {
        try {
          const { workflowId } = request.params;
          const spaceId = spaces.getSpaceId(request);
          await api.cancelAllActiveWorkflowExecutions(workflowId, spaceId, request);
          return response.ok();
        } catch (error) {
          return handleRouteError(response, error);
        }
      })
    );
}
