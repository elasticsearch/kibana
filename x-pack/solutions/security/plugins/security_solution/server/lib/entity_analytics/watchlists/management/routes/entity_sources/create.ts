/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildSiemResponse } from '@kbn/lists-plugin/server/routes/utils';
import { transformError } from '@kbn/securitysolution-es-utils';
import type { IKibanaResponse, Logger, KibanaRequest } from '@kbn/core/server';
import { API_VERSIONS } from '@kbn/elastic-assistant-common';
import { APP_ID } from '@kbn/security-solution-features/constants';

import { WATCHLISTS_DATA_SOURCE_URL } from '../../../../../../../common/constants';
import { WatchlistDataSources } from '../../../../../../../common/api/entity_analytics';

import type { EntityAnalyticsRoutesDeps } from '../../../../types';
import { withMinimumLicense } from '../../../../utils/with_minimum_license';
import { WatchlistConfigClient } from '../../watchlist_config';
import { createEntitySourcesService } from '../../../entity_sources/entity_sources_service';
import {
  WatchlistEntitySourceClient,
  getStreamPatternFor,
  INTEGRATION_TYPES,
  integrationsSourceIndex,
  oktaLastFullSyncMarkersIndex,
} from '../../../entity_sources/infra';
import { getWatchlistSavedObjectClient } from '../../../shared/utils';
import type { IntegrationType } from '../../../entity_sources/infra';

export const createEntitySourceRoute = (
  router: EntityAnalyticsRoutesDeps['router'],
  logger: Logger,
  getStartServices: EntityAnalyticsRoutesDeps['getStartServices'],
  hasEncryptionKey: EntityAnalyticsRoutesDeps['hasEncryptionKey']
) => {
  router.versioned
    .post({
      access: 'public',
      path: WATCHLISTS_DATA_SOURCE_URL,
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
            params: WatchlistDataSources.CreateWatchlistEntitySourceRequestParams,
            body: WatchlistDataSources.CreateWatchlistEntitySourceRequestBody,
          },
        },
      },
      withMinimumLicense(
        async (
          context,
          request,
          response
        ): Promise<IKibanaResponse<WatchlistDataSources.CreateWatchlistEntitySourceResponse>> => {
          const siemResponse = buildSiemResponse(response);
          const monitoringSource = request.body;
          try {
            const secSol = await context.securitySolution;
            const core = await context.core;
            const namespace = secSol.getSpaceId();
            const soClient = getWatchlistSavedObjectClient(core);
            const client = new WatchlistEntitySourceClient({
              soClient,
              namespace,
              getStartServices,
              esClient: core.elasticsearch.client.asCurrentUser,
              logger,
              hasEncryptionKey,
            });

            const body = await createSourceForType(client, monitoringSource, namespace, request);

            const watchlistClient = new WatchlistConfigClient({
              logger,
              namespace,
              soClient,
              esClient: core.elasticsearch.client.asCurrentUser,
            });
            await watchlistClient.addEntitySourceReference(request.params.watchlist_id, body.id);

            // Fire-and-forget sync after new source is linked
            void (async () => {
              try {
                const entitySourcesService = createEntitySourcesService({
                  esClient: core.elasticsearch.client.asCurrentUser,
                  soClient,
                  logger,
                  namespace,
                  getStartServices,
                  hasEncryptionKey,
                });
                await entitySourcesService.syncWatchlist(request.params.watchlist_id);
                logger.info(
                  `[WatchlistEntitySourceCreate] Background sync completed for watchlist ${request.params.watchlist_id}`
                );
              } catch (syncError) {
                const errorMsg = syncError instanceof Error ? syncError.message : String(syncError);
                logger.warn(
                  `[WatchlistEntitySourceCreate] Background sync failed for watchlist ${request.params.watchlist_id}: ${errorMsg}`
                );
              }
            })();

            return response.ok({ body });
          } catch (e) {
            const error = transformError(e);
            logger.error(`Error creating watchlist entity source sync config: ${error.message}`);
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

const createSourceForType = async (
  client: WatchlistEntitySourceClient,
  source: WatchlistDataSources.CreateWatchlistEntitySourceRequestBody,
  namespace: string,
  request: KibanaRequest
): Promise<WatchlistDataSources.CreateWatchlistEntitySourceResponse> => {
  if (source.type === 'entity_analytics_integration') {
    if (!validateIntegrationName(source.integrationName)) {
      throw new Error(
        `integrationName is required and must be one of: ${INTEGRATION_TYPES.join(', ')}`
      );
    }
    return createIntegrationSource(client, source.integrationName, namespace);
  }

  if (source.type === 'store' && !source.queryRule) {
    throw new Error('queryRule is required for store-type sources');
  }

  return client.create(source, request);
};

const getLastFullSyncMarkersIndex = (namespace: string, integration: IntegrationType): string => {
  if (integration === 'entityanalytics_ad') {
    return getStreamPatternFor(integration, namespace);
  }
  return oktaLastFullSyncMarkersIndex(namespace);
};

const buildIntegrationSourceAttributes = (
  namespace: string,
  integrationName: IntegrationType
): WatchlistDataSources.CreateWatchlistEntitySourceRequestBody => ({
  type: 'entity_analytics_integration',
  name: integrationsSourceIndex(namespace, integrationName),
  indexPattern: getStreamPatternFor(integrationName, namespace),
  integrationName,
  enabled: true,
});

const validateIntegrationName = (
  integrationName: string | undefined
): integrationName is IntegrationType => {
  return !!integrationName && INTEGRATION_TYPES.includes(integrationName as IntegrationType);
};

const createIntegrationSource = async (
  client: WatchlistEntitySourceClient,
  integrationName: IntegrationType,
  namespace: string
): Promise<WatchlistDataSources.CreateWatchlistEntitySourceResponse> => {
  const sourceAttrs = buildIntegrationSourceAttributes(namespace, integrationName);
  const { sources } = await client.list({ name: sourceAttrs.name, per_page: 1 });

  return (
    sources[0] ??
    client.create({
      ...sourceAttrs,
      integrations: {
        syncMarkerIndex: getLastFullSyncMarkersIndex(namespace, integrationName),
      },
    })
  );
};
