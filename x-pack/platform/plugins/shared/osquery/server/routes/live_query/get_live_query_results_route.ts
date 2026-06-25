/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter } from '@kbn/core/server';
import { map } from 'lodash';
import { lastValueFrom, zip } from 'rxjs';
import type { Observable } from 'rxjs';
import type { DataRequestHandlerContext } from '@kbn/data-plugin/server';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { isFilters } from '@kbn/es-query';
import type {
  GetLiveQueryResultsRequestQuerySchema,
  GetLiveQueryResultsRequestParamsSchema,
} from '../../../common/api';
import { buildRouteValidation } from '../../utils/build_validation/route_validation';
import {
  API_VERSIONS,
  DEFAULT_MAX_TABLE_QUERY_SIZE,
  OSQUERY_INTEGRATION_NAME,
} from '../../../common/constants';
import { PLUGIN_ID } from '../../../common';
import type {
  ActionDetailsRequestOptions,
  ActionDetailsStrategyResponse,
  ResultsRequestOptions,
  ResultsStrategyResponse,
} from '../../../common/search_strategy';
import { Direction, OsqueryQueries } from '../../../common/search_strategy';
import { generateTablePaginationOptions } from '../../../common/utils/build_query';
import { getActionResponses } from './utils';
import {
  getLiveQueryResultsRequestParamsSchema,
  getLiveQueryResultsRequestQuerySchema,
} from '../../../common/api';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';
import { buildIndexNameWithNamespace } from '../../utils/build_index_name_with_namespace';
import { createInternalSavedObjectsClientForSpaceId } from '../../utils/get_internal_saved_object_client';
import { getLiveQueryResultsResponseSchema } from './response_schemas';

export const getLiveQueryResultsRoute = (
  router: IRouter<DataRequestHandlerContext>,
  osqueryContext: OsqueryAppContext
) => {
  router.versioned
    .get({
      access: 'public',
      path: '/api/osquery/live_queries/{id}/results/{actionId}',
      security: {
        authz: {
          requiredPrivileges: [`${PLUGIN_ID}-readLiveQueries`],
        },
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: {
            query: buildRouteValidation<
              typeof getLiveQueryResultsRequestQuerySchema,
              GetLiveQueryResultsRequestQuerySchema
            >(getLiveQueryResultsRequestQuerySchema),
            params: buildRouteValidation<
              typeof getLiveQueryResultsRequestParamsSchema,
              GetLiveQueryResultsRequestParamsSchema
            >(getLiveQueryResultsRequestParamsSchema),
          },
          response: {
            200: {
              body: () => getLiveQueryResultsResponseSchema,
            },
          },
        },
      },
      async (context, request, response) => {
        const abortSignal = getRequestAbortedSignal(request.events.aborted$);

        try {
          const page = request.query.page ?? 0;
          const pageSize = request.query.pageSize ?? 100;

          if (page * pageSize >= DEFAULT_MAX_TABLE_QUERY_SIZE) {
            return response.badRequest({
              body: {
                message: `Cannot paginate beyond ${DEFAULT_MAX_TABLE_QUERY_SIZE} results. Use Discover for full access.`,
                attributes: {
                  code: 'PAGINATION_LIMIT_EXCEEDED',
                },
              },
            });
          }

          const spaceId = osqueryContext?.service?.getActiveSpace
            ? (await osqueryContext.service.getActiveSpace(request))?.id || DEFAULT_SPACE_ID
            : DEFAULT_SPACE_ID;

          let integrationNamespaces: Record<string, string[]> = {};
          let spaceAwareIndexPatterns: string[] = [];

          const logger = osqueryContext.logFactory.get('get_live_query_results');

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

            logger.debug(
              `Retrieved integration namespaces: ${JSON.stringify(integrationNamespaces)}`
            );

            const baseIndexPatterns = [`logs-${OSQUERY_INTEGRATION_NAME}.result*`];

            spaceAwareIndexPatterns = baseIndexPatterns.flatMap((pattern) => {
              const osqueryNamespaces = integrationNamespaces[OSQUERY_INTEGRATION_NAME];

              if (osqueryNamespaces && osqueryNamespaces.length > 0) {
                return osqueryNamespaces.map((namespace) =>
                  buildIndexNameWithNamespace(pattern, namespace)
                );
              }

              return [pattern];
            });

            logger.debug(
              `Built space-aware index patterns: ${JSON.stringify(spaceAwareIndexPatterns)}`
            );
          }

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
          const { actionDetails } = await lastValueFrom(
            search.search<ActionDetailsRequestOptions, ActionDetailsStrategyResponse>(
              {
                actionId: request.params.id,
                factoryQueryType: OsqueryQueries.actionDetails,
                spaceId,
              },
              { abortSignal, strategy: 'osquerySearchStrategy' }
            )
          );

          if (!actionDetails) {
            return response.notFound({ body: { message: 'Action not found' } });
          }

          const queries = actionDetails?._source?.queries;

          const osqueryNamespaces = integrationNamespaces[OSQUERY_INTEGRATION_NAME];
          const namespacesOrUndefined =
            osqueryNamespaces && osqueryNamespaces.length > 0 ? osqueryNamespaces : undefined;

          await lastValueFrom(
            zip(
              ...map(queries, (query) =>
                getActionResponses(
                  search,
                  query.action_id,
                  query.agents?.length ?? 0,
                  namespacesOrUndefined,
                  spaceId
                )
              )
            )
          );
          const res = await lastValueFrom(
            search.search<ResultsRequestOptions, ResultsStrategyResponse>(
              {
                actionId: request.params.actionId,
                factoryQueryType: OsqueryQueries.results,
                kuery: request.query.kuery,
                esFilters: request.query.esFilters,
                startDate: request.query.startDate,
                spaceId,
                pagination: generateTablePaginationOptions(
                  request.query.page ?? 0,
                  request.query.pageSize ?? 100
                ),
                sort: [
                  {
                    direction: request.query.sortOrder ?? Direction.desc,
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
            body: {
              message: e.message,
            },
          });
        }
      }
    );
};

function getRequestAbortedSignal(aborted$: Observable<void>): AbortSignal {
  const controller = new AbortController();
  aborted$.subscribe(() => controller.abort());

  return controller.signal;
}
