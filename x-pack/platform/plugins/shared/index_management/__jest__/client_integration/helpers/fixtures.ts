/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EnrichPolicyType } from '@elastic/elasticsearch/lib/api/types';

export const indexSettings = {
  settings: { index: { number_of_shards: '1' } },
  defaults: { index: { flush_after_merge: '512mb' } },
};

export const indexMappings = {
  mappings: {
    dynamic: 'strict',
    properties: {
      '@timestamp': {
        type: 'date',
      },
    },
  },
};

export const indexStats = {
  _shards: {
    total: 1,
    successful: 1,
    failed: 0,
  },
  stats: {
    uuid: 'test-uuid',
    health: 'green',
    status: 'open',
    primaries: {
      docs: {
        count: 0,
        deleted: 0,
      },
    },
    total: {
      docs: {
        count: 0,
        deleted: 0,
      },
    },
  },
};

export const createTestEnrichPolicy = (name: string, type: EnrichPolicyType) => ({
  name,
  type,
  sourceIndices: ['users'],
  matchField: 'email',
  enrichFields: ['first_name', 'last_name', 'city'],
  query: {
    match_all: {},
  },
});

// Template create test data
export const TEXT_MAPPING_FIELD = {
  name: 'text_datatype',
  type: 'text',
};

export const BOOLEAN_MAPPING_FIELD = {
  name: 'boolean_datatype',
  type: 'boolean',
};

export const KEYWORD_MAPPING_FIELD = {
  name: 'keyword_datatype',
  type: 'keyword',
};

export const componentTemplate1 = {
  name: 'test_component_template_1',
  hasMappings: true,
  hasAliases: false,
  hasSettings: false,
  usedBy: [],
  isManaged: false,
};

export const componentTemplate2 = {
  name: 'test_component_template_2',
  hasMappings: false,
  hasAliases: false,
  hasSettings: true,
  usedBy: ['test_index_template_1'],
  isManaged: false,
};

export const componentTemplates = [componentTemplate1, componentTemplate2];
