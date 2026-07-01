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
import { EXTERNAL_RESUME_FORM_API_PATH } from '@kbn/workflows/server';
import {
  EXTERNAL_RESUME_ROUTE_OPTIONS,
  EXTERNAL_RESUME_SECURITY,
  handleExternalResumeError,
  htmlOk,
} from './external_resume_route_helpers';
import type { RouteDependencies } from '../types';
import { API_VERSION } from '../utils/route_constants';
import { executionIdParamSchema } from '../utils/schemas';
import { withAvailabilityCheck } from '../utils/with_availability_check';

export function registerExternalResumeFormRoute(deps: RouteDependencies) {
  const { router, api, spaces } = deps;

  router.versioned
    .get({
      path: EXTERNAL_RESUME_FORM_API_PATH,
      access: 'public',
      security: EXTERNAL_RESUME_SECURITY,
      summary: 'Show the external input form for a paused workflow execution',
      description:
        'Render an HTML form for submitting external input to a paused waitForInput step. Does not resume the execution.',
      options: EXTERNAL_RESUME_ROUTE_OPTIONS,
    })
    .addVersion(
      {
        version: API_VERSION,
        options: {
          oasOperationObject: () =>
            path.join(__dirname, '../examples/resume_execution_external_form.yaml'),
        },
        validate: {
          request: {
            params: executionIdParamSchema,
            query: schema.object({
              apiKey: schema.string({
                meta: { description: 'External resume API key credential.' },
              }),
            }),
          },
        },
      },
      withAvailabilityCheck(async (context, request, response) => {
        try {
          const { executionId } = request.params;
          const { apiKey } = request.query;
          const body = await api.getExternalResumeFormPage({
            apiKey,
            executionId,
            spaceId: spaces.getSpaceId(request),
            basePath: request.basePath,
          });

          return htmlOk(response, body);
        } catch (error) {
          return handleExternalResumeError(response, error);
        }
      })
    );
}
