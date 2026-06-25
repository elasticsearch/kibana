/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import path from 'path';
import { schema, type TypeOf } from '@kbn/config-schema';
import { WorkflowsManagementApiActions } from '@kbn/workflows';
import type { GetWorkflowsParams } from '../../workflows_management_api';
import type { RouteDependencies } from '../types';
import {
  API_VERSION,
  AVAILABILITY,
  MAX_ARRAY_PARAM_SIZE,
  MAX_PAGE_SIZE,
  OAS_TAG,
} from '../utils/route_constants';
import { handleRouteError } from '../utils/route_error_handlers';
import {
  canReadManagedWorkflowExecutions,
  hasWorkflowReadPrivilege,
  resolveAuthorizedManagedFilter,
  WORKFLOW_READ_OR_READ_EXECUTIONS_SECURITY,
} from '../utils/route_security';
import { withAvailabilityCheck } from '../utils/with_availability_check';

const querySchema = schema.object({
  query: schema.maybe(schema.string({ meta: { description: 'Free-text search query.' } })),
  size: schema.maybe(
    schema.number({ min: 1, meta: { description: 'Number of results per page.' } })
  ),
  page: schema.maybe(schema.number({ min: 1, meta: { description: 'Page number.' } })),
  enabled: schema.maybe(
    schema.oneOf([schema.boolean(), schema.arrayOf(schema.boolean(), { maxSize: 2 })], {
      meta: { description: 'Filter by enabled state.' },
    })
  ),
  createdBy: schema.maybe(
    schema.oneOf(
      [schema.string(), schema.arrayOf(schema.string(), { maxSize: MAX_ARRAY_PARAM_SIZE })],
      { meta: { description: 'Filter by creator.' } }
    )
  ),
  tags: schema.maybe(
    schema.oneOf(
      [schema.string(), schema.arrayOf(schema.string(), { maxSize: MAX_ARRAY_PARAM_SIZE })],
      { meta: { description: 'Filter by tags.' } }
    )
  ),
  managed: schema.maybe(
    schema.oneOf([schema.literal('all'), schema.literal('managed'), schema.literal('unmanaged')], {
      meta: { description: 'Filter by managed status. Defaults to "unmanaged".' },
    })
  ),
  sortField: schema.maybe(
    schema.oneOf([schema.literal('name'), schema.literal('enabled')], {
      meta: { description: 'Field to sort by.' },
    })
  ),
  sortOrder: schema.maybe(
    schema.oneOf([schema.literal('asc'), schema.literal('desc')], {
      meta: { description: 'Sort direction.' },
    })
  ),
});

export function registerGetWorkflowsRoute({ router, api, spaces }: RouteDependencies) {
  router.versioned
    .get({
      path: '/api/workflows',
      access: 'public',
      security: WORKFLOW_READ_OR_READ_EXECUTIONS_SECURITY,
      summary: 'Get workflows',
      description: 'Retrieve a paginated list of workflows with optional filtering.',
      options: {
        tags: [OAS_TAG],
        availability: AVAILABILITY,
      },
    })
    .addVersion(
      {
        version: API_VERSION,
        options: {
          oasOperationObject: () => path.join(__dirname, '../examples/get_workflows.yaml'),
        },
        validate: { request: { query: querySchema } },
      },
      withAvailabilityCheck(async (context, request, response) => {
        try {
          if (!hasWorkflowReadPrivilege(request)) {
            return response.forbidden();
          }
          const managedFilter = resolveAuthorizedManagedFilter(request, request.query.managed);
          const params = prepareParams({ ...request.query, managed: managedFilter });
          const spaceId = spaces.getSpaceId(request);
          const includeExecutionHistory =
            request.authzResult?.[WorkflowsManagementApiActions.readExecution] === true;
          return response.ok({
            body: await api.getWorkflows(params, spaceId, {
              includeExecutionHistory,
              includeManagedExecutionHistory: canReadManagedWorkflowExecutions(request),
            }),
          });
        } catch (error) {
          return handleRouteError(response, error);
        }
      })
    );
}

function prepareParams({
  size,
  page,
  enabled,
  createdBy,
  tags,
  query,
  managed,
  sortField,
  sortOrder,
}: TypeOf<typeof querySchema>): GetWorkflowsParams {
  return {
    query,
    size: size ?? MAX_PAGE_SIZE,
    page: page ?? 1,
    enabled: enabled != null && !Array.isArray(enabled) ? [enabled] : enabled,
    createdBy: createdBy != null && !Array.isArray(createdBy) ? [createdBy] : createdBy,
    tags: tags != null && !Array.isArray(tags) ? [tags] : tags,
    managedFilter: managed,
    sortField,
    sortOrder,
  };
}
