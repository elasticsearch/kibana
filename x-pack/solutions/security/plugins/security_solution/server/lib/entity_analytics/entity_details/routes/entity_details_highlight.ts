/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { IKibanaResponse } from '@kbn/core/server';
import { buildSiemResponse } from '@kbn/lists-plugin/server/routes/utils';
import { transformError } from '@kbn/securitysolution-es-utils';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import {
  promptDictionary,
  promptGroupId,
} from '@kbn/elastic-assistant-plugin/server/lib/prompt/local_prompt_object';
import { getPrompt } from '@kbn/elastic-assistant-plugin/server/lib/prompt/get_prompt';
import type { EntityDetailsHighlightsResponse } from '../../../../../common/api/entity_analytics/entity_details/highlights.gen';
import { EntityDetailsHighlightsRequestBody } from '../../../../../common/api/entity_analytics/entity_details/highlights.gen';
import { ENTITY_DETAILS_HIGHLIGHT_INTERNAL_URL } from '../../../../../common/entity_analytics/entity_analytics/constants';
import { EntityTypeToIdentifierField } from '../../../../../common/entity_analytics/types';
import { APP_ID, API_VERSIONS } from '../../../../../common/constants';
import type { EntityAnalyticsRoutesDeps } from '../../types';
import { entityDetailsHighlightsServiceFactory } from '../entity_details_highlights_service';
import { withLicense } from '../../../siem_migrations/common/api/util/with_license';
import { ENTITY_HIGHLIGHTS_USAGE_EVENT } from '../../../telemetry/event_based/events';

export const entityDetailsHighlightsRoute = ({
  router,
  config,
  logger,
  getStartServices,
  ml,
}: EntityAnalyticsRoutesDeps) => {
  router.versioned
    .post({
      access: 'internal',
      path: ENTITY_DETAILS_HIGHLIGHT_INTERNAL_URL,
      security: {
        authz: {
          requiredPrivileges: ['securitySolution', `${APP_ID}-entity-analytics`],
        },
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v1,
        validate: {
          request: {
            body: buildRouteValidationWithZod(EntityDetailsHighlightsRequestBody),
          },
        },
      },
      withLicense(
        async (
          context,
          request,
          response
        ): Promise<IKibanaResponse<EntityDetailsHighlightsResponse>> => {
          const siemResponse = buildSiemResponse(response);
          try {
            const entityType = request.body.entityType;
            const entityIdentifier = request.body.entityIdentifier;
            const anonymizationFields = request.body.anonymizationFields;
            const connectorId = request.body.connectorId;
            const entityField = EntityTypeToIdentifierField[entityType];
            const fromDate = request.body.from;
            const toDate = request.body.to;

            const [coreStart, { entityStore, inference }] = await getStartServices();
            const securitySolution = await context.securitySolution;
            const esClient = coreStart.elasticsearch.client.asScoped(request).asCurrentUser;
            const spaceId = securitySolution.getSpaceId();

            const coreContext = await context.core;
            const soClient = coreContext.savedObjects.client;
            const riskEngineClient = securitySolution.getRiskEngineDataClient();
            const assetCriticalityClient = securitySolution.getAssetCriticalityDataClient();
            const entityStoreClient = entityStore.createCRUDClient(esClient, spaceId);

            const telemetry = securitySolution.getAnalytics();
            telemetry.reportEvent(ENTITY_HIGHLIGHTS_USAGE_EVENT.eventType, {
              entityType,
              spaceId,
            });

            const { getV1Data, getV2Data, getLocalReplacements } =
              entityDetailsHighlightsServiceFactory({
                riskEngineClient,
                entityStoreClient,
                experimentalFeatures: config.experimentalFeatures,
                spaceId,
                logger,
                esClient,
                request,
                assetCriticalityClient,
                soClient,
                uiSettingsClient: coreContext.uiSettings.client,
                ml,
                anonymizationFields,
              });

            const getDataOpts = {
              entityType,
              entityIdentifier,
              anomalyFromDate: fromDate,
              anomalyToDate: toDate,
            };

            const entitySummary = config.experimentalFeatures.entityAnalyticsEntityStoreV2
              ? await getV2Data(getDataOpts)
              : await getV1Data(getDataOpts);

            const prompt = await getPrompt({
              getInferenceConnectorById: (id) => inference.getConnectorById(id, request),
              connectorId,
              promptId: promptDictionary.entityDetailsHighlights,
              promptGroupId: promptGroupId.aiForEntityAnalytics,
              savedObjectsClient: soClient,
            });

            return response.ok({
              body: {
                summary: entitySummary,
                replacements: getLocalReplacements(entityField, entityIdentifier),
                prompt,
              },
            });
          } catch (e) {
            const error = transformError(e);

            return siemResponse.error({
              statusCode: error.statusCode,
              body: error.message,
            });
          }
        }
      )
    );
};
