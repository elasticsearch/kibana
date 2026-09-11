/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { CoreSetup, IRouter, Logger } from '@kbn/core/server';
import type {
  SmlAutocompleteHttpResponse,
  SmlAutocompleteHttpResultItem,
} from '../../common/http_api/sml';
import {
  SML_HTTP_AUTOCOMPLETE_QUERY_MAX_LENGTH,
  SmlSearchFilterType,
} from '../../common/http_api/sml';
import { smlAutocompletePath } from '../../common/constants';
import type { SmlService } from '../services/sml/types';
import type { AgentBuilderSmlStartDependencies, AgentBuilderSmlPluginStart } from '../types';
import { READ_SECURITY, getEffectiveFilters } from './common';

const SML_AUTOCOMPLETE_SIZE_MAX = 50;

export const registerAutocompleteRoute = ({
  router,
  coreSetup,
  logger,
  getSmlService,
}: {
  router: IRouter;
  coreSetup: CoreSetup<AgentBuilderSmlStartDependencies, AgentBuilderSmlPluginStart>;
  logger: Logger;
  getSmlService: () => SmlService;
}) => {
  router.post(
    {
      path: smlAutocompletePath,
      validate: {
        body: schema.object({
          query: schema.string({ minLength: 1, maxLength: SML_HTTP_AUTOCOMPLETE_QUERY_MAX_LENGTH }),
          size: schema.maybe(schema.number({ min: 1, max: SML_AUTOCOMPLETE_SIZE_MAX })),
          // Runtime-imposed per-type constraints (e.g. agent-centric connector
          // allow-list). Same shape as the `constraints` field on POST /sml/_search
          // so a single FE scope-builder can feed either route.
          constraints: schema.maybe(
            schema.recordOf(
              schema.literal(SmlSearchFilterType.connector),
              schema.object({
                ids: schema.maybe(
                  schema.arrayOf(schema.string({ maxLength: 100 }), { maxSize: 100 })
                ),
              })
            )
          ),
          // Caller-supplied type/tag refinements — same shape as on POST /sml/_search.
          // Useful for specialized UI pickers (e.g. connectors-only @ menu).
          filters: schema.maybe(
            schema.object({
              types: schema.maybe(
                schema.arrayOf(schema.string({ maxLength: 200 }), { maxSize: 100 })
              ),
              tags: schema.maybe(
                schema.arrayOf(schema.string({ maxLength: 200 }), { maxSize: 100 })
              ),
            })
          ),
        }),
      },
      options: { access: 'internal' },
      security: READ_SECURITY,
    },
    async (ctx, request, response) => {
      try {
        const sml = getSmlService();
        const { query, size, constraints, filters } = request.body;
        const coreContext = await ctx.core;
        const esClient = coreContext.elasticsearch.client;

        const effectiveFilters = await getEffectiveFilters(coreContext.uiSettings.client, filters);

        const [, startDeps] = await coreSetup.getStartServices();
        const spaceId = startDeps.spaces?.spacesService?.getSpaceId(request) ?? 'default';

        const { results } = await sml.autocomplete({
          query,
          size,
          spaceId,
          esClient,
          request,
          constraints,
          filters: effectiveFilters,
        });

        const body: SmlAutocompleteHttpResponse = {
          results: results.map(
            ({ id, type, origin, title }): SmlAutocompleteHttpResultItem => ({
              id,
              type,
              origin,
              title,
            })
          ),
        };

        return response.ok({ body });
      } catch (error) {
        logger.error(`SML autocomplete route error: ${(error as Error).message}`);
        throw error;
      }
    }
  );
};
