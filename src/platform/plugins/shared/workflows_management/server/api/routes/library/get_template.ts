/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import { WORKFLOWS_LIBRARY_ENABLED_SETTING_ID } from '@kbn/workflows';

import { mapLibraryError } from './error_mapper';
import { LibraryDisabledError, type LibraryService } from '../../../library';
import type { RouteDependencies } from '../types';
import { INTERNAL_API_VERSION } from '../utils/route_constants';
import { WORKFLOW_READ_SECURITY } from '../utils/route_security';
import { withAvailabilityCheck } from '../utils/with_availability_check';

const paramsSchema = schema.object({
  slug: schema.string({ maxLength: 256 }),
});

export function registerGetTemplateRoute(
  { router }: RouteDependencies,
  libraryService: LibraryService
) {
  router.versioned
    .get({
      path: '/internal/workflows/library/templates/{slug}',
      access: 'internal',
      security: WORKFLOW_READ_SECURITY,
      summary: 'Get a Workflow Template Library template',
      description: 'Returns the parsed template-metadata block and workflow body for a slug.',
    })
    .addVersion(
      {
        version: INTERNAL_API_VERSION,
        validate: { request: { params: paramsSchema } },
      },
      withAvailabilityCheck(async (context, request, response) => {
        try {
          const { uiSettings } = await context.core;
          const enabled = await uiSettings.globalClient.get<boolean>(
            WORKFLOWS_LIBRARY_ENABLED_SETTING_ID
          );
          if (!enabled) throw new LibraryDisabledError();

          const body = await libraryService.getTemplate(request.params.slug);
          return response.ok({ body });
        } catch (err) {
          return mapLibraryError(response, err);
        }
      })
    );
}
