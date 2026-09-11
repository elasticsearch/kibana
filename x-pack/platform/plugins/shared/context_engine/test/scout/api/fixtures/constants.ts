/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRole } from '@kbn/scout';

export const COMMON_HEADERS = {
  'kbn-xsrf': 'some-xsrf-token',
  'x-elastic-internal-origin': 'kibana',
  'Content-Type': 'application/json;charset=UTF-8',
};

export const API_HEADERS = {
  ...COMMON_HEADERS,
  'elastic-api-version': '2023-10-31',
};

export const AI_INDEX_COLLECTION_PATH = 'api/context_engine/ai_index';
export const AI_INDEX_QUERY_PATH = `${AI_INDEX_COLLECTION_PATH}/_query`;

export const CONTEXT_ENGINE_ENABLED_SETTING = 'contextEngine:enabled';

/** Kibana grant for the Context Engine `read` privilege in every space. */
export const CONTEXT_ENGINE_READ: KibanaRole['kibana'][number] = {
  base: [],
  feature: { contextEngine: ['read'] },
  spaces: ['*'],
};
