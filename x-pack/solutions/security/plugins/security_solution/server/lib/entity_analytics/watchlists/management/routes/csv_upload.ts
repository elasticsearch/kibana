/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildSiemResponse } from '@kbn/lists-plugin/server/routes/utils';
import { schema } from '@kbn/config-schema';
import { transformError } from '@kbn/securitysolution-es-utils';
import type { IKibanaResponse, Logger, StartServicesAccessor } from '@kbn/core/server';
import { APP_ID } from '@kbn/security-solution-features/constants';

import { WATCHLISTS_CSV_UPLOAD_URL, API_VERSIONS } from '../../../../../../common/constants';
import {
  UploadWatchlistCsvRequestParams,
  type UploadWatchlistCsvResponse,
} from '../../../../../../common/api/entity_analytics/watchlists/csv_upload/csv_upload.gen';
import type { EntityAnalyticsRoutesDeps } from '../../../types';
import { withMinimumLicense } from '../../../utils/with_minimum_license';
import { WatchlistConfigClient } from '../watchlist_config';
import type { HapiReadableStream } from '../../../../../types';
import type { StartPlugins } from '../../../../../plugin';
import { csvUpload } from '../../entity_sources/csv/csv_upload';

const WATCHLIST_CSV_MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100MB

export const csvUploadRoute = ({
  router,
  logger,
  getStartServices,
}: {
  router: EntityAnalyticsRoutesDeps['router'];
  logger: Logger;
  getStartServices: StartServicesAccessor<StartPlugins>;
}) => {
  router.versioned
    .post({
      access: 'public',
      path: WATCHLISTS_CSV_UPLOAD_URL,
      security: {
        authz: {
          requiredPrivileges: ['securitySolution', `${APP_ID}-entity-analytics`],
        },
      },
      options: {
        body: {
          output: 'stream',
          accepts: 'multipart/form-data',
          maxBytes: WATCHLIST_CSV_MAX_SIZE_BYTES,
        },
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: {
            params: UploadWatchlistCsvRequestParams,
            body: schema.object({
              file: schema.stream(),
            }),
          },
        },
      },
      withMinimumLicense(
        async (
          context,
          request,
          response
        ): Promise<IKibanaResponse<UploadWatchlistCsvResponse>> => {
          const siemResponse = buildSiemResponse(response);
          try {
            const secSol = await context.securitySolution;
            const [coreStart] = await getStartServices();
            const namespace = secSol.getSpaceId();

            const esClient = coreStart.elasticsearch.client.asScoped(request).asCurrentUser;
            const entityStoreClient = secSol.getEntityStoreUpdateClient();

            const soClient = (await context.core).savedObjects.client;
            const watchlistClient = new WatchlistConfigClient({
              esClient,
              soClient,
              logger,
              namespace,
            });

            const watchlistId = request.params.watchlist_id;
            const watchlist = await watchlistClient.get(watchlistId);

            const fileStream = request.body.file as HapiReadableStream;
            logger.debug(
              `[WatchlistCsvUpload] Parsing CSV file ${fileStream.hapi.filename} for watchlist ${watchlistId}`
            );

            const result = await csvUpload({
              entityStoreClient,
              esClient,
              fileStream,
              logger,
              watchlist: { name: watchlist.name, id: watchlist.id || watchlistId },
              namespace,
            });

            const { items, ...stats } = result;
            logger.debug(
              () =>
                `[WatchlistCsvUpload] CSV upload completed for watchlist ${watchlistId}: ${JSON.stringify(
                  stats
                )}`
            );

            return response.ok({ body: result });
          } catch (e) {
            logger.error(`[WatchlistCsvUpload] Error during CSV upload: ${e}`);
            const error = transformError(e);
            return siemResponse.error({ statusCode: error.statusCode, body: error.message });
          }
        },
        'platinum'
      )
    );
};
