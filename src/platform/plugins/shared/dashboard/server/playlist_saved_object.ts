/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import type { SavedObjectsType } from '@kbn/core/server';
import { ANALYTICS_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import { DASHBOARD_PLAYLIST_SAVED_OBJECT_TYPE } from '../common/playlist';

const playlistAttributesSchema = schema.object({
  name: schema.string({ minLength: 1, maxLength: 256 }),
  dashboardIds: schema.arrayOf(schema.string({ minLength: 1, maxLength: 512 }), {
    minSize: 1,
    maxSize: 100,
  }),
  duration: schema.number({ min: 1, max: 86_400_000 }),
});

export const dashboardPlaylistSavedObjectType: SavedObjectsType = {
  name: DASHBOARD_PLAYLIST_SAVED_OBJECT_TYPE,
  indexPattern: ANALYTICS_SAVED_OBJECT_INDEX,
  hidden: false,
  supportsAccessControl: true,
  namespaceType: 'multiple-isolated',
  management: {
    icon: 'play',
    defaultSearchField: 'name',
    importableAndExportable: true,
    getTitle: (obj) => obj.attributes.name,
  },
  modelVersions: {
    1: {
      changes: [],
      schemas: {
        forwardCompatibility: playlistAttributesSchema.extends({}, { unknowns: 'ignore' }),
        create: playlistAttributesSchema,
      },
    },
  },
  mappings: {
    dynamic: false,
    properties: {
      name: { type: 'text' },
    },
  },
  migrations: () => ({}),
};
