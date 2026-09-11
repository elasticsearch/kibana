/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ANALYTICS_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import type { SavedObjectsType } from '@kbn/core/server';
import type { MigrateFunctionsObject } from '@kbn/kibana-utils-plugin/common';
import { SavedSearchTypeDisplayName } from '@kbn/discover-session-constants';
import { getAllMigrations } from './search_migrations';
import { SCHEMA_SEARCH_V8_8_0 } from './schema_legacy';
import { MODEL_VERSIONS, typeVersionGuesser } from './model_versions';

export const getSavedSearchObjectType = (
  getSearchSourceMigrations: () => MigrateFunctionsObject
): SavedObjectsType => ({
  name: 'search',
  indexPattern: ANALYTICS_SAVED_OBJECT_INDEX,
  hidden: false,
  namespaceType: 'multiple-isolated',
  convertToMultiNamespaceTypeVersion: '8.0.0',
  management: {
    icon: 'discoverApp',
    defaultSearchField: 'title',
    displayName: SavedSearchTypeDisplayName,
    importableAndExportable: true,
    getTitle(obj) {
      return obj.attributes.title;
    },
    getInAppUrl(obj) {
      return {
        path: `/app/discover#/view/${encodeURIComponent(obj.id)}`,
        uiCapabilitiesPath: 'discover_v2.show',
      };
    },
  },
  modelVersions: MODEL_VERSIONS,
  mappings: {
    dynamic: false,
    properties: {
      title: { type: 'text' },
      description: { type: 'text' },
    },
  },
  schemas: {
    '8.8.0': SCHEMA_SEARCH_V8_8_0,
  },
  migrations: () => getAllMigrations(getSearchSourceMigrations()),
  typeVersionGuesser,
});
