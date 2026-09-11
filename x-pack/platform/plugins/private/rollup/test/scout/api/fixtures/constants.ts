/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';

// Mirrors `API_BASE_PATH` in the plugin's `common/index.ts`; the Scout tests are a separate TS
// project, so the value is restated rather than imported across that boundary.
export const API_BASE_PATH = 'api/rollup';

export const COMMON_HEADERS = {
  'kbn-xsrf': 'some-xsrf-token',
  'x-elastic-internal-origin': 'kibana',
};

// Fields the rollup jobs under test group and aggregate on.
export const INDEX_TO_ROLLUP_MAPPINGS: MappingTypeMapping = {
  properties: {
    testTotalField: { type: 'long' },
    testTagField: { type: 'keyword' },
    testCreatedField: { type: 'date' },
  },
};

// Prefixes for the indices these specs create, so teardown can sweep them by pattern.
export const SOURCE_INDEX_PREFIX = 'rollup-api-test';
export const TARGET_INDEX_PREFIX = 'rollup-api-target';
