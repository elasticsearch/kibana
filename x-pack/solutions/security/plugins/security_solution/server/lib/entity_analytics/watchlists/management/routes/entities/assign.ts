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
import { WATCHLISTS_ENTITIES_ASSIGN_URL } from '../../../../../../../common/entity_analytics/watchlists/constants';
import { API_VERSIONS } from '../../../../../../../common/entity_analytics/constants';
import {
  AssignWatchlistEntitiesRequestParams,
  AssignWatchlistEntitiesRequestBody,
  type AssignWatchlistEntitiesResponse,
} from '../../../../../../../common/api/entity_analytics/watchlists/entities/assign.gen';
import type { EntityAnalyticsRoutesDeps } from '../../../../types';
import { withMinimumLicense } from '../../../../utils/with_minimum_license';
import { WatchlistConfigClient } from '../../watchlist_config';
import { createManualEntityService } from '../../../entity_sources/manual/service';
import { getIndexForWatchlist } from '../../../entities/utils';

export const assignWatchlistEntitiesRoute = (
  router: EntityAnalyticsRoutesDeps['router'],
  logger: Logger
) => {
  router.versioned
    .post({
      access: 'public',
      path: WATCHLISTS_ENTITIES_ASSIGN_URL,
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
            params: AssignWatchlistEntitiesRequestParams,
            body: AssignWatchlistEntitiesRequestBody,
          },
        },
      },
      withMinimumLicense(
        async (
          context,
          request,
          response
        ): Promise<IKibanaResponse<AssignWatchlistEntitiesResponse>> => {
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
              `[WatchlistEntitiesAssign] Assigning ${request.body.euids.length} entities to watchlist ${watchlistId}`
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

            const result = await service.assign(request.body.euids);

            return response.ok({ body: result });
          } catch (e) {
            logger.error(`[WatchlistEntitiesAssign] Error during entity assignment: ${e}`);
            const error = transformError(e);
            return siemResponse.error({ statusCode: error.statusCode, body: error.message });
          }
        },
        'platinum'
      )
    );
};
