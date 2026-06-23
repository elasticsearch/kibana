/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IKibanaResponse, Logger } from '@kbn/core/server';
import { buildSiemResponse } from '@kbn/lists-plugin/server/routes/utils';
import { transformError } from '@kbn/securitysolution-es-utils';
import { WATCHLIST_API_CALL_EVENT } from '../../../../telemetry/event_based/events';
import type { ITelemetryEventsSender } from '../../../../telemetry/sender';
import type { UpdateWatchlistResponse } from '../../../../../../common/api/entity_analytics/watchlists/management/update.gen';
import {
  UpdateWatchlistRequestBody,
  UpdateWatchlistRequestParams,
} from '../../../../../../common/api/entity_analytics/watchlists/management/update.gen';
import { API_VERSIONS, APP_ID } from '../../../../../../common/constants';
import { WATCHLISTS_URL } from '../../../../../../common/entity_analytics/watchlists/constants';
import type { EntityAnalyticsRoutesDeps } from '../../../types';
import { withMinimumLicense } from '../../../utils/with_minimum_license';
import { WatchlistConfigClient } from '../watchlist_config';
import {
  buildWatchlistApiCallSuccessFields,
  reportWatchlistApiCallError,
} from './watchlist_ebt_helpers';

export const updateWatchlistRoute = (
  router: EntityAnalyticsRoutesDeps['router'],
  logger: Logger,
  telemetrySender: ITelemetryEventsSender
) => {
  router.versioned
    .put({
      access: 'public',
      path: `${WATCHLISTS_URL}/{id}`,
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
            params: UpdateWatchlistRequestParams,
            body: UpdateWatchlistRequestBody,
          },
        },
      },
      withMinimumLicense(
        async (context, request, response): Promise<IKibanaResponse<UpdateWatchlistResponse>> => {
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
            const { id } = request.params;
            // update returns attributes only, need to fetch full object for response
            const updated = await watchlistClient.update(id, request.body);

            telemetrySender.reportEBT(
              WATCHLIST_API_CALL_EVENT,
              buildWatchlistApiCallSuccessFields(request.route.path, request.body, id)
            );
            return response.ok({ body: updated });
          } catch (e) {
            const error = transformError(e);
            logger.error(`Failed to update watchlist: ${error.message}`);
            reportWatchlistApiCallError(telemetrySender, {
              path: request.route.path,
              errorMessage: error.message,
              watchlistId: request.params.id,
            });
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
