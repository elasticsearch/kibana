/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Saved-object attributes for the shared 'ML Test' dashboard created in every DFA spec's beforeAll. */
export const ML_TEST_DASHBOARD_ATTRIBUTES = {
  title: 'ML Test',
  hits: 0,
  description: '',
  panelsJSON: '[]',
  optionsJSON: '{"hidePanelTitles":false,"useMargins":true}',
  version: 1,
  timeRestore: false,
  kibanaSavedObjectMeta: {
    searchSourceJSON: '{"query":{"language":"kuery","query":""},"filter":[]}',
  },
} as const;
