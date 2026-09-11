/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const LENS_SCOUT_FIXTURES_DIR = 'x-pack/platform/plugins/shared/lens/test/scout/common/ui/fixtures';
const LENS_KBN_ARCHIVES_DIR = `${LENS_SCOUT_FIXTURES_DIR}/kbn_archives`;
const OPEN_IN_LENS_KBN_ARCHIVES_DIR = `${LENS_KBN_ARCHIVES_DIR}/open_in_lens`;

export const ES_ARCHIVE_PATHS = {
  LOGSTASH: 'x-pack/platform/test/fixtures/es_archives/logstash_functional',
  LONG_WINDOW_LOGSTASH: 'src/platform/test/functional/fixtures/es_archiver/long_window_logstash',
  KIBANA_SAMPLE_DATA_FLIGHTS:
    'src/platform/test/functional/fixtures/es_archiver/kibana_sample_data_flights',
  KIBANA_SAMPLE_DATA_LOGS_TSDB:
    'src/platform/test/functional/fixtures/es_archiver/kibana_sample_data_logs_tsdb',
} as const;

export const DATA_VIEW_ID = {
  LOGSTASH: 'logstash-*',
  LONG_WINDOW_LOGSTASH: 'long-window-logstash-*',
  FLIGHTS: 'kibana_sample_data_flights',
  /** Wildcard data view bundled with `lens_basic.json`; matches `logstash-*` indices. */
  LOGSTASH_WILDCARD: 'log*',
} as const;

/**
 * Saved-object titles of the visualizations bundled in `lens_basic.json`.
 * Because `scoutSpace.savedObjects.load()` imports with `createNewCopies: true`,
 * original IDs are replaced by random UUIDs. Look up the new ID by title from
 * the array returned by `load()`.
 */
export const LENS_BASIC_TITLES = {
  /** Legacy Lens metric (`lnsLegacyMetric`). */
  ARTIST_METRIC: 'Artistpreviouslyknownaslens',
  /** XY chart. Split by top-3 values of `ip`, y = average of `bytes`. */
  XY_VIS: 'lnsXYvis',
  /** Pie chart. */
  PIE_VIS: 'lnsPieVis',
} as const;

/** Elastic Charts / Lens XY workspace chart test subject. */
export const XY_CHART = 'xyVisChart' as const;

export const LOGSTASH_IN_RANGE_DATES = {
  from: 'Sep 19, 2015 @ 06:31:44.000',
  to: 'Sep 23, 2015 @ 18:31:44.000',
} as const;

export const TSDB_ISO_TIME_RANGE = {
  start: '2023-04-16T00:00:00.000Z',
  end: '2023-06-16T00:00:00.000Z',
} as const;

export const TSDB_IN_RANGE_DATES = {
  from: 'Apr 16, 2023 @ 00:00:00.000',
  to: 'Jun 16, 2023 @ 00:00:00.000',
} as const;

export const MULTIPLE_DATA_VIEWS_TIME_RANGE = {
  from: 'Oct 23, 2018 @ 07:00:00.000',
  to: 'Oct 23, 2018 @ 08:00:00.000',
} as const;

export const KIBANA_SAMPLE_DATA_LOGS_TSDB_INDEX = 'kibana_sample_data_logstsdb';

// FTR used `*stash*`. Scout parallel `global.setup` also loads long-window-logstash
// (`long-window-logstash-0`), which matches `*stash*` and doubles Discover hits /
// shifts metric & chart values. Use `logstash-2015*` so the ad hoc DV only matches
// the functional logstash archive (same data as FTR).
export const AD_HOC_DATA_VIEW_NAME = 'logstash-2015*' as const;

const PLATFORM_KBN_ARCHIVER_DIR = 'src/platform/test/functional/fixtures/kbn_archiver';

export const KBN_ARCHIVE_PATHS = {
  ESQL_CONVERSION_DASHBOARD: `${LENS_SCOUT_FIXTURES_DIR}/esql_conversion_dashboard.json`,
  ESQL_MULTI_LAYER_DASHBOARD: `${LENS_SCOUT_FIXTURES_DIR}/esql_multi_layer_dashboard.json`,
  /** Saved Lens objects including `lnsXYvis` (group5 formula transition). */
  LONG_WINDOW_LOGSTASH_INDEX_PATTERN: `${PLATFORM_KBN_ARCHIVER_DIR}/long_window_logstash_index_pattern.json`,
  KIBANA_SAMPLE_DATA_FLIGHTS_INDEX_PATTERN: `${PLATFORM_KBN_ARCHIVER_DIR}/kibana_sample_data_flights_index_pattern.json`,
  /**
   * Ships the `logstash-*` and `log*` data views plus the three visualizations referenced by
   * {@link LENS_BASIC_TITLES}.
   */
  LENS_BASIC: `${LENS_KBN_ARCHIVES_DIR}/lens_basic.json`,
  OPEN_IN_LENS: {
    TSVB: {
      METRIC: `${OPEN_IN_LENS_KBN_ARCHIVES_DIR}/tsvb/metric.json`,
      GAUGE: `${OPEN_IN_LENS_KBN_ARCHIVES_DIR}/tsvb/gauge.json`,
      TIMESERIES: `${OPEN_IN_LENS_KBN_ARCHIVES_DIR}/tsvb/timeseries.json`,
      TOP_N: `${OPEN_IN_LENS_KBN_ARCHIVES_DIR}/tsvb/top_n.json`,
      TABLE: `${OPEN_IN_LENS_KBN_ARCHIVES_DIR}/tsvb/table.json`,
      DASHBOARD: `${OPEN_IN_LENS_KBN_ARCHIVES_DIR}/tsvb/dashboard.json`,
    },
    AGG_BASED: {
      METRIC: `${OPEN_IN_LENS_KBN_ARCHIVES_DIR}/agg_based/metric.json`,
      PIE: `${OPEN_IN_LENS_KBN_ARCHIVES_DIR}/agg_based/pie.json`,
      XY: `${OPEN_IN_LENS_KBN_ARCHIVES_DIR}/agg_based/xy.json`,
      GAUGE: `${OPEN_IN_LENS_KBN_ARCHIVES_DIR}/agg_based/gauge.json`,
      GOAL: `${OPEN_IN_LENS_KBN_ARCHIVES_DIR}/agg_based/goal.json`,
      TABLE: `${OPEN_IN_LENS_KBN_ARCHIVES_DIR}/agg_based/table.json`,
      HEATMAP: `${OPEN_IN_LENS_KBN_ARCHIVES_DIR}/agg_based/heatmap.json`,
      NAVIGATION: `${OPEN_IN_LENS_KBN_ARCHIVES_DIR}/agg_based/navigation.json`,
    },
  },
} as const;

export const VISUALIZATION_TITLES = {
  OPEN_IN_LENS: {
    AGG_BASED: {
      NAVIGATION_LINE: 'Visualize navigation - Line',
    },
  },
} as const;

/** Runtime field used by formula KQL field-name escaping (FTR `ab' "'`). */
export const FORMULA_ESCAPED_RUNTIME_FIELD = `ab' "'` as const;

export const DASHBOARD_TITLES = {
  OPEN_IN_LENS: {
    TSVB: {
      METRIC: 'Convert to Lens - TSVB - Metric',
      GAUGE: 'Convert to Lens - TSVB - Gauge',
      TIMESERIES: 'Convert to Lens - TSVB - Timeseries',
      TOP_N: 'Convert to Lens - TSVB - Top N',
      TABLE: 'Convert to Lens - TSVB - Table',
      DASHBOARD_1: 'Convert to Lens - Dashboard - TSVB - 1',
      DASHBOARD_2: 'Convert to Lens - Dashboard - TSVB - 2',
    },
    AGG_BASED: {
      METRIC: 'Convert to Lens - Metric',
      PIE: 'Convert to Lens - Pie',
      XY: 'Convert to Lens - XY',
      GAUGE: 'Convert to Lens - Gauge',
      GOAL: 'Convert to Lens - Goal',
      TABLE: 'Convert to Lens - Table',
      HEATMAP: 'Convert to Lens - Heatmap',
    },
  },
} as const;

export const AVERAGE_OF_BYTES = 'Average of bytes' as const;
export const MAX_BYTES_LABEL = 'Maximum of bytes' as const;
export const TOP_VALUES_OF_IP = 'Top 3 values of ip' as const;

export const DATA_TEST_SUBJECTS = {
  OPEN_IN_LENS_ACTION: 'embeddablePanelAction-ACTION_EDIT_IN_LENS',
  OPEN_IN_DISCOVER_ACTION: 'embeddablePanelAction-ACTION_OPEN_IN_DISCOVER',
} as const;

export const ESQL_CONVERSION_DASHBOARD_ID = '3cda479c-8797-4492-99f4-2259e1377f85';

export const ESQL_CONVERSION_PANEL_IDS = {
  INLINE_METRIC: 'fb4626b8-d8ce-42d3-913a-081af94cfb51',
  SAVED_METRIC: '3aef33a1-bcbc-4cd7-b2d9-fa678b2fefa5',
  MULTI_LAYER: 'esql-conversion-multi-panel',
  PARTIAL_MULTI_LAYER: 'esql-conversion-partial-panel',
} as const;

export const ESQL_MULTI_LAYER_PANEL_IDS = {
  DATA: 'esql-multi-data-panel',
  MIXED_DATA: 'esql-mixed-data-panel',
} as const;
