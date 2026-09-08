/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { asyncForEach } from '@kbn/std';
import { first } from 'lodash/fp';
import type { EntityAnalyticsMigrationsParams } from '../../migrations';
import {
  getDefaultRiskEngineConfiguration,
  updateSavedObjectAttribute,
} from '../utils/saved_object_configuration';
import { RiskScoreDataClient } from '../../risk_score/risk_score_data_client';
import type { RiskEngineConfiguration } from '../../types';
import { riskEngineConfigurationTypeName } from '../saved_object';
import { buildScopedInternalSavedObjectsClientUnsafe } from '../../risk_score/tasks/helpers';

export const MAX_PER_PAGE = 10_000;

export const updateRiskScoreMappings = async ({
  auditLogger,
  logger,
  getStartServices,
  kibanaVersion,
  spaceId,
}: EntityAnalyticsMigrationsParams) => {
  const [coreStart] = await getStartServices();
  const soClientKibanaUser = coreStart.savedObjects.createInternalRepository();

  // Get all installed Risk Engine Configurations
  const savedObjectsResponse = await soClientKibanaUser.find<RiskEngineConfiguration>({
    type: riskEngineConfigurationTypeName,
    perPage: MAX_PER_PAGE,
    namespaces: spaceId ? [spaceId] : ['*'],
  });

  await asyncForEach(savedObjectsResponse.saved_objects, async (savedObject) => {
    const namespace = first(savedObject.namespaces); // We install one Risk Engine Configuration object per space

    if (!namespace) {
      logger.error('Unexpected saved object. Risk Score saved objects must have a namespace');
      return;
    }

    const newConfig = await getDefaultRiskEngineConfiguration({ namespace });

    if (savedObject.attributes._meta?.mappingsVersion !== newConfig._meta.mappingsVersion) {
      logger.info(
        `Starting Risk Score mappings update from version ${savedObject.attributes._meta?.mappingsVersion} to version ${newConfig._meta.mappingsVersion} on namespace ${namespace}`
      );

      const esClient = coreStart.elasticsearch.client.asInternalUser;
      const soClient = buildScopedInternalSavedObjectsClientUnsafe({ coreStart, namespace });
      const riskScoreDataClient = new RiskScoreDataClient({
        logger,
        kibanaVersion,
        esClient,
        namespace,
        soClient,
        auditLogger,
      });

      await riskScoreDataClient.createOrUpdateRiskScoreIndexTemplate();
      await riskScoreDataClient.createOrUpdateRiskScoreLatestIndex();
      await riskScoreDataClient.createOrUpdateRiskScoreComponentTemplate();
      await riskScoreDataClient.rolloverRiskScoreTimeSeriesIndex();
      await updateSavedObjectAttribute({
        savedObjectsClient: soClient,
        namespace,
        attributes: {
          _meta: {
            mappingsVersion: newConfig._meta.mappingsVersion,
          },
        },
      });

      logger.debug(
        `Risk score mappings updated to version ${newConfig._meta.mappingsVersion} on namespace ${namespace}`
      );
    }
  });
};
