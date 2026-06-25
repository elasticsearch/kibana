/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as t from 'io-ts';
import type { IRouter } from '@kbn/core/server';
import type { DataRequestHandlerContext } from '@kbn/data-plugin/server';
import { AGENT_ACTIONS_INDEX } from '@kbn/fleet-plugin/common';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';
import {
  API_VERSIONS,
  ACTIONS_INDEX,
  ACTION_RESPONSES_DATA_STREAM_INDEX,
  MAX_TAGS_PER_ACTION,
  MAX_TAG_LENGTH,
} from '../../../common/constants';
import { PLUGIN_ID } from '../../../common';
import { buildRouteValidation } from '../../utils/build_validation/route_validation';
import { buildSpaceIdFilter } from '../../utils/build_space_id_filter';
import { updateActionTagsResponseSchema } from './response_schemas';

const updateActionTagsRequestParamsSchema = t.type({
  id: t.string,
});

type UpdateActionTagsRequestParamsSchema = t.OutputOf<typeof updateActionTagsRequestParamsSchema>;

const updateActionTagsRequestBodySchema = t.type({
  tags: t.array(t.string),
});

type UpdateActionTagsRequestBodySchema = t.OutputOf<typeof updateActionTagsRequestBodySchema>;

export const updateActionTagsRoute = (
  router: IRouter<DataRequestHandlerContext>,
  osqueryContext: OsqueryAppContext
) => {
  router.versioned
    .put({
      access: 'public',
      path: '/api/osquery/history/{id}/tags',
      security: {
        authz: {
          requiredPrivileges: [`${PLUGIN_ID}-writeLiveQueries`],
        },
      },
      options: { tags: ['api'] },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: {
            params: buildRouteValidation<
              typeof updateActionTagsRequestParamsSchema,
              UpdateActionTagsRequestParamsSchema
            >(updateActionTagsRequestParamsSchema),
            body: buildRouteValidation<
              typeof updateActionTagsRequestBodySchema,
              UpdateActionTagsRequestBodySchema
            >(updateActionTagsRequestBodySchema),
          },
          response: {
            200: {
              body: () => updateActionTagsResponseSchema,
            },
          },
        },
      },
      async (_, request, response) => {
        try {
          const tags = [...new Set(request.body.tags)];

          if (tags.length > MAX_TAGS_PER_ACTION) {
            return response.badRequest({
              body: { message: `Cannot have more than ${MAX_TAGS_PER_ACTION} tags` },
            });
          }

          const invalidTag = tags.find((tag) => tag.length === 0 || tag.length > MAX_TAG_LENGTH);
          if (invalidTag !== undefined) {
            return response.badRequest({
              body: {
                message: `Tags must be non-empty strings with a maximum length of ${MAX_TAG_LENGTH}`,
              },
            });
          }

          const [coreStartServices] = await osqueryContext.getStartServices();
          const esClient = coreStartServices.elasticsearch.client.asInternalUser;

          const spaceId = osqueryContext?.service?.getActiveSpace
            ? (await osqueryContext.service.getActiveSpace(request))?.id || DEFAULT_SPACE_ID
            : DEFAULT_SPACE_ID;

          const actionsIndexExists = await esClient.indices.exists({
            index: `${ACTIONS_INDEX}*`,
          });

          const index = actionsIndexExists ? `${ACTIONS_INDEX}*` : AGENT_ACTIONS_INDEX;

          const spaceFilter = buildSpaceIdFilter(spaceId);

          const searchResult = await esClient.search({
            index,
            size: 1,
            query: {
              bool: {
                filter: [
                  spaceFilter,
                  { term: { type: 'INPUT_ACTION' } },
                  { term: { input_type: 'osquery' } },
                  { term: { action_id: request.params.id } },
                ],
              },
            },
            _source: false,
          });

          const hit = searchResult.hits.hits[0];

          if (!hit) {
            const scheduledCheck = await esClient.search({
              index: `${ACTION_RESPONSES_DATA_STREAM_INDEX}-*`,
              size: 0,
              query: {
                bool: {
                  filter: [{ term: { schedule_id: request.params.id } }, spaceFilter],
                },
              },
            });

            const totalHits = scheduledCheck.hits.total;
            const scheduledCount =
              typeof totalHits === 'number' ? totalHits : totalHits?.value ?? 0;

            if (scheduledCount > 0) {
              return response.badRequest({
                body: {
                  message:
                    'Tags are not supported for scheduled query results. Tags can only be added to live queries and queries from rules.',
                },
              });
            }

            return response.notFound({
              body: { message: `Action ${request.params.id} not found` },
            });
          }

          await esClient.update({
            index: hit._index,
            id: hit._id as string,
            doc: { tags },
            refresh: 'wait_for',
          });

          return response.ok({
            body: { data: { tags } },
          });
        } catch (e) {
          if (e.statusCode === 404) {
            return response.notFound({
              body: { message: `Action ${request.params.id} not found` },
            });
          }

          return response.customError({
            statusCode: e.statusCode ?? 500,
            body: { message: e.message },
          });
        }
      }
    );
};
