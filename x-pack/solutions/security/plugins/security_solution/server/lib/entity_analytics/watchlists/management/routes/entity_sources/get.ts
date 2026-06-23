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

import { WATCHLISTS_DATA_SOURCE_URL } from '../../../../../../../common/constants';
import { WatchlistDataSources } from '../../../../../../../common/api/entity_analytics';

import type { EntityAnalyticsRoutesDeps } from '../../../../types';
import { withMinimumLicense } from '../../../../utils/with_minimum_license';
import { WatchlistEntitySourceClient } from '../../../entity_sources/infra';
import { getWatchlistSavedObjectClient } from '../../../shared/utils';

export const getEntitySourceRoute = (
  router: EntityAnalyticsRoutesDeps['router'],
  logger: Logger,
  getStartServices: EntityAnalyticsRoutesDeps['getStartServices'],
  hasEncryptionKey: EntityAnalyticsRoutesDeps['hasEncryptionKey']
) => {
  router.versioned
    .get({
      access: 'public',
      path: `${WATCHLISTS_DATA_SOURCE_URL}/{id}`,
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
            params: WatchlistDataSources.GetWatchlistEntitySourceRequestParams,
          },
        },
      },
      withMinimumLicense(
        async (
          context,
          request,
          response
        ): Promise<IKibanaResponse<WatchlistDataSources.GetWatchlistEntitySourceResponse>> => {
          const siemResponse = buildSiemResponse(response);

          try {
            const secSol = await context.securitySolution;
            const core = await context.core;
            const client = new WatchlistEntitySourceClient({
              soClient: getWatchlistSavedObjectClient(core),
              namespace: secSol.getSpaceId(),
              getStartServices,
              esClient: core.elasticsearch.client.asCurrentUser,
              logger,
              hasEncryptionKey,
            });
            const body = await client.get(request.params.id);
            return response.ok({ body });
          } catch (e) {
            const error = transformError(e);
            logger.error(`Error getting watchlist entity source config: ${error.message}`);
            return siemResponse.error({
              statusCode: error.statusCode,
              body: error.message,
            });
          }
        },
        'platinum'
      )
    );
};
