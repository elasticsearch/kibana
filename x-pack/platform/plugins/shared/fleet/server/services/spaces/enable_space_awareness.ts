/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import { SavedObjectsErrorHelpers, isSavedObjectErrorResult, type Logger } from '@kbn/core/server';

import { LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE } from '../../../common';
import {
  LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE,
  PACKAGE_POLICY_SAVED_OBJECT_TYPE,
} from '../../../common/constants';
import { appContextService } from '..';
import { AGENT_POLICY_SAVED_OBJECT_TYPE } from '../../constants';
import { getSettingsOrUndefined, saveSettings } from '../settings';
import { FleetError } from '../../errors';

import { PENDING_MIGRATION_TIMEOUT } from './helpers';

export async function enableSpaceAwarenessMigration() {
  const soClient = appContextService.getInternalUserSOClientWithoutSpaceExtension();
  const logger = appContextService.getLogger();

  const existingSettings = await getSettingsOrUndefined(soClient);
  if (existingSettings?.use_space_awareness_migration_status === 'success') {
    return;
  }

  if (
    existingSettings?.use_space_awareness_migration_started_at &&
    new Date(existingSettings?.use_space_awareness_migration_started_at).getTime() >
      Date.now() - PENDING_MIGRATION_TIMEOUT
  ) {
    logger.info('Fleet space awareness migration is pending');
    throw new FleetError('Migration is pending.');
  }

  await saveSettings(
    soClient,
    {
      use_space_awareness_migration_status: 'pending',
      use_space_awareness_migration_started_at: new Date().toISOString(),
    },
    {
      createWithOverwrite: false,
      version: existingSettings?.version,
    }
  ).catch((err) => {
    if (SavedObjectsErrorHelpers.isConflictError(err)) {
      logger.info('Fleet space awareness migration is pending');
      throw new FleetError('Migration is pending. (conflict acquiring the lock)');
    }

    throw err;
  });

  await runMigration(soClient, logger)
    .then(async () => {
      logger.info('Fleet space awareness migration is complete');
      // Update Settings SO
      await saveSettings(soClient, {
        use_space_awareness_migration_status: 'success',
        use_space_awareness_migration_started_at: null,
      });
    })
    .catch(async (error) => {
      logger.error('Fleet space awareness migration failed', { error });
      await saveSettings(soClient, {
        use_space_awareness_migration_status: 'error',
        use_space_awareness_migration_started_at: null,
      });
      throw error;
    });
}

async function runMigration(soClient: SavedObjectsClientContract, logger: Logger) {
  logger.info('Starting Fleet space awareness migration');
  // Agent Policy
  await batchMigration(
    soClient,
    LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
    AGENT_POLICY_SAVED_OBJECT_TYPE
  );
  // Package policu
  await batchMigration(
    soClient,
    LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE,
    PACKAGE_POLICY_SAVED_OBJECT_TYPE
  );
}

const BATCH_SIZE = 1000;

async function batchMigration(
  soClient: SavedObjectsClientContract,
  sourceSoType: string,
  targetSoType: string
) {
  const finder = soClient.createPointInTimeFinder({
    type: sourceSoType,
    perPage: BATCH_SIZE,
  });
  try {
    for await (const result of finder.find()) {
      const createRes = await soClient.bulkCreate<any>(
        result.saved_objects.map((so) => ({
          type: targetSoType,
          id: so.id,
          attributes: so.attributes,
        })),
        {
          overwrite: true,
          refresh: 'wait_for',
        }
      );
      for (const res of createRes.saved_objects) {
        if (isSavedObjectErrorResult(res)) {
          throw res.error;
        }
      }
    }
  } finally {
    await finder.close();
  }
}
