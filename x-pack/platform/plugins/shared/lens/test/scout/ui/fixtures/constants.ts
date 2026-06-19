/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const ES_ARCHIVES = {
  LOGSTASH: 'x-pack/platform/test/fixtures/es_archives/logstash_functional',
};

export const DATA_VIEW_ID = {
  LOGSTASH: 'logstash-*',
};

export const LOGSTASH_IN_RANGE_DATES = {
  from: 'Sep 19, 2015 @ 06:31:44.000',
  to: 'Sep 23, 2015 @ 18:31:44.000',
};

const OPEN_IN_LENS_FIXTURES_ROOT =
  'x-pack/platform/plugins/shared/lens/test/scout/ui/fixtures/kbn_archives/open_in_lens/agg_based';

export const KBN_ARCHIVES = {
  ESQL_CONVERSION_DASHBOARD:
    'x-pack/platform/plugins/shared/lens/test/scout/ui/fixtures/esql_conversion_dashboard.json',
  OPEN_IN_LENS_AGG_BASED: {
    METRIC: `${OPEN_IN_LENS_FIXTURES_ROOT}/metric.json`,
    PIE: `${OPEN_IN_LENS_FIXTURES_ROOT}/pie.json`,
    XY: `${OPEN_IN_LENS_FIXTURES_ROOT}/xy.json`,
    GAUGE: `${OPEN_IN_LENS_FIXTURES_ROOT}/gauge.json`,
    GOAL: `${OPEN_IN_LENS_FIXTURES_ROOT}/goal.json`,
    TABLE: `${OPEN_IN_LENS_FIXTURES_ROOT}/table.json`,
    HEATMAP: `${OPEN_IN_LENS_FIXTURES_ROOT}/heatmap.json`,
  },
};

export const OPEN_IN_LENS_DASHBOARDS = {
  METRIC: 'Convert to Lens - Metric',
  PIE: 'Convert to Lens - Pie',
  XY: 'Convert to Lens - XY',
  GAUGE: 'Convert to Lens - Gauge',
  GOAL: 'Convert to Lens - Goal',
  TABLE: 'Convert to Lens - Table',
  HEATMAP: 'Convert to Lens - Heatmap',
};

export const ESQL_CONVERSION_DASHBOARD_TEST_ID =
  'dashboardListingTitleLink-ES|QL-Conversion-Dashboard';
export const INLINE_METRIC_PANEL_ID = 'fb4626b8-d8ce-42d3-913a-081af94cfb51';
export const SAVED_METRIC_PANEL_ID = '3aef33a1-bcbc-4cd7-b2d9-fa678b2fefa5';
