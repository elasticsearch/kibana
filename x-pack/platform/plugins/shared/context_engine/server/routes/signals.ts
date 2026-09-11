/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { IRouter } from '@kbn/core/server';
import type { RouteSecurity } from '@kbn/core-http-server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import {
  DEFAULT_SIGNALS_PAGE_SIZE,
  MAX_SIGNAL_GROUPS,
  MAX_SIGNALS_PAGE_SIZE,
  SIGNALS_INTERNAL_API_VERSION,
  signalGroupsPath,
  signalsPath,
} from '../../common/constants';
import type { ListSignalGroupsResponse, ListSignalsResponse } from '../../common/http_api/signals';
import { apiPrivileges } from '../../common/features';
import { getSignalGroups, getSignalsByTag } from '../signals/read';
import { resolveSpaceId } from '../utils/resolve_space_id';
import { withContextEngineFeatureFlag } from './with_feature_flag';

const READ_SECURITY: RouteSecurity = {
  authz: { requiredPrivileges: [apiPrivileges.readContextEngine] },
};

/** Upper bound on `from + size`, so deep pagination cannot exceed ES `index.max_result_window`. */
const MAX_RESULT_WINDOW = 10000;

const listSignalsQuerySchema = schema.object({
  tag: schema.string({
    minLength: 1,
    maxLength: 1024,
    meta: { description: 'The tag whose signals should be fetched.' },
  }),
  from: schema.number({
    min: 0,
    max: MAX_RESULT_WINDOW - MAX_SIGNALS_PAGE_SIZE,
    defaultValue: 0,
  }),
  size: schema.number({
    min: 1,
    max: MAX_SIGNALS_PAGE_SIZE,
    defaultValue: DEFAULT_SIGNALS_PAGE_SIZE,
  }),
});

/**
 * Registers the read-only Signals routes. Reads run as the CURRENT USER (the signals indices are
 * per-space user indices), so both handlers use `asCurrentUser` and read the current space's index.
 */
export const registerSignalRoutes = ({
  router,
  getSpaces,
  getFeedbackLoopEnabled,
}: {
  router: IRouter;
  getSpaces: () => Promise<SpacesPluginStart | undefined>;
  /** Reads the global `contextEngine:feedbackLoopEnabled` setting; routes 404 while it is off. */
  getFeedbackLoopEnabled: () => Promise<boolean>;
}) => {
  // Preaggregated grouped-by-tag list.
  router.versioned
    .get({
      path: signalGroupsPath,
      security: READ_SECURITY,
      access: 'internal',
      summary: 'List signal groups',
      description:
        "Returns the current space's Context Engine signals grouped by tag: a terms aggregation over the whole space's signals store.",
    })
    .addVersion(
      { version: SIGNALS_INTERNAL_API_VERSION, validate: false },
      withContextEngineFeatureFlag(async (ctx, request, response) => {
        if (!(await getFeedbackLoopEnabled())) {
          return response.notFound();
        }
        const esClient = (await ctx.core).elasticsearch.client.asCurrentUser;
        const spaceId = resolveSpaceId(await getSpaces(), request);
        const body: ListSignalGroupsResponse = await getSignalGroups(esClient, {
          spaceId,
          maxGroups: MAX_SIGNAL_GROUPS,
        });
        return response.ok({ body });
      })
    );

  // Per-group signals (paginated).
  router.versioned
    .get({
      path: signalsPath,
      security: READ_SECURITY,
      access: 'internal',
      summary: 'List signals for a tag',
      description:
        'Returns the individual signals carrying a given tag, newest first and paginated.',
    })
    .addVersion(
      {
        version: SIGNALS_INTERNAL_API_VERSION,
        validate: { request: { query: listSignalsQuerySchema } },
      },
      withContextEngineFeatureFlag(async (ctx, request, response) => {
        if (!(await getFeedbackLoopEnabled())) {
          return response.notFound();
        }
        const esClient = (await ctx.core).elasticsearch.client.asCurrentUser;
        const spaceId = resolveSpaceId(await getSpaces(), request);
        const { tag, from, size } = request.query;
        const body: ListSignalsResponse = await getSignalsByTag(esClient, {
          spaceId,
          tag,
          from,
          size,
        });
        return response.ok({ body });
      })
    );
};
