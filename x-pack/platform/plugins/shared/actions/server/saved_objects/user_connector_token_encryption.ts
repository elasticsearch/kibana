/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EncryptedSavedObjectTypeRegistration } from '@kbn/encrypted-saved-objects-plugin/server';
import { USER_CONNECTOR_TOKEN_SAVED_OBJECT_TYPE } from '../constants/saved_objects';

const USER_CONNECTOR_TOKEN_ATTRIBUTES_TO_ENCRYPT = new Set(['credentials']);

const USER_CONNECTOR_TOKEN_ATTRIBUTES_TO_INCLUDE_IN_AAD_V1 = new Set([
  'profileUid',
  'connectorId',
  'credentialType',
  'expiresAt',
  'refreshTokenExpiresAt',
  'createdAt',
  'updatedAt',
]);

const USER_CONNECTOR_TOKEN_ATTRIBUTES_TO_INCLUDE_IN_AAD_V2 = new Set([
  'profileUid',
  'userCloudId',
  'connectorId',
  'credentialType',
  'expiresAt',
  'refreshTokenExpiresAt',
  'createdAt',
  'updatedAt',
]);

export const userConnectorTokenEncryptedRegistrationV1: EncryptedSavedObjectTypeRegistration = {
  type: USER_CONNECTOR_TOKEN_SAVED_OBJECT_TYPE,
  attributesToEncrypt: USER_CONNECTOR_TOKEN_ATTRIBUTES_TO_ENCRYPT,
  attributesToIncludeInAAD: USER_CONNECTOR_TOKEN_ATTRIBUTES_TO_INCLUDE_IN_AAD_V1,
};

export const userConnectorTokenEncryptedRegistrationV2: EncryptedSavedObjectTypeRegistration = {
  type: USER_CONNECTOR_TOKEN_SAVED_OBJECT_TYPE,
  attributesToEncrypt: USER_CONNECTOR_TOKEN_ATTRIBUTES_TO_ENCRYPT,
  attributesToIncludeInAAD: USER_CONNECTOR_TOKEN_ATTRIBUTES_TO_INCLUDE_IN_AAD_V2,
};
