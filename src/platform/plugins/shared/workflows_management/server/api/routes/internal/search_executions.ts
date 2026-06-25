/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import type { SearchExecutionsViewParams } from '../../workflows_management_service';
import type { RouteDependencies } from '../types';
import {
  INTERNAL_API_VERSION,
  MAX_TRIGGER_EVENT_SEARCH_KQL_LENGTH,
} from '../utils/route_constants';
import { handleRouteError } from '../utils/route_error_handlers';
import {
  canReadManagedWorkflowExecutions,
  hasWorkflowExecutionReadPrivilege,
  WORKFLOW_EXECUTION_READ_WITH_MANAGED_SECURITY,
} from '../utils/route_security';
import { withAvailabilityCheck } from '../utils/with_availability_check';

const MAX_EXECUTIONS_SEARCH_QUERY_JSON_LENGTH = MAX_TRIGGER_EVENT_SEARCH_KQL_LENGTH * 4;
const MAX_EXECUTIONS_SEARCH_SORT_JSON_LENGTH = 4096;

const querySchema = schema.object({
  query: schema.maybe(
    schema.string({
      maxLength: MAX_EXECUTIONS_SEARCH_QUERY_JSON_LENGTH,
      meta: { description: 'JSON-encoded Elasticsearch query DSL.' },
    })
  ),
  sort: schema.maybe(
    schema.string({
      maxLength: MAX_EXECUTIONS_SEARCH_SORT_JSON_LENGTH,
      meta: { description: 'JSON-encoded Elasticsearch sort definition.' },
    })
  ),
  from: schema.maybe(schema.number({ min: 0, meta: { description: 'Pagination offset.' } })),
  size: schema.maybe(
    schema.number({
      min: 1,
      max: 1000,
      meta: { description: 'Number of results to return.' },
    })
  ),
  trackTotalHits: schema.maybe(
    schema.boolean({ meta: { description: 'Whether to track total hit count.' } })
  ),
});

const parseJsonParam = <T>(value: string | undefined, paramName: string): T | undefined => {
  if (value == null || value === '') {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`Invalid JSON in ${paramName}`);
  }
};

export function registerInternalSearchExecutionsRoute({ router, api, spaces }: RouteDependencies) {
  router.versioned
    .get({
      path: '/internal/workflows/executions',
      access: 'internal',
      security: WORKFLOW_EXECUTION_READ_WITH_MANAGED_SECURITY,
    })
    .addVersion(
      {
        version: INTERNAL_API_VERSION,
        validate: {
          request: {
            query: querySchema,
          },
        },
      },
      withAvailabilityCheck(async (_context, request, response) => {
        try {
          if (!hasWorkflowExecutionReadPrivilege(request)) {
            return response.forbidden();
          }
          const spaceId = spaces.getSpaceId(request);
          const params: SearchExecutionsViewParams = {
            query: parseJsonParam(request.query.query, 'query'),
            sort: parseJsonParam(request.query.sort, 'sort'),
            from: request.query.from,
            size: request.query.size,
            trackTotalHits: request.query.trackTotalHits,
            includeManagedExecutions: canReadManagedWorkflowExecutions(request),
          };

          return response.ok({
            body: await api.searchExecutionsView(params, spaceId),
          });
        } catch (error) {
          if (error instanceof Error && error.message.startsWith('Invalid JSON in')) {
            return response.badRequest({ body: { message: error.message } });
          }
          return handleRouteError(response, error);
        }
      })
    );
}
