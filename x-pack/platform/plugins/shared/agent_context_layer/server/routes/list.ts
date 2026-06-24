/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { CoreSetup, IRouter, Logger } from '@kbn/core/server';
import type { SmlListHttpResponse } from '../../common/http_api/sml';
import {
  SML_HTTP_LIST_PAGE_DEFAULT,
  SML_HTTP_LIST_PER_PAGE_DEFAULT,
  SML_HTTP_LIST_PER_PAGE_MAX,
} from '../../common/http_api/sml';
import { smlBasePath } from '../../common/constants';
import type { SmlService } from '../services/sml/types';
import type { AgentContextLayerStartDependencies, AgentContextLayerPluginStart } from '../types';
import { READ_SECURITY, toSmlHttpItem, withSmlFeatureFlag } from './common';
import { SmlResultWindowExceededError } from '../services/sml/sml_errors';

export const registerListRoute = ({
  router,
  coreSetup,
  logger,
  getSmlService,
}: {
  router: IRouter;
  coreSetup: CoreSetup<AgentContextLayerStartDependencies, AgentContextLayerPluginStart>;
  logger: Logger;
  getSmlService: () => SmlService;
}) => {
  router.get(
    {
      path: smlBasePath,
      validate: {
        query: schema.object({
          page: schema.number({ defaultValue: SML_HTTP_LIST_PAGE_DEFAULT, min: 1 }),
          per_page: schema.number({
            defaultValue: SML_HTTP_LIST_PER_PAGE_DEFAULT,
            min: 1,
            max: SML_HTTP_LIST_PER_PAGE_MAX,
          }),
          type: schema.maybe(schema.string({ minLength: 1 })),
          origin_uri: schema.maybe(schema.string({ minLength: 1, maxLength: 512 })),
          tags: schema.maybe(
            schema.string({
              maxLength: 2000,
              meta: {
                description:
                  'Comma-delimited list of tags to filter by (OR semantics — returns documents matching any supplied tag). Tag values must be lowercase alphanumeric with optional hyphens or underscores. Example: `?tags=otel,my-tag`.',
              },
            })
          ),
        }),
      },
      options: { access: 'internal' },
      security: READ_SECURITY,
    },
    withSmlFeatureFlag(async (ctx, request, response) => {
      try {
        const sml = getSmlService();
        const {
          page,
          per_page: perPage,
          type,
          origin_uri: originUri,
          tags: tagsParam,
        } = request.query as {
          page: number;
          per_page: number;
          type?: string;
          origin_uri?: string;
          tags?: string;
        };
        const coreContext = await ctx.core;
        const esClient = coreContext.elasticsearch.client;

        const [, startDeps] = await coreSetup.getStartServices();
        const spaceId = startDeps.spaces?.spacesService?.getSpaceId(request) ?? 'default';

        const tags = tagsParam
          ? tagsParam
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : undefined;

        const { results } = await sml.listDocuments({
          spaceId,
          esClient,
          page,
          perPage,
          type,
          originUri,
          tags,
        });

        // TODO: Push permission filtering into the ES query for accurate pagination.
        let filteredResults = results;
        if (results.length > 0) {
          const ids = results.map((r) => r.id);
          const accessMap = await sml.checkItemsAccess({ ids, spaceId, esClient, request });
          filteredResults = results.filter((r) => accessMap.get(r.id) !== false);
        }

        const body: SmlListHttpResponse = {
          page,
          per_page: perPage,
          items: filteredResults.map(toSmlHttpItem),
        };

        return response.ok({ body });
      } catch (error) {
        if (error instanceof SmlResultWindowExceededError) {
          return response.badRequest({ body: { message: error.message } });
        }
        logger.error(`SML list route error: ${(error as Error).message}`);
        throw error;
      }
    })
  );
};
