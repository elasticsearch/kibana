/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { MOCK_ROLLUP_INDEX_NAME } from '../../common/fixtures/constants';

// Source index prefix the wizard's index pattern (`to-be*`) matches; docs are seeded here.
export const SOURCE_INDEX_PREFIX = 'to-be';
export const SOURCE_INDEX_PATTERN = 'to-be*';

// Target (rollup) index name the wizard creates the job against.
export const TARGET_INDEX_NAME = 'rollup-to-be';

// EuiFlyout renders in a portal outside `.kbnAppWrapper`, so both selectors are required to catch
// a11y violations inside the rollup job details flyout.
export const A11Y_SELECTORS = ['.kbnAppWrapper', '[data-euiportal="true"]'];

// Hybrid-data-view spec: a rollup job rolls `rollup-source-data-*` into `rollup-target-data`, then
// a data view spans a regular index plus that rollup target.
export const HYBRID = {
  ROLLUP_TARGET_INDEX: 'rollup-target-data',
  ROLLUP_SOURCE_PREFIX: 'rollup-source-data',
  REGULAR_INDEX_PREFIX: 'regular-index',
  DATA_VIEW_PATTERN: 'regular-index*,rollup-target-data',
  // An alias pointing at the rollup target index; a rollup data view can also be built over it.
  ROLLUP_ALIAS: 'rollup-alias',
  // Fields the rollup data view exposes (the rolled-up index has no regular mapped fields).
  EXPECTED_FIELDS: ['@timestamp', '_id', '_ignored', '_index', '_score', '_source'],
} as const;

// TSVB-integration spec: a TSVB Metric panel reads a rollup index by name (string index, enabled
// by `metrics:allowStringIndices`) and renders the rolled-up doc count.
export const TSVB = {
  SOURCE_INDEX: 'tsvb-source-data',
  TARGET_INDEX: 'tsvb-target-data',
  // Three rolled-up docs are seeded, so the Metric panel should render "3".
  EXPECTED_METRIC_VALUE: '3',
} as const;
