/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsTypeMappingDefinition } from '@kbn/core/server';

export const actionMappings: SavedObjectsTypeMappingDefinition = {
  dynamic: false,
  properties: {
    name: {
      type: 'text',
      fields: {
        keyword: {
          type: 'keyword',
        },
      },
    },
    actionTypeId: {
      type: 'keyword',
    },
    // NO NEED TO BE INDEXED
    // isMissingSecrets: {
    //   type: 'boolean',
    // },
    // NO NEED TO BE INDEXED
    // config: {
    //   enabled: false,
    //   type: 'object',
    // },
    // NEED TO CHECK WITH KIBANA SECURITY
    // secrets: {
    //   type: 'binary',
    // },
  },
};

export const actionTaskParamsMappings: SavedObjectsTypeMappingDefinition = {
  dynamic: false,
  properties: {
    apiKeyId: {
      type: 'keyword',
    },
    // NO NEED TO BE INDEXED
    // actionId: {
    //   type: 'keyword',
    // },
    // consumer: {
    //   type: 'keyword',
    // },
    // params: {
    //   enabled: false,
    //   type: 'object',
    // },
    // apiKey: {
    //   type: 'binary',
    // },
    // executionId: {
    //   type: 'keyword',
    // },
    // relatedSavedObjects: {
    //   enabled: false,
    //   type: 'object',
    // },
    // source: {
    //   type: 'keyword'
    // }
  },
};

export const connectorTokenMappings: SavedObjectsTypeMappingDefinition = {
  dynamic: false,
  properties: {
    connectorId: {
      type: 'keyword',
    },
    tokenType: {
      type: 'keyword',
    },
    // NO NEED TO BE INDEXED
    // token: {
    //   type: 'binary',
    // },
    // expiresAt: {
    //   type: 'date',
    // },
    // createdAt: {
    //   type: 'date',
    // },
    // updatedAt: {
    //   type: 'date',
    // },
    // refreshToken: {
    //   type: 'binary',
    // },
    // refreshTokenExpiresAt: {
    //   type: 'date',
    // },
  },
};

export const userConnectorTokenMappings: SavedObjectsTypeMappingDefinition = {
  dynamic: false,
  properties: {
    profileUid: {
      type: 'keyword',
    },
    userCloudId: {
      type: 'keyword',
    },
    connectorId: {
      type: 'keyword',
    },
    credentialType: {
      type: 'keyword',
    },
  },
};

export const oauthStateMappings: SavedObjectsTypeMappingDefinition = {
  dynamic: false,
  properties: {
    state: {
      type: 'keyword',
    },
    connectorId: {
      type: 'keyword',
    },
    expiresAt: {
      type: 'date',
    },
    // NO NEED TO BE INDEXED
    // codeVerifier: {
    //   type: 'binary',
    // },
    // redirectUri: {
    //   type: 'keyword',
    // },
    // scope: {
    //   type: 'keyword',
    // },
    // createdAt: {
    //   type: 'date',
    // },
    // createdBy: {
    //   type: 'keyword',
    // },
    // kibanaReturnUrl: {
    //   type: 'keyword',
    // },
    // spaceId: {
    //   type: 'keyword',
    // },
  },
};
