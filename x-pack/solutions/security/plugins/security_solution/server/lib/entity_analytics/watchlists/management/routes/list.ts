/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IKibanaResponse, Logger } from '@kbn/core/server';
import { buildSiemResponse } from '@kbn/lists-plugin/server/routes/utils';
import { transformError } from '@kbn/securitysolution-es-utils';
import { API_VERSIONS, APP_ID } from '../../../../../../common/constants';
import { WATCHLISTS_URL } from '../../../../../../common/entity_analytics/watchlists/constants';
import type { EntityAnalyticsRoutesDeps } from '../../../types';
import { withMinimumLicense } from '../../../utils/with_minimum_license';
import type { ListWatchlistsResponse } from '../../../../../../common/api/entity_analytics/watchlists/management/list.gen';
import { WatchlistConfigClient } from '../watchlist_config';

export const listWatchlistsRoute = (
  router: EntityAnalyticsRoutesDeps['router'],
  logger: Logger
) => {
  router.versioned
    .get({
      access: 'public',
      path: `${WATCHLISTS_URL}/list`,
      security: {
        authz: {
          requiredPrivileges: ['securitySolution', `${APP_ID}-entity-analytics`],
        },
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {},
      },
      withMinimumLicense(
        async (context, request, response): Promise<IKibanaResponse<ListWatchlistsResponse>> => {
          const siemResponse = buildSiemResponse(response);
          try {
            const secSol = await context.securitySolution;
            const core = await context.core;

            const watchlistClient = new WatchlistConfigClient({
              namespace: secSol.getSpaceId(),
              soClient: core.savedObjects.client,
              esClient: core.elasticsearch.client.asCurrentUser,
              logger,
            });
            const body = await watchlistClient.list();
            return response.ok({ body });
          } catch (e) {
            const error = transformError(e);
            logger.error(`Failed to list watchlists: ${error.message}`);
            return siemResponse.error({
              body: error.message,
              statusCode: error.statusCode,
            });
          }
        },
        'platinum'
      )
    );
};
