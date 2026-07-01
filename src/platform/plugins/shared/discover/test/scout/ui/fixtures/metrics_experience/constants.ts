/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { tags } from '@kbn/scout';
import type { KibanaRole } from '@kbn/scout';

export const METRICS_TEST_INDEX_NAME = 'test-metrics-experience';
export const METRICS_TEST_INDEX_NAME_OTHER = 'test-metrics-experience-other';
export const METRICS_TEST_INDEX_PATTERN = 'test-metrics-*';

// Companion indices for the partial-dimension scenario. Both match
// METRICS_TEST_INDEX_PATTERN, so the existing read privileges cover them.
export const METRICS_TEST_INDEX_PARTIAL_FULL = 'test-metrics-partial-full';
export const METRICS_TEST_INDEX_PARTIAL_ONLY = 'test-metrics-partial-only';
export const METRICS_TEST_INDEX_PARTIAL_PATTERN = 'test-metrics-partial-*';

/**
 * Shared/partial dimension names and metric ids used by the partial-dimension
 * regression scenario. `PARTIAL_DIMENSION` is a real dimension only on
 * `FULL_METRIC`; on `ONLY_METRIC` it exists as a plain keyword value.
 */
export const PARTIAL_DIMENSION_SCENARIO = {
  SHARED_DIMENSION: 'host.name',
  PARTIAL_DIMENSION: 'color',
  FULL_METRIC: 'partial_full',
  ONLY_METRIC: 'partial_only',
} as const;

// The Security serverless viewer role only grants read access to `metrics-endpoint.metadata_current_*`.
// Our test index doesn't match that pattern. Instead of renaming the index to fit, we prefer a custom role that explicitly grants read access.
const METRICS_ES_INDEX_PRIVILEGES = [
  {
    names: [METRICS_TEST_INDEX_NAME, METRICS_TEST_INDEX_PATTERN],
    privileges: ['read', 'view_index_metadata'],
  },
];

export const METRICS_EXPERIENCE_VIEWER_ROLE: KibanaRole = {
  elasticsearch: { cluster: [], indices: METRICS_ES_INDEX_PRIVILEGES },
  kibana: [{ base: ['read'], feature: {}, spaces: ['*'] }],
};

export const METRICS_EXPERIENCE_PRIVILEGED_ROLE: KibanaRole = {
  elasticsearch: { cluster: [], indices: METRICS_ES_INDEX_PRIVILEGES },
  kibana: [{ base: ['all'], feature: {}, spaces: ['*'] }],
};

export const METRICS_FLYOUT_DIMENSION_ITEM_DATA_TEST_SUBJ =
  'metricsExperienceFlyoutOverviewTabDimensionItem';

export const ESQL_QUERIES = {
  TS: `TS ${METRICS_TEST_INDEX_NAME}`,
  TS_OTHER: `TS ${METRICS_TEST_INDEX_NAME_OTHER}`,
  TS_WILDCARD: `TS ${METRICS_TEST_INDEX_PATTERN}`,
  TS_PARTIAL: `TS ${METRICS_TEST_INDEX_PARTIAL_PATTERN}`,
  FROM: `FROM ${METRICS_TEST_INDEX_NAME}`,
};

export const RECOMMENDED_QUERY_LABELS = {
  SEARCH_ALL_METRICS: 'Search all metrics',
} as const;

export const METRICS_DIMENSION_FIELDS = {
  DEFAULT_BREAKDOWN: 'dimension_0',
  /** Dimension emitted by `DEFAULT_CONFIG` but not by `DIMENSIONS_WIPE_CONFIG`. */
  ONLY_IN_A: 'dimension_1',
} as const;

export const DATA_VIEW_NAME = METRICS_TEST_INDEX_NAME;

/**
 * Viewport wide enough (>= 1200px) for the metrics insights flyout to render
 * in push mode (`type="push"`, `pushMinBreakpoint="xl"`).
 *
 * In overlay mode, an `euiOverlayMask` traps pointer events on the rest of
 * the page (Discover tab bar, metrics toolbar), making any flow that
 * interacts with the surrounding UI while the flyout is open unreachable.
 * Apply this via `spaceTest.use({ viewport: PUSH_FLYOUT_VIEWPORT })` in
 * suites that need the surrounding UI to stay interactable.
 */
export const PUSH_FLYOUT_VIEWPORT = { width: 1920, height: 1080 } as const;

export const KBN_ARCHIVE =
  'src/platform/plugins/shared/discover/test/scout/ui/fixtures/metrics_experience/kbn_archives/metrics_data_view.json';

export const METRICS_EXPERIENCE_TAGS = [
  ...tags.stateful.all,
  ...tags.serverless.observability.complete,
  ...tags.serverless.security.complete,
];

export const RECOMMENDED_QUERY_TAGS = [
  ...tags.stateful.search,
  ...tags.stateful.observability,
  ...tags.stateful.security,
  ...tags.serverless.observability.complete,
];
