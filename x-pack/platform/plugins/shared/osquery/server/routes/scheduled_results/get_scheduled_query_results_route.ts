/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { IRouter } from '@kbn/core/server';
import { lastValueFrom } from 'rxjs';
import type { DataRequestHandlerContext } from '@kbn/data-plugin/server';
import { getRequestAbortedSignal } from '@kbn/data-plugin/server';
import { isFilters } from '@kbn/es-query';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { PLUGIN_ID, OSQUERY_INTEGRATION_NAME } from '../../../common';
import { API_VERSIONS, DEFAULT_MAX_TABLE_QUERY_SIZE } from '../../../common/constants';
import type {
  ResultsRequestOptions,
  ResultsStrategyResponse,
} from '../../../common/search_strategy';
import { Direction, OsqueryQueries } from '../../../common/search_strategy';
import { generateTablePaginationOptions } from '../../../common/utils/build_query';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';
import { createInternalSavedObjectsClientForSpaceId } from '../../utils/get_internal_saved_object_client';

export const getScheduledQueryResultsRoute = (
  router: IRouter<DataRequestHandlerContext>,
  osqueryContext: OsqueryAppContext
) => {
  router.versioned
    .get({
      access: 'public',
      path: '/api/osquery/scheduled_results/{scheduleId}/{executionCount}/results',
      security: {
        authz: {
          requiredPrivileges: [`${PLUGIN_ID}-read`],
        },
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: {
            params: schema.object({
              scheduleId: schema.string(),
              executionCount: schema.number(),
            }),
            query: schema.object({
              page: schema.maybe(schema.number()),
              pageSize: schema.maybe(schema.number()),
              sort: schema.maybe(schema.string()),
              sortOrder: schema.maybe(
                schema.oneOf([schema.literal('asc'), schema.literal('desc')])
              ),
              kuery: schema.maybe(schema.string()),
              esFilters: schema.maybe(schema.string()),
              startDate: schema.maybe(schema.string()),
            }),
          },
        },
      },
      async (context, request, response) => {
        const abortSignal = getRequestAbortedSignal(request.events.aborted$);

        try {
          const { scheduleId, executionCount } = request.params;
          const page = request.query.page ?? 0;
          const pageSize = request.query.pageSize ?? 100;

          if (page * pageSize >= DEFAULT_MAX_TABLE_QUERY_SIZE) {
            return response.badRequest({
              body: {
                message: `Cannot paginate beyond ${DEFAULT_MAX_TABLE_QUERY_SIZE} results. Use Discover for full access.`,
                attributes: { code: 'PAGINATION_LIMIT_EXCEEDED' },
              },
            });
          }

          let integrationNamespaces: Record<string, string[]> = {};
          const logger = osqueryContext.logFactory.get('scheduled_query_results');

          const spaceId = osqueryContext?.service?.getActiveSpace
            ? (await osqueryContext.service.getActiveSpace(request))?.id ?? DEFAULT_SPACE_ID
            : DEFAULT_SPACE_ID;

          if (osqueryContext?.service?.getIntegrationNamespaces) {
            const spaceScopedClient = await createInternalSavedObjectsClientForSpaceId(
              osqueryContext,
              request
            );
            integrationNamespaces = await osqueryContext.service.getIntegrationNamespaces(
              [OSQUERY_INTEGRATION_NAME],
              spaceScopedClient,
              logger
            );
          }

          const osqueryNamespaces = integrationNamespaces[OSQUERY_INTEGRATION_NAME];
          const namespacesOrUndefined =
            osqueryNamespaces && osqueryNamespaces.length > 0 ? osqueryNamespaces : undefined;

          if (request.query.esFilters) {
            let parsed: unknown;
            try {
              parsed = JSON.parse(request.query.esFilters);
            } catch {
              return response.badRequest({ body: { message: 'esFilters contains invalid JSON' } });
            }

            if (!isFilters(parsed)) {
              return response.badRequest({
                body: { message: 'esFilters must be a valid filters array' },
              });
            }
          }

          const search = await context.search;
          const res = await lastValueFrom(
            search.search<ResultsRequestOptions, ResultsStrategyResponse>(
              {
                actionId: scheduleId,
                scheduleId,
                executionCount,
                factoryQueryType: OsqueryQueries.results,
                kuery: request.query.kuery,
                esFilters: request.query.esFilters,
                startDate: request.query.startDate,
                spaceId,
                pagination: generateTablePaginationOptions(page, pageSize),
                sort: [
                  {
                    direction: (request.query.sortOrder as Direction) ?? Direction.desc,
                    field: request.query.sort ?? '@timestamp',
                  },
                ],
                integrationNamespaces: namespacesOrUndefined,
              },
              { abortSignal, strategy: 'osquerySearchStrategy' }
            )
          );

          return response.ok({
            body: { data: res },
          });
        } catch (e) {
          return response.customError({
            statusCode: e.statusCode ?? 500,
            body: { message: e.message },
          });
        }
      }
    );
};
