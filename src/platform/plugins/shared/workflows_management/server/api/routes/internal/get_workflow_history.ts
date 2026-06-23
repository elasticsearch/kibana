/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import type { RouteDependencies } from '../types';
import { INTERNAL_API_VERSION, MAX_PAGE_SIZE } from '../utils/route_constants';
import { handleRouteError } from '../utils/route_error_handlers';
import { WORKFLOW_READ_SECURITY } from '../utils/route_security';
import { idParamSchema } from '../utils/schemas';
import { withAvailabilityCheck } from '../utils/with_availability_check';

const querySchema = schema.object({
  page: schema.maybe(schema.number({ min: 1, meta: { description: 'Page number (1-based).' } })),
  per_page: schema.maybe(
    schema.number({
      min: 1,
      max: MAX_PAGE_SIZE,
      meta: { description: 'Items per page.' },
    })
  ),
});

export function registerGetWorkflowHistoryRoute(deps: RouteDependencies) {
  const { router, api, spaces, audit } = deps;
  router.versioned
    .get({
      path: '/internal/workflows/workflow/{id}/history',
      access: 'internal',
      security: WORKFLOW_READ_SECURITY,
      summary: 'Get workflow change history',
      description: 'Retrieve paginated change-history entries for a workflow.',
    })
    .addVersion(
      {
        version: INTERNAL_API_VERSION,
        validate: {
          request: {
            params: idParamSchema,
            query: querySchema,
          },
        },
      },
      withAvailabilityCheck(async (context, request, response) => {
        try {
          const { id } = request.params;
          const spaceId = spaces.getSpaceId(request);
          const page = request.query.page ?? 1;
          const perPage = request.query.per_page ?? 20;
          const history = await api.getHistoryForWorkflow(id, spaceId, { page, perPage });
          audit.logWorkflowAccessed(request, { id });
          return response.ok({ body: history });
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
