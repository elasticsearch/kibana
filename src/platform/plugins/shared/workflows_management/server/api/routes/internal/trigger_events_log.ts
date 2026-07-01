/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import { KQLSyntaxError } from '@kbn/es-query';
import type { RouteDependencies } from '../types';
import {
  INTERNAL_API_VERSION,
  MAX_PAGE_SIZE,
  MAX_TRIGGER_EVENT_SEARCH_KQL_LENGTH,
  MAX_TRIGGER_EVENT_SEARCH_TIME_STRING_LENGTH,
} from '../utils/route_constants';
import { handleRouteError } from '../utils/route_error_handlers';
import { WORKFLOW_EXECUTION_READ_SECURITY } from '../utils/route_security';
import { withAvailabilityCheck } from '../utils/with_availability_check';

export const triggerEventsLogSearchBodySchema = schema.object({
  kql: schema.maybe(schema.string({ maxLength: MAX_TRIGGER_EVENT_SEARCH_KQL_LENGTH })),
  from: schema.maybe(schema.string({ maxLength: MAX_TRIGGER_EVENT_SEARCH_TIME_STRING_LENGTH })),
  to: schema.maybe(schema.string({ maxLength: MAX_TRIGGER_EVENT_SEARCH_TIME_STRING_LENGTH })),
  page: schema.maybe(schema.number({ min: 1 })),
  size: schema.maybe(schema.number({ min: 1, max: MAX_PAGE_SIZE })),
});

export function registerTriggerEventsLogRoutes(deps: RouteDependencies) {
  const { router, workflowsService, spaces } = deps;

  router.versioned
    .post({
      path: '/internal/workflows/trigger_events/_search',
      access: 'internal',
      security: WORKFLOW_EXECUTION_READ_SECURITY,
      enableQueryVersion: true,
    })
    .addVersion(
      {
        version: INTERNAL_API_VERSION,
        validate: {
          request: {
            body: triggerEventsLogSearchBodySchema,
          },
        },
      },
      withAvailabilityCheck(async (_context, request, response) => {
        try {
          const spaceId = spaces.getSpaceId(request);
          const { triggerEvents } = await workflowsService.getWorkflowsExecutionEngine();
          const { kql, from: fromTs, to: toTs, page, size } = request.body;

          const result = await triggerEvents.searchTriggerEventLog({
            spaceId,
            kql,
            from: fromTs,
            to: toTs,
            page,
            size,
          });

          return response.ok({ body: result });
        } catch (error) {
          if (error instanceof KQLSyntaxError) {
            return response.badRequest({
              body: { message: error.shortMessage ?? error.message },
            });
          }
          return handleRouteError(
            response,
            error instanceof Error ? error : new Error(String(error))
          );
        }
      })
    );
}
