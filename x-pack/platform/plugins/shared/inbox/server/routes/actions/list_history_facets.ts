/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  API_VERSIONS,
  INBOX_ACTIONS_HISTORY_FACETS_URL,
  INTERNAL_API_ACCESS,
  ListInboxActionsHistoryFacetsRequestQuery,
  type ListInboxActionsHistoryFacetsResponse,
} from '@kbn/inbox-common';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { INBOX_API_PRIVILEGE_READ } from '../../../common';
import type { RouteDependencies } from '../register_routes';

/**
 * Distinct-value buckets used to populate the inbox-history filter dropdowns.
 * The fan-out across registered providers is delegated to the registry, which
 * merges per-dimension bucket arrays so the UI sees a single, deduplicated
 * list.
 *
 * The buckets are explicitly **not** narrowed by user-supplied filters from
 * the list endpoint — see
 * `WorkflowExecutionQueryService.listProcessedWaitForInputFacets` for the
 * stability rationale (selecting one option must not silently truncate the
 * others' choices).
 */
export const registerListInboxActionsHistoryFacetsRoute = ({
  router,
  logger,
  registry,
  getSpaceId,
}: RouteDependencies) => {
  router.versioned
    .get({
      path: INBOX_ACTIONS_HISTORY_FACETS_URL,
      access: INTERNAL_API_ACCESS,
      security: {
        authz: { requiredPrivileges: [INBOX_API_PRIVILEGE_READ] },
      },
      summary: 'List inbox actions history facets',
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v1,
        validate: {
          request: {
            query: buildRouteValidationWithZod(ListInboxActionsHistoryFacetsRequestQuery),
          },
        },
      },
      async (_context, request, response) => {
        try {
          const { source_app: sourceApp } = request.query;
          const spaceId = getSpaceId(request);

          const { channel, respondedBy } = await registry.listFacets(
            { sourceApp },
            { request, spaceId }
          );

          const body: ListInboxActionsHistoryFacetsResponse = { channel, respondedBy };

          return response.ok({ body });
        } catch (error) {
          logger.error(`Failed to list inbox actions history facets: ${error}`);
          return response.customError({
            statusCode: 500,
            body: { message: 'Failed to list inbox actions history facets' },
          });
        }
      }
    );
};
