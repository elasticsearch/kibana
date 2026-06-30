/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  API_VERSIONS,
  INBOX_ACTIONS_HISTORY_URL,
  INTERNAL_API_ACCESS,
  ListInboxActionsHistoryRequestQuery,
  type ListInboxActionsHistoryResponse,
} from '@kbn/inbox-common';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { INBOX_API_PRIVILEGE_READ } from '../../../common';
import type { RouteDependencies } from '../register_routes';

export const registerListInboxActionsHistoryRoute = ({
  router,
  logger,
  registry,
  getSpaceId,
}: RouteDependencies) => {
  router.versioned
    .get({
      path: INBOX_ACTIONS_HISTORY_URL,
      access: INTERNAL_API_ACCESS,
      security: {
        authz: { requiredPrivileges: [INBOX_API_PRIVILEGE_READ] },
      },
      summary: 'List inbox actions history',
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v1,
        validate: {
          request: {
            query: buildRouteValidationWithZod(ListInboxActionsHistoryRequestQuery),
          },
        },
      },
      async (_context, request, response) => {
        try {
          const {
            source_app: sourceApp,
            page,
            per_page: perPage,
            q,
            channel,
            workflow_id: workflowId,
            responded_by: respondedBy,
            sort_order: sortOrder,
          } = request.query;
          const spaceId = getSpaceId(request);

          // Normalize the free-text search: an empty string from the UI's
          // controlled input shouldn't trigger a no-op filter that the
          // providers then have to pre-validate.
          const trimmedQuery = q?.trim();

          // Soft cap on multi-valued filters to keep ES clauses bounded. Anything beyond
          // MAX_FILTER_VALUES_PER_DIMENSION is truncated rather than rejected
          // so a mistyped URL or an over-eager bookmark doesn't flip the route
          // to 400 and hide otherwise-valid filters.
          const MAX_FILTER_VALUES_PER_DIMENSION = 16;
          const truncate = <T>(values: T[] | undefined): T[] | undefined =>
            values && values.length > MAX_FILTER_VALUES_PER_DIMENSION
              ? values.slice(0, MAX_FILTER_VALUES_PER_DIMENSION)
              : values;

          const { actions, total } = await registry.listHistory(
            {
              sourceApp,
              page,
              perPage,
              q: trimmedQuery && trimmedQuery.length > 0 ? trimmedQuery : undefined,
              channel: truncate(channel),
              workflowId: truncate(workflowId),
              respondedBy: truncate(respondedBy),
              sortOrder,
            },
            { request, spaceId }
          );

          const body: ListInboxActionsHistoryResponse = { actions, total };

          return response.ok({ body });
        } catch (error) {
          logger.error(`Failed to list inbox actions history: ${error}`);
          return response.customError({
            statusCode: 500,
            body: { message: 'Failed to list inbox actions history' },
          });
        }
      }
    );
};
