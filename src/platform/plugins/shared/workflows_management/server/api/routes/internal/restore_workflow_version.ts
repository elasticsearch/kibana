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
import { INTERNAL_API_VERSION, MAX_CHANGE_HISTORY_EVENT_ID_LENGTH } from '../utils/route_constants';
import { handleRouteError } from '../utils/route_error_handlers';
import { WORKFLOW_UPDATE_SECURITY } from '../utils/route_security';
import { idParamSchema } from '../utils/schemas';
import { withAvailabilityCheck } from '../utils/with_availability_check';

const paramsSchema = idParamSchema.extends({
  eventId: schema.string({
    maxLength: MAX_CHANGE_HISTORY_EVENT_ID_LENGTH,
    meta: { description: 'Change history event ID to restore from.' },
  }),
});

export function registerRestoreWorkflowVersionRoute(deps: RouteDependencies) {
  const { router, api, spaces, audit } = deps;
  router.versioned
    .post({
      path: '/internal/workflows/workflow/{id}/history/{eventId}/restore',
      access: 'internal',
      security: WORKFLOW_UPDATE_SECURITY,
      summary: 'Restore workflow from change history',
      description:
        'Applies a historical workflow snapshot as a new version. History is preserved; restore appends a new change-history entry.',
    })
    .addVersion(
      {
        version: INTERNAL_API_VERSION,
        validate: {
          request: {
            params: paramsSchema,
          },
        },
      },
      withAvailabilityCheck(async (context, request, response) => {
        try {
          const { id, eventId } = request.params;
          const spaceId = spaces.getSpaceId(request);
          const restored = await api.restoreWorkflowVersion(id, eventId, spaceId, request);
          audit.logWorkflowRestored(request, { id, eventId, version: restored.version });
          return response.ok({ body: restored });
        } catch (error) {
          audit.logWorkflowRestored(request, {
            id: request.params.id,
            eventId: request.params.eventId,
            error,
          });
          return handleRouteError(response, error as Error);
        }
      })
    );
}
