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
import type { SearchStepExecutionsParams } from '../../workflows_management_api';
import type { RouteDependencies } from '../types';
import { API_VERSION, AVAILABILITY, MAX_PAGE_SIZE, OAS_TAG } from '../utils/route_constants';
import { handleRouteError } from '../utils/route_error_handlers';
import {
  assertCanReadManagedWorkflowExecution,
  hasWorkflowExecutionReadPrivilege,
  WORKFLOW_EXECUTION_READ_WITH_MANAGED_SECURITY,
} from '../utils/route_security';
import { workflowIdParamSchema } from '../utils/schemas';
import { withAvailabilityCheck } from '../utils/with_availability_check';

export function registerGetWorkflowStepExecutionsRoute({ router, api, spaces }: RouteDependencies) {
  router.versioned
    .get({
      path: '/api/workflows/workflow/{workflowId}/executions/steps',
      access: 'public',
      security: WORKFLOW_EXECUTION_READ_WITH_MANAGED_SECURITY,
      summary: 'Get workflow step executions',
      description:
        'Retrieve a paginated list of step-level execution records for a specific workflow. Optionally filter by step ID and include input or output data.',
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
            path.join(__dirname, '../examples/get_workflow_step_executions.yaml'),
        },
        validate: {
          request: {
            params: workflowIdParamSchema,
            query: schema.object({
              stepId: schema.maybe(schema.string({ meta: { description: 'Filter by step ID.' } })),
              includeInput: schema.maybe(
                schema.boolean({ meta: { description: 'Include step input data.' } })
              ),
              includeOutput: schema.maybe(
                schema.boolean({ meta: { description: 'Include step output data.' } })
              ),
              page: schema.maybe(
                schema.number({ min: 1, meta: { description: 'Page number for pagination.' } })
              ),
              size: schema.maybe(
                schema.number({
                  min: 1,
                  max: MAX_PAGE_SIZE,
                  meta: { description: 'Number of results per page.' },
                })
              ),
              startedAfter: schema.maybe(
                schema.string({
                  meta: {
                    description:
                      'Datemath lower bound for filtering step executions by startedAt (inclusive when parsed).',
                  },
                })
              ),
              startedBefore: schema.maybe(
                schema.string({
                  meta: {
                    description:
                      'Datemath upper bound for filtering step executions by startedAt (inclusive when parsed with roundUp).',
                  },
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
          const spaceId = spaces.getSpaceId(request);
          const { workflowId } = request.params;
          const query = request.query;
          const workflow = await api.getWorkflow(workflowId, spaceId);
          assertCanReadManagedWorkflowExecution(request, workflow);

          const params: SearchStepExecutionsParams = {
            workflowId,
            stepId: query.stepId,
            includeInput: query.includeInput ?? false,
            includeOutput: query.includeOutput ?? false,
            page: query.page,
            size: query.size,
            startedAfter: query.startedAfter,
            startedBefore: query.startedBefore,
          };

          return response.ok({
            body: await api.searchStepExecutions(params, spaceId),
          });
        } catch (error) {
          return handleRouteError(response, error);
        }
      })
    );
}
