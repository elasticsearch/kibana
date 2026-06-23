/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildSiemResponse } from '@kbn/lists-plugin/server/routes/utils';
import { transformError } from '@kbn/securitysolution-es-utils';
import type { IKibanaResponse, Logger } from '@kbn/core/server';
import { APP_ID } from '@kbn/security-solution-features/constants';

import { CRUDClient } from '@kbn/entity-store/server/domain/crud';
import { WATCHLISTS_ENTITIES_UNASSIGN_URL } from '../../../../../../../common/entity_analytics/watchlists/constants';
import { API_VERSIONS } from '../../../../../../../common/entity_analytics/constants';
import {
  UnassignWatchlistEntitiesRequestParams,
  UnassignWatchlistEntitiesRequestBody,
  type UnassignWatchlistEntitiesResponse,
} from '../../../../../../../common/api/entity_analytics/watchlists/entities/unassign.gen';
import type { EntityAnalyticsRoutesDeps } from '../../../../types';
import { withMinimumLicense } from '../../../../utils/with_minimum_license';
import { WatchlistConfigClient } from '../../watchlist_config';
import { createManualEntityService } from '../../../entity_sources/manual/service';
import { getIndexForWatchlist } from '../../../entities/utils';

export const unassignWatchlistEntitiesRoute = (
  router: EntityAnalyticsRoutesDeps['router'],
  logger: Logger
) => {
  router.versioned
    .post({
      access: 'public',
      path: WATCHLISTS_ENTITIES_UNASSIGN_URL,
      security: {
        authz: {
          requiredPrivileges: ['securitySolution', `${APP_ID}-entity-analytics`],
        },
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: {
            params: UnassignWatchlistEntitiesRequestParams,
            body: UnassignWatchlistEntitiesRequestBody,
          },
        },
      },
      withMinimumLicense(
        async (
          context,
          request,
          response
        ): Promise<IKibanaResponse<UnassignWatchlistEntitiesResponse>> => {
          const siemResponse = buildSiemResponse(response);
          try {
            const secSol = await context.securitySolution;
            const core = await context.core;
            const namespace = secSol.getSpaceId();

            const esClient = core.elasticsearch.client.asCurrentUser;
            const soClient = core.savedObjects.client;

            const watchlistClient = new WatchlistConfigClient({
              esClient,
              soClient,
              logger,
              namespace,
            });

            const watchlistId = request.params.watchlist_id;
            const watchlist = await watchlistClient.get(watchlistId);

            logger.debug(
              `[WatchlistEntitiesUnassign] Unassigning ${request.body.euids.length} entities from watchlist ${watchlistId}`
            );

            const service = createManualEntityService({
              esClient,
              crudClient: new CRUDClient({ logger, esClient, namespace }),
              logger,
              watchlist: {
                name: watchlist.name,
                id: watchlist.id || watchlistId,
                index: getIndexForWatchlist(namespace),
              },
            });

            const result = await service.unassign(request.body.euids);

            return response.ok({ body: result });
          } catch (e) {
            logger.error(`[WatchlistEntitiesUnassign] Error during entity unassignment: ${e}`);
            const error = transformError(e);
            return siemResponse.error({ statusCode: error.statusCode, body: error.message });
          }
        },
        'platinum'
      )
    );
};
