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
import { WATCHLISTS_PREBUILT_INSTALL_URL } from '../../../../../../common/entity_analytics/watchlists/constants';
import type { EntityAnalyticsRoutesDeps } from '../../../types';
import { WatchlistConfigClient } from '../watchlist_config';
import { getWatchlistSavedObjectClient } from '../../shared/utils';
import { ensurePrebuiltWatchlists } from '../../migrations/install_prebuilt_watchlists';

export const installPrebuiltWatchlistsRoute = (
  router: EntityAnalyticsRoutesDeps['router'],
  logger: Logger,
  getStartServices: EntityAnalyticsRoutesDeps['getStartServices'],
  hasEncryptionKey: EntityAnalyticsRoutesDeps['hasEncryptionKey']
) => {
  router.versioned
    .post({
      access: 'public',
      path: WATCHLISTS_PREBUILT_INSTALL_URL,
      security: {
        authz: {
          requiredPrivileges: ['securitySolution', `${APP_ID}-entity-analytics`],
        },
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: false,
      },
      async (context, _request, response): Promise<IKibanaResponse<{ acknowledged: boolean }>> => {
        const siemResponse = buildSiemResponse(response);

        try {
          const secSol = await context.securitySolution;
          const core = await context.core;
          const namespace = secSol.getSpaceId();
          const soClient = getWatchlistSavedObjectClient(core);
          const esClient = core.elasticsearch.client.asCurrentUser;

          const watchlistClient = new WatchlistConfigClient({
            namespace,
            soClient,
            esClient,
            internalEsClient: core.elasticsearch.client.asInternalUser,
            logger,
          });

          logger.debug(
            `[WATCHLIST INSTALL ROUTE]Installing prebuilt watchlists for namespace: ${namespace} from watchlist install route`
          );
          await ensurePrebuiltWatchlists({
            watchlistClient,
            soClient,
            namespace,
            logger,
            esClient,
            getStartServices,
            hasEncryptionKey,
          });

          return response.ok({
            body: { acknowledged: true },
          });
        } catch (e) {
          const error = transformError(e);
          logger.error(`Error ensuring prebuilt watchlists: ${error.message}`);
          return siemResponse.error({
            statusCode: error.statusCode,
            body: error.message,
          });
        }
      }
    );
};
