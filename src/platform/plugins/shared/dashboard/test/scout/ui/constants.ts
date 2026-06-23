/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const SAMPLE_DATA_SET_ID = 'flights';
export const SAMPLE_DATA_DASHBOARD_ID = '7adfa750-4c81-11e8-b3d7-01146121b73d';
export const SAMPLE_DATA_VIEW = 'Kibana Sample Data Flights';
export const SAMPLE_DATA_TIME_RANGE = 'sample_data range';

export const SAMPLE_DATA_RANGE = [
  {
    from: 'now-30d',
    to: 'now+40d',
    display: 'sample data range',
  },
  {
    from: 'now/d',
    to: 'now/d',
    display: 'Today',
  },
  {
    from: 'now/w',
    to: 'now/w',
    display: 'This week',
  },
  {
    from: 'now-15m',
    to: 'now',
    display: 'Last 15 minutes',
  },
  {
    from: 'now-30m',
    to: 'now',
    display: 'Last 30 minutes',
  },
  {
    from: 'now-1h',
    to: 'now',
    display: 'Last 1 hour',
  },
  {
    from: 'now-24h',
    to: 'now',
    display: 'Last 24 hours',
  },
  {
    from: 'now-7d',
    to: 'now',
    display: 'Last 7 days',
  },
  {
    from: 'now-30d',
    to: 'now',
    display: 'Last 30 days',
  },
  {
    from: 'now-90d',
    to: 'now',
    display: 'Last 90 days',
  },
  {
    from: 'now-1y',
    to: 'now',
    display: 'Last 1 year',
  },
];

export const LENS_BASIC_KIBANA_ARCHIVE =
  'x-pack/platform/test/functional/fixtures/kbn_archives/lens/lens_basic.json';
export const LENS_BASIC_DATA_VIEW = 'logstash-*';
export const LENS_BASIC_TITLE = 'Artistpreviouslyknownaslens';
export const LENS_BASIC_TIME_RANGE = {
  from: 'Sep 22, 2015 @ 00:00:00.000',
  to: 'Sep 23, 2015 @ 00:00:00.000',
};

export const DASHBOARD_SAVED_SEARCH_ARCHIVE =
  'src/platform/test/functional/fixtures/kbn_archiver/dashboard/current/kibana';
export const DASHBOARD_DEFAULT_INDEX_TITLE = 'logstash-*';
export const FEW_PANELS_DASHBOARD_TITLE = 'few panels';

export const MIGRATION_SMOKE_EXPORTS_DIR =
  'src/platform/plugins/shared/dashboard/test/scout/ui/parallel_tests/migration_smoke_tests/exports';
export const DASHBOARD_EDIT_PANEL_ACTION_TEST_SUBJ = 'embeddablePanelAction-editPanel';
export const SHAKESPEARE_DATA_VIEW_TITLE = 'shakespeare';
export const LOGSTASH_DATA_VIEW_TITLE = 'logstash*';
