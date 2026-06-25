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
  assertCanReadManagedWorkflow,
  hasWorkflowReadPrivilege,
  WORKFLOW_READ_WITH_MANAGED_SECURITY,
} from '../utils/route_security';
import { idParamSchema } from '../utils/schemas';
import { withAvailabilityCheck } from '../utils/with_availability_check';

export function registerGetWorkflowRoute(deps: RouteDependencies) {
  const { router, api, spaces, audit } = deps;
  router.versioned
    .get({
      path: '/api/workflows/workflow/{id}',
      access: 'public',
      security: WORKFLOW_READ_WITH_MANAGED_SECURITY,
      summary: 'Get a workflow',
      description: 'Retrieve a single workflow by its ID.',
      options: {
        tags: [OAS_TAG],
        availability: AVAILABILITY,
      },
    })
    .addVersion(
      {
        version: API_VERSION,
        options: {
          oasOperationObject: () => path.join(__dirname, '../examples/get_workflow.yaml'),
        },
        validate: {
          request: {
            params: idParamSchema,
          },
        },
      },
      withAvailabilityCheck(async (context, request, response) => {
        try {
          if (!hasWorkflowReadPrivilege(request)) {
            return response.forbidden();
          }
          const { id } = request.params;
          const spaceId = spaces.getSpaceId(request);
          const workflow = await api.getWorkflow(id, spaceId);
          if (!workflow) {
            audit.logWorkflowAccessed(request, {
              id,
              error: new Error('Workflow not found'),
            });
            return response.notFound({ body: { message: 'Workflow not found' } });
          }
          assertCanReadManagedWorkflow(request, workflow);
          audit.logWorkflowAccessed(request, { id });
          return response.ok({ body: workflow });
        } catch (error) {
          audit.logWorkflowAccessed(request, {
            id: request.params.id,
            error,
          });
          return handleRouteError(response, error);
        }
      })
    );
}
