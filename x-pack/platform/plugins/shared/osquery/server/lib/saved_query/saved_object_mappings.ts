/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { produce } from 'immer';
import type { SavedObjectsType } from '@kbn/core/server';
import { SECURITY_SOLUTION_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import {
  packAssetSavedObjectModelVersion1,
  packSavedObjectModelVersion1,
  packSavedObjectModelVersion2,
  packSavedObjectModelVersion3,
  packSavedObjectModelVersion4,
  savedQueryModelVersion1,
  savedQueryModelVersion2,
} from './saved_object_model_versions';
import {
  savedQuerySavedObjectType,
  packSavedObjectType,
  packAssetSavedObjectType,
  usageMetricSavedObjectType,
} from '../../../common/types';

export const usageMetricSavedObjectMappings: SavedObjectsType['mappings'] = {
  properties: {
    count: {
      type: 'long',
    },
    errors: {
      type: 'long',
    },
  },
};

export const usageMetricType: SavedObjectsType = {
  name: usageMetricSavedObjectType,
  indexPattern: SECURITY_SOLUTION_SAVED_OBJECT_INDEX,
  hidden: false,
  namespaceType: 'agnostic',
  mappings: usageMetricSavedObjectMappings,
};

export const savedQuerySavedObjectMappings: SavedObjectsType['mappings'] = {
  dynamic: false,
  properties: {
    description: {
      type: 'text',
    },
    id: {
      type: 'keyword',
    },
    query: {
      type: 'text',
    },
    created_at: {
      type: 'date',
    },
    created_by: {
      type: 'text',
    },
    created_by_profile_uid: {
      type: 'keyword',
    },
    platform: {
      type: 'keyword',
    },
    version: {
      type: 'keyword',
    },
    updated_at: {
      type: 'date',
    },
    updated_by: {
      type: 'text',
    },
    updated_by_profile_uid: {
      type: 'keyword',
    },
    interval: {
      type: 'keyword',
    },
    timeout: {
      type: 'short',
    },
    ecs_mapping: {
      dynamic: false,
      properties: {},
    },
  },
};

export const savedQueryType: SavedObjectsType = {
  name: savedQuerySavedObjectType,
  indexPattern: SECURITY_SOLUTION_SAVED_OBJECT_INDEX,
  hidden: false,
  namespaceType: 'multiple-isolated',
  mappings: savedQuerySavedObjectMappings,
  modelVersions: {
    1: savedQueryModelVersion1,
    2: savedQueryModelVersion2,
  },
  management: {
    importableAndExportable: true,
    getTitle: (savedObject) => savedObject.attributes.id,
    getEditUrl: (savedObject) => `/saved_queries/${savedObject.id}/edit`,
    getInAppUrl: (savedObject) => ({
      path: `/app/osquery/saved_queries/${savedObject.id}`,
      uiCapabilitiesPath: 'osquery.read',
    }),
    onExport: (context, objects) =>
      produce(objects, (draft) => {
        draft.forEach((savedQuerySO) => {
          // Only prebuilt saved queries should have a version
          if (savedQuerySO.attributes.version) {
            savedQuerySO.attributes.id += '_copy';
            delete savedQuerySO.attributes.version;
          }
        });

        return draft;
      }),
  },
};

export const packSavedObjectMappings: SavedObjectsType['mappings'] = {
  properties: {
    description: {
      type: 'text',
    },
    name: {
      type: 'text',
    },
    created_at: {
      type: 'date',
    },
    created_by: {
      type: 'keyword',
    },
    created_by_profile_uid: {
      type: 'keyword',
    },
    updated_at: {
      type: 'date',
    },
    updated_by: {
      type: 'keyword',
    },
    updated_by_profile_uid: {
      type: 'keyword',
    },
    enabled: {
      type: 'boolean',
    },
    shards: {
      dynamic: false,
      properties: {},
    },
    version: {
      type: 'long',
    },
    schedule_type: {
      type: 'keyword',
      ignore_above: 1024,
    },
    interval: {
      type: 'integer',
    },
    rrule_schedule: {
      dynamic: false,
      properties: {},
    },
    queries: {
      dynamic: false,
      properties: {
        id: {
          type: 'keyword',
        },
        query: {
          type: 'text',
        },
        interval: {
          type: 'text',
        },
        timeout: {
          type: 'short',
        },
        platform: {
          type: 'keyword',
        },
        version: {
          type: 'keyword',
        },
        ecs_mapping: {
          dynamic: false,
          properties: {},
        },
      },
    },
  },
};

export const packType: SavedObjectsType = {
  name: packSavedObjectType,
  indexPattern: SECURITY_SOLUTION_SAVED_OBJECT_INDEX,
  hidden: false,
  // 'multiple-isolated' technically allows a pack to be shared to multiple spaces via the
  // Saved Objects management UI, but the Osquery UI never exposes that feature. In practice
  // every pack lives in exactly one space, so namespaces[0] is always the correct space.
  namespaceType: 'multiple-isolated',
  mappings: packSavedObjectMappings,
  modelVersions: {
    1: packSavedObjectModelVersion1,
    2: packSavedObjectModelVersion2,
    3: packSavedObjectModelVersion3,
    4: packSavedObjectModelVersion4,
  },
  management: {
    defaultSearchField: 'name',
    importableAndExportable: true,
    getTitle: (savedObject) => `Pack: ${savedObject.attributes.name}`,
    getEditUrl: (savedObject) => `/packs/${savedObject.id}/edit`,
    getInAppUrl: (savedObject) => ({
      path: `/app/osquery/packs/${savedObject.id}`,
      uiCapabilitiesPath: 'osquery.read',
    }),
    onExport: (context, objects) =>
      produce(objects, (draft) => {
        draft.forEach((packSO) => {
          packSO.references = [];
          // Only prebuilt packs should have a version
          if (packSO.attributes.version) {
            packSO.attributes.name += '_copy';
            delete packSO.attributes.version;
          }
        });

        return draft;
      }),
  },
};

export const packAssetSavedObjectMappings: SavedObjectsType['mappings'] = {
  dynamic: false,
  properties: {
    description: {
      type: 'text',
    },
    name: {
      type: 'text',
    },
    version: {
      type: 'long',
    },
    shards: {
      dynamic: false,
      properties: {},
    },
    queries: {
      dynamic: false,
      properties: {
        id: {
          type: 'keyword',
        },
        query: {
          type: 'text',
        },
        interval: {
          type: 'text',
        },
        timeout: {
          type: 'short',
        },
        platform: {
          type: 'keyword',
        },
        version: {
          type: 'keyword',
        },
        ecs_mapping: {
          dynamic: false,
          properties: {},
        },
      },
    },
  },
};

export const packAssetType: SavedObjectsType = {
  name: packAssetSavedObjectType,
  indexPattern: SECURITY_SOLUTION_SAVED_OBJECT_INDEX,
  hidden: false,
  management: {
    importableAndExportable: true,
    visibleInManagement: false,
  },
  modelVersions: {
    1: packAssetSavedObjectModelVersion1,
  },
  namespaceType: 'agnostic',
  mappings: packAssetSavedObjectMappings,
};
