/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsTypeMappingDefinition } from '@kbn/core/server';

export const taskMappings: SavedObjectsTypeMappingDefinition = {
  dynamic: false,
  properties: {
    taskType: {
      type: 'keyword',
    },
    scheduledAt: {
      type: 'date',
    },
    runAt: {
      type: 'date',
    },
    // NO NEED TO BE INDEXED
    // startedAt: {
    //   type: 'date',
    // },
    retryAt: {
      type: 'date',
    },
    enabled: {
      type: 'boolean',
    },
    schedule: {
      properties: {
        interval: {
          type: 'keyword',
        },
      },
    },
    attempts: {
      type: 'integer',
    },
    status: {
      type: 'keyword',
    },
    // NO NEED TO BE INDEXED
    // traceparent: {
    //   type: 'text',
    // },
    // params: {
    //   type: 'text',
    // },
    // state: {
    //   type: 'text',
    // },
    // NO NEED TO BE INDEXED
    // user: {
    //   type: 'keyword',
    // },
    scope: {
      type: 'keyword',
    },
    ownerId: {
      type: 'keyword',
    },
    partition: {
      type: 'integer',
    },
    priority: {
      type: 'integer',
    },
    cost: {
      type: 'keyword',
    },
    // NO NEED TO BE INDEXED
    // apiKey: {
    //   type: 'binary',
    // },
    userScope: {
      properties: {
        // Indexing apiKeyId to query for mass deletion in the future
        apiKeyId: {
          type: 'keyword',
        },
        uiamApiKeyId: {
          type: 'keyword',
        },
        // NO NEED TO BE INDEXED
        // apiKeyCreatedByUser: {
        //   type: 'boolean',
        // },
        // spaceId: {
        //   type: 'keyword',
        // },
        // userProfileId: {
        //   type: 'keyword',
        //   ignore_above: 1024,
        // },
      },
    },
  },
};

export const backgroundTaskNodeMapping: SavedObjectsTypeMappingDefinition = {
  dynamic: false,
  properties: {
    id: {
      type: 'keyword',
    },
    last_seen: {
      type: 'date',
    },
  },
};

export const apiKeyToInvalidateMappings: SavedObjectsTypeMappingDefinition = {
  dynamic: false,
  properties: {
    apiKeyId: {
      type: 'keyword',
    },
    createdAt: {
      type: 'date',
    },
  },
};
