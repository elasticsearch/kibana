/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsModelVersion } from '@kbn/core-saved-objects-server';
import { SECURITY_SOLUTION_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import type { SavedObjectsType } from '@kbn/core/server';

// Saved object type name for the legacy v1 entity engine descriptor.
//
// The v1 Entity Store has been removed (data clients, routes, tasks). This
// registration is retained solely so the v2 install hook can detect whether
// the user previously had v1 enabled in non-default spaces (via
// `/api/saved_objects/_find?type=entity-engine-status`) and decide whether to
// auto-install v2. Once we are confident no environments still hold v1
// descriptors, this can be deleted.
//
// Mappings and model versions mirror the deleted v1 schema verbatim. Kibana's
// SO migration system forbids removing mapped properties between versions
// (>8.8 rule), so the property declarations must be preserved even though no
// runtime code reads them. The data_backfill values in version2 inline the
// constants formerly imported from the deleted v1 `constants.ts`.
export const v1EntityEngineDescriptorTypeName = 'entity-engine-status';

const v1EntityEngineDescriptorTypeMappings: SavedObjectsType['mappings'] = {
  dynamic: false,
  properties: {
    indexPattern: { type: 'keyword' },
    filter: { type: 'keyword' },
    type: { type: 'keyword' },
    status: { type: 'keyword' },
    fieldHistoryLength: { type: 'integer', index: false },
    timestampField: { type: 'keyword' },
  },
};

const version1: SavedObjectsModelVersion = {
  changes: [
    {
      type: 'mappings_addition',
      addedMappings: {
        fieldHistoryLength: { type: 'integer', index: false },
        timestampField: { type: 'keyword' },
      },
    },
    {
      type: 'data_backfill',
      backfillFn: (document) => ({
        attributes: {
          ...document.attributes,
          fieldHistoryLength: 10,
        },
      }),
    },
  ],
};

const version2: SavedObjectsModelVersion = {
  changes: [
    {
      type: 'data_backfill',
      backfillFn: (document) => ({
        attributes: {
          delay: '1m',
          timeout: '180s',
          frequency: '1m',
          docsPerSecond: -1,
          lookbackPeriod: '3h',
          fieldHistoryLength: 10,
          indexPattern: '',
          filter: '',
          enrichPolicyExecutionInterval: '1h',
          timestampField: '@timestamp',
          maxPageSearchSize: 500,
          ...document.attributes,
        },
      }),
    },
  ],
};

export const v1EntityEngineDescriptorType: SavedObjectsType = {
  name: v1EntityEngineDescriptorTypeName,
  indexPattern: SECURITY_SOLUTION_SAVED_OBJECT_INDEX,
  hidden: false,
  namespaceType: 'multiple-isolated',
  mappings: v1EntityEngineDescriptorTypeMappings,
  modelVersions: { 1: version1, 2: version2 },
};
