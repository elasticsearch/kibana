/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsTypeMappingDefinition } from '@kbn/core-saved-objects-server';

/**
 * Mappings for the API key pending invalidation saved object.
 * For the full list of mappings, see:
 * https://github.com/elastic/kibana/blob/main/x-pack/plugins/alerting_v2/server/saved_objects/schemas/api_key_pending_invalidation_attributes/v1.ts
 */
export const apiKeyPendingInvalidationMappings: SavedObjectsTypeMappingDefinition = {
  dynamic: false,
  properties: {
    createdAt: { type: 'date' },
  },
};
