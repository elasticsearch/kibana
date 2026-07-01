/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { WORKFLOWS_LIBRARY_ENABLED_SETTING_ID } from '@kbn/workflows';

import { mapLibraryError } from './error_mapper';
import type { LibraryService } from '../../../library';
import type { RouteDependencies } from '../types';
import { INTERNAL_API_VERSION } from '../utils/route_constants';
import { WORKFLOW_READ_SECURITY } from '../utils/route_security';
import { withAvailabilityCheck } from '../utils/with_availability_check';

/**
 * Diagnostic endpoint. Returns the toggle state and the cache's
 * source-mode + last refresh details. Intentionally not gated by the library
 * uiSetting — admins debugging "why don't I see the library?" need this
 * endpoint to be reachable even when the toggle is off.
 */
export function registerLibraryHealthRoute(
  { router }: RouteDependencies,
  libraryService: LibraryService
) {
  router.versioned
    .get({
      path: '/internal/workflows/library/health',
      access: 'internal',
      security: WORKFLOW_READ_SECURITY,
      summary: 'Workflow Template Library health',
      description: 'Returns the toggle state and the cache refresh diagnostic payload.',
    })
    .addVersion(
      { version: INTERNAL_API_VERSION, validate: false },
      withAvailabilityCheck(async (context, _request, response) => {
        try {
          const { uiSettings } = await context.core;
          const enabled = await uiSettings.globalClient.get<boolean>(
            WORKFLOWS_LIBRARY_ENABLED_SETTING_ID
          );
          const health = libraryService.getHealth();
          return response.ok({ body: { ...health, enabled } });
        } catch (err) {
          return mapLibraryError(response, err);
        }
      })
    );
}
