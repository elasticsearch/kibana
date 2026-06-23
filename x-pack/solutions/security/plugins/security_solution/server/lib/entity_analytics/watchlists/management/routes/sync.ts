/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildSiemResponse } from '@kbn/lists-plugin/server/routes/utils';
import { transformError } from '@kbn/securitysolution-es-utils';
import type { IKibanaResponse, Logger } from '@kbn/core/server';
import { API_VERSIONS } from '@kbn/elastic-assistant-common';
import { APP_ID } from '@kbn/security-solution-features/constants';

import { WATCHLISTS_SYNC_URL } from '../../../../../../common/entity_analytics/watchlists/constants';
import { SyncWatchlistRequestParams } from '../../../../../../common/api/entity_analytics';
import type { EntityAnalyticsRoutesDeps } from '../../../types';
import { withMinimumLicense } from '../../../utils/with_minimum_license';
import { createEntitySourcesService } from '../../entity_sources/entity_sources_service';
import { getWatchlistSavedObjectClient } from '../../shared/utils';

export const syncWatchlistRoute = (
  router: EntityAnalyticsRoutesDeps['router'],
  logger: Logger,
  getStartServices: EntityAnalyticsRoutesDeps['getStartServices'],
  hasEncryptionKey: EntityAnalyticsRoutesDeps['hasEncryptionKey']
) => {
  router.versioned
    .post({
      access: 'public',
      path: WATCHLISTS_SYNC_URL,
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
            params: SyncWatchlistRequestParams,
          },
        },
      },
      withMinimumLicense(async (context, request, response): Promise<IKibanaResponse> => {
        const siemResponse = buildSiemResponse(response);

        try {
          const secSol = await context.securitySolution;
          const core = await context.core;

          const entitySourcesService = createEntitySourcesService({
            esClient: core.elasticsearch.client.asCurrentUser,
            soClient: getWatchlistSavedObjectClient(core),
            logger,
            namespace: secSol.getSpaceId(),
            getStartServices,
            hasEncryptionKey,
          });

          await entitySourcesService.syncWatchlist(request.params.watchlist_id);

          return response.ok({ body: { acknowledged: true } });
        } catch (e) {
          const error = transformError(e);
          logger.error(`Failed to sync watchlist: ${error.message}`);
          return siemResponse.error({
            statusCode: error.statusCode,
            body: error.message,
          });
        }
      }, 'platinum')
    );
};
