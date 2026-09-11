/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Mirrors `API_BASE_PATH` in the plugin's `common/constants.ts`; the Scout tests are a separate
// TS project, so the value is restated rather than imported across that boundary.
export const API_BASE_PATH = 'api/remote_clusters';

export const COMMON_HEADERS = {
  'kbn-xsrf': 'some-xsrf-token',
  'x-elastic-internal-origin': 'kibana',
};

export const CLUSTER_NAME = 'test_cluster';
export const EXTRA_CLUSTER_NAMES = ['test_cluster1', 'test_cluster2'];
export const MISSING_CLUSTER_NAME = 'test_cluster_doesnt_exist';
