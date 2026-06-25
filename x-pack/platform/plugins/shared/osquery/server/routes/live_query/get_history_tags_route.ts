/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter } from '@kbn/core/server';
import type { DataRequestHandlerContext } from '@kbn/data-plugin/server';
import { AGENT_ACTIONS_INDEX } from '@kbn/fleet-plugin/common';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';
import { API_VERSIONS, ACTIONS_INDEX } from '../../../common/constants';
import { PLUGIN_ID } from '../../../common';
import { buildSpaceIdFilter } from '../../utils/build_space_id_filter';

// Max unique tags returned by the aggregation; results beyond this are truncated
const TAGS_AGG_SIZE = 200;

interface TagBucket {
  key: string;
  doc_count: number;
}

export const getHistoryTagsRoute = (
  router: IRouter<DataRequestHandlerContext>,
  osqueryContext: OsqueryAppContext
) => {
  router.versioned
    .get({
      access: 'internal',
      path: '/internal/osquery/history/tags',
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
        validate: {},
      },
      async (_, request, response) => {
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

          const result = await esClient.search({
            index,
            size: 0,
            query: {
              bool: {
                filter: [
                  buildSpaceIdFilter(spaceId),
                  { term: { type: 'INPUT_ACTION' } },
                  { term: { input_type: 'osquery' } },
                  { exists: { field: 'tags' } },
                ],
              },
            },
            aggs: {
              unique_tags: {
                terms: {
                  field: 'tags',
                  size: TAGS_AGG_SIZE,
                },
              },
            },
          });

          const buckets =
            (result.aggregations?.unique_tags as { buckets: TagBucket[] })?.buckets ?? [];

          const tags = buckets.map((bucket) => bucket.key);

          return response.ok({
            body: { data: tags },
          });
        } catch (e) {
          return response.customError({
            statusCode: e.statusCode ?? 500,
            body: { message: 'Failed to fetch history tags' },
          });
        }
      }
    );
};
