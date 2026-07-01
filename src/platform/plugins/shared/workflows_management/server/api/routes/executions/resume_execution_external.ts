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
import { EXTERNAL_RESUME_API_PATH } from '@kbn/workflows/server';
import {
  EXTERNAL_RESUME_POST_ROUTE_OPTIONS,
  EXTERNAL_RESUME_ROUTE_OPTIONS,
  EXTERNAL_RESUME_SECURITY,
  handleExternalResumeError,
  htmlSuccess,
} from './external_resume_route_helpers';
import { resolveExternalResumeApiKey } from '../../external_resume/external_resume_service';
import type { RouteDependencies } from '../types';
import { API_VERSION } from '../utils/route_constants';
import { executionIdParamSchema } from '../utils/schemas';
import { withAvailabilityCheck } from '../utils/with_availability_check';

export function registerExternalResumeExecutionPostRoute(deps: RouteDependencies) {
  const { router, api, spaces, audit } = deps;

  router.versioned
    .post({
      path: EXTERNAL_RESUME_API_PATH,
      access: 'public',
      security: EXTERNAL_RESUME_SECURITY,
      summary: 'Submit external input for a paused workflow execution',
      description:
        'Resume a paused waitForInput step using an external resume API key and submitted form data. Authenticate with an Authorization: ApiKey header or an apiKey query parameter (header takes precedence). Returns an HTML confirmation page.',
      options: EXTERNAL_RESUME_POST_ROUTE_OPTIONS,
    })
    .addVersion(
      {
        version: API_VERSION,
        options: {
          oasOperationObject: () =>
            path.join(__dirname, '../examples/resume_execution_external_post.yaml'),
        },
        validate: {
          request: {
            params: executionIdParamSchema,
            query: schema.object({
              apiKey: schema.maybe(
                schema.string({
                  meta: {
                    description:
                      'External resume API key credential. Used when Authorization header is not provided.',
                  },
                })
              ),
            }),
            body: schema.object({}, { unknowns: 'allow' }),
          },
        },
      },
      withAvailabilityCheck(async (context, request, response) => {
        try {
          const { executionId } = request.params;
          const apiKey = resolveExternalResumeApiKey({
            authorization: request.headers?.authorization,
            queryApiKey: request.query.apiKey,
          });
          const spaceId = spaces.getSpaceId(request);
          const { resumedBy } = await api.resumeWorkflowExecutionExternallyWithInput({
            apiKey,
            executionId,
            spaceId,
            input: request.body as Record<string, unknown>,
          });

          audit.logExecutionResumed(request, {
            executionId,
            resumedBy,
          });

          return htmlSuccess(response);
        } catch (error) {
          audit.logExecutionResumed(request, {
            executionId: request.params.executionId,
            error,
          });
          return handleExternalResumeError(response, error);
        }
      })
    );
}

export function registerExternalResumeExecutionGetRoute(deps: RouteDependencies) {
  const { router, api, spaces, audit } = deps;

  router.versioned
    .get({
      path: EXTERNAL_RESUME_API_PATH,
      access: 'public',
      security: EXTERNAL_RESUME_SECURITY,
      summary: 'Resume a workflow execution from an external link',
      description:
        'Resume a paused waitForApproval step (approved query param) or waitForInput step (schema fields as query params). Returns an HTML confirmation page.',
      options: EXTERNAL_RESUME_ROUTE_OPTIONS,
    })
    .addVersion(
      {
        version: API_VERSION,
        options: {
          oasOperationObject: () =>
            path.join(__dirname, '../examples/resume_execution_external.yaml'),
        },
        validate: {
          request: {
            params: executionIdParamSchema,
            query: schema.object(
              {
                apiKey: schema.string({
                  meta: { description: 'External resume API key credential.' },
                }),
                approved: schema.maybe(
                  schema.oneOf(
                    [schema.boolean(), schema.literal('true'), schema.literal('false')],
                    {
                      meta: {
                        description:
                          'Required for waitForApproval. Whether the external actor approved the workflow pause.',
                      },
                    }
                  )
                ),
              },
              { unknowns: 'allow' }
            ),
          },
        },
      },
      withAvailabilityCheck(async (context, request, response) => {
        try {
          const { executionId } = request.params;
          const apiKey = resolveExternalResumeApiKey({
            authorization: request.headers?.authorization,
            queryApiKey: request.query.apiKey,
          });
          const { resumedBy } = await api.resumeWorkflowExecutionExternallyViaGet({
            apiKey,
            executionId,
            spaceId: spaces.getSpaceId(request),
            query: request.query as Record<string, unknown>,
          });

          audit.logExecutionResumed(request, {
            executionId,
            resumedBy,
          });

          return htmlSuccess(response);
        } catch (error) {
          audit.logExecutionResumed(request, {
            executionId: request.params.executionId,
            error,
          });
          return handleExternalResumeError(response, error);
        }
      })
    );
}
