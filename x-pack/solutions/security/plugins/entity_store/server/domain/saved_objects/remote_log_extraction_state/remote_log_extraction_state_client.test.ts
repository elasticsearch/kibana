/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import { RemoteLogExtractionStateClient } from '.';
import {
  LEGACY_CCS_LOG_EXTRACTION_STATE_TYPE_NAME,
  readLegacyCcsLogExtractionState,
} from './legacy_ccs_log_extraction_state';
import { RemoteLogExtractionStateTypeName } from './types';

describe('RemoteLogExtractionStateClient', () => {
  const namespace = 'default';
  const entityType = 'user' as const;
  const remoteId = `${RemoteLogExtractionStateTypeName}-${entityType}-${namespace}`;
  const legacyId = `${LEGACY_CCS_LOG_EXTRACTION_STATE_TYPE_NAME}-${entityType}-${namespace}`;
  const legacyState = {
    checkpointTimestamp: '2024-01-01T00:00:00.000Z',
    paginationRecoveryId: 'recovery-1',
  };

  let soClient: ReturnType<typeof savedObjectsClientMock.create>;
  let client: RemoteLogExtractionStateClient;

  beforeEach(() => {
    soClient = savedObjectsClientMock.create();
    client = new RemoteLogExtractionStateClient(
      soClient,
      namespace,
      loggingSystemMock.create().get()
    );
  });

  it('migrates legacy CCS state into entity-store-remote-state on findOrInit', async () => {
    soClient.get.mockImplementation(async (type, id) => {
      if (type === RemoteLogExtractionStateTypeName && id === remoteId) {
        throw SavedObjectsErrorHelpers.createGenericNotFoundError(type, id);
      }
      if (type === LEGACY_CCS_LOG_EXTRACTION_STATE_TYPE_NAME && id === legacyId) {
        return { id: legacyId, attributes: legacyState, type, references: [] };
      }
      throw SavedObjectsErrorHelpers.createGenericNotFoundError(type, id);
    });
    soClient.create.mockResolvedValue({} as never);
    soClient.delete.mockResolvedValue({} as never);

    const state = await client.findOrInit(entityType);

    expect(state).toEqual(legacyState);
    expect(soClient.create).toHaveBeenCalledWith(
      RemoteLogExtractionStateTypeName,
      legacyState,
      expect.objectContaining({ id: remoteId })
    );
    expect(soClient.delete).toHaveBeenCalledWith(
      LEGACY_CCS_LOG_EXTRACTION_STATE_TYPE_NAME,
      legacyId
    );
  });

  it('readLegacyCcsLogExtractionState returns undefined when no legacy row exists', async () => {
    soClient.get.mockRejectedValue(
      SavedObjectsErrorHelpers.createGenericNotFoundError(
        LEGACY_CCS_LOG_EXTRACTION_STATE_TYPE_NAME,
        legacyId
      )
    );

    await expect(
      readLegacyCcsLogExtractionState(soClient, entityType, namespace)
    ).resolves.toBeUndefined();
  });
});
