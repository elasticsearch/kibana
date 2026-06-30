/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const TEST_OBJECT_ID = 'object-1';
export const TEST_OBJECT_ID_A = 'object-a';
export const TEST_OBJECT_ID_B = 'object-b';
export const TEST_OBJECT_TITLE = 'Test object';
export const TEST_CHANGE_HISTORY_SCOPE = {
  module: 'stack',
  dataset: 'workflows',
  objectType: 'workflow',
} as const;
export const TEST_SNAPSHOT = { content: 'name: test\n' };
export const TEST_SNAPSHOT_OLD = { content: 'name: old\n' };
export const TEST_SNAPSHOT_OLDER = { content: 'name: older\n' };
