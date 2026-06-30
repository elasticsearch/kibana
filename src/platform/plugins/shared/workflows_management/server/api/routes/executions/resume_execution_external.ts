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
import type { KibanaResponseFactory } from '@kbn/core/server';
import { EXTERNAL_RESUME_API_PATH } from '@kbn/workflows/server';
import { ExternalResumeError } from '../../external_resume/external_resume_error';
import { parseApprovedQueryParam } from '../../external_resume/external_resume_service';
import {
  renderExternalResumeErrorPage,
  renderExternalResumeSuccessPage,
} from '../../external_resume/render_external_resume_page';
import type { RouteDependencies } from '../types';
import { API_VERSION, AVAILABILITY, OAS_TAG } from '../utils/route_constants';
import { executionIdParamSchema } from '../utils/schemas';
import { withAvailabilityCheck } from '../utils/with_availability_check';

const EXTERNAL_RESUME_SECURITY = {
  authc: {
    enabled: false,
    reason: 'External resume uses a short-lived API key token instead of a Kibana session.',
  },
  authz: {
    enabled: false,
    reason: 'External resume authorizes by matching the API key metadata to the execution.',
  },
} as const;

export function registerExternalResumeExecutionRoute(deps: RouteDependencies) {
  const { router, api, spaces, audit } = deps;

  router.versioned
    .get({
      path: EXTERNAL_RESUME_API_PATH,
      access: 'public',
      security: EXTERNAL_RESUME_SECURITY,
      summary: 'Resume a workflow execution from an external link',
      description:
        'Resume a paused workflow execution using an external resume API key. Returns an HTML confirmation page.',
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
            path.join(__dirname, '../examples/resume_execution_external.yaml'),
        },
        validate: {
          request: {
            params: executionIdParamSchema,
            query: schema.object({
              apiKey: schema.string({
                meta: { description: 'External resume API key credential.' },
              }),
              approved: schema.oneOf(
                [schema.boolean(), schema.literal('true'), schema.literal('false')],
                {
                  meta: { description: 'Whether the external actor approved the workflow pause.' },
                }
              ),
            }),
          },
        },
      },
      withAvailabilityCheck(async (context, request, response) => {
        try {
          const { executionId } = request.params;
          const { apiKey, approved } = request.query;
          const { resumedBy } = await api.resumeWorkflowExecutionExternally({
            apiKey,
            approved: parseApprovedQueryParam(approved),
            executionId,
            spaceId: spaces.getSpaceId(request),
          });

          audit.logExecutionResumed(request, {
            executionId,
            resumedBy,
          });

          return htmlOk(response, renderExternalResumeSuccessPage());
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

function htmlOk(response: KibanaResponseFactory, body: string) {
  return response.ok({
    body,
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  });
}

function handleExternalResumeError(response: KibanaResponseFactory, error: unknown) {
  if (error instanceof ExternalResumeError) {
    return htmlError(response, error.statusCode, error.message);
  }

  const message =
    error instanceof Error
      ? error.message
      : 'An unexpected error occurred while resuming the workflow.';
  return htmlError(response, 500, message);
}

function htmlError(response: KibanaResponseFactory, statusCode: number, message: string) {
  return response.custom({
    statusCode,
    bypassErrorFormat: true,
    body: renderExternalResumeErrorPage(message),
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  });
}
