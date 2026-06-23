/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import type { EntityType } from '../../../../common/domain/definitions/entity_schema';
import type { RemoteLogExtractionState } from './constants';
import { RemoteLogExtractionState as RemoteLogExtractionStateSchema } from './constants';

/**
 * Pre-unification SO type used before serverless CPS (non-serverless CCS only).
 * Replaced by {@link RemoteLogExtractionStateTypeName}; kept registered
 * only so existing checkpoints can be read and migrated.
 */
export const LEGACY_CCS_LOG_EXTRACTION_STATE_TYPE_NAME = 'entity-store-ccs-state';

const getLegacyCcsLogExtractionStateId = (entityType: EntityType, namespace: string): string =>
  `${LEGACY_CCS_LOG_EXTRACTION_STATE_TYPE_NAME}-${entityType}-${namespace}`;

/**
 * Reads checkpoint state stored under `entity-store-ccs-state` before the CCS/CPS
 * types were unified into `entity-store-remote-state`.
 */
export const readLegacyCcsLogExtractionState = async (
  soClient: SavedObjectsClientContract,
  entityType: EntityType,
  namespace: string
): Promise<RemoteLogExtractionState | undefined> => {
  const legacyId = getLegacyCcsLogExtractionStateId(entityType, namespace);
  try {
    const { attributes } = await soClient.get<RemoteLogExtractionState>(
      LEGACY_CCS_LOG_EXTRACTION_STATE_TYPE_NAME,
      legacyId
    );
    return RemoteLogExtractionStateSchema.parse(attributes);
  } catch (err) {
    if (SavedObjectsErrorHelpers.isNotFoundError(err)) {
      return undefined;
    }
    throw err;
  }
};

/** Removes a migrated legacy row so we do not leave duplicate checkpoint state. */
export const deleteLegacyCcsLogExtractionState = async (
  soClient: SavedObjectsClientContract,
  entityType: EntityType,
  namespace: string
): Promise<void> => {
  const legacyId = getLegacyCcsLogExtractionStateId(entityType, namespace);
  await soClient.delete(LEGACY_CCS_LOG_EXTRACTION_STATE_TYPE_NAME, legacyId).catch((err) => {
    if (!SavedObjectsErrorHelpers.isNotFoundError(err)) {
      throw err;
    }
  });
};
