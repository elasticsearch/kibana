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
  assertCanReadManagedWorkflow,
  hasWorkflowReadPrivilege,
  WORKFLOW_READ_WITH_MANAGED_SECURITY,
} from '../utils/route_security';
import { withAvailabilityCheck } from '../utils/with_availability_check';

export function registerMgetWorkflowsRoute(deps: RouteDependencies) {
  const { router, api, spaces, audit } = deps;
  router.versioned
    .post({
      path: '/api/workflows/mget',
      access: 'public',
      security: WORKFLOW_READ_WITH_MANAGED_SECURITY,
      summary: 'Get workflows by IDs',
      description:
        'Retrieve multiple workflows by their IDs in a single request. Optionally use the `source` parameter to return only specific fields from each workflow document.',
      options: {
        tags: [OAS_TAG],
        availability: AVAILABILITY,
      },
    })
    .addVersion(
      {
        version: API_VERSION,
        options: {
          oasOperationObject: () => path.join(__dirname, '../examples/mget_workflows.yaml'),
        },
        validate: {
          request: {
            body: schema.object({
              ids: schema.arrayOf(
                schema.string({ maxLength: 255, meta: { description: 'Workflow ID.' } }),
                {
                  minSize: 1,
                  maxSize: 500,
                  meta: { description: 'Array of workflow IDs to look up.' },
                }
              ),
              source: schema.maybe(
                schema.arrayOf(
                  schema.string({ maxLength: 255, meta: { description: 'Source field.' } }),
                  {
                    minSize: 1,
                    maxSize: 10,
                    meta: { description: 'Array of source fields to include.' },
                  }
                )
              ),
            }),
          },
        },
      },
      withAvailabilityCheck(async (context, request, response) => {
        try {
          if (!hasWorkflowReadPrivilege(request)) {
            return response.forbidden();
          }
          const spaceId = spaces.getSpaceId(request);
          const { ids, source } = request.body;
          const workflowsForAuthorization = await api.getWorkflowsByIds(ids, spaceId);
          workflowsForAuthorization.forEach((workflow) =>
            assertCanReadManagedWorkflow(request, workflow)
          );
          const workflows = await api.getWorkflowsSourceByIds(ids, spaceId, source);
          audit.logWorkflowMget(request, {
            requestedCount: ids.length,
            returnedCount: workflows.length,
          });
          return response.ok({ body: workflows });
        } catch (error) {
          audit.logWorkflowMget(request, { error });
          return handleRouteError(response, error);
        }
      })
    );
}
