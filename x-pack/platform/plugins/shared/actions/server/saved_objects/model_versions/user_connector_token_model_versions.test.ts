/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObject, SavedObjectsType } from '@kbn/core-saved-objects-server';
import type {
  SavedObjectModelTransformationContext,
  SavedObjectsFullModelVersion,
} from '@kbn/core-saved-objects-server';
import type { Logger } from '@kbn/core/server';
import { createModelVersionTestMigrator } from '@kbn/core-test-helpers-model-versions';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { USER_CONNECTOR_TOKEN_SAVED_OBJECT_TYPE } from '../../constants/saved_objects';
import { userConnectorTokenMappings } from '../mappings';
import {
  userConnectorTokenEncryptedRegistrationV1,
  userConnectorTokenEncryptedRegistrationV2,
} from '../user_connector_token_encryption';
import { userConnectorTokenModelVersions } from './user_connector_token_model_versions';

const encryptedSavedObjects = encryptedSavedObjectsMock.createSetup({ canEncrypt: true });

const userConnectorTokenType: SavedObjectsType = {
  name: USER_CONNECTOR_TOKEN_SAVED_OBJECT_TYPE,
  hidden: true,
  namespaceType: 'agnostic',
  mappings: userConnectorTokenMappings,
  modelVersions: userConnectorTokenModelVersions(encryptedSavedObjects),
};

const createV1TokenDocument = (): SavedObject => ({
  id: 'token-1',
  type: USER_CONNECTOR_TOKEN_SAVED_OBJECT_TYPE,
  attributes: {
    profileUid: 'profile-1',
    connectorId: 'connector-1',
    credentialType: 'access_token',
    credentials: '{"accessToken":"encrypted-value"}',
    expiresAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  references: [],
});

describe('userConnectorTokenModelVersions', () => {
  describe('encryption registrations', () => {
    it('includes userCloudId in V2 AAD but not in V1', () => {
      expect(userConnectorTokenEncryptedRegistrationV1.attributesToIncludeInAAD).not.toContain(
        'userCloudId'
      );
      expect(userConnectorTokenEncryptedRegistrationV2.attributesToIncludeInAAD).toContain(
        'userCloudId'
      );
    });
  });

  describe('version 2', () => {
    const version2 = userConnectorTokenModelVersions(encryptedSavedObjects)[
      '2'
    ] as SavedObjectsFullModelVersion;
    const context: SavedObjectModelTransformationContext = {
      log: {
        get: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn() }),
      } as unknown as Logger,
      modelVersion: 2,
      namespaceType: 'agnostic',
    };

    it('has a no-op backfill and userCloudId mappings addition', () => {
      expect(version2.changes).toHaveLength(2);

      const backfillChange = version2.changes.find((change) => change.type === 'data_backfill');
      expect(backfillChange).toBeDefined();
      expect(backfillChange?.type).toBe('data_backfill');

      const mappingsChange = version2.changes.find((change) => change.type === 'mappings_addition');
      expect(mappingsChange).toBeDefined();
      if (mappingsChange?.type === 'mappings_addition') {
        expect(mappingsChange.addedMappings).toEqual({
          userCloudId: { type: 'keyword' },
        });
      }
    });

    it('preserves V1 attributes in the no-op backfill', () => {
      const backfillChange = version2.changes.find((change) => change.type === 'data_backfill');
      const backfillFn =
        backfillChange && backfillChange.type === 'data_backfill'
          ? backfillChange.backfillFn
          : undefined;

      const document = createV1TokenDocument();
      const result = backfillFn!(document, context);

      expect(result).toBe(document);
    });
  });

  describe('v1 to v2 migration', () => {
    it('preserves a pre-existing V1 token without populating userCloudId', () => {
      const migrator = createModelVersionTestMigrator({ type: userConnectorTokenType });
      const document = createV1TokenDocument();

      const migrated = migrator.migrate({
        document,
        fromVersion: 1,
        toVersion: 2,
      });

      expect(migrated.attributes).toEqual(document.attributes);
      expect(migrated.attributes).not.toHaveProperty('userCloudId');
    });
  });
});
