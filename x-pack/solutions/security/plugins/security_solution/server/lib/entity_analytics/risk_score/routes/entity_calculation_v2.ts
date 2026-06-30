/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  IKibanaResponse,
  KibanaRequest,
  KibanaResponseFactory,
  Logger,
} from '@kbn/core/server';
import { buildSiemResponse } from '@kbn/lists-plugin/server/routes/utils';
import { transformError } from '@kbn/securitysolution-es-utils';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { euid } from '@kbn/entity-store/common/euid_helpers';
import type { EntityStoreCRUDClient } from '@kbn/entity-store/server';
import type { SecuritySolutionRequestHandlerContext } from '../../../../types';
import type { RiskScoresEntityCalculationResponse } from '../../../../../common/api/entity_analytics';
import { RiskScoresEntityCalculationRequest } from '../../../../../common/api/entity_analytics';
import {
  APP_ID,
  RISK_SCORE_ENTITY_CALCULATION_V2_URL,
  DEFAULT_RISK_SCORE_PAGE_SIZE,
} from '../../../../../common/constants';
import { getRiskInputsIndex } from '../get_risk_inputs_index';
import type { EntityAnalyticsRoutesDeps, RiskEngineConfiguration } from '../../types';
import { RiskScoreAuditActions } from '../audit';
import { AUDIT_CATEGORY, AUDIT_OUTCOME, AUDIT_TYPE } from '../../audit';
import { withRiskEnginePrivilegeCheck } from '../../risk_engine/risk_engine_privileges';
import { withMinimumLicense } from '../../utils/with_minimum_license';
import { getConfiguration } from '../../risk_engine/utils/saved_object_configuration';
import { buildAlertFilters } from '../maintainer/steps/build_alert_filters';
import { getLookupIndexName } from '../maintainer/lookup/lookup_index';
import { scoreBaseEntities } from '../maintainer/steps/score_base_entities';
import { runResolutionScoringStep } from '../maintainer/steps/run_resolution_scoring_step';
import { getIsIdBasedRiskScoringEnabled } from '../is_id_based_risk_scoring_enabled';
import { fetchWatchlistConfigs } from '../maintainer/utils/fetch_watchlist_configs';
import type { EntityType } from '../../../../../common/entity_analytics/types';

type Handler = (
  context: SecuritySolutionRequestHandlerContext,
  request: KibanaRequest<unknown, unknown, RiskScoresEntityCalculationRequest>,
  response: KibanaResponseFactory
) => Promise<IKibanaResponse<RiskScoresEntityCalculationResponse>>;

async function buildScoringContext({
  entityId,
  identifierType,
  engineConfig,
  logger,
  crudClient,
}: {
  entityId: string;
  identifierType: string;
  engineConfig: RiskEngineConfiguration;
  logger: Logger;
  crudClient: EntityStoreCRUDClient;
}) {
  const baseAlertFilters = buildAlertFilters(engineConfig, identifierType as EntityType, logger);

  const { entities } = await crudClient.listEntities({
    filter: { term: { 'entity.id': entityId } },
    size: 1,
  });

  if (entities.length === 0) {
    return;
  }

  const entityDoc = entities[0];
  const entityIdentityFilter = euid.dsl.getEuidFilterBasedOnDocument(
    identifierType as EntityType,
    entityDoc
  );

  return {
    alertFilters: [...baseAlertFilters, entityIdentityFilter],
    resolutionTargetId: entityDoc?.entity?.relationships?.resolution?.resolved_to ?? entityId,
  };
}

const handler: (logger: Logger) => Handler = (logger) => async (context, request, response) => {
  const securityContext = await context.securitySolution;
  const coreContext = await context.core;
  const securityConfig = securityContext.getConfig();
  const siemResponse = buildSiemResponse(response);

  if (!securityConfig.experimentalFeatures.entityAnalyticsEntityStoreV2) {
    return siemResponse.error({
      statusCode: 400,
      body: 'Entity Store V2 is not enabled',
    });
  }

  const { identifier_type: identifierType, entity_id: entityId } = request.body;

  if (!entityId) {
    return siemResponse.error({
      statusCode: 400,
      body: 'Entity ID is required',
    });
  }

  securityContext.getAuditLogger()?.log({
    message: 'User triggered custom manual scoring',
    event: {
      action: RiskScoreAuditActions.RISK_ENGINE_ENTITY_MANUAL_SCORING,
      category: AUDIT_CATEGORY.DATABASE,
      type: AUDIT_TYPE.CHANGE,
      outcome: AUDIT_OUTCOME.UNKNOWN,
    },
  });

  const soClient = coreContext.savedObjects.client;
  const esClient = coreContext.elasticsearch.client.asCurrentUser;
  const namespace = securityContext.getSpaceId();

  try {
    const engineConfig = await getConfiguration({
      savedObjectsClient: soClient,
      logger,
      namespace,
    });

    if (!engineConfig) {
      return siemResponse.error({ statusCode: 400, body: 'No Risk engine configuration found' });
    }

    const { dataViewId } = engineConfig;
    const pageSize = engineConfig.pageSize ?? DEFAULT_RISK_SCORE_PAGE_SIZE;
    const sampleSize =
      engineConfig.alertSampleSizePerShard ??
      securityConfig.entityAnalytics?.riskEngine?.alertSampleSizePerShard ??
      10000;

    const crudClient = securityContext.getEntityStoreUpdateClient();

    const { index: alertsIndex } = await getRiskInputsIndex({ dataViewId, logger, soClient });
    const scoringContext = await buildScoringContext({
      entityId,
      identifierType,
      engineConfig,
      logger,
      crudClient,
    });

    if (!scoringContext) {
      return siemResponse.error({ statusCode: 400, body: 'Entity not found' });
    }

    const { alertFilters, resolutionTargetId } = scoringContext;

    const writer = await securityContext.getRiskScoreDataClient().getWriter({ namespace });
    const idBasedRiskScoringEnabled = await getIsIdBasedRiskScoringEnabled(
      coreContext.uiSettings.client
    );
    const watchlistConfigs = await fetchWatchlistConfigs({ soClient, esClient, namespace, logger });
    const lookupIndex = getLookupIndexName(namespace);
    const calculationRunId = uuidv4();
    const now = new Date().toISOString();

    await scoreBaseEntities({
      esClient,
      crudClient,
      logger,
      entityType: identifierType as EntityType,
      alertFilters,
      alertsIndex,
      pageSize,
      sampleSize,
      now,
      watchlistConfigs,
      calculationRunId,
      writer,
      idBasedRiskScoringEnabled,
      refresh: 'wait_for',
    });

    if (resolutionTargetId) {
      await runResolutionScoringStep({
        esClient,
        crudClient,
        logger,
        entityType: identifierType as EntityType,
        alertsIndex,
        lookupIndex,
        pageSize,
        sampleSize,
        now,
        calculationRunId,
        watchlistConfigs,
        idBasedRiskScoringEnabled,
        writer,
        targetEntityIds: [resolutionTargetId],
        refresh: 'wait_for',
      });
    }

    return response.ok({ body: { success: true } });
  } catch (e) {
    const error = transformError(e);
    return siemResponse.error({
      statusCode: error.statusCode,
      body: { message: error.message, full_error: JSON.stringify(e) },
      bypassErrorFormat: true,
    });
  }
};

export const riskScoreEntityCalculationRouteV2 = (
  router: EntityAnalyticsRoutesDeps['router'],
  getStartServices: EntityAnalyticsRoutesDeps['getStartServices'],
  logger: Logger
) => {
  router.versioned
    .post({
      path: RISK_SCORE_ENTITY_CALCULATION_V2_URL,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['securitySolution', `${APP_ID}-entity-analytics`],
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: buildRouteValidationWithZod(RiskScoresEntityCalculationRequest),
          },
        },
      },
      withMinimumLicense(
        withRiskEnginePrivilegeCheck(getStartServices, handler(logger)),
        'platinum'
      )
    );
};
