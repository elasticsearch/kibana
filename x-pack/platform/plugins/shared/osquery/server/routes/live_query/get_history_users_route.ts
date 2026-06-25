/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as t from 'io-ts';
import type { IRouter } from '@kbn/core/server';
import type { DataRequestHandlerContext } from '@kbn/data-plugin/server';
import type { estypes } from '@elastic/elasticsearch';
import { AGENT_ACTIONS_INDEX } from '@kbn/fleet-plugin/common';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';
import { API_VERSIONS, ACTIONS_INDEX } from '../../../common/constants';
import { PLUGIN_ID } from '../../../common';
import { buildRouteValidation } from '../../utils/build_validation/route_validation';
import { buildSpaceIdFilter } from '../../utils/build_space_id_filter';

const USERS_PAGE_SIZE = 10;

const getHistoryUsersRequestQuerySchema = t.type({
  searchTerm: t.union([t.string, t.undefined]),
});

type GetHistoryUsersRequestQuerySchema = t.OutputOf<typeof getHistoryUsersRequestQuerySchema>;

interface UserBucket {
  key: string;
  doc_count: number;
  latest_profile_uid: {
    buckets: Array<{ key: string; doc_count: number }>;
  };
}

export const getHistoryUsersRoute = (
  router: IRouter<DataRequestHandlerContext>,
  osqueryContext: OsqueryAppContext
) => {
  router.versioned
    .get({
      access: 'internal',
      path: '/internal/osquery/history/users',
      security: {
        authz: {
          requiredPrivileges: [`${PLUGIN_ID}-readLiveQueries`],
        },
      },
      options: { tags: ['api'] },
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v1,
        validate: {
          request: {
            query: buildRouteValidation<
              typeof getHistoryUsersRequestQuerySchema,
              GetHistoryUsersRequestQuerySchema
            >(getHistoryUsersRequestQuerySchema),
          },
        },
      },
      async (context, request, response) => {
        try {
          const [coreStartServices] = await osqueryContext.getStartServices();
          const esClient = coreStartServices.elasticsearch.client.asInternalUser;

          const spaceId = osqueryContext?.service?.getActiveSpace
            ? (await osqueryContext.service.getActiveSpace(request))?.id || DEFAULT_SPACE_ID
            : DEFAULT_SPACE_ID;

          const actionsIndexExists = await esClient.indices.exists({
            index: `${ACTIONS_INDEX}*`,
          });

          const index = actionsIndexExists ? `${ACTIONS_INDEX}*` : AGENT_ACTIONS_INDEX;

          const { searchTerm } = request.query;

          const filter: estypes.QueryDslQueryContainer[] = [
            buildSpaceIdFilter(spaceId),
            { term: { type: 'INPUT_ACTION' } },
            { term: { input_type: 'osquery' } },
            { exists: { field: 'user_id' } },
          ];

          if (searchTerm?.trim()) {
            const escaped = searchTerm.trim().replace(/[\\*?]/g, '\\$&');
            filter.push({ wildcard: { user_id: `*${escaped}*` } });
          }

          const result = await esClient.search({
            index,
            size: 0,
            query: { bool: { filter } },
            aggs: {
              unique_users: {
                terms: {
                  field: 'user_id',
                  size: USERS_PAGE_SIZE,
                },
                aggs: {
                  latest_profile_uid: {
                    terms: {
                      field: 'user_profile_uid',
                      size: 1,
                    },
                  },
                },
              },
            },
          });

          const buckets =
            (result.aggregations?.unique_users as { buckets: UserBucket[] })?.buckets ?? [];

          const users = buckets.map((bucket) => ({
            user_id: bucket.key,
            user_profile_uid: bucket.latest_profile_uid?.buckets?.[0]?.key,
          }));

          return response.ok({
            body: { data: users },
          });
        } catch (e) {
          return response.customError({
            statusCode: e.statusCode ?? 500,
            body: { message: 'Failed to fetch history users' },
          });
        }
      }
    );
};
