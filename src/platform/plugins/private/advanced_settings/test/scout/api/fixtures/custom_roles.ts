/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRole } from '@kbn/scout';

// The routes under test enforce Kibana feature privileges, so each role only needs Kibana
// privileges (no Elasticsearch cluster/index access).
const NO_ES_PRIVILEGES = { cluster: [] as string[] };

// Global (all-spaces) feature roles used by the non-space feature-control tests.
export const CUSTOM_ROLES = {
  settings_all: {
    elasticsearch: NO_ES_PRIVILEGES,
    kibana: [{ base: [], feature: { advancedSettings: ['all'] }, spaces: ['*'] }],
  },

  settings_read: {
    elasticsearch: NO_ES_PRIVILEGES,
    kibana: [{ base: [], feature: { advancedSettings: ['read'] }, spaces: ['*'] }],
  },

  settings_so_all_settings_read: {
    elasticsearch: NO_ES_PRIVILEGES,
    kibana: [
      {
        base: [],
        feature: { savedObjectsManagement: ['all'], advancedSettings: ['read'] },
        spaces: ['*'],
      },
    ],
  },
} satisfies Record<string, KibanaRole>;

/**
 * Builds the per-space role used by the spaces suite: `advancedSettings: all` in the first space,
 * and only `dashboard` privileges in the other two. Space ids are provided at runtime so the suite
 * can use unique ids and stay isolated on shared Cloud deployments.
 */
export const buildSpacesRole = (
  space1Id: string,
  space2Id: string,
  space3Id: string
): KibanaRole => ({
  elasticsearch: NO_ES_PRIVILEGES,
  kibana: [
    { base: [], feature: { advancedSettings: ['all'] }, spaces: [space1Id] },
    { base: [], feature: { dashboard: ['all'] }, spaces: [space2Id] },
    { base: [], feature: { dashboard: ['read'] }, spaces: [space3Id] },
  ],
});
