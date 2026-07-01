/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsModelVersionMap } from '@kbn/core-saved-objects-server';
import type { EncryptedSavedObjectsPluginSetup } from '@kbn/encrypted-saved-objects-plugin/server';
import {
  rawUserConnectorTokenSchemaV1,
  rawUserConnectorTokenSchemaV2,
} from '../schemas/raw_user_connector_token';
import {
  userConnectorTokenEncryptedRegistrationV1,
  userConnectorTokenEncryptedRegistrationV2,
} from '../user_connector_token_encryption';

export const userConnectorTokenModelVersions = (
  encryptedSavedObjects: EncryptedSavedObjectsPluginSetup
): SavedObjectsModelVersionMap => {
  // createModelVersion replaces `changes` with a single `unsafe_transform`, stripping
  // `mappings_addition`. We spread it back so the SO validator can see the new field.
  const version2 = encryptedSavedObjects.createModelVersion({
    modelVersion: {
      changes: [
        {
          // no-op backfill to trigger re-encryption with updated AAD
          type: 'data_backfill',
          backfillFn: (doc) => doc,
        },
      ],
      schemas: {
        forwardCompatibility: rawUserConnectorTokenSchemaV2.extends({}, { unknowns: 'ignore' }),
        create: rawUserConnectorTokenSchemaV2,
      },
    },
    inputType: userConnectorTokenEncryptedRegistrationV1,
    outputType: userConnectorTokenEncryptedRegistrationV2,
    shouldTransformIfDecryptionFails: true,
  });

  return {
    '1': {
      changes: [],
      schemas: {
        forwardCompatibility: rawUserConnectorTokenSchemaV1.extends({}, { unknowns: 'ignore' }),
        create: rawUserConnectorTokenSchemaV1,
      },
    },
    '2': {
      ...version2,
      changes: [
        ...version2.changes,
        {
          type: 'mappings_addition',
          addedMappings: {
            userCloudId: { type: 'keyword' },
          },
        },
      ],
    },
  };
};
