/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { VersionedRouter } from '@kbn/core-http-server';
import type { Logger, RequestHandlerContext } from '@kbn/core/server';
import { AuthzDisabled } from '@kbn/core-security-server';
import { writeErrorHandler } from '@kbn/as-code-utils';
import { z } from '@kbn/zod';
import {
  DASHBOARD_PLAYLIST_API_PATH,
  DASHBOARD_PLAYLIST_API_VERSION,
  DASHBOARD_PLAYLIST_SAVED_OBJECT_TYPE,
  type DashboardPlaylistAttributes,
} from '../common/playlist';

const playlistSchema = z.object({
  name: z.string().trim().min(1).max(256),
  dashboardIds: z.array(z.string().min(1).max(512)).min(1).max(100),
  duration: z.number().finite().positive().max(86_400_000),
});
const playlistResponseSchema = playlistSchema.extend({ id: z.string() });

const idSchema = z.object({ id: z.string().min(1).max(512) });

const serialize = (savedObject: { id: string; attributes: DashboardPlaylistAttributes }) => ({
  id: savedObject.id,
  ...savedObject.attributes,
});

export function registerPlaylistRoutes(
  router: VersionedRouter<RequestHandlerContext>,
  logger: Logger
) {
  const routeConfig = {
    access: 'internal' as const,
    security: { authz: AuthzDisabled.delegateToSOClient },
  };

  const listRoute = router.get({
    path: DASHBOARD_PLAYLIST_API_PATH,
    summary: 'List dashboard playlists',
    ...routeConfig,
  });
  listRoute.addVersion(
    {
      version: DASHBOARD_PLAYLIST_API_VERSION,
      validate: {
        response: { 200: { body: () => z.array(playlistResponseSchema) } },
      },
    },
    async (ctx, req, res) => {
      try {
        const { core } = await ctx.resolve(['core']);
        const savedObjects = [];
        let page = 1;
        let total = 0;
        do {
          const result = await core.savedObjects.client.find<DashboardPlaylistAttributes>({
            type: DASHBOARD_PLAYLIST_SAVED_OBJECT_TYPE,
            perPage: 100,
            page,
            sortField: 'updated_at',
            sortOrder: 'desc',
          });
          savedObjects.push(...result.saved_objects);
          total = result.total;
          page += 1;
        } while (savedObjects.length < total);
        return res.ok({ body: savedObjects.map(serialize) });
      } catch (error) {
        return writeErrorHandler(error, res, logger, req);
      }
    }
  );

  const createRoute = router.post({
    path: DASHBOARD_PLAYLIST_API_PATH,
    summary: 'Create a dashboard playlist',
    ...routeConfig,
  });
  createRoute.addVersion(
    {
      version: DASHBOARD_PLAYLIST_API_VERSION,
      validate: {
        request: { body: playlistSchema },
        response: { 201: { body: () => playlistResponseSchema } },
      },
    },
    async (ctx, req, res) => {
      try {
        const { core } = await ctx.resolve(['core']);
        const result = await core.savedObjects.client.create<DashboardPlaylistAttributes>(
          DASHBOARD_PLAYLIST_SAVED_OBJECT_TYPE,
          req.body
        );
        return res.created({ body: serialize(result) });
      } catch (error) {
        return writeErrorHandler(error, res, logger, req);
      }
    }
  );

  const updateRoute = router.put({
    path: `${DASHBOARD_PLAYLIST_API_PATH}/{id}`,
    summary: 'Update a dashboard playlist',
    ...routeConfig,
  });
  updateRoute.addVersion(
    {
      version: DASHBOARD_PLAYLIST_API_VERSION,
      validate: {
        request: { params: idSchema, body: playlistSchema },
        response: { 200: { body: () => playlistResponseSchema } },
      },
    },
    async (ctx, req, res) => {
      try {
        const { core } = await ctx.resolve(['core']);
        await core.savedObjects.client.update<DashboardPlaylistAttributes>(
          DASHBOARD_PLAYLIST_SAVED_OBJECT_TYPE,
          req.params.id,
          req.body
        );
        return res.ok({ body: serialize({ id: req.params.id, attributes: req.body }) });
      } catch (error) {
        return writeErrorHandler(error, res, logger, req);
      }
    }
  );

  const getRoute = router.get({
    path: `${DASHBOARD_PLAYLIST_API_PATH}/{id}`,
    summary: 'Get a dashboard playlist',
    ...routeConfig,
  });
  getRoute.addVersion(
    {
      version: DASHBOARD_PLAYLIST_API_VERSION,
      validate: {
        request: { params: idSchema },
        response: { 200: { body: () => playlistResponseSchema } },
      },
    },
    async (ctx, req, res) => {
      try {
        const { core } = await ctx.resolve(['core']);
        const result = await core.savedObjects.client.get<DashboardPlaylistAttributes>(
          DASHBOARD_PLAYLIST_SAVED_OBJECT_TYPE,
          req.params.id
        );
        return res.ok({ body: serialize(result) });
      } catch (error) {
        return writeErrorHandler(error, res, logger, req);
      }
    }
  );

  const deleteRoute = router.delete({
    path: `${DASHBOARD_PLAYLIST_API_PATH}/{id}`,
    summary: 'Delete a dashboard playlist',
    ...routeConfig,
  });
  deleteRoute.addVersion(
    { version: DASHBOARD_PLAYLIST_API_VERSION, validate: { request: { params: idSchema } } },
    async (ctx, req, res) => {
      try {
        const { core } = await ctx.resolve(['core']);
        await core.savedObjects.client.delete(DASHBOARD_PLAYLIST_SAVED_OBJECT_TYPE, req.params.id);
        logger.debug(`Deleted dashboard playlist [${req.params.id}]`);
        return res.noContent();
      } catch (error) {
        return writeErrorHandler(error, res, logger, req);
      }
    }
  );
}
