/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRoleDescriptors } from '@kbn/ftr-common-functional-services';

const noAccessUserRole: KibanaRoleDescriptors = {
  elasticsearch: {
    indices: [],
  },
  kibana: [],
};

const readUserRole: KibanaRoleDescriptors = {
  elasticsearch: {
    indices: [
      {
        names: ['logs-*-*'],
        privileges: ['read'],
      },
    ],
  },
  kibana: [],
};

const datasetQualityMonitorUserRole: KibanaRoleDescriptors = {
  elasticsearch: {
    indices: [
      {
        names: ['logs-*-*', 'metrics-*-*', 'traces-*-*', 'synthetics-*-*'],
        privileges: ['monitor', 'view_index_metadata', 'read'],
      },
    ],
  },
  kibana: [],
};

// Has `read` and `view_index_metadata` on logs but no `monitor`. Used to verify
// that data streams are still listed (no empty-state) even without `monitor`,
// while per-stream `canMonitor` (which requires `monitor`) is correctly false.
const readAndViewMetadataUserRole: KibanaRoleDescriptors = {
  elasticsearch: {
    indices: [
      {
        names: ['logs-*-*'],
        privileges: ['read', 'view_index_metadata'],
      },
    ],
  },
  kibana: [],
};

// Grants access to every index except system indices, ILM history and `logs-apm*`,
// using a Lucene complement (negated) index pattern. The wildcard `_has_privileges`
// check for `logs-*-*` therefore returns false, even though individual logs data
// streams (e.g. `logs-synth-default`) remain readable. Used to verify the page works
// for roles built with negated/complement patterns.
const negatedLogsUserRole: KibanaRoleDescriptors = {
  elasticsearch: {
    indices: [
      {
        names: ['/~(([.]|ilm-history-|logs-apm).*)/'],
        privileges: ['read', 'monitor', 'view_index_metadata'],
      },
    ],
  },
  kibana: [],
};

type CustomRoleNames =
  | 'noAccessUserRole'
  | 'readUserRole'
  | 'datasetQualityMonitorUserRole'
  | 'readAndViewMetadataUserRole'
  | 'negatedLogsUserRole';

export const customRoles: Record<CustomRoleNames, KibanaRoleDescriptors> = {
  noAccessUserRole,
  readUserRole,
  datasetQualityMonitorUserRole,
  readAndViewMetadataUserRole,
  negatedLogsUserRole,
};
