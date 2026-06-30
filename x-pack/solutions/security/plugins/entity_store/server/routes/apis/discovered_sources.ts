/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IKibanaResponse } from '@kbn/core-http-server';
import { API_VERSIONS, ENTITY_STORE_ROUTES } from '../../../common';
import { DEFAULT_ENTITY_STORE_PERMISSIONS } from '../constants';
import type { EntityStorePluginRouter } from '../../types';
import { wrapMiddlewares } from '../middleware';
import type { DiscoveredSourcesResult } from '../../domain/logs_extraction/logs_extraction_client';

/**
 * Read-only visibility into deterministic source discovery (POC): the per-type
 * source patterns each engine would scope its ESQL `FROM` to, and why each
 * source qualified. Returns `enabled: false` with empty results when the
 * `useDiscoveredIndexSource` flag is off or the store is not installed.
 */
export type DiscoveredSourcesResponseBody = DiscoveredSourcesResult;

export function registerDiscoveredSources(router: EntityStorePluginRouter) {
  router.versioned
    .get({
      path: ENTITY_STORE_ROUTES.internal.DISCOVERED_SOURCES,
      access: 'internal',
      summary: 'Get deterministically discovered entity sources',
      description:
        'Return the per-entity-type index source patterns discovered for the current space, along with the identity fields that qualified each source.',
      options: {
        tags: ['oas-tag:Security entity store'],
      },
      security: {
        authz: DEFAULT_ENTITY_STORE_PERMISSIONS,
      },
      enableQueryVersion: true,
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v2,
        validate: false,
      },
      wrapMiddlewares(
        async (ctx, req, res): Promise<IKibanaResponse<DiscoveredSourcesResponseBody>> => {
          const entityStoreCtx = await ctx.entityStore;
          const { logger, logsExtractionClient } = entityStoreCtx;
          logger.debug('Discovered sources API invoked');

          const body = await logsExtractionClient.getDiscoveredSources();

          return res.ok({ body });
        }
      )
    );
}
