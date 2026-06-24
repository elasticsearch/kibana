/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { CoreSetup, IRouter, Logger } from '@kbn/core/server';
import type { SmlUpsertHttpResponse } from '../../common/http_api/sml';
import { smlByIdPath } from '../../common/constants';
import type { SmlDocumentInput, SmlService } from '../services/sml/types';
import type { AgentContextLayerStartDependencies, AgentContextLayerPluginStart } from '../types';
import { WRITE_SECURITY, toSmlHttpItem, withSmlFeatureFlag } from './common';

export const registerUpsertRoute = ({
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
  router.put(
    {
      path: smlByIdPath,
      validate: {
        params: schema.object({
          id: schema.string({ minLength: 1 }),
        }),
        // TODO: Add maxLength bounds to string fields (type, title, origin_id, content) to
        // prevent abuse with excessively long values.
        body: schema.object({
          type: schema.string({ minLength: 1 }),
          title: schema.string({ minLength: 1 }),
          origin_id: schema.string({ minLength: 1 }),
          content: schema.string(),
          tags: schema.maybe(
            schema.arrayOf(
              schema.string({
                maxLength: 100,
                validate: (v) =>
                  /^[a-z0-9][a-z0-9_-]*$/.test(v)
                    ? undefined
                    : 'must be lowercase alphanumeric and may contain hyphens or underscores (e.g. "my-tag", "otel_v2")',
                meta: {
                  description:
                    'A single tag value. Must be lowercase alphanumeric; hyphens and underscores are allowed (e.g. "otel", "my-tag", "v2_data"). Commas are not allowed — use separate array entries.',
                },
              }),
              {
                maxSize: 100,
                meta: {
                  description:
                    'Optional tags for grouping and retrieval. Tags are matched with OR semantics on the list endpoint — a document is returned if it has any of the requested tags. Maximum 100 tags per document; each tag is at most 100 characters.',
                },
              }
            )
          ),
          permissions: schema.maybe(
            schema.object({
              kibana: schema.maybe(
                schema.object({
                  privileges: schema.arrayOf(
                    schema.object({ name: schema.string({ minLength: 1, maxLength: 255 }) }),
                    { maxSize: 100 }
                  ),
                })
              ),
              elasticsearch: schema.maybe(
                schema.object({
                  indices: schema.arrayOf(
                    schema.object({ name: schema.string({ minLength: 1, maxLength: 255 }) }),
                    { maxSize: 100 }
                  ),
                })
              ),
            })
          ),
        }),
      },
      options: { access: 'internal' },
      security: WRITE_SECURITY,
    },
    withSmlFeatureFlag(async (ctx, request, response) => {
      try {
        const sml = getSmlService();
        const { id } = request.params as { id: string };
        const coreContext = await ctx.core;
        const esClient = coreContext.elasticsearch.client;

        const [, startDeps] = await coreSetup.getStartServices();
        const spaceId = startDeps.spaces?.spacesService?.getSpaceId(request) ?? 'default';

        const result = await sml.upsertDocument({
          id,
          spaceId,
          document: request.body as SmlDocumentInput,
          esClient,
        });
        if (!result) {
          return response.notFound({ body: { message: `SML document '${id}' not found` } });
        }

        const body: SmlUpsertHttpResponse = {
          item: toSmlHttpItem(result.document),
          created: result.created,
        };

        return response.ok({ body });
      } catch (error) {
        logger.error(`SML upsert route error: ${(error as Error).message}`);
        throw error;
      }
    })
  );
};
