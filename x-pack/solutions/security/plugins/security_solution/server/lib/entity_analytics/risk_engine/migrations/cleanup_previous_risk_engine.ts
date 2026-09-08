/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { first } from 'lodash/fp';
import type { EntityAnalyticsMigrationsParams } from '../../migrations';
import type { RiskEngineConfiguration } from '../../types';
import { stopTransform, deleteTransform, getLatestTransformId } from '../../utils/transforms';
import { riskEngineConfigurationTypeName } from '../saved_object';
import { MAX_PER_PAGE } from './update_risk_score_mappings';

/**
 * Cleans up the legacy risk engine's ES "latest" transform and the risk_engine:risk_scoring
 * Kibana task per space when migrating to Entity Store V2.
 * Does not delete transform destination indices or templates.
 */
export const cleanupLegacyRiskEngine = async ({
  logger,
  getStartServices,
  spaceId,
}: EntityAnalyticsMigrationsParams) => {
  try {
    const [coreStart, startPlugins] = await getStartServices();
    const taskManager = startPlugins.taskManager;

    if (!taskManager) {
      logger.warn(
        'Task Manager is unavailable; skipping legacy risk engine cleanup (transform + task removal).'
      );
      return;
    }

    const esClient = coreStart.elasticsearch.client.asInternalUser;
    const soClientKibanaUser = coreStart.savedObjects.createInternalRepository();

    const savedObjectsResponse = await soClientKibanaUser.find<RiskEngineConfiguration>({
      type: riskEngineConfigurationTypeName,
      perPage: MAX_PER_PAGE,
      namespaces: spaceId ? [spaceId] : ['*'],
    });

    if (savedObjectsResponse.saved_objects.length === 0) {
      return;
    }

    for (const savedObject of savedObjectsResponse.saved_objects) {
      const namespace = first(savedObject.namespaces);

      if (!namespace) {
        logger.error('Unexpected saved object. Risk Score saved objects must have a namespace');
      } else {
        const transformId = getLatestTransformId(namespace);

        await stopTransform({ esClient, logger, transformId }).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          logger.error(
            `Failed to stop legacy latest transform ${transformId} for namespace ${namespace}: ${message}`
          );
        });

        await deleteTransform({ esClient, logger, transformId }).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          logger.error(
            `Failed to delete legacy latest transform ${transformId} for namespace ${namespace}: ${message}`
          );
        });

      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to clean up legacy risk engine resources: ${message}`);
  }
};
