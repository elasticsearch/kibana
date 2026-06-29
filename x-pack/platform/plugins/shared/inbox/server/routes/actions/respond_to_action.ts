/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  API_VERSIONS,
  INBOX_CHANNELS,
  INTERNAL_API_ACCESS,
  INBOX_ACTION_RESPOND_URL_TEMPLATE,
  RespondToInboxActionRequestBody,
  RespondToInboxActionRequestParams,
  type RespondToInboxActionResponse,
} from '@kbn/inbox-common';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { INBOX_API_PRIVILEGE_RESPOND } from '../../../common';
import type { RouteDependencies } from '../register_routes';
import {
  isInvalidInboxActionSourceIdError,
  isInboxActionConflictError,
  isUnknownInboxSourceAppError,
} from '../../services/inbox_action_registry';

export const registerRespondToActionRoute = ({
  router,
  logger,
  registry,
  getSpaceId,
}: RouteDependencies) => {
  router.versioned
    .post({
      path: INBOX_ACTION_RESPOND_URL_TEMPLATE,
      access: INTERNAL_API_ACCESS,
      security: {
        authz: { requiredPrivileges: [INBOX_API_PRIVILEGE_RESPOND] },
      },
      summary: 'Respond to an inbox action',
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v1,
        validate: {
          request: {
            params: buildRouteValidationWithZod(RespondToInboxActionRequestParams),
            body: buildRouteValidationWithZod(RespondToInboxActionRequestBody),
          },
        },
      },
      async (_context, request, response) => {
        const { source_app: sourceApp, source_id: sourceId } = request.params;

        try {
          // Default to `inbox` so callers that don't explicitly identify
          // their surface (e.g. the existing Kibana inbox UI) end up with
          // the same audit tag as before — preserving the audit-feed
          // semantics that landed with the inbox-history rollout.
          //
          // `channel` is NOT a closed enum: the request-body Zod validator
          // only constrains it to a slug shape (lowercase + digits + `_-`,
          // ≤64 chars). So by the time we read `request.body.channel` it is
          // either `undefined` or some validated slug — which may be a
          // well-known `INBOX_CHANNELS` value OR an arbitrary client id like
          // `example-mcp-app-security`. It is a client-supplied, trusted-shape
          // (but not trusted-value) audit tag only; never branch security or
          // identity decisions off it — `responded_by` (derived server-side
          // from the request auth context) is the trustworthy identity field.
          await registry.respondTo(sourceApp, sourceId, request.body.input, {
            request,
            spaceId: getSpaceId(request),
            channel: request.body.channel ?? INBOX_CHANNELS.inbox,
          });

          const body: RespondToInboxActionResponse = { ok: true };
          return response.ok({ body });
        } catch (error) {
          if (isUnknownInboxSourceAppError(error)) {
            return response.notFound({
              body: { message: error.message },
            });
          }
          if (isInboxActionConflictError(error)) {
            // The action exists in our addressing scheme but the underlying
            // resource (e.g. a workflow step) is no longer in a state that
            // can accept a response. Surface as 409 so clients can refresh
            // their inbox instead of treating it like a server error.
            return response.conflict({
              body: { message: error.message },
            });
          }
          if (isInvalidInboxActionSourceIdError(error)) {
            return response.badRequest({
              body: { message: error.message },
            });
          }
          logger.error(`Failed to respond to inbox action ${sourceApp}/${sourceId}: ${error}`);
          return response.customError({
            statusCode: 500,
            body: { message: 'Failed to respond to inbox action' },
          });
        }
      }
    );
};
