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
import { WatchlistConfigClient } from '../../watchlist_config';
import { WatchlistEntitySourceClient } from '../../../entity_sources/infra';
import { getWatchlistSavedObjectClient } from '../../../shared/utils';

export const deleteEntitySourceRoute = (
  router: EntityAnalyticsRoutesDeps['router'],
  logger: Logger,
  getStartServices: EntityAnalyticsRoutesDeps['getStartServices'],
  hasEncryptionKey: EntityAnalyticsRoutesDeps['hasEncryptionKey']
) => {
  router.versioned
    .delete({
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
            params: WatchlistDataSources.DeleteWatchlistEntitySourceRequestParams,
          },
        },
      },
      withMinimumLicense(async (context, request, response): Promise<IKibanaResponse> => {
        const siemResponse = buildSiemResponse(response);

        try {
          const secSol = await context.securitySolution;
          const core = await context.core;
          const soClient = getWatchlistSavedObjectClient(core);
          const client = new WatchlistEntitySourceClient({
            soClient,
            namespace: secSol.getSpaceId(),
            getStartServices,
            esClient: core.elasticsearch.client.asCurrentUser,
            logger,
            hasEncryptionKey,
          });

          // Get the source first so we can pass it for validation
          const source = await client.get(request.params.id);

          // Validate and remove the reference (checks watchlist managed, source managed, and link)
          const watchlistClient = new WatchlistConfigClient({
            logger,
            namespace: secSol.getSpaceId(),
            soClient,
            esClient: core.elasticsearch.client.asCurrentUser,
          });
          await watchlistClient.removeEntitySourceReference(request.params.watchlist_id, source);
          await client.delete(request.params.id);

          return response.ok({ body: { acknowledged: true } });
        } catch (e) {
          const error = transformError(e);
          logger.error(`Error deleting watchlist entity source config: ${error.message}`);
          return siemResponse.error({
            statusCode: error.statusCode,
            body: error.message,
          });
        }
      }, 'platinum')
    );
};
