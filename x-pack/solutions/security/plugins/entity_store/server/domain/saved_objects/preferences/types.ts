/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsFullModelVersion } from '@kbn/core-saved-objects-server';
import type { SavedObjectsType } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';

export const EntityStorePreferencesTypeName = 'entity-store-preferences';

const EntityStorePreferencesTypeMappings: SavedObjectsType['mappings'] = {
  dynamic: false,
  // we are not searching by any fields, so we can keep the mappings empty
  properties: {},
};

const preferencesSchemaV1 = schema.object({
  autoInstall: schema.boolean(),
});

const version1: SavedObjectsFullModelVersion = {
  changes: [],
  schemas: {
    create: preferencesSchemaV1,
    forwardCompatibility: preferencesSchemaV1.extends({}, { unknowns: 'ignore' }),
  },
};

export const EntityStorePreferencesType: SavedObjectsType = {
  name: EntityStorePreferencesTypeName,
  hidden: false,
  namespaceType: 'multiple-isolated',
  mappings: EntityStorePreferencesTypeMappings,
  modelVersions: { 1: version1 },
  hiddenFromHttpApis: true,
};
